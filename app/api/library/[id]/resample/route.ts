import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { sharedBookSchema, json, sameOrigin, limitedBody } from '@/lib/shared';
export const dynamic = 'force-dynamic';
const input = z.object({ revision: z.number().int().min(1), hash: z.string().regex(/^[a-f0-9]{64}$/),
  samples: z.array(z.object({ page: z.number().int().min(1).max(20000), text: z.string().min(1).max(22000) }).strict()).min(1).max(18),
  strategy: z.enum(['full-source-contiguous-v1', 'full-text-v1']), sourceSampling: z.unknown().optional(),
}).strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return json({ error: 'Refresh evidence from Folio.' }, 403);
  if (!env.DB || !env.BUCKET) return json({ error: 'Shared book storage is unavailable.' }, 503);
  let snapshotKey: string | undefined;
  try {
    const { id } = await context.params;
    const data = input.parse(await (await limitedBody(request, 45000)).json());
    const current = await env.DB.prepare('SELECT record,revision,pdf_key FROM shared_books WHERE id=?').bind(id).first<{ record: string; revision: number; pdf_key: string }>();
    if (!current) return json({ error: 'This book has been removed.' }, 404);
    if (current.revision !== data.revision) return json({ error: 'This book changed. Reload before refreshing evidence.' }, 409);
    const original = JSON.parse(current.record);
    if (!current.pdf_key || original.hash !== data.hash) return json({ error: 'Use the retained original PDF for this book.' }, 400);
    if ((original.evidenceRuns?.length || 0) >= 10) return json({ error: 'This book has reached the beta limit of ten saved comparison runs.' }, 409);
    const run = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), strategy: original.evidenceStrategy || 'distributed-pages-and-within-page-v1' };
    const next = sharedBookSchema.parse({ ...original, samples: data.samples, evidenceStrategy: data.strategy, sourceSampling: data.sourceSampling,
      result: undefined, detailedSubject: undefined, qualifiers: undefined, status: 'ready', message: 'Refreshed evidence is ready. The previous run is saved for comparison.',
      evidenceRuns: [...(original.evidenceRuns || []), run] });
    snapshotKey = `books/${id}/evidence-runs/${run.id}.json`;
    await env.BUCKET.put(snapshotKey, JSON.stringify({ ...original, revision: current.revision }), { httpMetadata: { contentType: 'application/json' } });
    const saved = await env.DB.prepare('UPDATE shared_books SET record=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? RETURNING revision').bind(JSON.stringify(next), run.createdAt, id, data.revision).first<{ revision: number }>();
    if (!saved) { await env.BUCKET.delete(snapshotKey); snapshotKey = undefined; return json({ error: 'Another tester changed this book. Reload before refreshing evidence.' }, 409); }
    snapshotKey = undefined;
    return json({ book: { ...next, revision: saved.revision, pdfUrl: `/api/library/${id}/pdf` } });
  } catch {
    if (snapshotKey) await env.BUCKET.delete(snapshotKey);
    return json({ error: 'Evidence could not be refreshed. Existing results are retained.' }, 400);
  }
}
