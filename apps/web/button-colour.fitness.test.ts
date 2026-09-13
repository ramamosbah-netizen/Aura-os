import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A painted <button> must set its own text colour.
 *
 * THE BUG THIS EXISTS TO PREVENT, reported from the Engineering workspace:
 *
 *   background-color: rgb(19, 19, 22)   ← the dark panel
 *   color:            rgb(0, 0, 0)      ← black
 *
 * A `<button>` does NOT inherit text colour. Browsers give it the UA default `buttontext`, which is
 * black — so on a dark surface the label simply does not appear. In the Engineering overview the
 * number and its caption were invisible, and the only line that showed was the one carrying its own
 * `var(--warn)`. Nothing failed; the text was rendered, in black, on near-black.
 *
 * The compiler cannot see this and no unit test renders these styles, so it is checked as source:
 * a style applied to a `<button>` that paints a background or border, and offers `cursor: pointer`,
 * must also say what colour its text is.
 *
 * NOTE ON THE SCAN ITSELF. The tag is found by scanning BACKWARDS to the nearest `<`. The obvious
 * `<button[^>]*style=...` cannot be used: an `onClick={() => …}` contains a `>`, which truncates the
 * match — the first version of this check reported a clean sweep while the known bug was still in
 * the tree. It was caught by running the scan against the unfixed file and getting "none".
 */
const COMPONENTS = join(__dirname, 'components');

/** Style keys applied to a `<button>` in this source. */
function buttonStyles(src: string): Set<string> {
  const keys = new Set<string>();
  for (const m of src.matchAll(/style=\{st\.([a-zA-Z]+)\}/g)) {
    const open = src.lastIndexOf('<', m.index);
    if (open >= 0 && src.slice(open + 1, open + 8).startsWith('button')) keys.add(m[1]);
  }
  return keys;
}

function paintedButtonsWithoutColour(src: string): string[] {
  const onButton = buttonStyles(src);
  const found: string[] = [];
  for (const m of src.matchAll(/\n {2}([a-zA-Z]+): \{([\s\S]*?)\} as CSSProperties,/g)) {
    const [, key, body] = m;
    if (!onButton.has(key)) continue;
    if (!/cursor:\s*'pointer'/.test(body)) continue;
    if (/[^-]color:/.test(body)) continue;
    if (!/background|border:/.test(body)) continue;
    found.push(key);
  }
  return found;
}

describe('button text colour', () => {
  it('every painted button style says what colour its text is', () => {
    const offenders: string[] = [];
    for (const file of readdirSync(COMPONENTS).filter((f) => f.endsWith('.tsx'))) {
      for (const key of paintedButtonsWithoutColour(readFileSync(join(COMPONENTS, file), 'utf8'))) {
        offenders.push(`${file} → st.${key}`);
      }
    }
    expect(
      offenders,
      'a <button> does not inherit colour — without an explicit one its label renders black on the dark panel',
    ).toEqual([]);
  });

  /**
   * The check must be able to fail. This is the Engineering style exactly as it shipped, and if the
   * scan stops catching it the suite above is worthless without anyone noticing.
   */
  it('catches the shape that shipped, so a clean sweep means something', () => {
    const shipped = `
      <button key={s.label} onClick={() => selectTab(s.tab)} style={st.statCard}>
      const st = {
  statCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
    padding: '16px 18px', borderRadius: 12, border: '1px solid var(--border)',
    background: 'var(--panel)', cursor: 'pointer', textAlign: 'left',
  } as CSSProperties,
`;
    expect(paintedButtonsWithoutColour(shipped)).toEqual(['statCard']);
  });

  it('accepts the same style once it names a colour', () => {
    const fixed = `
      <button key={s.label} onClick={() => selectTab(s.tab)} style={st.statCard}>
      const st = {
  statCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
    padding: '16px 18px', borderRadius: 12, border: '1px solid var(--border)',
    background: 'var(--panel)', color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
  } as CSSProperties,
`;
    expect(paintedButtonsWithoutColour(fixed)).toEqual([]);
  });
});
