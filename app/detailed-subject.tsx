'use client';
import { ArrowRight, CheckCheck } from 'lucide-react';
import type { Book } from '@/lib/catalog';
export default function DetailedSubjects({book,busy,onRefine,onSave}:{book:Book;busy:boolean;onRefine:()=>void;onSave:(book:Book)=>Promise<boolean>}) {
  const detail=book.detailedSubject;
  return <section className="technical-details"><h4>Detailed subjects · all kinds of books</h4>
    {detail?.method==='beam-and-source-check-v1' ? <>
      {!detail.subjects?.length && <p>No subject had enough support in the supplied text. Add better evidence or review the book before assigning one.</p>}
      {detail.subjects?.map((subject,i)=><article className="subject-evidence" key={subject.code}>
        <h5>{i===0?'Primary suggestion':'Additional subject'} · {subject.code}</h5><p><b>{subject.heading}</b></p>
        <p className="fine-print">{subject.path.map(step=>step.heading).join(' → ')}</p>
        {subject.citation && <><blockquote>{subject.citation.text}</blockquote><p className="fine-print">PDF page {subject.citation.page} · {Math.round(subject.supportProbability*100)}% book-level support · {Math.round(subject.citation.supportProbability*100)}% passage support</p></>}
      </article>)}
      <p>{detail.stoppedReason}{detail.reviewed?' Approved in the shared workspace.':detail.needsReview?' Review recommended.':''}</p>
      <details><summary>Search alternatives and support checks</summary><p>Search scores rank candidate paths; they are not accuracy percentages. Support percentages are Jev yes probabilities, not independent expert verification.</p>
        {detail.search?.pruned && <p>The bounded search pruned alternative branches. Additional relevant subjects may exist.</p>}
        {detail.candidates?.map(candidate=><div key={candidate.code}><p><b>{candidate.code} · {candidate.heading}</b> · {candidate.status.replaceAll('-',' ')}</p><p className="fine-print">Search rank {candidate.rankingScore.toFixed(3)} · section applicability {Math.round(candidate.sectionProbability*100)}% · book support {Math.round(candidate.supportProbability*100)}% · passage support {candidate.citation?`${Math.round(candidate.citation.supportProbability*100)}%`:'no passage'}</p></div>)}
      </details>
      {Boolean(detail.subjects?.length) && !detail.reviewed && <button className="secondary-button" disabled={busy} onClick={()=>void onSave({...book,detailedSubject:{...detail,reviewed:true}})}><CheckCheck size={15}/> Approve subject suggestions</button>}
    </> : detail ? <><p><b>{detail.code||'Unassigned'} · {detail.heading||'Needs a subject review'}</b></p><p>{detail.path.map(step=>step.heading).join(' → ')}</p><p>This earlier result used one search path. Run the updated search to check alternatives and supporting passages.</p></> : <p>Explore the complete Thema subject hierarchy across fiction, history, medicine, law, cooking, business, and every other section. Several supported subjects can apply to one book.</p>}
    <button className="secondary-button" disabled={busy} onClick={onRefine}>{detail?'Refine subject again':'Find detailed subject'} <ArrowRight size={14}/></button>
    {detail && <p className="fine-print">{detail.model} · {detail.version} · {detail.requests} requests</p>}
    <p className="fine-print">The search checks multiple branches and only assigns subjects with supporting source text. Results are suggestions for review, not a complete publisher record. <a href="https://www.editeur.org/151/Thema/" target="_blank" rel="noreferrer">Thema © EDItEUR</a> · <a href="https://doi.org/10.4400/nwgj" target="_blank" rel="noreferrer">License</a></p>
  </section>;
}
