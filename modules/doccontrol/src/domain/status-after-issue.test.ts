import { describe, expect, it } from 'vitest';
import { type RegisterStatus, statusAfterIssue } from './drawing-register';

/**
 * An as-built survives its own release.
 *
 * Issuing used to set every register entry to `for_construction`. That is right for almost any
 * drawing — releasing one makes it the drawing to build from — and wrong for the one status that
 * is terminal: an as-built records what WAS built, and being released is what makes it the
 * record. The effect was that a drawing could either BE the as-built or have been released,
 * never both, and Handover's as-built gate correctly refused a released as-built labelled "for
 * construction".
 */
describe('the register status a revision leaves behind when it is issued', () => {
  it('keeps as_built, because an as-built is released and stays an as-built', () => {
    expect(statusAfterIssue('as_built')).toBe('as_built');
  });

  it('releases everything else for construction', () => {
    for (const from of ['draft', 'for_review', 'for_construction'] as RegisterStatus[]) {
      expect(statusAfterIssue(from), from).toBe('for_construction');
    }
  });

  it('brings a superseded entry back into use rather than freezing it', () => {
    // A superseded header receiving a newly issued revision has a current revision again, so it
    // is for construction like any other — only `as_built` is terminal.
    expect(statusAfterIssue('superseded')).toBe('for_construction');
  });

  it('never invents a status outside the register vocabulary', () => {
    const allowed: RegisterStatus[] = ['draft', 'for_review', 'for_construction', 'superseded', 'as_built'];
    for (const from of allowed) expect(allowed).toContain(statusAfterIssue(from));
  });
});
