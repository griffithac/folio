'use client';
import { useState } from 'react';
import type { Book } from '@/lib/catalog';
import { sharedBookSchema } from '@/lib/shared';
import { qualifierPredictions } from '@/lib/qualifier-evaluation';
export default function EvidenceComparison({ book }: { book: Book }) {
  const runs = book.evidenceRuns || [];
  const [selected, setSelected] = useState(runs.at(-1)?.id || '');
  const [before, setBefore] = useState<Book>(); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  async function compare() {
    setLoading(true); setError(''); setBefore(undefined);
    try { const response = await fetch(`/api/library/${book.id}/evidence-runs/${selected}`); if (!response.ok) throw new Error('The saved comparison could not be loaded.'); setBefore(sharedBookSchema.parse(await response.json())); }
    catch (error) { setError((error as Error).message); } finally { setLoading(false); }
  }
  const cells = (b: Book) => ({ Genre: b.result?.genre.label, Language: b.result?.language.label, 'Reading band': b.result?.readingLevel.label, 'Story setting': b.result?.timePeriod?.label,
    'Detailed subjects': b.detailedSubject?.subjects?.map(s => s.code).join(', ') || b.detailedSubject?.code, 'Subject qualifiers': b.qualifiers?.status === 'complete' ? qualifierPredictions(b).join(', ') || 'No assignment' : b.qualifiers?.status || undefined });
  const prior = before ? cells(before) : undefined, current = cells(book);
  return <details className="excerpt-details"><summary>Previous evidence runs · {runs.length} saved comparisons</summary>
    <p>Compare raw predictions before and after the refresh. Agreement alone is not accuracy; review the source passages and independently sourced labels. Corrections do not alter this comparison.</p>
    <label>Saved run to compare<select value={selected} onChange={e => { setSelected(e.target.value); setBefore(undefined); }}>{runs.map(run => <option key={run.id} value={run.id}>{run.createdAt.slice(0, 19).replace('T', ' ')} UTC · {run.strategy}</option>)}</select></label>
    <button className="secondary-button" disabled={loading || !selected} onClick={() => void compare()}>{loading ? 'Loading comparison…' : 'Compare raw predictions'}</button>
    {error && <p role="status">{error}</p>}
    {before && prior && <><p className="fine-print">Before: {before.evidenceStrategy || 'Earlier sampling'} · {before.result?.model || 'No initial run'}; after: {book.evidenceStrategy} · {book.result?.model || 'No initial run'}. Qualifier methods: {before.qualifiers?.method || 'None'} / {book.qualifiers?.method || 'None'}; models: {before.qualifiers?.model || 'None'} / {book.qualifiers?.model || 'None'}.</p><div className="testing-table-wrap"><table className="testing-table"><thead><tr><th>Dimension</th><th>Before refresh</th><th>Current raw prediction</th></tr></thead><tbody>{(Object.keys(current) as (keyof typeof current)[]).map(key => <tr key={key}><td>{key}</td><td>{prior[key] || 'Not run'}</td><td>{current[key] || 'Not run'}</td></tr>)}</tbody></table></div></>}
    <p>Download the original excerpts, raw judgments, source checks, corrections and reference labels as they were before each refresh. Snapshots are separate from the current validation report.</p><ul>{runs.map(run => <li key={run.id}><a href={`/api/library/${book.id}/evidence-runs/${run.id}`} download>{run.createdAt.slice(0, 19).replace('T', ' ')} UTC · {run.strategy}</a></li>)}</ul>
  </details>;
}
