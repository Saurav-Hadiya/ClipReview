export interface ApiErrorData {
  error?: string;
  [key: string]: unknown;
}

/** Error thrown by the fetch helpers for non-2xx responses. */
export interface ApiError extends Error {
  status: number;
  data: ApiErrorData;
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof Error && typeof (e as Partial<ApiError>).status === 'number';
}

/** Extract a human-readable message from a caught value. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : '';
}

type Headers_ = Record<string, string>;
type Body = unknown;

async function req<T>(method: string, url: string, body?: Body, headers: Headers_ = {}): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  // 204 No Content: callers that expect a body never hit this path.
  if (res.status === 204) return null as T;
  const data = (await res.json().catch(() => ({}))) as ApiErrorData & T;
  if (!res.ok) {
    throw Object.assign(new Error(data.error || res.statusText), { status: res.status, data }) as ApiError;
  }
  return data;
}

export const api = {
  get: <T = unknown>(u: string, h?: Headers_) => req<T>('GET', u, null, h),
  post: <T = unknown>(u: string, b?: Body, h?: Headers_) => req<T>('POST', u, b, h),
  patch: <T = unknown>(u: string, b?: Body) => req<T>('PATCH', u, b),
  del: <T = unknown>(u: string) => req<T>('DELETE', u),
};

export const mediaUrl = (versionId: string): string => `/api/media/${versionId}`;

export function formatTimecode(t: number | null | undefined, fps: number = 24): string {
  const total = Math.max(0, t || 0);
  const s = Math.floor(total);
  const f = Math.floor((total - s) * fps + 1e-6);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}:${p(f)}`;
}
