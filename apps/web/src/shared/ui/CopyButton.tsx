import { useState } from 'react';
import { secondaryButton } from './buttons';

type CopyState = 'idle' | 'copied' | 'failed';

/** Copies `text` to the clipboard and announces the outcome in a live region. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<CopyState>('idle');

  const copy = async () => {
    try {
      // `navigator.clipboard` is missing outside secure contexts; the TypeError lands in the catch.
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => void copy()} className={secondaryButton}>
        {label}
      </button>
      <span role="status" className={`text-sm ${state === 'failed' ? 'text-red-700' : 'text-emerald-800'}`}>
        {state === 'copied' && 'Copiado.'}
        {state === 'failed' && 'No se pudo copiar. Selecciona el texto y cópialo manualmente.'}
      </span>
    </div>
  );
}
