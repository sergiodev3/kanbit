import { useId } from 'react';
import { cardClasses } from '../../shared/forms/FormParts';
import { CHECKIN_FIELDS, CHECKIN_QUESTIONS, type CheckinRow } from './meetings-model';

export interface CheckinListProps {
  rows: readonly CheckinRow[];
}

/** Read-only answers of every team member (spec §8.4); members without a check-in are marked. */
export function CheckinList({ rows }: CheckinListProps) {
  const headingId = useId();
  const names = new Map(rows.map(({ member }) => [member.userId, member.name]));

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="text-lg font-bold">
        Check-ins del equipo
      </h2>
      <ul aria-label="Check-ins" className="space-y-3">
        {rows.map(({ member, checkin }) => (
          <li key={member.userId} className={cardClasses}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-900">{member.name}</h3>
              {checkin?.capturedById && (
                <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-600">
                  {`Capturado por ${names.get(checkin.capturedById) ?? 'el moderador'}`}
                </span>
              )}
            </div>
            {checkin ? (
              <dl className="space-y-2 text-sm">
                {CHECKIN_FIELDS.map((field) => (
                  <div key={field}>
                    <dt className="font-semibold text-slate-800">{CHECKIN_QUESTIONS[field]}</dt>
                    <dd className="whitespace-pre-wrap break-words text-slate-700">
                      {checkin[field] ?? <span className="text-slate-500">Sin respuesta</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-slate-600">Sin check-in</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
