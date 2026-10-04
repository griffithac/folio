import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { sampledPageNumbers } from '../lib/catalog.ts';
import { budgetSamples } from '../lib/evidence.ts';
import { selectSourceEvidence, sourceAnchors } from '../lib/source-sampling.ts';
const manifest = JSON.parse(await readFile('outputs/corpus/manifest.json', 'utf8'));
const report = { version: 'source-sampling-regressions-v1', runAt: new Date().toISOString(),
  notes: 'Eight generated public-domain PDFs. Native pdftotext extraction tests the selector, not browser PDF.js extraction or Jev accuracy. Literal anchor coverage includes metadata, incidental mentions and possible dates; it is retrieval coverage, not verified book classification. Nine distributed excerpts and up to nine anchor-guided excerpts remain bounded; limits and pruning can omit details. No reference labels or title knowledge are used to select evidence.', books: [] as unknown[] };
for (const item of manifest) {
  const source = execFileSync('pdftotext', ['-layout', item.pdf, '-'], { encoding: 'utf8', maxBuffer: 16_000_000 });
  const texts = source.split('\f'); if (!texts.at(-1)?.trim()) texts.pop();
  const pages = texts.map((text, i) => ({ page: i + 1, text: text.replace(/[ \t]+/g, ' ').trim() })).filter(p => p.text);
  const selectedPages = sampledPageNumbers(texts.length);
  const old = budgetSamples(pages.filter(p => selectedPages.includes(p.page)));
  const current = selectSourceEvidence(pages, texts.length);
  const anchors = (samples: typeof pages) => new Set(samples.flatMap(p => sourceAnchors(p.text).map(a => a.key)));
  const full = anchors(pages), baseline = anchors(old), retrieved = anchors(current.samples);
  const result = { title: item.title, source: item.source, pageCount: texts.length, method: current.evidenceStrategy,
    baselineCharacters: old.reduce((n, p) => n + p.text.length, 0), selectedCharacters: current.samples.reduce((n, p) => n + p.text.length, 0),
    selectedBytes: new TextEncoder().encode(JSON.stringify(current.samples)).length, fullLiteralAnchors: full.size, baselineLiteralAnchors: baseline.size, selectedLiteralAnchors: retrieved.size,
    sourceSampling: current.sourceSampling, selectedPages: current.samples.map(p => p.page),
    newlyCovered: [...retrieved].filter(code => !baseline.has(code)), omittedFromBaseline: [...baseline].filter(code => !retrieved.has(code)), samples: current.samples };
  report.books.push(result); console.log(JSON.stringify({ title: item.title, pages: texts.length, baselineLiteralAnchors: baseline.size, selectedLiteralAnchors: retrieved.size, selectedBytes: result.selectedBytes }));
}
await writeFile('outputs/source-sampling-regressions.json', JSON.stringify(report, null, 2));
