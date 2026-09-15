import type { Employee } from './employee';

/**
 * The rules for binding an EMPLOYMENT record to a LOGIN.
 *
 * WHY THIS IS NOT A MATCH. The cheap version of this feature compares names, or emails, and
 * needs no administration at all. It is also the version that quietly assigns one person's work
 * to another: two employees share a name far more often than anyone expects, a site mailbox is
 * shared by a whole crew, and a personal address follows someone to their next employer. A link
 * that is *probably* right is worse than no link, because everything downstream — allocations,
 * acceptance, timesheets, approvals — then reads as an authoritative statement about a named
 * person. So the link is declared by an administrator, stamped with who declared it and when,
 * and every rule below refuses rather than guesses.
 *
 * WHAT THE LINK IS NOT. It is not an access grant. Binding an account to an employee lets AURA
 * say "these allocations are yours"; it does not admit that account to a project, and project
 * membership remains the AccessService's answer alone. The two are deliberately separate: a
 * planner may commit anyone's time to an activity, and nobody should be able to widen their own
 * access by being booked.
 */

export interface AccountLinkInput {
  /** The platform account id (`aura_users.user_id`). Existence is the service's check, not this one. */
  userId: string;
  /** Who is declaring the link. Recorded; never inferred. */
  actorId: string | null;
}

/** Bind an account to this employee. Pure — the caller persists the result. */
export function linkEmployeeAccount(employee: Employee, input: AccountLinkInput): Employee {
  const userId = input.userId?.trim();
  if (!userId) throw new Error('an account link needs a user account id');
  if (employee.deletedAt) {
    throw new Error('a deleted employee record cannot be linked to an account; restore it first');
  }
  if (employee.status === 'terminated') {
    // A terminated employee keeps their history and loses their future. Linking one would send
    // live allocations and approvals to somebody who has left.
    throw new Error('a terminated employee cannot be linked to an account');
  }
  if (employee.userId && employee.userId !== userId) {
    // Silently re-pointing the link would move every attribution that hangs off it — past work
    // included — from one person to another in a single write, with nothing recording that it
    // happened. Unlinking first makes the break explicit and separately audited.
    throw new Error(
      `this employee is already linked to account ${employee.userId}; unlink that account before linking another`,
    );
  }
  // Idempotent: re-declaring the SAME link keeps the original provenance rather than restamping
  // it, so "who established this identity, and when" stays the answer to the question it was.
  if (employee.userId === userId) return employee;

  const now = new Date().toISOString();
  return { ...employee, userId, userLinkedAt: now, userLinkedBy: input.actorId ?? null, updatedAt: now };
}

/**
 * Break the link. The employment record and the account both survive it.
 *
 * Takes no actor: who unlinked is recorded by the event the service appends, and a
 * `userUnlinkedBy` column on a row that no longer claims an account would be provenance for
 * an absence.
 */
export function unlinkEmployeeAccount(employee: Employee): Employee {
  if (!employee.userId) throw new Error('this employee is not linked to an account');
  const now = new Date().toISOString();
  // The provenance fields clear with the link. Keeping a `userLinkedBy` beside a null `userId`
  // would read, later, as a link that is still in force.
  return { ...employee, userId: null, userLinkedAt: null, userLinkedBy: null, updatedAt: now };
}

/** Does this employee act as the given account? Typed so a null never matches a null. */
export const employeeHoldsAccount = (employee: Pick<Employee, 'userId'>, userId: string): boolean =>
  Boolean(employee.userId) && employee.userId === userId;
