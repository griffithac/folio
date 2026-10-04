import { readFile } from 'node:fs/promises';
import { sharedBookSchema } from '../lib/shared.ts';
import { qualifierNode, type QualifierFamily } from '../lib/qualifier-catalog.ts';
import type { Book, ReferenceLabels } from '../lib/catalog.ts';
const origin = new URL(process.argv[2] || '').origin;
const pilot = JSON.parse(await readFile(new URL('../public/qualifier-reference-pilot.json', import.meta.url), 'utf8'));
const response = await fetch(`${origin}/api/library`);
if (!response.ok) throw new Error('Shared library unavailable.');
const { books } = await response.json() as { books: Book[] };
for (const item of pilot.references) {
  const matches = books.filter(book => book.title === item.title && book.sourceUrl === item.sourceUrl);
  if (matches.length !== 1) { console.log(JSON.stringify({ title: item.title, skipped: 'A unique matching sourced book is required.' })); continue; }
  const book = matches[0];
  if (book.reference?.status === 'verified' || book.reference?.review || book.reference?.split === 'holdout' || book.reference?.scope === 'edition' || book.reference?.qualifierReference || (book.reference && book.reference.sourceUrl !== item.sourceUrl)) { console.log(JSON.stringify({ title: book.title, skipped: 'Existing reviewed, holdout, edition-specific or qualifier references are preserved.' })); continue; }
  for (const mapping of item.mappings) if (qualifierNode(mapping.code)?.CodeDescription !== mapping.heading) throw new Error('Pilot mapping must match the pinned official taxonomy.');
  const now = new Date().toISOString();
  const note = `${pilot.notes}\nPlace mappings: ${item.mappings.map((m: { sourceHeading: string; code: string; codeSourceUrl: string }) => `${m.sourceHeading} → ${m.code} (${m.codeSourceUrl})`).join('; ')}. Catalog source: ${item.sourceUrl}`;
  const reference: ReferenceLabels = { ...(book.reference || { labels: {}, edition: 'Generated test PDF from the linked Gutenberg work.', notes: '' }),
    status: 'provisional', sourceName: item.sourceName, sourceUrl: item.sourceUrl, scope: 'work', split: 'development', review: undefined, updatedAt: now,
    notes: [book.reference?.notes.trim(), note].filter(Boolean).join('\n'),
    qualifierReference: { taxonomyVersion: 'Thema 1.6', dimensions: { [item.family as QualifierFamily]: { codes: item.codes, coverage: item.coverage } } },
  };
  const next = sharedBookSchema.parse({ ...book, reference });
  const updated = await fetch(`${origin}/api/library/${book.id}`, { method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
  if (!updated.ok) throw new Error(`Reference update failed (${updated.status}); refresh the record before retrying.`);
  const saved = await updated.json() as { book: Book };
  console.log(JSON.stringify({ title: saved.book.title, revision: saved.book.revision, status: saved.book.reference?.status, qualifiers: item.codes, coverage: item.coverage }));
}
