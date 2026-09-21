import { describe, expect, it } from 'vitest';
import { allowedFamiliesFor, checkFileType, sniff } from './file-type-policy';

/**
 * The rule exists because AURA stored a Windows executable as a study drawing and served it back
 * byte-identical, PE header intact, with `Content-Type: application/x-msdownload`. Study files
 * come from clients and consultants and the download surface is shared with the project team.
 *
 * Every test here is written from the attacker's side, because the defender's side — "a PDF is
 * accepted" — is the part that was never in doubt.
 */

const pdf = (extra = 'body') => Buffer.concat([Buffer.from('%PDF-1.7\n', 'latin1'), Buffer.from(extra), Buffer.from('\n%%EOF\n')]);
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const dwg = () => Buffer.concat([Buffer.from('AC1027', 'latin1'), Buffer.alloc(64, 2)]);
const exe = () => Buffer.concat([Buffer.from('MZ\x90\x00', 'latin1'), Buffer.alloc(64, 3)]);
const elf = () => Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(64, 4)]);
const zip = () => Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.alloc(64, 5)]);
const docx = () => Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.from('....[Content_Types].xml'), Buffer.alloc(32, 6)]);
const jar = () => Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.from('....META-INF/MANIFEST.MF'), Buffer.alloc(32, 7)]);
const sh = () => Buffer.from('#!/bin/sh\nrm -rf /\n', 'latin1');

describe('what the bytes actually are', () => {
  it('names each executable format rather than calling it "invalid"', () => {
    expect(sniff(exe()).detected).toBe('a Windows executable');
    expect(sniff(elf()).detected).toBe('a Linux executable');
    expect(sniff(jar()).detected).toBe('a Java archive');
    expect(sniff(sh()).detected).toBe('a shell script');
  });

  it('tells a ZIP container apart from the OOXML that shares its header', () => {
    // Both start "PK". Getting this wrong either blocks every .docx or allows every .zip.
    expect(sniff(docx())).toMatchObject({ family: 'office', detected: 'OOXML' });
    expect(sniff(zip())).toMatchObject({ family: 'archive', detected: 'ZIP' });
    // …and a JAR is a ZIP too, which is why it is tested BEFORE the container rule.
    expect(sniff(jar()).family).toBe('unknown');
  });

  it('recognises what a contractor actually exchanges', () => {
    expect(sniff(pdf()).family).toBe('pdf');
    expect(sniff(png()).family).toBe('image');
    expect(sniff(dwg()).family).toBe('cad');
    expect(sniff(Buffer.from('0\nSECTION\n  2\nHEADER\n')).family).toBe('cad');
    expect(sniff(Buffer.from('a plain note about the riser')).family).toBe('text');
  });
});

describe('what may be stored under a category', () => {
  it('REFUSES the executable that started this, under the category it was filed as', () => {
    const v = checkFileType({ category: 'drawing', fileName: 'invoice-viewer.exe', declaredContentType: 'application/x-msdownload', data: exe() });
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('a Windows executable');
  });

  it('refuses it just as firmly when it lies about its name and its content type', () => {
    // The two things the uploader controls, both set to something allowed.
    const v = checkFileType({ category: 'drawing', fileName: 'ground-floor-layout.pdf', declaredContentType: 'application/pdf', data: exe() });
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('a Windows executable');
  });

  it('refuses a real allowed file that is named as something else', () => {
    // A genuine PNG called .pdf. The type would be allowed either way, so this is refused for
    // misrepresentation rather than for danger: a register whose names do not match its contents
    // is not a register.
    const v = checkFileType({ category: 'drawing', fileName: 'section.pdf', data: png() });
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('misrepresents itself');
  });

  it('refuses an archive everywhere, because nothing inspects what is inside it', () => {
    for (const category of ['drawing', 'specification', 'evidence', 'certificate']) {
      expect(checkFileType({ category, fileName: 'drawings.zip', data: zip() }).ok, category).toBe(false);
    }
  });

  it('keeps the categories apart instead of having one global list', () => {
    // A DWG is a drawing, not a certificate; a certificate is a PDF and nothing else.
    expect(checkFileType({ category: 'drawing', fileName: 'layout.dwg', data: dwg() }).ok).toBe(true);
    expect(checkFileType({ category: 'certificate', fileName: 'layout.dwg', data: dwg() }).ok).toBe(false);
    expect(checkFileType({ category: 'photo', fileName: 'riser.png', data: png() }).ok).toBe(true);
    expect(checkFileType({ category: 'photo', fileName: 'note.pdf', data: pdf() }).ok).toBe(false);
  });

  it('lets the ordinary work through — the rule is worthless if it blocks the job', () => {
    expect(checkFileType({ category: 'drawing', fileName: 'GF-ELV-001.pdf', data: pdf() }).ok).toBe(true);
    expect(checkFileType({ category: 'drawing', fileName: 'GF-ELV-001.dwg', data: dwg() }).ok).toBe(true);
    expect(checkFileType({ category: 'site_survey', fileName: 'riser.jpg', data: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32)]) }).ok).toBe(true);
    expect(checkFileType({ category: 'client_specification', fileName: 'spec.docx', data: docx() }).ok).toBe(true);
    expect(checkFileType({ category: 'study_note', fileName: 'notes.txt', data: Buffer.from('cable tray at 2.8m') }).ok).toBe(true);
  });

  it('is conservative about a category nobody has declared', () => {
    // An unknown category gets the default list, which still excludes executables and archives.
    expect(allowedFamiliesFor('something-new')).not.toContain('archive');
    expect(checkFileType({ category: 'something-new', fileName: 'x.exe', data: exe() }).ok).toBe(false);
    expect(checkFileType({ category: 'something-new', fileName: 'x.pdf', data: pdf() }).ok).toBe(true);
  });

  it('says what IS allowed, so the refusal is actionable', () => {
    const v = checkFileType({ category: 'certificate', fileName: 'cert.docx', data: docx() });
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/certificate must be pdf/);
  });
});
