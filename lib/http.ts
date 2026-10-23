// Small response helpers for route handlers. Error body shape is always {error: '<code>'}.
export const json = (data: unknown, status = 200, headers?: HeadersInit): Response =>
  Response.json(data, { status, headers });
export const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Response =>
  Response.json({ error, ...extra }, { status });
export const noContent = (): Response => new Response(null, { status: 204 });

/** Parse a JSON request body; returns {} when the body is empty/invalid so handlers can validate fields. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try { return ((await request.json()) as Record<string, unknown> | null) ?? {}; } catch { return {}; }
}
