import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** `registerType: 'prompt'`: the new service worker waits until the user reloads (spec §5.2). */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => {
        void registration.update();
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-slate-900 p-4 text-white shadow-lg"
    >
      <span className="text-sm">Hay una actualización</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:text-white"
        >
          Después
        </button>
        <button
          type="button"
          onClick={() => void updateServiceWorker(true)}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold hover:bg-brand-700"
        >
          Recargar
        </button>
      </div>
    </div>
  );
}
