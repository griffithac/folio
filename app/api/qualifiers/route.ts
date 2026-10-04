import { env } from 'cloudflare:workers';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { z } from 'zod';
import { inputSchema } from '@/lib/classification';
import { refineQualifiers } from '@/lib/qualifier-search';
import { validateQualifiers } from '@/lib/qualifier-validation';
import { sharedBookSchema, json, sameOrigin, limitedBody } from '@/lib/shared';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'Use Folio to find qualifiers.' }, 403);
  if (!env.DB || !env.TYPESAFE_API_KEY) return json({ error: 'Qualifier refinement is unavailable.' }, 503);
  if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'Expected a JSON book reference.' }, 415);
  let body: unknown;
  try { body = await (await limitedBody(request, 1000)).json(); }
  catch (error) { return json({ error: 'Invalid or oversized book reference.' }, (error as Error).message.includes('too large') ? 413 : 400); }
  const parsed = z.object({ bookId: z.string().uuid(), revision: z.number().int().min(1) }).strict().safeParse(body);
  if (!parsed.success) return json({ error: 'A saved book and current revision are required.' }, 400);
  try {
    const current = await env.DB.prepare('SELECT record,revision FROM shared_books WHERE id=?').bind(parsed.data.bookId).first<{ record: string; revision: number }>();
    if (!current) return json({ error: 'This book has been removed.' }, 404);
    if (current.revision !== parsed.data.revision) return json({ error: 'This book changed. Reload it before finding qualifiers.' }, 409);
    const book = sharedBookSchema.parse(JSON.parse(current.record));
    const subjects = book.detailedSubject?.method === 'beam-and-source-check-v1' ? book.detailedSubject.subjects?.map(s => s.code) || [] : [];
    if (!subjects.length) return json({ error: 'Find supported detailed subjects before adding qualifiers.' }, 400);
    const parsedState = inputSchema.parse({ title: book.title, pageCount: book.pageCount, samples: book.samples, strategy: book.evidenceStrategy });
    // Preserve the saved offsets, including leading/trailing whitespace.
    const state = { ...parsedState, samples: book.samples };
    const client = new TypeSafeClient({ apiKey: env.TYPESAFE_API_KEY, defaultModel: env.TYPESAFE_MODEL || 'jev-latest', timeout: 15000, retry: { maxRetries: 0 }, logLevel: 'off' });
    const configured = Number(env.CLASSIFICATION_DAILY_LIMIT ?? 250);
    const limit = Number.isFinite(configured) ? Math.max(1, Math.min(10000, Math.floor(configured))) : 250;
    const operation = AbortSignal.timeout(150000);
    const result = await refineQualifiers(state, subjects, payload => client.systemOne(payload, { signal: AbortSignal.any([operation, AbortSignal.timeout(15000)]) }), async () => {
      if (operation.aborted) throw new Error('Qualifier time budget exhausted.');
      return Boolean(await env.DB!.prepare('INSERT INTO classification_quota (day,used) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET used=used+1 WHERE used<? RETURNING used').bind(new Date().toISOString().slice(0,10), limit).first());
    });
    validateQualifiers(result, state, subjects);
    return json(result);
  } catch { return json({ error: 'Qualifiers could not be completed. Existing book results are saved; retry this stage.' }, 502); }
}
