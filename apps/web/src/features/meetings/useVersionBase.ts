import { useState } from 'react';

/**
 * The version (`updatedAt`) a form started from, which a write sends as `expectedUpdatedAt`. After a 409 the page
 * reloads; once the fresh record arrives, `onRebase` lets the form re-base on it. A poll that changes the record
 * under a user who is typing never touches the form: only a conflict (`awaitFresh`) or a save (`setBase`) re-bases.
 *
 * `sameContent` is for records whose `updatedAt` also moves for reasons that do not touch the edited fields (a
 * meeting that starts): such a change is adopted silently, while a change to the edited fields stays unadopted so
 * the next save is rejected instead of overwriting someone else's edit.
 */
export function useVersionBase<T extends { updatedAt: string }>(
  current: T | null,
  onRebase: (fresh: T) => void,
  sameContent?: (a: T, b: T) => boolean,
) {
  const [base, setBase] = useState<T | null>(current);
  const [awaitingFresh, setAwaitingFresh] = useState(false);
  if (current && base && current.updatedAt !== base.updatedAt) {
    if (awaitingFresh) {
      setBase(current);
      setAwaitingFresh(false);
      onRebase(current);
    } else if (sameContent?.(current, base)) {
      setBase(current);
    }
  } else if (awaitingFresh && current && !base) {
    setBase(current);
    setAwaitingFresh(false);
    onRebase(current);
  }
  return { base, setBase, awaitFresh: () => setAwaitingFresh(true) };
}
