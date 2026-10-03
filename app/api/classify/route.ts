import { env } from 'cloudflare:workers';
import { APIError, TypeSafeClient } from '@typesafe-ai/sdk';
import { inputSchema, prepareRequest, normalizeClassification } from '@/lib/classification';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET() {
  return json({ configured: Boolean(env.TYPESAFE_API_KEY && env.DB), model: env.TYPESAFE_MODEL || 'jev-latest' });
}
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Please classify books from the Folio app.' }, 403);
  if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'Expected JSON book excerpts.' }, 415);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: 'Book excerpts are required.' }, 400);
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 100000) { await reader.cancel(); return json({ error: 'The excerpt request is too large.' }, 413); }
      chunks.push(value);
    }
  } catch { return json({ error: 'The request was interrupted. Please retry.' }, 400); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { return json({ error: 'The request contains invalid JSON.' }, 400); }
  const input = inputSchema.safeParse(body);
  if (!input.success) return json({ error: 'Readable PDF excerpts are required. Please upload the book again.' }, 400);
  let payload;
  try { payload = prepareRequest(input.data); }
  catch { return json({ error: 'These excerpts exceed the text budget. Please upload the PDF again.' }, 400); }
  if (!env.TYPESAFE_API_KEY) return json({ error: 'Jev is waiting for an API key from the site owner. Your book is ready; try again once Jev is connected.', code: 'NOT_CONFIGURED' }, 503);
  if (!env.DB) return json({ error: 'Classification is temporarily unavailable. Please try again later.' }, 503);
  const configuredLimit = Number(env.CLASSIFICATION_DAILY_LIMIT ?? 250);
  const limit = Number.isFinite(configuredLimit) ? Math.max(1, Math.min(10000, Math.floor(configuredLimit))) : 250;
  try {
    const day = new Date().toISOString().slice(0, 10);
    const quota = await env.DB.prepare('INSERT INTO classification_quota (day, used) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET used = used + 1 WHERE used < ? RETURNING used').bind(day, limit).first();
    if (!quota) return json({ error: 'The public test site has reached its daily classification limit. Please try again tomorrow.', code: 'DAILY_LIMIT' }, 429);
    const client = new TypeSafeClient({ apiKey: env.TYPESAFE_API_KEY, baseURL: 'https://api.typesafe.ai', defaultModel: env.TYPESAFE_MODEL || 'jev-latest', timeout: 20000, retry: { maxRetries: 1, maxRetryAfterMs: 2000 }, logLevel: 'off' });
    const result = await client.systemOne(payload, { signal: AbortSignal.timeout(45000) });
    return json({ ...normalizeClassification(result), evidence: { strategy: input.data.strategy, pages: input.data.samples.map(s => s.page), characters: input.data.samples.reduce((n, s) => n + s.text.length, 0), questionCount: Object.keys(payload.questions).length } });
  } catch (error) {
    if (error instanceof APIError) {
      if (error.status === 401 || error.status === 403) return json({ error: 'Jev could not authenticate. The site owner needs to check the TypeSafe API key.' }, 502);
      if (error.status === 429 || error.status === 529) return json({ error: 'Jev is busy. Please retry in a moment.' }, 429);
      if (error.status === 422) return json({ error: 'Jev could not evaluate these excerpts. Try another searchable PDF.' }, 502);
    }
    return json({ error: 'Jev could not finish the classification. Please retry in a moment.' }, 502);
  }
}
