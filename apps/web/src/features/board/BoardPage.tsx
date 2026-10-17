import type { BoardSprint, CardResponse } from '@kanbit/shared';
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { errorMessage } from '../../lib/error-messages';
import { useOnlineStatus } from '../../shared/pwa/OfflineBanner';
import { primaryButton } from '../../shared/ui/buttons';
import { useIsNarrow } from '../../shared/ui/useIsNarrow';
import { useMe } from '../auth/auth.api';
import { useBoard } from './board.api';
import { BOARD_COLUMNS, buildRows, onlyRowOf, viewerOf, type BoardRow } from './board-model';
import { CardDialog, CreateCardDialog, type BoardContext } from './CardDialog';
import { CardTile } from './CardTile';

interface BoardPageProps {
  teamId: string;
  /** The teacher's view (spec §8.5): no create, no filter, card details only. */
  readOnly?: boolean;
}

type OpenDialog = { kind: 'create' } | { kind: 'card'; cardId: string } | null;

/** Spec §8.2 "Mi equipo / Tablero": rows per member plus "Sin asignar" × the four fixed columns. */
export function BoardPage({ teamId, readOnly = false }: BoardPageProps) {
  const board = useBoard(teamId);
  const me = useMe();
  const online = useOnlineStatus();
  const narrow = useIsNarrow();
  const [onlyMine, setOnlyMine] = useState(false);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const data = board.data;
  const rows = useMemo(() => (data ? buildRows(data) : []), [data]);

  if (board.isPending) {
    return (
      <p role="status" className="text-slate-600">
        Cargando tablero…
      </p>
    );
  }
  if (!data) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200">
        {errorMessage(board.error)}
      </p>
    );
  }

  const userId = me.data?.user.id ?? null;
  const viewer = !readOnly && userId ? viewerOf(data, userId) : null;
  const canCreate = viewer?.isMember === true;
  const context: BoardContext = { board: data, rows, viewer, online };
  const visibleRows = onlyMine && viewer?.isMember ? onlyRowOf(rows, viewer.userId) : rows;
  const projectNames = new Map(data.projects.map((project) => [project.id, project.name]));
  const memberNames = new Map(data.members.map((member) => [member.userId, member.name]));
  const openCard = data.cards.find((card) => dialog?.kind === 'card' && card.id === dialog.cardId);

  const tile = (card: CardResponse) => (
    <CardTile
      card={card}
      projectName={projectNames.get(card.projectId) ?? ''}
      assigneeName={card.assigneeId ? (memberNames.get(card.assigneeId) ?? null) : null}
      onOpen={() => setDialog({ kind: 'card', cardId: card.id })}
    />
  );

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{data.team.name}</h1>
          {readOnly && <Badge>Solo lectura</Badge>}
          {viewer?.isModerator && <Badge>Eres moderador del equipo</Badge>}
        </div>
        <SprintSummary sprint={data.sprint} />
      </header>

      {canCreate && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(event) => setOnlyMine(event.target.checked)}
              className="h-5 w-5 rounded border-slate-400 accent-brand-600"
            />
            Solo mis tarjetas
          </label>
          {canCreate && (
            <button
              type="button"
              onClick={() => setDialog({ kind: 'create' })}
              disabled={!online || data.projects.length === 0}
              className={primaryButton}
            >
              Nueva tarjeta
            </button>
          )}
        </div>
      )}
      {canCreate && !online && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Sin conexión: no puedes crear, editar ni mover tarjetas.
        </p>
      )}
      {canCreate && online && data.projects.length === 0 && (
        <p className="text-sm text-slate-600">Para crear tarjetas, el moderador debe agregar un proyecto.</p>
      )}

      {narrow ? (
        <BoardTabs rows={visibleRows} viewerId={viewer?.userId ?? null} renderCard={tile} />
      ) : (
        <BoardGrid rows={visibleRows} renderCard={tile} />
      )}

      {dialog?.kind === 'create' && <CreateCardDialog context={context} onClose={() => setDialog(null)} />}
      {openCard && <CardDialog key={openCard.id} context={context} card={openCard} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700 ring-1 ring-brand-600">
      {children}
    </span>
  );
}

const dayFormat = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' });
// Display only: a calendar date read as UTC midnight prints the same day in any zone.
const formatDay = (isoDate: string): string => dayFormat.format(new Date(`${isoDate}T00:00:00Z`));

function SprintSummary({ sprint }: { sprint: BoardSprint | null }) {
  if (!sprint) return <p className="text-slate-600">Sin sprint abierto</p>;
  return (
    <div className="text-slate-700">
      <p className="font-semibold">
        Sprint {sprint.number} · {formatDay(sprint.startDate)} – {formatDay(sprint.endDate)}
      </p>
      {sprint.goal && <p className="text-sm">Meta: {sprint.goal}</p>}
    </div>
  );
}

type RenderCard = (card: CardResponse) => ReactNode;

function BoardCell({ label, cards, renderCard }: { label: string; cards: readonly CardResponse[]; renderCard: RenderCard }) {
  return (
    <div role="group" aria-label={label} className="h-full min-h-20 rounded-lg bg-slate-100 p-2">
      {cards.length === 0 ? (
        <p className="sr-only">Sin tarjetas</p>
      ) : (
        <ul className="space-y-2">
          {cards.map((card) => (
            <li key={card.id}>{renderCard(card)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const cellLabel = (row: BoardRow, columnLabel: string) => `${row.label} · ${columnLabel}`;

/** Desktop: the full rows × columns matrix, scrolling sideways when the screen is too narrow for it. */
function BoardGrid({ rows, renderCard }: { rows: readonly BoardRow[]; renderCard: RenderCard }) {
  return (
    <div className="overflow-x-auto pb-2">
      <div
        role="table"
        aria-label="Tablero del equipo"
        className="grid min-w-[60rem] grid-cols-[9rem_repeat(4,minmax(12rem,1fr))] gap-2"
      >
        <div role="row" className="col-span-5 grid grid-cols-subgrid">
          <div role="columnheader" className="px-2 text-sm font-semibold text-slate-600">
            Integrante
          </div>
          {BOARD_COLUMNS.map((column) => (
            <div key={column.status} role="columnheader" className="px-2 text-sm font-bold text-slate-800">
              {column.label}
            </div>
          ))}
        </div>
        {rows.map((row) => (
          <div key={row.id} role="row" className="col-span-5 grid grid-cols-subgrid">
            <div role="rowheader" className="break-words px-2 py-2 font-semibold text-slate-900">
              {row.label}
              {row.isModerator && <span className="block text-xs font-normal text-slate-600"> (moderador)</span>}
            </div>
            {BOARD_COLUMNS.map((column) => (
              <div key={column.status} role="cell">
                <BoardCell label={cellLabel(row, column.label)} cards={row.cells[column.status]} renderCard={renderCard} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface BoardTabsProps {
  rows: readonly BoardRow[];
  viewerId: string | null;
  renderCard: RenderCard;
}

/** Phones (spec §12.1): one row per tab, its four columns stacked; starts on the viewer's own row. */
function BoardTabs({ rows, viewerId, renderCard }: BoardTabsProps) {
  const baseId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const current = rows.find((row) => row.id === selectedId) ?? rows.find((row) => row.assigneeId === viewerId) ?? rows[0];
  if (!current) return null;

  const select = (row: BoardRow) => {
    setSelectedId(row.id);
    tabRefs.current.get(row.id)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = rows.indexOf(current);
    const next: Record<string, BoardRow | undefined> = {
      ArrowRight: rows[(index + 1) % rows.length],
      ArrowLeft: rows[(index - 1 + rows.length) % rows.length],
      Home: rows[0],
      End: rows[rows.length - 1],
    };
    const target = next[event.key];
    if (!target) return;
    event.preventDefault();
    select(target);
  };

  const tabId = (row: BoardRow) => `${baseId}-tab-${row.id}`;
  const panelId = `${baseId}-panel`;

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Filas del tablero" className="flex gap-1 overflow-x-auto pb-1">
        {rows.map((row) => {
          const selected = row === current;
          return (
            <button
              key={row.id}
              ref={(element) => {
                if (element) tabRefs.current.set(row.id, element);
                else tabRefs.current.delete(row.id);
              }}
              type="button"
              role="tab"
              id={tabId(row)}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(row)}
              onKeyDown={onKeyDown}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                selected ? 'bg-brand-600 text-white' : 'bg-white text-slate-800 ring-1 ring-slate-300'
              }`}
            >
              {row.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId(current)} className="space-y-3">
        {BOARD_COLUMNS.map((column) => (
          <section key={column.status} className="space-y-1">
            <h2 className="text-sm font-bold text-slate-800">{column.label}</h2>
            <BoardCell label={cellLabel(current, column.label)} cards={current.cells[column.status]} renderCard={renderCard} />
          </section>
        ))}
      </div>
    </div>
  );
}
