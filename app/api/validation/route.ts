import { env } from 'cloudflare:workers';
import type { Book } from '@/lib/catalog';
import { buildValidationReport } from '@/lib/validation';
import { json } from '@/lib/shared';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const split = new URL(request.url).searchParams.get('split') || 'all';
  if (split !== 'all' && split !== 'development' && split !== 'holdout') return json({ error: 'Choose all, development or holdout.' }, 400);
  if (!env.DB) return json({ error: 'Shared reference storage is unavailable.' }, 503);
  try {
    const rows = await env.DB.prepare('SELECT record, revision, pdf_key FROM shared_books ORDER BY updated_at DESC').all<{ record: string; revision: number; pdf_key: string }>();
    const books: Book[] = rows.results.map(row => {
      const book = JSON.parse(row.record) as Book;
      return { ...book, revision: row.revision, ...(row.pdf_key ? { pdfUrl: `/api/library/${book.id}/pdf` } : {}) };
    });
    const report = buildValidationReport(books, split);
    return new Response(JSON.stringify(report, null, 2), { headers: {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `attachment; filename="folio-validation-${split}-${report.exportedAt.slice(0, 10)}.json"`,
    } });
  } catch {
    return json({ error: 'The shared validation report could not be loaded. Please retry.' }, 503);
  }
}
