import type { ReactNode } from 'react';

/** Announces every form problem at once (`role="alert"`); renders nothing when there are none. */
export function ErrorSummary({ messages }: { messages: readonly string[] }) {
  if (messages.length === 0) return null;
  return (
    <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200">
      {messages.length === 1 ? (
        <p>{messages[0]}</p>
      ) : (
        <>
          <p className="font-semibold">Revisa lo siguiente:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function SubmitButton({ pending, pendingLabel, children }: { pending: boolean; pendingLabel: string; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export const cardClasses = 'space-y-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200';
export const linkClasses = 'font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-600';
