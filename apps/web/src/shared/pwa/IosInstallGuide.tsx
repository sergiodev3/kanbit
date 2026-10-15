import { useState } from 'react';

const DISMISS_KEY = 'kanbit:ios-install-guide-dismissed';

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as "MacIntel" with touch support.
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIos && !isOtherBrowser;
}

function isStandalone(): boolean {
  // `navigator.standalone` is a non-standard iOS Safari property.
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** iOS has no `beforeinstallprompt`: show the manual "Compartir → Agregar a inicio" steps. */
export function IosInstallGuide() {
  const [visible, setVisible] = useState(() => isIosSafari() && !isStandalone() && !readDismissed());
  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Storage may be unavailable (private mode); hiding for this session is enough.
    }
    setVisible(false);
  };

  return (
    <aside className="mb-4 rounded-xl bg-brand-50 p-4 text-sm text-slate-800 ring-1 ring-brand-600/20">
      <p className="font-semibold">Instala Kanbit en tu iPhone o iPad</p>
      <p className="mt-1">
        Toca <span className="font-semibold">Compartir</span> y luego{' '}
        <span className="font-semibold">Agregar a inicio</span>.
      </p>
      <button type="button" onClick={dismiss} className="mt-2 font-semibold text-brand-700 underline">
        Entendido
      </button>
    </aside>
  );
}
