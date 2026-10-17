import type { BoardResponse } from '@kanbit/shared';
import { useMemo } from 'react';
import { BOARD_COLUMNS, buildRows, UNASSIGNED_ROW_ID } from '../board/board-model';

/** Titles shown per cell; the rest is counted, so a crowded cell cannot push the check-ins off the screen. */
const MAX_TITLES = 3;

export interface ProjectionBoardProps {
  board: BoardResponse;
}

/** A compact, read-only board for the projector (spec §8.4): a row per member, the four columns, truncated titles. */
export function ProjectionBoard({ board }: ProjectionBoardProps) {
  const rows = useMemo(
    () =>
      buildRows(board).filter(
        (row) => row.id !== UNASSIGNED_ROW_ID || BOARD_COLUMNS.some((column) => row.cells[column.status].length > 0),
      ),
    [board],
  );

  return (
    <section aria-label="Tablero del equipo" className="space-y-4">
      <h2 className="text-4xl font-bold">Tablero</h2>
      <div className="overflow-x-auto">
        <table aria-label="Tablero del equipo" className="w-full table-fixed border-separate border-spacing-2 text-left">
          <thead>
            <tr>
              <th scope="col" className="w-40 text-xl font-semibold text-slate-300">
                Integrante
              </th>
              {BOARD_COLUMNS.map((column) => (
                <th key={column.status} scope="col" className="text-xl font-bold">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="align-top text-xl font-bold break-words">
                  {row.label}
                </th>
                {BOARD_COLUMNS.map((column) => {
                  const cards = row.cells[column.status];
                  return (
                    <td key={column.status} className="rounded-xl bg-slate-900 p-2 align-top ring-1 ring-slate-600">
                      <ul className="space-y-1">
                        {cards.slice(0, MAX_TITLES).map((card) => (
                          <li key={card.id} className="truncate text-xl">
                            {card.title}
                          </li>
                        ))}
                        {cards.length > MAX_TITLES && (
                          <li className="text-lg text-slate-300">{`+${cards.length - MAX_TITLES} más`}</li>
                        )}
                      </ul>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
