'use client';
import { useState } from 'react';
import { GENRES, LANGUAGES, LEVELS, TIME_PERIODS, type Book, type ReferenceLabels } from '@/lib/catalog';
import { SUBCATEGORIES } from '@/lib/subcategories';
import { themaForLabel } from '@/lib/standards';
import { subjectNode } from '@/lib/hierarchy';
import { hasIndependentReview, referenceSchema } from '@/lib/references';
import QualifierReferenceFields from './qualifier-reference-fields';
export default function ReferenceEditor({ book, onSave, disabled }: { book: Book; onSave: (book: Book) => Promise<boolean>; disabled: boolean }) {
  const initial = book.reference;
  const [labels, setLabels] = useState<ReferenceLabels['labels']>(initial?.labels || {});
  const [sourceName, setSourceName] = useState(initial?.sourceName || '');
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl || '');
  const [scope, setScope] = useState<'work' | 'edition'>(initial?.scope || 'work');
  const [edition, setEdition] = useState(initial?.edition || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [verified, setVerified] = useState(initial ? hasIndependentReview(initial) : false);
  const [includeSubjects, setIncludeSubjects] = useState(Boolean(initial?.subjectReference));
  const [subjectCodes, setSubjectCodes] = useState(initial?.subjectReference?.codes.join(', ') || '');
  const [coverage, setCoverage] = useState<'complete' | 'partial'>(initial?.subjectReference?.coverage || 'partial');
  const [includeQualifiers, setIncludeQualifiers] = useState(Boolean(initial?.qualifierReference));
  const [qualifierReference, setQualifierReference] = useState<NonNullable<ReferenceLabels['qualifierReference']>>(initial?.qualifierReference || { taxonomyVersion: 'Thema 1.6', dimensions: {} });
  const [reviewer, setReviewer] = useState(initial?.review?.reviewer || '');
  const [reviewerRole, setReviewerRole] = useState(initial?.review?.reviewerRole || '');
  const [method, setMethod] = useState<NonNullable<ReferenceLabels['review']>['method']>(initial?.review?.method || 'expert-review');
  const [editionMatched, setEditionMatched] = useState(initial?.review?.editionMatched || false);
  const [modelBlind, setModelBlind] = useState(initial?.review?.modelBlind || false);
  const [workKey, setWorkKey] = useState(initial?.workKey || '');
  const [split, setSplit] = useState<'development' | 'holdout'>(initial?.split || 'development');
  const [system, setSystem] = useState<'ATOS' | 'Lexile'>(initial?.readingMeasure?.system || 'ATOS');
  const [value, setValue] = useState(initial?.readingMeasure?.value || '');
  const [measureUrl, setMeasureUrl] = useState(initial?.readingMeasure?.sourceUrl || '');
  const [measureEdition, setMeasureEdition] = useState(initial?.readingMeasure?.edition || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const narrower = SUBCATEGORIES[themaForLabel(labels.genre || '')?.code || ''] || [];
  const codes = subjectCodes.split(/[\s,;]+/).map(code => code.trim().toUpperCase()).filter(Boolean);
  async function save() {
    setError('');
    const now = new Date().toISOString();
    const reference: ReferenceLabels = {
      status: verified ? 'verified' : 'provisional', labels, sourceName: sourceName.trim(), sourceUrl: sourceUrl.trim(), scope, edition, notes, split, updatedAt: now,
      ...(includeSubjects ? { subjectReference: { codes, coverage, taxonomyVersion: 'Thema 1.6' } } : {}),
      ...(includeQualifiers ? { qualifierReference } : {}),
      ...(verified ? { review: { reviewer, reviewerRole, method, reviewedAt: now, independent: true, editionMatched, modelBlind } } : {}),
      ...(workKey.trim() ? { workKey: workKey.trim() } : {}),
      ...(value.trim() ? { readingMeasure: { system, value: value.trim(), sourceUrl: measureUrl.trim(), edition: measureEdition } } : {}),
    };
    const parsed = referenceSchema.safeParse(reference);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Check the reference fields.'); return; }
    setSaving(true);
    try { if (await onSave({ ...book, reference })) setError('Reference labels saved.'); }
    finally { setSaving(false); }
  }
  const select = (name: keyof ReferenceLabels['labels'], title: string, options: { value: string; label: string }[]) => <label key={name}>{title}<select value={labels[name] || ''} onChange={e => setLabels({ ...labels, [name]: e.target.value || undefined, ...(name === 'genre' ? { subcategory: undefined } : {}) })}><option value="">No reference label</option>{options.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>;
  const options = (values: string[]) => values.map(value => ({ value, label: value }));
  return <details className="reference-editor"><summary>Reference labels · {initial && hasIndependentReview(initial) ? 'Reviewer-attested' : initial ? 'Provisional source labels' : 'Add an expert reference'}</summary>
    <p>Use a catalog, publisher, or independent expert as the reference. These labels stay separate from corrections and the original Jev prediction. Verify translations and editions before marking a reference verified.</p>
    <div className="form-columns">{select('genre', 'Reference genre', options(Object.keys(GENRES)))}{select('language', 'Reference language', options(Object.keys(LANGUAGES)))}{select('readingLevel', 'Reference reading band', options(LEVELS.map(l => l.label)))}</div>
    <div className="form-columns">{select('subcategory', 'Reference subcategory', [{ value: 'Unspecified', label: 'Unspecified' }, ...narrower.map(item => ({ value: item.code, label: `${item.code} · ${item.heading}` }))])}{select('timePeriod', 'Reference story setting', options(Object.keys(TIME_PERIODS)))}</div>
    <label>Reference primary detailed Thema code (optional)<input value={labels.detailedSubject || ''} maxLength={6} onChange={e => setLabels({ ...labels, detailedSubject:e.target.value.toUpperCase() || undefined })} placeholder="e.g. UMX, FBC, PDX" /></label>
    <label className="reference-check"><input type="checkbox" checked={includeSubjects} onChange={e => setIncludeSubjects(e.target.checked)} /> Add a reference set for all detailed subjects.</label>
    {includeSubjects && <div className="subject-reference-fields"><label>Detailed Thema subject codes (comma-separated)<input value={subjectCodes} maxLength={100} onChange={e => setSubjectCodes(e.target.value)} placeholder="e.g. UMX, KJMB" /></label>
      {codes.length > 0 && <ul className="reference-code-list">{codes.map((code, i) => <li key={`${code}-${i}`}>{code} · {subjectNode(code)?.CodeDescription || 'Unknown subject code'}</li>)}</ul>}
      <label>Completeness of the subject reference<select value={coverage} onChange={e => setCoverage(e.target.value as typeof coverage)}><option value="partial">Partial · only these known subjects</option><option value="complete">Complete · all applicable subjects checked</option></select></label>
      <p>A complete list enables precision, recall and exact-set agreement. With a partial list, extra suggestions remain unjudged. Choose complete only after reviewing all substantial subjects. An empty complete list means no assignable subject is supported.</p>
      <a href="https://ns.editeur.org/thema/en" target="_blank" rel="noreferrer">Find official Thema 1.6 codes</a></div>}
    <label className="reference-check"><input type="checkbox" checked={includeQualifiers} onChange={e => setIncludeQualifiers(e.target.checked)} /> Add qualifier reference labels by dimension.</label>
    {includeQualifiers && <QualifierReferenceFields value={qualifierReference} onChange={setQualifierReference} />}
    <label>Reference source name<input value={sourceName} maxLength={200} onChange={e => setSourceName(e.target.value)} placeholder="Publisher, library catalog, or expert review" /></label>
    <label>Reference source link<input type="url" value={sourceUrl} maxLength={2000} onChange={e => setSourceUrl(e.target.value)} placeholder="https://…" /></label>
    <div className="form-columns"><label>Reference scope<select value={scope} onChange={e => setScope(e.target.value as 'work' | 'edition')}><option value="work">Original work</option><option value="edition">This edition / translation</option></select></label><label>Evaluation split<select value={split} onChange={e => setSplit(e.target.value as 'development' | 'holdout')}><option value="development">Development</option><option value="holdout">Holdout · reserve from tuning</option></select></label></div>
    <label>Edition or translation notes<input value={edition} maxLength={240} onChange={e => setEdition(e.target.value)} /></label>
    <label>Work grouping key (optional)<input value={workKey} maxLength={200} onChange={e => setWorkKey(e.target.value)} placeholder="Use the same key for editions and translations of one work" /></label>
    <p>Keep versions of the same work in the same evaluation split. Without a grouping key, Folio can only detect identical PDF fingerprints across splits.</p>
    <label>Reference notes<textarea value={notes} maxLength={4000} onChange={e => setNotes(e.target.value)} rows={3} /></label>
    <details className="measure-editor"><summary>Published ATOS or Lexile measure (optional)</summary><p>Store the published score separately. No conversion to a Jev reading band is made.</p><div className="form-columns"><label>Measure system<select value={system} onChange={e => setSystem(e.target.value as 'ATOS' | 'Lexile')}><option>ATOS</option><option>Lexile</option></select></label><label>Published value<input value={value} maxLength={20} onChange={e => setValue(e.target.value)} /></label></div><label>Measure source link<input type="url" value={measureUrl} maxLength={2000} onChange={e => setMeasureUrl(e.target.value)} /></label><label>Measure edition<input value={measureEdition} maxLength={240} onChange={e => setMeasureEdition(e.target.value)} /></label></details>
    <label className="reference-check"><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} /> I independently checked these labels and their fit to this work or edition.</label>
    {verified && <div><div className="form-columns"><label>Reviewer name<input value={reviewer} maxLength={160} onChange={e => setReviewer(e.target.value)} /></label><label>Reviewer role or relevant expertise<input value={reviewerRole} maxLength={200} onChange={e => setReviewerRole(e.target.value)} placeholder="e.g. publisher metadata editor" /></label></div>
      <label>Review method<select value={method} onChange={e => setMethod(e.target.value as typeof method)}><option value="expert-review">Independent expert review</option><option value="publisher-metadata">Checked publisher metadata</option><option value="catalog-metadata">Checked catalog metadata</option></select></label>
      <label className="reference-check"><input type="checkbox" checked={editionMatched} onChange={e => setEditionMatched(e.target.checked)} /> I checked the match to this edition or translation.</label>
      <label className="reference-check"><input type="checkbox" checked={modelBlind} onChange={e => setModelBlind(e.target.checked)} /> These labels were established before seeing Jev’s predictions.</label>
      <p className="fine-print">The review name and claims are supplied by the reviewer in this public workspace; Folio does not authenticate expertise. Language and reading bands must describe this edition. Published ATOS/Lexile values do not verify a Jev band.</p></div>}
    {error && <p role="status">{error}</p>}
    <button className="secondary-button" disabled={disabled || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save reference labels'}</button>
    {initial && <p className="fine-print"><a href={initial.sourceUrl} target="_blank" rel="noreferrer">Open reference source</a> · Last updated {initial.updatedAt.slice(0, 10)}</p>}
  </details>;
}
