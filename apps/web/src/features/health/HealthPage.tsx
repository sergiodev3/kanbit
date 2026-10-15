import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from './health.api';

type Tone = 'ok' | 'bad' | 'pending';

const toneClasses: Record<Tone, string> = {
  ok: 'bg-emerald-100 text-emerald-800',
  bad: 'bg-red-100 text-red-800',
  pending: 'bg-slate-200 text-slate-700',
};

function StatusRow({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className={`rounded-full px-3 py-1 text-sm font-semibold ${toneClasses[tone]}`}>{value}</dd>
    </div>
  );
}

const timeFormatter = new Intl.DateTimeFormat('es-MX', { timeStyle: 'medium' });

export function HealthPage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 10_000,
  });

  const apiTone: Tone = health.isPending ? 'pending' : health.isError ? 'bad' : 'ok';
  const apiLabel = health.isPending ? 'Verificando…' : health.isError ? 'Sin respuesta' : 'En línea';

  const dbTone: Tone = health.data ? (health.data.db === 'ok' ? 'ok' : 'bad') : 'pending';
  const dbLabel = health.data ? (health.data.db === 'ok' ? 'Conectada' : 'Sin conexión') : '—';

  return (
    <section aria-labelledby="health-title" className="space-y-4">
      <div>
        <h1 id="health-title" className="text-2xl font-bold">
          Estado del servicio
        </h1>
        <p className="text-sm text-slate-600">Se actualiza automáticamente cada 10 segundos.</p>
      </div>

      <dl className="divide-y divide-slate-200 rounded-xl bg-white px-4 shadow-sm ring-1 ring-slate-200">
        <StatusRow label="API" value={apiLabel} tone={apiTone} />
        <StatusRow label="Base de datos" value={dbLabel} tone={dbTone} />
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="text-sm text-slate-600">Versión</dt>
          <dd className="font-mono text-sm">{health.data?.version ?? '—'}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-3">
          <dt className="text-sm text-slate-600">Última verificación</dt>
          <dd className="text-sm">
            {health.dataUpdatedAt ? timeFormatter.format(new Date(health.dataUpdatedAt)) : '—'}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => void health.refetch()}
        disabled={health.isFetching}
        className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {health.isFetching ? 'Verificando…' : 'Verificar ahora'}
      </button>
    </section>
  );
}
