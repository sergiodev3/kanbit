/** Whole seconds a meeting lasted (spec §7.4); a clock that went backwards counts as 0. */
export function meetingDurationSeconds(startedAt: Date, endedAt: Date): number {
  return Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
}
