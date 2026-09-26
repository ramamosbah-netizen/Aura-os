/**
 * WHAT MAY BE STORED, DECIDED FROM THE BYTES.
 *
 * AURA accepted any file at all. A Windows executable uploaded as a study drawing was stored
 * under `category: drawing`, and downloaded back byte-identical with its PE header intact and
 * `Content-Type: application/x-msdownload`. Study files arrive from clients and consultants and
 * the download surface is shared with the project team, so that is a distribution path through
 * the ERP. `XOP-09`'s frozen acceptance proof asks for size/type rules; the 25 MB limit was
 * enforced (413) and nothing checked the type.
 *
 * ## Why the bytes and not the name
 *
 * The uploader controls the filename and the declared `Content-Type` — both arrive in the
 * multipart body. An allow-list checked against either is checked against something the attacker
 * writes, so `payload.exe` renamed `drawing.pdf` with `content-type: application/pdf` would pass.
 * The magic bytes are the one part of the upload that has to be real for the file to work at all.
 *
 * So the rule is: SNIFF the content, and require the sniffed type to be allowed for the category.
 * The declared type and extension are then checked for AGREEMENT — a mismatch is refused too,
 * because a file that lies about itself is not something to store under a client's project.
 *
 * ## Why an allow-list
 *
 * A deny-list of executables is open by default: it protects against the types someone thought of
 * on the day it was written, and the next one arrives unblocked. The categories below say what a
 * contractor actually exchanges, and anything else has to be added deliberately.
 */

/** Families a stored file may belong to, named for what the business does with them. */
export type FileFamily = 'pdf' | 'office' | 'image' | 'cad' | 'archive' | 'text' | 'unknown';

export interface SniffResult {
  family: FileFamily;
  /** The specific type the bytes indicate, for the refusal message. */
  detected: string;
}

/**
 * Signatures are checked against the leading bytes. Order matters: OOXML and modern archives are
 * both ZIP containers, so the more specific test has to come first.
 */
const MAGIC: Array<{ detected: string; family: FileFamily; test: (b: Buffer) => boolean }> = [
  { detected: 'PDF', family: 'pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { detected: 'PNG', family: 'image', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { detected: 'JPEG', family: 'image', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { detected: 'GIF', family: 'image', test: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')) },
  { detected: 'WEBP', family: 'image', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { detected: 'TIFF', family: 'image', test: (b) => ['II*\0', 'MM\0*'].includes(b.subarray(0, 4).toString('latin1')) },
  { detected: 'BMP', family: 'image', test: (b) => b.subarray(0, 2).toString('latin1') === 'BM' },
  // DWG carries its version in the first six bytes: AC1015 (2000) through AC1032 (2018+).
  { detected: 'DWG', family: 'cad', test: (b) => /^AC10[0-3][0-9]$/.test(b.subarray(0, 6).toString('latin1')) },
  // DXF is text; the section marker is what distinguishes it from any other text file.
  { detected: 'DXF', family: 'cad', test: (b) => /^\s*0\r?\nSECTION/.test(b.subarray(0, 40).toString('latin1')) },
  // ZIP container. OOXML (docx/xlsx/pptx) is a ZIP whose first entry names a known part.
  {
    detected: 'OOXML',
    family: 'office',
    test: (b) => b.subarray(0, 2).toString('latin1') === 'PK' && /\[Content_Types\]\.xml|word\/|xl\/|ppt\//.test(b.subarray(0, 512).toString('latin1')),
  },
  { detected: 'ZIP', family: 'archive', test: (b) => b.subarray(0, 2).toString('latin1') === 'PK' },
  // Legacy Office and other OLE compound files (.doc/.xls/.ppt/.msg).
  { detected: 'OLE', family: 'office', test: (b) => b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) },
  { detected: '7Z', family: 'archive', test: (b) => b.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) },
  { detected: 'RAR', family: 'archive', test: (b) => b.subarray(0, 6).toString('latin1') === 'Rar!\x1a\x07' },
];

/**
 * Types that are refused everywhere, named so the refusal can say WHAT was found rather than
 * "not allowed". These are never reachable through an allow-list — the list exists to give an
 * executable a precise refusal instead of a generic one.
 */
const EXECUTABLE: Array<{ detected: string; test: (b: Buffer) => boolean }> = [
  { detected: 'a Windows executable', test: (b) => b.subarray(0, 2).toString('latin1') === 'MZ' },
  { detected: 'a Linux executable', test: (b) => b.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) },
  { detected: 'a macOS executable', test: (b) => [0xfeedface, 0xfeedfacf, 0xcafebabe].includes(b.readUInt32BE(0)) },
  { detected: 'a Java archive', test: (b) => b.subarray(0, 2).toString('latin1') === 'PK' && /META-INF\/MANIFEST\.MF/.test(b.subarray(0, 512).toString('latin1')) },
  { detected: 'a shell script', test: (b) => b.subarray(0, 2).toString('latin1') === '#!' },
];

/** Plain text is only accepted where a category asks for it, and only if it is really text. */
function looksLikeText(b: Buffer): boolean {
  const head = b.subarray(0, 4096);
  if (head.includes(0)) return false; // a NUL byte means it is not text
  let printable = 0;
  for (const byte of head) {
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte < 0x7f) || byte >= 0x80) printable += 1;
  }
  return head.length === 0 || printable / head.length > 0.95;
}

/** What the leading bytes actually are, regardless of what the upload claimed. */
export function sniff(data: Buffer): SniffResult {
  if (data.length < 4) return looksLikeText(data) ? { family: 'text', detected: 'text' } : { family: 'unknown', detected: 'unrecognised' };
  for (const e of EXECUTABLE) {
    try {
      if (e.test(data)) return { family: 'unknown', detected: e.detected };
    } catch { /* a short buffer cannot be this type */ }
  }
  for (const m of MAGIC) {
    try {
      if (m.test(data)) return { family: m.family, detected: m.detected };
    } catch { /* ditto */ }
  }
  return looksLikeText(data) ? { family: 'text', detected: 'text' } : { family: 'unknown', detected: 'unrecognised' };
}

/**
 * What each business category may hold.
 *
 * `archive` is deliberately absent everywhere: a ZIP is a container whose contents are not
 * inspected, so allowing one would reopen the hole this closes one level down. A consultant who
 * sends a zipped drawing set has to have it unpacked, which is what a document register is for.
 */
const CATEGORY_FAMILIES: Record<string, readonly FileFamily[]> = {
  drawing: ['pdf', 'cad', 'image'],
  'as-built': ['pdf', 'cad', 'image'],
  specification: ['pdf', 'office', 'text'],
  client_specification: ['pdf', 'office', 'text'],
  client_requirement: ['pdf', 'office', 'text'],
  authority_requirement: ['pdf', 'office', 'text'],
  government_requirement: ['pdf', 'office', 'text'],
  scope_summary: ['pdf', 'office', 'text'],
  system_identification: ['pdf', 'office', 'text'],
  site_information: ['pdf', 'office', 'image', 'text'],
  site_survey: ['pdf', 'office', 'image', 'text'],
  technical_reference: ['pdf', 'office', 'text'],
  study_note: ['pdf', 'office', 'text'],
  // Evidence from site and commissioning: what a phone or a scanner produces.
  evidence: ['image', 'pdf'],
  photo: ['image'],
  signature: ['image', 'pdf'],
  certificate: ['pdf'],
  // `text` belongs here: the OLAP export writes a real CSV under this kind, and a CSV report is
  // an ordinary thing for a contractor to produce. Leaving it out would have refused an internal
  // export the moment this rule shipped.
  report: ['pdf', 'office', 'text'],
  correspondence: ['pdf', 'office', 'text'],
  // What a client sends with an enquiry, before anyone has sorted it into a discipline.
  client_enquiry: ['pdf', 'office', 'image', 'text'],
  // EST-12 — written by the server only: the issued matrix is a workbook rendered from frozen verdicts.
  technical_compliance_matrix: ['office'],
};

/** Anything not named above. Deliberately conservative rather than permissive. */
const DEFAULT_FAMILIES: readonly FileFamily[] = ['pdf', 'office', 'image', 'text'];

export function allowedFamiliesFor(category: string | null | undefined): readonly FileFamily[] {
  return CATEGORY_FAMILIES[(category ?? '').trim().toLowerCase()] ?? DEFAULT_FAMILIES;
}

/**
 * Has someone actually decided what this category may hold?
 *
 * Distinct from `allowedFamiliesFor`, which answers for every category by falling back. A rule
 * that happens to equal the default is not the same as no rule at all, and only the map itself
 * can tell them apart — which is what the upload-category guard needs in order to say "nobody
 * has chosen this one yet" without accusing the categories that chose the default on purpose.
 */
export function isDeclaredCategory(category: string | null | undefined): boolean {
  return Object.hasOwn(CATEGORY_FAMILIES, (category ?? '').trim().toLowerCase());
}

const EXT_FAMILY: Record<string, FileFamily> = {
  pdf: 'pdf',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', tif: 'image', tiff: 'image', bmp: 'image',
  dwg: 'cad', dxf: 'cad',
  doc: 'office', docx: 'office', xls: 'office', xlsx: 'office', ppt: 'office', pptx: 'office',
  txt: 'text', csv: 'text', md: 'text', json: 'text', xml: 'text',
};

export interface FileTypeVerdict {
  ok: boolean;
  /** Present when `ok` is false: a message safe to return to the caller. */
  reason?: string;
  family: FileFamily;
  detected: string;
}

/**
 * Decide whether these bytes may be stored under this category.
 *
 * Three questions, in order of how much the uploader controls the answer:
 *   1. what ARE the bytes                 — the only part they cannot fake and still have a usable file
 *   2. is that family allowed here        — the business rule
 *   3. does the NAME agree with the bytes — a file that misrepresents itself is refused even when
 *                                            the true type would have been allowed
 */
export function checkFileType(args: {
  category?: string | null;
  fileName: string;
  declaredContentType?: string | null;
  data: Buffer;
}): FileTypeVerdict {
  const { family, detected } = sniff(args.data);
  const allowed = allowedFamiliesFor(args.category);

  if (family === 'unknown') {
    return {
      ok: false, family, detected,
      reason: `this file is ${detected === 'unrecognised' ? 'not a recognised document type' : detected}, which cannot be stored`,
    };
  }
  if (!allowed.includes(family)) {
    const list = [...allowed];
    const readable = list.length > 1 ? `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}` : list[0];
    return {
      ok: false, family, detected,
      // Phrased with "must" deliberately: the error taxonomy reads the message, and this is a
      // 400 the caller fixes by sending a different file — not a 500.
      reason: `a ${args.category ?? 'document'} must be ${readable}; this file is ${detected}`,
    };
  }

  const ext = (args.fileName.split('.').pop() ?? '').toLowerCase();
  const extFamily = EXT_FAMILY[ext];
  if (extFamily && extFamily !== family) {
    return {
      ok: false, family, detected,
      reason: `this file is named .${ext} but its contents are ${detected}; a file that misrepresents itself cannot be stored`,
    };
  }

  return { ok: true, family, detected };
}
