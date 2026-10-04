'use client';
import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowUpRight } from 'lucide-react';
import { type Book } from '@/lib/catalog';
import { hasIndependentReview } from '@/lib/references';
import { DIMENSIONS, evaluateReferences, evaluateSubjects, evaluationWarnings, prediction, subjectPredictions, subjectReference } from '@/lib/validation';
import { evaluateQualifiers, qualifierPredictions } from '@/lib/qualifier-evaluation';
import { QUALIFIER_FAMILIES, qualifierNode } from '@/lib/qualifier-catalog';
import QualifierEvaluation from '../qualifier-evaluation';
const names = { detailedSubject: 'Primary detailed subject', genre: 'Genre', subcategory: 'Subcategory', language: 'Language', readingLevel: 'Reading band', timePeriod: 'Story setting' };
const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
function QualifierShelfRows({ book }: { book: Book }) {
  const actual = qualifierPredictions(book), dimensions = book.reference?.qualifierReference?.dimensions;
  return <><tr><td>All subject qualifiers</td><td>{book.qualifiers?.status === 'complete' ? actual.join(', ') || 'Explicitly unassigned' : book.qualifiers ? `${book.qualifiers.status} run` : 'No qualifier run'}</td><td>{dimensions ? 'See reviewed dimensions below' : 'Not supplied'}</td></tr>
    {QUALIFIER_FAMILIES.flatMap(family => dimensions?.[family] ? [<tr key={family}><td>{qualifierNode(family)!.CodeDescription}</td><td>{book.qualifiers?.status === 'complete' ? actual.filter(code => code[0] === family).join(', ') || 'Unassigned' : 'No complete prediction'}</td><td>{dimensions[family]!.codes.join(', ') || 'Explicitly none apply'} ({dimensions[family]!.coverage})</td></tr>] : [])}</>;
}
function SubjectEvaluation({ report, provisional = false }: { report: ReturnType<typeof evaluateSubjects>; provisional?: boolean }) {
  return <section className="subject-evaluation"><h3>{provisional ? 'Provisional' : 'Reviewer-attested'} detailed subject sets</h3>
    <p>Exact subject codes are compared across every supported suggestion. Precision measures how many suggestions match the complete reference; recall measures how many reference subjects were found. Partial references cannot judge extra suggestions.</p>
    <div className="testing-metrics subject-metrics">
      <div><strong>{report.complete}</strong><span>Complete reference sets</span><small>{report.partial} partial sets kept separate</small></div>
      <div><strong>{percent(report.micro.precision)}</strong><span>Subject precision</span><small>{report.micro.tp} matches · {report.micro.fp} extras vs reference</small></div>
      <div><strong>{percent(report.micro.recall)}</strong><span>Subject recall</span><small>{report.micro.fn} missed reference subjects</small></div>
      <div><strong>{percent(report.macroF1)}</strong><span>Macro F1</span><small>Equal weight per observed code, including extra-only codes</small></div>
      <div><strong>{percent(report.exactAgreement)}</strong><span>Exact set agreement</span><small>{report.exact}/{report.complete} complete sets · Missing searches remain in the denominator</small></div>
      <div><strong>{report.assigned}/{report.complete}</strong><span>Books with suggestions</span><small>{report.abstained} unassigned · {report.missingSearch} missing searches · {report.needsReview} need review</small></div>
    </div>
    {report.complete > 0 && <p className="fine-print">Micro F1: {percent(report.micro.f1)}. Broad section precision: {percent(report.section.precision)}; recall: {percent(report.section.recall)}. Section matches do not count as exact subject matches. Undefined rates are shown as “—”. Models: {report.models.join(', ') || 'No detailed predictions'}{report.models.length > 1 ? ' · Mixed versions: use the exported records to compare each model separately.' : ''}.</p>}
    {report.partial > 0 && <p className="fine-print">Partial-reference known-label coverage: {report.partialMatches}/{report.partialKnown} ({percent(report.partialKnownRecall)}). This does not measure recall of all subjects, precision, or exact-set agreement.</p>}
    {report.complete === 0 && <p className="fine-print">Add independently reviewed complete subject sets before estimating detailed subject precision or recall.{provisional ? ' Provisional scores remain exploratory.' : ''}</p>}
    {report.perLabel.length > 0 && <details className="evaluation-details"><summary>Per-code precision, recall and F1</summary><div className="testing-table-wrap"><table className="testing-table subject-metric-table"><thead><tr><th>Subject</th><th>Reference count</th><th>Matches / extras / misses</th><th>Precision</th><th>Recall</th><th>F1</th></tr></thead><tbody>{report.perLabel.map(label => <tr key={label.code}><td>{label.code} · {label.heading}</td><td>{label.support}</td><td>{label.tp} / {label.fp} / {label.fn}</td><td>{percent(label.precision)}</td><td>{percent(label.recall)}</td><td>{percent(label.f1)}</td></tr>)}</tbody></table></div></details>}
    {report.rows.length > 0 && <details className="evaluation-details"><summary>Which subjects were missed or added?</summary><div className="testing-table-wrap"><table className="testing-table subject-metric-table"><thead><tr><th>Book</th><th>Reference</th><th>Matched</th><th>Missed</th><th>Extra suggestions</th><th>Specificity</th></tr></thead><tbody>{report.rows.map(row => <tr key={row.id}><td>{row.title}<small>{row.model || 'No search recorded'}{row.needsReview ? ' · Needs review' : ''}</small></td><td>{row.coverage} · {row.expected.join(', ') || 'No assignable subjects'}</td><td>{row.matched.join(', ') || '—'}</td><td>{row.missing.join(', ') || '—'}</td><td>{row.extras.join(', ') || '—'}{row.coverage === 'partial' && <small>Unjudged against a partial reference</small>}</td><td>{[...row.broader.map(pair => `${pair.predicted} is broader than ${pair.reference}`), ...row.narrower.map(pair => `${pair.predicted} is narrower than ${pair.reference}`)].join('; ') || '—'}</td></tr>)}</tbody></table></div></details>}
    {provisional && <p className="fine-print">These mappings are awaiting independent review. Their metrics are not expert-validated accuracy.</p>}
  </section>;
}
export default function Validation() {
  const [books, setBooks] = useState<Book[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [split, setSplit] = useState<'all' | 'development' | 'holdout'>('all');
  useEffect(() => {
    async function refresh() { try { const response = await fetch('/api/library', { cache: 'no-store' }); if (!response.ok) throw new Error('The shared reference library is unavailable. Please retry.'); const data = await response.json() as { books?: Book[]; error?: string }; if (!data.books) throw new Error(data.error || 'Library unavailable.'); setBooks(data.books); setError(''); } catch (e) { setError((e as Error).message); } finally { setLoaded(true); } }
    void refresh(); const timer = setInterval(() => void refresh(), 20000); return () => clearInterval(timer);
  }, []);
  const verified = evaluateReferences(books, 'verified', split);
  const provisional = evaluateReferences(books, 'provisional', split);
  const verifiedSubjects = evaluateSubjects(books, 'verified', split);
  const provisionalSubjects = evaluateSubjects(books, 'provisional', split);
  const verifiedQualifiers = evaluateQualifiers(books, 'verified', split);
  const provisionalQualifiers = evaluateQualifiers(books, 'provisional', split);
  const warnings = evaluationWarnings(books);
  const selected = books.filter(b => split === 'all' || b.reference?.split === split);
  return <main className="testing-page validation-page"><a href="/" className="text-button"><ArrowLeft size={16} /> Back to the shared library</a><span className="eyebrow">INDEPENDENT EVIDENCE</span><h1>How close to the reference?</h1>
    <p className="testing-lead">Compare the original Jev predictions with separately sourced labels, including multiple subjects and missing predictions. Corrections never change these metrics. An independent review record is required for verified references; names and expertise are reviewer-supplied in this public workspace.</p>
    <label className="validation-split">Evaluation split <select value={split} onChange={e => setSplit(e.target.value as typeof split)}><option value="all">All books</option><option value="development">Development</option><option value="holdout">Holdout</option></select></label>
    <a className="secondary-button" href={`/api/validation?split=${split}`} download aria-disabled={!loaded || Boolean(error)} onClick={e => { if (!loaded || error) e.preventDefault(); }}><ArrowDownToLine size={15} /> Export validation report</a>
    {error && <p role="alert">{error}</p>}{!loaded && <p>Loading shared references…</p>}
    {warnings.length > 0 && <aside className="evaluation-warnings" aria-label="Evaluation limitations">{warnings.map(warning => <p key={warning}>{warning}</p>)}</aside>}
    <h2>Reviewer-attested agreement</h2><p className="fine-print">Each dimension includes all books with an eligible reference label, even when no prediction was returned. Reading-band error uses only valid predicted bands; its comparison count is shown separately. Published ATOS/Lexile scores are excluded.</p>
    <div className="testing-metrics">{verified.map(metric => <div key={metric.dimension}><strong>{metric.count ? `${metric.correct}/${metric.count}` : '—'}</strong><span>{names[metric.dimension]}</span><small>{metric.count ? `${percent(metric.accuracy)} exact agreement · ${metric.missing} missing predictions` : 'No verified labels yet'}</small>{metric.meanBandError !== null && <small>Mean band error: {metric.meanBandError.toFixed(2)} · Within one band: {metric.adjacentBand}/{metric.bandComparisons}</small>}</div>)}</div>
    <SubjectEvaluation report={verifiedSubjects} />
    <QualifierEvaluation report={verifiedQualifiers} />
    <h2>Provisional source agreement</h2><p className="fine-print">These reference mappings are awaiting independent review. Agreement here is not an expert-validated accuracy score.</p><div className="testing-metrics">{provisional.map(metric => <div key={metric.dimension}><strong>{metric.count ? `${metric.correct}/${metric.count}` : '—'}</strong><span>{names[metric.dimension]}</span><small>{metric.count ? `Provisional labels only · ${metric.missing} missing predictions` : 'No reference supplied'}</small></div>)}</div>
    <SubjectEvaluation report={provisionalSubjects} provisional />
    <QualifierEvaluation report={provisionalQualifiers} provisional />
    <h2>The shared reference shelf</h2><p>Open a book in the library and expand “Reference labels” to record its source, edition, independent-review status, and evaluation split. Reserve holdout books from prompt and threshold tuning.</p>
    <div className="reference-shelf">{selected.map(book => <article key={book.id}><h3>{book.title}</h3><p>{book.reference ? `${hasIndependentReview(book.reference) ? 'Reviewer-attested reference' : book.reference.status === 'verified' ? 'Review record required' : 'Provisional reference'} · ${book.reference.scope} · ${book.reference.split}` : 'Awaiting reference labels'}</p><div className="testing-table-wrap"><table><thead><tr><th>Dimension</th><th>Jev prediction</th><th>Reference</th></tr></thead><tbody>{DIMENSIONS.map(d => <tr key={d}><td>{names[d]}</td><td>{prediction(book, d) || '—'}</td><td>{book.reference?.labels[d] || 'Not supplied'}</td></tr>)}<tr><td>All detailed subjects</td><td>{subjectPredictions(book).join(', ') || '—'}</td><td>{subjectReference(book) ? `${subjectReference(book)!.codes.join(', ') || 'No assignable subjects'} (${subjectReference(book)!.coverage})` : 'Not supplied'}</td></tr><QualifierShelfRows book={book} /></tbody></table></div>{book.reference && <><a href={book.reference.sourceUrl} target="_blank" rel="noreferrer">{book.reference.sourceName} <ArrowUpRight size={12} /></a><p className="fine-print">{book.reference.edition}<br />{book.reference.notes}</p>{book.reference.review && <p className="fine-print">Review: {book.reference.review.reviewer} · {book.reference.review.reviewerRole} · {book.reference.review.reviewedAt.slice(0, 10)}<br />{book.reference.review.modelBlind ? 'Labels established before seeing predictions' : 'Predictions visible during review'}</p>}{book.reference.readingMeasure && <p className="reference-measure"><b>{book.reference.readingMeasure.system}: {book.reference.readingMeasure.value}</b> · <a href={book.reference.readingMeasure.sourceUrl} target="_blank" rel="noreferrer">Published source</a><br /><small>{book.reference.readingMeasure.edition}</small></p>}</>}</article>)}</div>
    <div className="testing-note"><h2>Build a benchmark for new books</h2><p>Use independently reviewed known books to develop the method, then evaluate an untouched holdout set. Include modern works, nonfiction, translations, mixed genres, and all reading bands. This public-domain shelf tests the workflow; it cannot establish accuracy for new books on its own.</p><a href="/testing" className="text-button">Compare sampling with full text <ArrowUpRight size={14} /></a></div>
  </main>;
}
