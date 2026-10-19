async function req(method, url, body, headers = {}) {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status, data });
  return data;
}

export const api = {
  get: (u, h) => req('GET', u, null, h),
  post: (u, b, h) => req('POST', u, b, h),
  patch: (u, b) => req('PATCH', u, b),
  del: (u) => req('DELETE', u),
};

export const mediaUrl = (versionId) => `/api/media/${versionId}`;

export function formatTimecode(t, fps = 24) {
  const total = Math.max(0, t || 0);
  const s = Math.floor(total);
  const f = Math.floor((total - s) * fps + 1e-6);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}:${p(f)}`;
}
