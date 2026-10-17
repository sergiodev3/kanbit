import type { MeResponse, Role } from '@kanbit/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type InitialEntry, type RouteObject } from 'react-router';
import { vi } from 'vitest';
import { createQueryClient } from '../app/query-client';
import { API_URL } from '../lib/api';

export const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const errorResponse = (status: number, code: string): Response =>
  jsonResponse(status, { error: { code, message: code } });

export const unauthenticated = (): Response => errorResponse(401, 'UNAUTHENTICATED');

export function meFixture(role: Role, overrides: Partial<MeResponse['user']> = {}): MeResponse {
  return {
    user: { id: `${role.toLowerCase()}-1`, name: role === 'TEACHER' ? 'Ana Docente' : 'Luis Alumno', username: role === 'TEACHER' ? 'ana' : 'a001', role, ...overrides },
    memberships:
      role === 'STUDENT'
        ? [{ groupId: 'g1', groupName: 'Grupo A', teamId: null, teamName: null, isModerator: false }]
        : [],
  };
}

type Handler = (init: RequestInit) => Response | Promise<Response>;

/** Stubs `fetch` with handlers keyed by `"METHOD /path"` (path without the API prefix). */
export function mockApi(handlers: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const key = `${init.method ?? 'GET'} ${url.slice(API_URL.length)}`;
    const handler = handlers[key];
    if (!handler) return errorResponse(404, `UNMOCKED ${key}`);
    return handler(init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Parsed JSON body of the first request matching `"METHOD /path"`. */
export function requestBody(fetchMock: ReturnType<typeof mockApi>, key: string): unknown {
  const [method, path] = key.split(' ');
  const call = fetchMock.mock.calls.find(
    ([input, init]) => (init?.method ?? 'GET') === method && String(input) === `${API_URL}${path}`,
  );
  const body = call?.[1]?.body;
  return typeof body === 'string' ? (JSON.parse(body) as unknown) : undefined;
}

/** Stubs `window.matchMedia` so every query reports `matches`; undo with `vi.unstubAllGlobals()`. */
export function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

export function renderRoutes(routes: RouteObject[], initialEntries: InitialEntry[] = ['/']) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
  const router = createMemoryRouter(routes, { initialEntries });
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router, client };
}
