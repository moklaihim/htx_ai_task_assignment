import type { ErrorResponse } from '../types';

/**
 * Thrown by every wrapper in `src/api/` on a non-2xx response (design §4.1's
 * error shape). `code` lets a caller branch on failure type; `message` is
 * what gets shown to the user, e.g. in the toast the Update-button pattern
 * shows on a 400 (design §6.4, REQ-3.4).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorResponse['error']['code'] | 'UNKNOWN';

  constructor(status: number, code: ApiError['code'], message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Shared `fetch` wrapper (design §6.5: plain `fetch` behind typed wrappers,
 * no data-fetching library). Every backend route responds under `/api` via
 * the nginx proxy in production and the Vite dev-server proxy locally (see
 * `vite.config.ts`, `nginx.conf`), so callers pass paths like `/tasks`.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ErrorResponse | null;
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? `Request to ${path} failed with status ${res.status}`,
    );
  }

  return (await res.json()) as T;
}

export function getJson<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function patchJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}
