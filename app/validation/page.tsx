'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { type Book } from '@/lib/catalog';
import { DIMENSIONS, evaluateReferences, prediction } from '@/lib/validation';
const names = { detailedSubject: 'Detailed subject', genre: 'Genre', subcategory: 'Subcategory', language: 'Language', readingLevel: 'Reading band', timePeriod: 'Story setting' };
export default function Validation() {
  const [books, setBooks] = useState<Book[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [split, setSplit] = useState<'all' | 'development' | 'holdout'>('all');
  useEffect(() => {
    async function refresh() { try { const response = await fetch('/api/library', { cache: 'no-store' }); const data = await response.json() as { books?: Book[]; error?: string }; if (!response.ok || !data.books) throw new Error(data.error || 'Library unavailable.'); setBooks(data.books); setError(''); } catch (e) { setError((e as Error).message); } finally { setLoaded(true); } }
    void refresh(); const timer = setInterval(() => void refresh(), 20000); return () => clearInterval(timer);
  }, []);
  const verified = evaluateReferences(books, 'verified', split);
  const provisional = evaluateReferences(books, 'provisional', split);
  const selected = books.filter(b => split === 'all' || b.reference?.split === split);
  return <main className="testing-page validation-page"><a href="/" className="text-button"><ArrowLeft size={16} /> Back to the shared library</a><span className="eyebrow">INDEPENDENT EVIDENCE</span><h1>How close to the reference?</h1>
    <p className="testing-lead">Compare the original Jev predictions with separately sourced labels. Corrections never change these metrics. Catalog crosswalks begin as provisional; an independent reviewer must check them before they count as verified references.</p>
    <label className="validation-split">Evaluation split <select value={split} onChange={e => setSplit(e.target.value as typeof split)}><option value="all">All books</option><option value="development">Development</option><option value="holdout">Holdout</option></select></label>
    {error && <p role="alert">{error}</p>}{!loaded && <p>Loading shared references…</p>}
    <h2>Verified-reference agreement</h2><p className="fine-print">Each dimension uses only books with a verified label for that dimension and a model prediction. Small samples are pilot evidence. Published ATOS/Lexile scores have separate units and are excluded from reading-band agreement.</p>
    <div className="testing-metrics">{verified.map(metric => <div key={metric.dimension}><strong>{metric.count ? `${metric.correct}/${metric.count}` : '—'}</strong><span>{names[metric.dimension]}</span><small>{metric.count ? `${Math.round(metric.accuracy! * 100)}% exact agreement` : 'No verified labels yet'}</small>{metric.meanBandError !== null && <small>Mean band error: {metric.meanBandError.toFixed(2)} · Within one band: {metric.adjacentBand}/{metric.count}</small>}</div>)}</div>
    <h2>Provisional source agreement</h2><p className="fine-print">These reference mappings are awaiting independent review. Agreement here is not an expert-validated accuracy score.</p><div className="testing-metrics">{provisional.map(metric => <div key={metric.dimension}><strong>{metric.count ? `${metric.correct}/${metric.count}` : '—'}</strong><span>{names[metric.dimension]}</span><small>{metric.count ? 'Provisional labels only' : 'No reference supplied'}</small></div>)}</div>
    <h2>The shared reference shelf</h2><p>Open a book in the library and expand “Reference labels” to record its source, edition, independent-review status, and evaluation split. Reserve holdout books from prompt and threshold tuning.</p>
    <div className="reference-shelf">{selected.map(book => <article key={book.id}><h3>{book.title}</h3><p>{book.reference ? `${book.reference.status === 'verified' ? 'Verified reference' : 'Provisional reference'} · ${book.reference.scope} · ${book.reference.split}` : 'Awaiting reference labels'}</p><div className="testing-table-wrap"><table><thead><tr><th>Dimension</th><th>Jev prediction</th><th>Reference</th></tr></thead><tbody>{DIMENSIONS.map(d => <tr key={d}><td>{names[d]}</td><td>{prediction(book, d) || '—'}</td><td>{book.reference?.labels[d] || 'Not supplied'}</td></tr>)}</tbody></table></div>{book.reference && <><a href={book.reference.sourceUrl} target="_blank" rel="noreferrer">{book.reference.sourceName} <ArrowUpRight size={12} /></a><p className="fine-print">{book.reference.edition}<br />{book.reference.notes}</p>{book.reference.readingMeasure && <p className="reference-measure"><b>{book.reference.readingMeasure.system}: {book.reference.readingMeasure.value}</b> · <a href={book.reference.readingMeasure.sourceUrl} target="_blank" rel="noreferrer">Published source</a><br /><small>{book.reference.readingMeasure.edition}</small></p>}</>}</article>)}</div>
    <div className="testing-note"><h2>Build a benchmark for new books</h2><p>Use independently reviewed known books to develop the method, then evaluate an untouched holdout set. Include modern works, nonfiction, translations, mixed genres, and all reading bands. This public-domain shelf tests the workflow; it cannot establish accuracy for new books on its own.</p><a href="/testing" className="text-button">Compare sampling with full text <ArrowUpRight size={14} /></a></div>
  </main>;
}
