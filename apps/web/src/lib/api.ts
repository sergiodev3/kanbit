/** Base URL: production points at https://api.kanbit.app/api/v1; dev uses the Vite proxy. */
export const API_URL: string = import.meta.env.VITE_API_URL ?? '/api/v1';

interface ErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
}

const isErrorEnvelope = (value: unknown): value is ErrorEnvelope =>
  typeof value === 'object' &&
  value !== null &&
  'error' in value &&
  typeof value.error === 'object' &&
  value.error !== null &&
  'code' in value.error &&
  typeof value.error.code === 'string' &&
  'message' in value.error &&
  typeof value.error.message === 'string';

/** Typed error built from the API's `{ error: { code, message, details? } }` shape. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    /** Raw parsed body, for endpoints whose non-2xx body is not an error envelope. */
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' });
  const body = await parseBody(res);

  if (!res.ok) {
    if (isErrorEnvelope(body)) {
      const { code, message, details } = body.error;
      throw new ApiError(res.status, code, message, details, body);
    }
    throw new ApiError(res.status, `HTTP_${res.status}`, res.statusText || 'Request failed', undefined, body);
  }

  // Callers validate the shape with zod where it matters.
  return body as T;
}

const withJsonBody = (method: string, body: unknown): RequestInit =>
  body === undefined ? { method } : { method, body: JSON.stringify(body) };

export const apiGet = <T>(path: string): Promise<T> => apiFetch<T>(path);

/** 204 responses resolve to `undefined`. */
export const apiPost = <T = undefined>(path: string, body?: unknown): Promise<T> =>
  apiFetch<T>(path, withJsonBody('POST', body));

export const apiPatch = <T = undefined>(path: string, body?: unknown): Promise<T> =>
  apiFetch<T>(path, withJsonBody('PATCH', body));

export const apiPut = <T = undefined>(path: string, body?: unknown): Promise<T> =>
  apiFetch<T>(path, withJsonBody('PUT', body));

export const apiDelete = <T = undefined>(path: string): Promise<T> => apiFetch<T>(path, { method: 'DELETE' });

/** True when `error` is an `ApiError`, optionally with the given code. */
export const isApiError = (error: unknown, code?: string): error is ApiError =>
  error instanceof ApiError && (code === undefined || error.code === code);
