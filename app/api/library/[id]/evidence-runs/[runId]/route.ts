import { env } from 'cloudflare:workers';
import { json } from '@/lib/shared';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string; runId: string }> }) {
  if (!env.DB || !env.BUCKET) return json({ error: 'Saved evidence storage is unavailable.' }, 503);
  const { id, runId } = await context.params;
  const row = await env.DB.prepare('SELECT record FROM shared_books WHERE id=?').bind(id).first<{ record: string }>();
  if (!row || !JSON.parse(row.record).evidenceRuns?.some((run: { id: string }) => run.id === runId)) return json({ error: 'Saved run not found.' }, 404);
  const saved = await env.BUCKET.get(`books/${id}/evidence-runs/${runId}.json`);
  if (!saved) return json({ error: 'Saved run not found.' }, 404);
  return new Response(saved.body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="folio-evidence-run-${runId}.json"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
