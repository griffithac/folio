'use client';
import { ArrowRight, CheckCheck } from 'lucide-react';
import type { Book } from '@/lib/catalog';
import { QUALIFIER_FAMILIES, qualifierNode } from '@/lib/qualifier-catalog';
export default function QualifierDetails({ book, busy, onRefine, onSave }: { book: Book; busy: boolean; onRefine: () => void; onSave: (book: Book) => Promise<boolean> }) {
  const detail = book.qualifiers;
  const subjects = book.detailedSubject?.subjects || [];
  return <section className="technical-details"><h4>Subject qualifiers</h4>
    <p>Add detail about place, the language discussed, time, education, interests, and creative style. Qualifiers describe supported subjects in this book; time qualifiers describe its content or events.</p>
    {detail ? <>
      {QUALIFIER_FAMILIES.map(family => {
        const assigned = detail.qualifiers.filter(c => c.family === family);
        if (!assigned.length) return null;
        return <div key={family}><h5>{qualifierNode(family)!.CodeDescription}</h5>{assigned.map(c => <article className="subject-evidence" key={c.code}>
          <p><b>{c.code} · {c.heading}</b></p><p className="fine-print">{c.path.map(p => p.heading).join(' → ')}</p>
          <p>Refines: {c.appliesTo.map(code => subjects.find(s => s.code === code)?.heading || code).join('; ')}</p>
          {c.citation && <><blockquote>{c.citation.text}</blockquote><p className="fine-print">PDF page {c.citation.page} · {Math.round(c.supportProbability * 100)}% book support · {Math.round(c.citation.supportProbability * 100)}% passage support{c.explicitPurposeProbability === undefined ? '' : ` · ${Math.round(c.explicitPurposeProbability * 100)}% explicit purpose`}</p></>}
        </article>)}</div>;
      })}
      <p role={detail.status !== 'complete' ? 'status' : undefined}>{detail.stoppedReason}{detail.reviewed ? ' Approved in the shared workspace.' : ' Human review recommended.'}</p>
      <details><summary>Qualifier search and source checks</summary><p>The search checks all six dimensions. Its bounded branches and option groups can miss relevant qualifiers. Search ranks compare paths; support percentages are Jev yes probabilities, not independently validated accuracy.</p>
        <p>{detail.status} · {detail.requests} requests · {detail.model || 'No completed response'} · {detail.version}{detail.search.pruned ? ' · Alternatives pruned' : ''}</p>
        <h5>Dimension applicability</h5>{QUALIFIER_FAMILIES.map(f => <div className="probability" key={f}><span>{qualifierNode(f)!.CodeDescription}</span><b>{detail.applicability[f] === undefined ? 'Not completed' : `${Math.round(detail.applicability[f]! * 100)}% yes`}</b></div>)}
        <h5>Candidates</h5>{detail.candidates.map(c => <div key={c.code}><p><b>{c.code} · {c.heading}</b> · {c.status.replaceAll('-', ' ')}</p><p className="fine-print">Rank {c.rankingScore.toFixed(3)} · book {Math.round(c.supportProbability * 100)}% · passage {c.citation ? `${Math.round(c.citation.supportProbability * 100)}%` : 'none'}</p>{Object.entries(c.subjectLinks).map(([code, p]) => <div className="probability" key={code}><span>Refines {code} · {subjects.find(s => s.code === code)?.heading}</span><b>{Math.round(p * 100)}% yes</b></div>)}{c.citation && <blockquote>{c.citation.text}</blockquote>}</div>)}
        <details><summary>All routing distributions</summary>{detail.routing.map(d => <div key={d.id}><p><b>{d.parent} · {qualifierNode(d.parent)?.CodeDescription}</b> · option group {d.group + 1} · selected {d.choice} · {Math.round(d.confidence * 100)}% Choice confidence</p>{Object.entries(d.probabilities).sort((a, b) => b[1] - a[1]).map(([code, p]) => <div className="probability" key={code}><span>{code} · {qualifierNode(code)?.CodeDescription || code}</span><b>{Math.round(p * 100)}%</b></div>)}</div>)}</details>
      </details>
      {detail.status === 'complete' && detail.qualifiers.length > 0 && !detail.reviewed && <button className="secondary-button" disabled={busy} onClick={() => void onSave({ ...book, qualifiers: { ...detail, reviewed: true } })}><CheckCheck size={15} /> Approve qualifier suggestions</button>}
    </> : <p>{subjects.length ? 'Find source-backed qualifiers for the detailed subjects below.' : 'Find supported detailed subjects first to enable qualifier suggestions.'}</p>}
    <button className="secondary-button" disabled={busy || !subjects.length} onClick={onRefine}>{detail ? 'Refine qualifiers again' : 'Find qualifiers'} <ArrowRight size={14} /></button>
    <p className="fine-print">Thema 1.6 · 5,765 qualifier nodes across six dimensions. Language qualifiers describe languages taught or discussed, separately from the text’s language. Interest age is separate from reading complexity and requires explicit evidence. <a href="https://www.editeur.org/151/Thema/" target="_blank" rel="noreferrer">Thema © EDItEUR</a></p>
  </section>;
}
