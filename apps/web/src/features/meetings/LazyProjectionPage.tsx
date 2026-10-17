import { lazy, Suspense } from 'react';
import type { ProjectionPageProps } from './ProjectionPage';

// The projection (timer, large check-ins, compact board) is its own chunk, kept out of the main bundle.
const ProjectionPage = lazy(() => import('./ProjectionPage').then((module) => ({ default: module.ProjectionPage })));

export function LazyProjectionPage(props: ProjectionPageProps) {
  return (
    <Suspense
      fallback={
        <p role="status" className="text-slate-600">
          Cargando proyección…
        </p>
      }
    >
      <ProjectionPage {...props} />
    </Suspense>
  );
}
