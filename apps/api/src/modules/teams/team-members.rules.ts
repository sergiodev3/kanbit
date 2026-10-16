export interface MemberRow {
  userId: string;
  /** Board row order: the index in the desired list. */
  rowOrder: number;
  isModerator: boolean;
}

/** How to turn a team's current member set into the desired one. */
export interface MemberPlan {
  /** Current members to delete. */
  remove: string[];
  /** New member rows to insert. */
  create: MemberRow[];
  /** Members that stay, with their new row order and moderator flag. */
  keep: MemberRow[];
  /** Exactly one moderator whenever the team has members (spec §6.1), else null. */
  moderatorId: string | null;
}

/**
 * Plans a full replacement of a team's members. The current moderator keeps the role while
 * still a member; otherwise the first desired member takes it.
 */
export function planMembers(
  current: readonly string[],
  desired: readonly string[],
  moderatorId: string | null,
): MemberPlan {
  if (new Set(desired).size !== desired.length) throw new Error('planMembers: duplicate desired members');

  const desiredSet = new Set(desired);
  const currentSet = new Set(current);
  const nextModerator =
    moderatorId !== null && desiredSet.has(moderatorId) ? moderatorId : (desired[0] ?? null);

  const rows = desired.map((userId, rowOrder): MemberRow => ({
    userId,
    rowOrder,
    isModerator: userId === nextModerator,
  }));

  return {
    remove: current.filter((userId) => !desiredSet.has(userId)),
    create: rows.filter((row) => !currentSet.has(row.userId)),
    keep: rows.filter((row) => currentSet.has(row.userId)),
    moderatorId: nextModerator,
  };
}
