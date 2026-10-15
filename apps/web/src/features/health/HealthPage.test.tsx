import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthPage } from './HealthPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HealthPage />
    </QueryClientProvider>,
  );
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HealthPage', () => {
  it('shows API, database and version when the API is healthy', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { status: 'ok', db: 'ok', version: '0.1.0', time: '2026-10-19T15:00:00.000Z' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    expect(await screen.findByText('En línea')).toBeInTheDocument();
    expect(screen.getByText('Conectada')).toBeInTheDocument();
    expect(screen.getByText('0.1.0')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/health', expect.objectContaining({ credentials: 'include' }));
  });

  it('reports the database as down on 503', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(503, { status: 'error', db: 'down', version: '0.1.0', time: '2026-10-19T15:00:00.000Z' }),
      ),
    );

    renderPage();

    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    expect(screen.getByText('En línea')).toBeInTheDocument();
  });

  it('reports the API as unreachable when fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    renderPage();

    expect(await screen.findByText('Sin respuesta')).toBeInTheDocument();
  });
});
