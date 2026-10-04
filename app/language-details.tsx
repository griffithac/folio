import type { LanguageAnalysis } from '@/lib/language-classification';
import { languageByCode } from '@/lib/language-catalog';

const name = (code: string) => code === 'none' ? 'Outside this group / uncertain' : languageByCode(code)?.label || code;
export default function LanguageDetails({ analysis }: { analysis: LanguageAnalysis }) {
  return <section className="language-details">
    <h4>Language evidence</h4>
    <p>{analysis.reason} {analysis.needsReview && <b>Human review recommended.</b>}</p>
    <p>Three independent questions cover the complete ISO 639-2 catalog. {analysis.basis === 'fallback' ? 'Language is an undetermined fallback with no provider confidence judgment.' : `The displayed confidence comes from ${analysis.basis === 'arbitration' ? 'the candidate comparison' : `language group ${Number(analysis.selectedGroup?.split('_')[1]) + 1}`}.`} Probabilities from separate groups are not combined.</p>
    <details><summary>Inspect language judgments</summary>
      {analysis.groups.map((group, i) => <details key={group.id}><summary>Group {i + 1}: {name(group.choice)} · {Math.round(group.confidence * 100)}% confidence</summary>
        {Object.entries(group.probabilities).sort((a, b) => b[1] - a[1]).map(([code, p]) => <div className="probability" key={code}><span>{name(code)} {code !== 'none' && `(${code})`}</span><b>{Math.round(p * 100)}%</b></div>)}
      </details>)}
      {analysis.arbitration && <details><summary>Candidate comparison: {name(analysis.arbitration.choice)} · {Math.round(analysis.arbitration.confidence * 100)}% confidence</summary><p>{analysis.arbitration.model}{analysis.arbitration.model !== analysis.model ? ' · rejected because the model changed' : ''}</p>{Object.entries(analysis.arbitration.probabilities).map(([code, p]) => <div className="probability" key={code}><span>{name(code)} ({code})</span><b>{Math.round(p * 100)}%</b></div>)}</details>}
      <p>{analysis.requests} {analysis.requests === 1 ? 'request' : 'requests'} for the initial labels and language comparison · {analysis.model}</p>
      <p><a href={analysis.catalog.source} target="_blank" rel="noreferrer">Library of Congress language source</a> · {analysis.catalog.version}</p>
    </details>
    <p className="fine-print">ISO 639-2 includes collective and broad language codes. It does not identify every individual language, dialect or script. A broad grouping may need a more specific catalog label.</p>
  </section>;
}
