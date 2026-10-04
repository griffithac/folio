'use client';
import { useState } from 'react';
import type { ReferenceLabels } from '@/lib/catalog';
import { QUALIFIER_FAMILIES, qualifierNode, type QualifierFamily } from '@/lib/qualifier-catalog';
import { subjectNode } from '@/lib/hierarchy';
type Reference = NonNullable<ReferenceLabels['qualifierReference']>;
type Dimension = NonNullable<Reference['dimensions'][QualifierFamily]>;
const names: Record<QualifierFamily, string> = { '1': 'place', '2': 'language discussed', '3': 'time period', '4': 'educational purpose', '5': 'interest', '6': 'creative style' };
const examples: Record<QualifierFamily, string> = { '1': '1DDF, 1DDU', '2': '2ADF, 2ACB', '3': '3MNB, 3MNQ', '4': '4LEA, 4TN', '5': '5HPD', '6': '6JA' };
const parseCodes = (text: string) => text.split(/[\s,;]+/).map(code => code.trim().toUpperCase()).filter(Boolean);
export default function QualifierReferenceFields({ value, onChange }: { value: Reference; onChange: (value: Reference) => void }) {
  const [inputs, setInputs] = useState<Partial<Record<QualifierFamily, string>>>(Object.fromEntries(Object.entries(value.dimensions).map(([family, d]) => [family, d?.codes.join(', ') || ''])));
  const initialLinks = Object.values(value.dimensions).flatMap(d => d?.links || []);
  const [linkInputs, setLinkInputs] = useState<Record<string, string>>(Object.fromEntries(initialLinks.map(link => [link.code, link.subjectCodes.join(', ')])));
  const [linkCoverage, setLinkCoverage] = useState<Record<string, 'complete' | 'partial'>>(Object.fromEntries(initialLinks.map(link => [link.code, link.coverage])));
  function update(family: QualifierFamily, dimension: Dimension | undefined) {
    const dimensions = { ...value.dimensions };
    if (dimension) dimensions[family] = dimension; else delete dimensions[family];
    onChange({ taxonomyVersion: 'Thema 1.6', dimensions });
  }
  function links(codes: string[], texts = linkInputs, coverages = linkCoverage) {
    return codes.filter(code => texts[code]?.trim() || coverages[code] === 'complete').map(code => ({ code, subjectCodes: parseCodes(texts[code] || ''), coverage: coverages[code] || 'partial' as const }));
  }
  return <div className="qualifier-reference-fields">
    <p>Review each dimension separately. A complete list means every applicable qualifier in that dimension was checked; an empty complete list explicitly means none apply. Unselected dimensions remain unjudged. Partial lists only establish known codes.</p>
    {QUALIFIER_FAMILIES.map(family => {
      const dimension = value.dimensions[family];
      return <fieldset key={family}><legend>{qualifierNode(family)!.CodeDescription}</legend>
        <label className="reference-check"><input type="checkbox" checked={Boolean(dimension)} onChange={e => update(family, e.target.checked ? { codes: parseCodes(inputs[family] || ''), coverage: 'partial' } : undefined)} /> Review {names[family]} qualifiers</label>
        {dimension && <>
          <label>Reference {names[family]} codes (comma-separated)<input value={inputs[family] || ''} maxLength={1000} placeholder={`e.g. ${examples[family]}`} onChange={e => {
            setInputs({ ...inputs, [family]: e.target.value }); const codes = parseCodes(e.target.value);
            update(family, { ...dimension, codes, ...(dimension.links ? { links: links(codes) } : {}) });
          }} /></label>
          {dimension.codes.length > 0 && <ul className="reference-code-list">{dimension.codes.map((code, i) => <li key={`${code}-${i}`}>{code} · {qualifierNode(code)?.CodeDescription || 'Unknown qualifier code'}</li>)}</ul>}
          <label>Completeness of {names[family]} reference<select value={dimension.coverage} onChange={e => update(family, { ...dimension, coverage: e.target.value as Dimension['coverage'] })}><option value="partial">Partial · only these known qualifiers</option><option value="complete">Complete · all qualifiers in this dimension checked</option></select></label>
          <label className="reference-check"><input type="checkbox" checked={dimension.links !== undefined} onChange={e => update(family, { ...dimension, links: e.target.checked ? links(dimension.codes) : undefined })} /> Also review which subjects these {names[family]} qualifiers refine</label>
          {dimension.links !== undefined && <div className="qualifier-link-fields"><p>Enter the independently checked subjects for each qualifier. Leave an input empty with partial coverage when no relationship reference is supplied. Complete means all subjects refined by that qualifier have been checked.</p>{dimension.codes.map((code, i) => <div key={`${code}-${i}`}>
            <label>Subjects refined by {code}<input value={linkInputs[code] || ''} maxLength={100} placeholder="e.g. FV, NH" onChange={e => { const texts = { ...linkInputs, [code]: e.target.value }; setLinkInputs(texts); update(family, { ...dimension, links: links(dimension.codes, texts) }); }} /></label>
            {parseCodes(linkInputs[code] || '').map((subject, j) => <p className="fine-print" key={`${subject}-${j}`}>{subject} · {subjectNode(subject)?.CodeDescription || 'Unknown subject code'}</p>)}
            <label>Completeness of {code} relationships<select value={linkCoverage[code] || 'partial'} onChange={e => { const coverages = { ...linkCoverage, [code]: e.target.value as 'complete' | 'partial' }; setLinkCoverage(coverages); update(family, { ...dimension, links: links(dimension.codes, linkInputs, coverages) }); }}><option value="partial">Partial · only these known subjects</option><option value="complete">Complete · all related subjects checked</option></select></label>
          </div>)}</div>}
        </>}
      </fieldset>;
    })}
    <p>Language qualifiers describe languages taught or discussed; interest age is separate from reading complexity. Exact codes and subject relationships are scored separately. Verified qualifier references require this edition or adaptation to be matched by the reviewer.</p>
    <a className="text-button" href="https://ns.editeur.org/thema/en" target="_blank" rel="noreferrer">Find official Thema qualifier codes</a>
  </div>;
}
