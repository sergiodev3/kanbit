import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPut } from './api';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api helpers', () => {
  it('sends JSON bodies with the session cookie and returns the parsed response', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(201, { id: 'g1' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiPost<{ id: string }>('/groups', { name: 'Grupo A' });

    expect(result).toEqual({ id: 'g1' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/groups',
      expect.objectContaining({ method: 'POST', credentials: 'include', body: '{"name":"Grupo A"}' }),
    );
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
  });

  it('uses the matching HTTP method for each helper', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await apiGet('/a');
    await apiPatch('/b', { x: 1 });
    await apiPut('/c', { y: 2 });
    await apiDelete('/d');

    expect(fetchMock.mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual(['GET', 'PATCH', 'PUT', 'DELETE']);
  });

  it('returns undefined for 204 No Content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );

    await expect(apiPost('/auth/logout')).resolves.toBeUndefined();
  });

  it('turns the error envelope into a typed ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(409, { error: { code: 'USERNAME_TAKEN', message: 'Username taken', details: { field: 'username' } } }),
      ),
    );

    const error = await apiPost('/auth/register', {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'USERNAME_TAKEN',
      message: 'Username taken',
      details: { field: 'username' },
    });
  });

  it('falls back to an HTTP_<status> code when the body is not an envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Bad gateway', { status: 502, statusText: 'Bad Gateway' })),
    );

    await expect(apiGet('/groups')).rejects.toMatchObject({ status: 502, code: 'HTTP_502' });
  });
});
