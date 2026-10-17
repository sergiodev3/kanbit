import { useEffect } from 'react';

/**
 * Keeps the screen on while the projection is open (Screen Wake Lock API, spec §8.4). The browser drops the lock when
 * the tab is hidden, so it is requested again when the tab is visible. Unsupported or refused: nothing happens.
 */
export function useWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    const wakeLock = navigator.wakeLock;
    let sentinel: WakeLockSentinel | null = null;
    let mounted = true;

    let requesting = false;

    const acquire = async () => {
      if (requesting) return;
      requesting = true;
      try {
        const granted = await wakeLock.request('screen');
        if (!mounted) {
          await granted.release();
          return;
        }
        sentinel = granted;
      } catch {
        // Refused (battery saver, permissions policy) or released meanwhile: the projection works without it.
      } finally {
        requesting = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && (sentinel === null || sentinel.released)) void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);
}
