import { lazy, Suspense } from 'react';
import type { BoardPageProps } from './BoardPage';

// The board (drag & drop, card forms, client ids) is its own chunk, kept out of the main bundle.
const BoardPage = lazy(() => import('./BoardPage').then((module) => ({ default: module.BoardPage })));

export function LazyBoardPage(props: BoardPageProps) {
  return (
    <Suspense
      fallback={
        <p role="status" className="text-slate-600">
          Cargando tablero…
        </p>
      }
    >
      <BoardPage {...props} />
    </Suspense>
  );
}
