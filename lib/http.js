// Small response helpers for route handlers. Error body shape is always {error: '<code>'}.
export const json = (data, status = 200, headers) => Response.json(data, { status, headers });
export const fail = (status, error, extra = {}) => Response.json({ error, ...extra }, { status });
export const noContent = () => new Response(null, { status: 204 });

/** Parse a JSON request body; returns {} when the body is empty/invalid so handlers can validate fields. */
export async function readJson(request) {
  try { return (await request.json()) ?? {}; } catch { return {}; }
}
