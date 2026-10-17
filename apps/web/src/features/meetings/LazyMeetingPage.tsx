import { lazy, Suspense } from 'react';
import type { MeetingPageProps } from './MeetingPage';

// The meeting (check-in forms, notes) is its own chunk, kept out of the main bundle like the board.
const MeetingPage = lazy(() => import('./MeetingPage').then((module) => ({ default: module.MeetingPage })));

export function LazyMeetingPage(props: MeetingPageProps) {
  return (
    <Suspense
      fallback={
        <p role="status" className="text-slate-600">
          Cargando reunión…
        </p>
      }
    >
      <MeetingPage {...props} />
    </Suspense>
  );
}
