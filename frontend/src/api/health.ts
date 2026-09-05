export interface HealthResponse {
  status: string;
}

export interface DbHealthResponse {
  status: string;
  db: string;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`${path} responded ${res.status}`);
  }
  return (await res.json()) as T;
}

export function fetchHealth(): Promise<HealthResponse> {
  return getJson<HealthResponse>('/api/health');
}

export function fetchDbHealth(): Promise<DbHealthResponse> {
  return getJson<DbHealthResponse>('/api/health/db');
}
