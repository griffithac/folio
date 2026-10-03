'use client';
import { useState } from 'react';
import { GENRES, LANGUAGES, LEVELS, TIME_PERIODS, type Book, type ReferenceLabels } from '@/lib/catalog';
import { SUBCATEGORIES } from '@/lib/subcategories';
import { themaForLabel } from '@/lib/standards';
export default function ReferenceEditor({ book, onSave, disabled }: { book: Book; onSave: (book: Book) => Promise<boolean>; disabled: boolean }) {
  const initial = book.reference;
  const [labels, setLabels] = useState<ReferenceLabels['labels']>(initial?.labels || {});
  const [sourceName, setSourceName] = useState(initial?.sourceName || '');
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl || '');
  const [scope, setScope] = useState<'work' | 'edition'>(initial?.scope || 'work');
  const [edition, setEdition] = useState(initial?.edition || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [verified, setVerified] = useState(initial?.status === 'verified');
  const [split, setSplit] = useState<'development' | 'holdout'>(initial?.split || 'development');
  const [system, setSystem] = useState<'ATOS' | 'Lexile'>(initial?.readingMeasure?.system || 'ATOS');
  const [value, setValue] = useState(initial?.readingMeasure?.value || '');
  const [measureUrl, setMeasureUrl] = useState(initial?.readingMeasure?.sourceUrl || '');
  const [measureEdition, setMeasureEdition] = useState(initial?.readingMeasure?.edition || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const narrower = SUBCATEGORIES[themaForLabel(labels.genre || '')?.code || ''] || [];
  async function save() {
    setError('');
    if (!Object.values(labels).some(Boolean) && !value.trim()) { setError('Add a reference label or published measure first.'); return; }
    if (!sourceName.trim() || !/^https?:\/\//.test(sourceUrl)) { setError('Add the source name and its web link.'); return; }
    if (value && (!/^https?:\/\//.test(measureUrl) || !measureEdition.trim())) { setError('A published reading measure needs its source link and edition.'); return; }
    setSaving(true);
    const reference: ReferenceLabels = { status: verified ? 'verified' : 'provisional', labels, sourceName: sourceName.trim(), sourceUrl, scope, edition, notes, split, updatedAt: new Date().toISOString(), ...(value ? { readingMeasure: { system, value, sourceUrl: measureUrl, edition: measureEdition } } : {}) };
    try { if (await onSave({ ...book, reference })) setError('Reference labels saved.'); }
    finally { setSaving(false); }
  }
  const select = (name: keyof ReferenceLabels['labels'], title: string, options: { value: string; label: string }[]) => <label key={name}>{title}<select value={labels[name] || ''} onChange={e => setLabels({ ...labels, [name]: e.target.value || undefined, ...(name === 'genre' ? { subcategory: undefined } : {}) })}><option value="">No reference label</option>{options.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>;
  const options = (values: string[]) => values.map(value => ({ value, label: value }));
  return <details className="reference-editor"><summary>Reference labels · {initial?.status === 'verified' ? 'Independently verified' : initial ? 'Provisional source labels' : 'Add an expert reference'}</summary>
    <p>Use a catalog, publisher, or independent expert as the reference. These labels stay separate from corrections and the original Jev prediction. Verify translations and editions before marking a reference verified.</p>
    <div className="form-columns">{select('genre', 'Reference genre', options(Object.keys(GENRES)))}{select('language', 'Reference language', options(Object.keys(LANGUAGES)))}{select('readingLevel', 'Reference reading band', options(LEVELS.map(l => l.label)))}</div>
    <div className="form-columns">{select('subcategory', 'Reference subcategory', [{ value: 'Unspecified', label: 'Unspecified' }, ...narrower.map(item => ({ value: item.code, label: `${item.code} · ${item.heading}` }))])}{select('timePeriod', 'Reference story setting', options(Object.keys(TIME_PERIODS)))}</div>
    <label>Reference detailed Thema code<input value={labels.detailedSubject || ''} maxLength={6} onChange={e => setLabels({ ...labels, detailedSubject:e.target.value.toUpperCase() || undefined })} placeholder="e.g. UMX, FBC, PDX" /></label>
    <label>Reference source name<input value={sourceName} maxLength={200} onChange={e => setSourceName(e.target.value)} placeholder="Publisher, library catalog, or expert review" /></label>
    <label>Reference source link<input type="url" value={sourceUrl} maxLength={2000} onChange={e => setSourceUrl(e.target.value)} placeholder="https://…" /></label>
    <div className="form-columns"><label>Reference scope<select value={scope} onChange={e => setScope(e.target.value as 'work' | 'edition')}><option value="work">Original work</option><option value="edition">This edition / translation</option></select></label><label>Evaluation split<select value={split} onChange={e => setSplit(e.target.value as 'development' | 'holdout')}><option value="development">Development</option><option value="holdout">Holdout · reserve from tuning</option></select></label></div>
    <label>Edition or translation notes<input value={edition} maxLength={240} onChange={e => setEdition(e.target.value)} /></label>
    <label>Reference notes<textarea value={notes} maxLength={4000} onChange={e => setNotes(e.target.value)} rows={3} /></label>
    <details className="measure-editor"><summary>Published ATOS or Lexile measure (optional)</summary><p>Store the published score separately. No conversion to a Jev reading band is made.</p><div className="form-columns"><label>Measure system<select value={system} onChange={e => setSystem(e.target.value as 'ATOS' | 'Lexile')}><option>ATOS</option><option>Lexile</option></select></label><label>Published value<input value={value} maxLength={20} onChange={e => setValue(e.target.value)} /></label></div><label>Measure source link<input type="url" value={measureUrl} maxLength={2000} onChange={e => setMeasureUrl(e.target.value)} /></label><label>Measure edition<input value={measureEdition} maxLength={240} onChange={e => setMeasureEdition(e.target.value)} /></label></details>
    <label className="reference-check"><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} /> I independently checked these labels and their fit to this work or edition.</label>
    {verified && <p className="fine-print">This adds supplied labels to the verified-reference metrics. Published ATOS/Lexile values are displayed separately and do not verify the estimated reading band.</p>}
    {error && <p role="status">{error}</p>}
    <button className="secondary-button" disabled={disabled || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save reference labels'}</button>
    {initial && <p className="fine-print"><a href={initial.sourceUrl} target="_blank" rel="noreferrer">Open reference source</a> · Last updated {initial.updatedAt.slice(0, 10)}</p>}
  </details>;
}
