import type { Id } from '@aura/shared';

/**
 * AN AUTHOR DOES NOT REVIEW OR DECIDE THEIR OWN WORK — the owner's SEC-01 decisions D-04 and D-05
 * (2026-09-28).
 *
 * The Technical Manager holds every engineering review and decision, and can also AUTHOR (the role
 * carries `engineering.*`). Until this, nothing compared the reviewer with the author: the permission
 * was asserted and the decision recorded, so a drawing, submittal, design change or engineering document
 * could be written and approved by one person, and an RFI could be raised and answered by the same
 * Project Engineer. A permission cannot express "not this item's author" — only the domain knows who that
 * is — so the rule lives here, beside the records.
 *
 * `actorId` null is the unauthenticated development seam, which has no identity to compare.
 */
export function assertNotOwnWork(
  actorId: Id | null | undefined,
  authors: ReadonlyArray<Id | null | undefined>,
  words: { item: string; authored: string; act: string },
): void {
  if (!actorId) return;
  if (authors.some((author) => author != null && author === actorId)) {
    throw new Error(`the person who ${words.authored} this ${words.item} may not ${words.act} their own ${words.item}`);
  }
}
