import { CHECKIN_FIELDS, CHECKIN_QUESTIONS, type CheckinRow } from './meetings-model';

export interface ProjectionCheckinsProps {
  rows: readonly CheckinRow[];
}

/** The team's check-ins in large type for the projector (spec §8.4); members without one are marked. */
export function ProjectionCheckins({ rows }: ProjectionCheckinsProps) {
  return (
    <section aria-label="Check-ins del equipo" className="space-y-4">
      <h2 className="text-4xl font-bold">Check-ins del equipo</h2>
      <ul className="grid gap-4 lg:grid-cols-2">
        {rows.map(({ member, checkin }) => (
          <li key={member.userId} className="space-y-3 rounded-2xl bg-slate-900 p-5 ring-2 ring-slate-600">
            <h3 className="text-3xl font-bold">{member.name}</h3>
            {checkin ? (
              <dl className="space-y-3 text-2xl">
                {CHECKIN_FIELDS.map((field) => (
                  <div key={field}>
                    <dt className="font-semibold text-slate-300">{CHECKIN_QUESTIONS[field]}</dt>
                    <dd className="break-words whitespace-pre-wrap text-white">
                      {checkin[field] ?? <span className="text-slate-400">Sin respuesta</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-2xl text-slate-300">Sin check-in</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
