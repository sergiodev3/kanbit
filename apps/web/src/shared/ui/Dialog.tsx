import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { ErrorSummary } from '../forms/FormParts';
import { errorMessage } from '../../lib/error-messages';
import { dangerButton, primaryButton, secondaryButton } from './buttons';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

const focusables = (root: HTMLElement): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Modal dialog: focuses its first control on open, keeps Tab inside, closes on Escape and
 * returns focus to the element that opened it.
 */
export function Dialog({ title, onClose, children }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    if (panel) (focusables(panel)[0] ?? panel).focus();
    return () => opener?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    const panel = panelRef.current;
    if (event.key !== 'Tab' || !panel) return;
    const items = focusables(panel);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      event.preventDefault();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-xl focus:outline-none"
      >
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  /** Failure of the confirmed action, shown inside the dialog. */
  error?: unknown;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** In-app replacement for `window.confirm`; "Cancelar" comes first and gets the initial focus. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  pendingLabel,
  pending,
  error,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog title={title} onClose={onCancel}>
      <div className="space-y-2 text-sm text-slate-700">{children}</div>
      <ErrorSummary messages={error ? [errorMessage(error)] : []} />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className={secondaryButton}>
          Cancelar
        </button>
        <button type="button" onClick={onConfirm} disabled={pending} className={danger ? dangerButton : primaryButton}>
          {pending ? pendingLabel : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
