'use client';

import { useEffect, useRef, useState, useMemo, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, Check, CheckCheck, ChevronDown, CircleHelp, FileText, Globe2, GraduationCap, Grid2X2, Leaf, LibraryBig, List, LoaderCircle, Plus, Search, ShieldCheck, Sparkles, Tag, Trash2, Upload, X } from 'lucide-react';
import { GENRES, LANGUAGES, LEVELS, TIME_PERIODS, needsReview, type Book, type Classification } from '@/lib/catalog';
import type { DetailedSubject } from '@/lib/hierarchy';
import ReferenceEditor from './reference-editor';
import { exampleBooks } from '@/lib/examples';
import { extractBook } from '@/lib/pdf';
import { SUBCATEGORIES } from '@/lib/subcategories';
import { FACET_THRESHOLD } from '@/lib/details';
import { budgetSamples, EVIDENCE_BYTE_BUDGET } from '@/lib/evidence';
import { TAXONOMY_VERSION, themaForLabel, languageCodes } from '@/lib/standards';

type View = 'library' | 'review';
type Mode = 'grid' | 'list';
const colors = ['sage', 'rose', 'blue', 'sand', 'olive', 'clay'];
function labels(book: Book) {
  return { genre: book.corrections?.genre || book.result?.genre.label || '', language: book.corrections?.language || book.result?.language.label || '', readingLevel: book.corrections?.readingLevel || book.result?.readingLevel.label || '', timePeriod: book.corrections?.timePeriod || book.result?.timePeriod?.label || '', subcategory: book.corrections?.subcategory ?? book.result?.subcategory?.code ?? '' };
}

function Cover({ book, small = false }: { book: Book; small?: boolean }) {
  const tone = colors[Array.from(book.title).reduce((n, c) => n + c.charCodeAt(0), 0) % colors.length];
  return <div className={`cover ${tone} ${small ? 'small' : ''}`} aria-hidden="true">
    {book.cover ? <img src={book.cover} alt="" /> : <><span className="cover-rule" /><span className="cover-author">{book.author || 'THE FOLIO LIBRARY'}</span><span className="cover-title">{book.title}</span><div className="cover-art"><span /><span /><span /><Leaf size={44} strokeWidth={1} /></div><span className="cover-edition">A WORLD BETWEEN THE PAGES</span></>}
  </div>;
}

function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, textarea, summary') || []);
        if (!nodes.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, [onClose]);
  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={panel}>
      <div className="dialog-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>{children}
    </div>
  </div>;
}

function Details({ book, onClose, onSave, onDelete, onRetry, onRefine, busy }: { book: Book; onClose: () => void; onSave: (book: Book) => Promise<boolean>; onDelete: () => void; onRetry: () => void; onRefine: () => void; busy: boolean }) {
  const current = labels(book);
  const [title, setTitle] = useState(book.title);
  const [genre, setGenre] = useState(current.genre);
  const [language, setLanguage] = useState(current.language);
  const [level, setLevel] = useState(current.readingLevel);
  const [time, setTime] = useState(current.timePeriod || 'Not applicable / uncertain');
  const [sub, setSub] = useState(current.subcategory);
  const narrower = SUBCATEGORIES[themaForLabel(genre)?.code || ''] || [];
  const result = book.result;
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  async function save(next: Book) { setSaving(true); try { if (await onSave(next)) onClose(); } finally { setSaving(false); } }
  return <Dialog title="Inside this book" onClose={onClose} wide>
    {book.example && <div className="notice">Example only. These are illustrative results, not a Jev classification.</div>}
    <div className="detail-top"><Cover book={book} small /><div><span className="eyebrow">{book.example ? 'EXAMPLE BOOK' : 'SHARED BOOK'}</span><h3>{book.title}</h3><p>{book.author || 'Author not found in PDF metadata'}</p><span className="muted">{book.pageCount.toLocaleString()} pages · {book.example ? 'Example' : `${(book.size / 1024 / 1024).toFixed(1)} MB PDF`}</span></div></div>
    {result ? <>
      <div className="detail-results">{([
        ['Genre', result.genre, genre, book.corrections?.genre], ['Language', result.language, language, book.corrections?.language], ['Reading level', result.readingLevel, level, book.corrections?.readingLevel],
        ...(result.timePeriod ? [['Story setting', result.timePeriod, time, book.corrections?.timePeriod] as const] : []),
        ...(result.subcategory ? [['Subcategory', result.subcategory, narrower.find(item => item.code === sub)?.heading || 'Unspecified', book.corrections?.subcategory] as const] : []),
      ] as const).map(([name, judgment, value, correction]) => <div key={name} className="judgment"><span>{name}</span><strong>{value}</strong><div className="confidence-bar"><i style={{ width: `${judgment.confidence * 100}%` }} /></div><small>{correction !== undefined && (name === 'Subcategory' ? correction !== result.subcategory?.code : correction !== judgment.label) ? 'Manually corrected' : book.example ? 'Illustrative confidence' : `${Math.round(judgment.confidence * 100)}% Jev confidence`}</small><details><summary>See alternatives</summary>{Object.entries(judgment.probabilities).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([label, p]) => <div className="probability" key={label}><span>{name === 'Reading level' ? LEVELS[Number(label)]?.label || label : name === 'Subcategory' ? narrower.find(item => item.code === label)?.heading || label : label}</span><b>{Math.round(p * 100)}%</b></div>)}</details></div>)}</div>
      {(result.form || result.audience) && <div className="supplementary-details">{result.form && <div><span>Book form</span><b>{result.form.label}</b><small>{Math.round(result.form.confidence * 100)}% Jev confidence</small></div>}{result.audience && <div><span>Intended audience</span><b>{result.audience.label}</b><small>{Math.round(result.audience.confidence * 100)}% Jev confidence · estimate</small></div>}</div>}
      {result.technical && (Object.values(result.technical.languages).some(p => p >= FACET_THRESHOLD) || Object.values(result.technical.topics).some(p => p >= FACET_THRESHOLD)) && <section className="technical-details"><h4>Technical subjects</h4><p>Several topics and languages may apply. These supplementary tags are inferred from the excerpts; HTML and CSS are markup and style languages.</p>{([['Programming & technical languages', result.technical.languages], ['Computing topics', result.technical.topics]] as const).map(([heading, values]) => <div key={heading}><h5>{heading}</h5><div className="facet-tags">{Object.entries(values).filter(([,p]) => p >= FACET_THRESHOLD).map(([label,p]) => <span key={label}>{label} <small>{Math.round(p * 100)}% yes</small></span>)}</div><details><summary>All probabilities</summary>{Object.entries(values).sort((a,b) => b[1]-a[1]).map(([label,p]) => <div className="probability" key={label}><span>{label}</span><b>{Math.round(p*100)}%</b></div>)}</details></div>)}<p>Assumed technical experience: <b>{result.technical.experience.label}</b> · {Math.round(result.technical.experience.confidence*100)}% Jev confidence</p></section>}
      <div className="standard-identifiers"><span>Thema 1.6: <b>{sub || themaForLabel(genre)?.code || 'Unassigned'}</b></span><span>ISO 639-2: <b>{languageCodes(language)?.iso639_2 || 'und'}</b></span><span>Reading: <b>Jev estimate</b></span></div>
      <p className="fine-print">Subjects use selected broad Thema categories and their immediate subcategories; this is a suggested primary subject, not a complete catalog record. Reading level is an estimate, not Lexile, ATOS, or an age suitability rating. Jev’s confidence reflects its answer distribution; it does not certify correctness.</p>
      {!book.example && <div className="review-form"><h4>Make it yours</h4><p>Review the labels and correct anything that needs a human touch.</p><label>Book title<input value={title} onChange={e => setTitle(e.target.value)} maxLength={240} /></label><div className="form-columns"><label>Genre<select value={genre} onChange={e => { setGenre(e.target.value); setSub(''); }}>{Object.keys(GENRES).map(v => <option key={v}>{v}</option>)}</select></label><label>Language<select value={language} onChange={e => setLanguage(e.target.value)}>{Object.keys(LANGUAGES).map(v => <option key={v}>{v}</option>)}</select></label><label>Reading level<select value={level} onChange={e => setLevel(e.target.value)}>{LEVELS.map(v => <option key={v.label}>{v.label}</option>)}</select></label></div><div className="form-columns"><label>Subcategory<select value={sub} onChange={e => setSub(e.target.value)} disabled={!narrower.length}><option value="">Unspecified</option>{narrower.map(item => <option key={item.code} value={item.code}>{item.heading}</option>)}</select></label><label>Story setting<select value={time} onChange={e => setTime(e.target.value)}>{Object.keys(TIME_PERIODS).map(v => <option key={v}>{v}</option>)}</select></label></div><button className="primary-button" disabled={!title.trim() || busy || saving} onClick={() => void save({ ...book, title: title.trim(), corrections: { genre, language, readingLevel: level, subcategory: sub, timePeriod: time }, result: { ...result, reviewed: true } })}><CheckCheck size={16} /> Save & mark reviewed</button></div>}
      <div className="detail-footer"><span>{result.model}{result.reviewed ? ' · Reviewed in shared workspace' : ''}</span>{!book.example && <button className="text-button" onClick={onRetry} disabled={busy}>Reclassify <ArrowRight size={14} /></button>}</div>
    </> : <div className="pending-detail"><FileText size={26} /><h4>{book.status === 'error' ? 'This book needs attention' : 'Ready for its next chapter'}</h4><p>{book.message || 'Your PDF has been read. Classify its subject, subcategory, language, reading level, and story setting.'}</p>{book.samples.length > 0 && <button className="primary-button" onClick={onRetry} disabled={busy}><Sparkles size={16} /> Classify book</button>}</div>}
    {!book.example && book.samples.length > 0 && <section className="technical-details"><h4>Detailed subject · all kinds of books</h4>{book.detailedSubject ? <><p><b>{book.detailedSubject.code || 'Unassigned'} · {book.detailedSubject.heading || 'Needs a subject review'}</b></p><p>{book.detailedSubject.path.map(step=>step.heading).join(' → ')}</p><p>{book.detailedSubject.stoppedReason}{book.detailedSubject.needsReview ? ' Review recommended.' : ''}</p><details><summary>Subject path and evidence</summary>{book.detailedSubject.path.map(step=><div key={step.code}><p>{step.code} · {step.heading} · {Math.round(step.confidence*100)}% Jev confidence</p>{Object.entries(step.probabilities).filter(([,p])=>p>0).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([code,p])=><div className="probability" key={code}><span>{code}</span><b>{Math.round(p*100)}%</b></div>)}</div>)}</details><p className="fine-print">{book.detailedSubject.model} · {book.detailedSubject.version} · {book.detailedSubject.requests} requests</p></> : <p>Refine the primary subject through the complete Thema hierarchy, including fiction, history, medicine, law, cooking, business, and every other section. This uses additional requests as the supported branch becomes known.</p>}<button className="secondary-button" disabled={busy || saving} onClick={onRefine}>{book.detailedSubject ? 'Refine subject again' : 'Find detailed subject'} <ArrowRight size={14} /></button><p className="fine-print">A supported primary-subject suggestion, not a complete publisher record. <a href="https://www.editeur.org/151/Thema/" target="_blank" rel="noreferrer">Thema © EDItEUR</a> · <a href="https://doi.org/10.4400/nwgj" target="_blank" rel="noreferrer">License</a></p></section>}
    {result?.evidence && <p className="fine-print">{result.evidence.strategy === 'full-text-v1' ? 'Full extracted text' : 'Distributed samples'} · One Jev request · {result.evidence.questionCount} independent questions · {result.evidence.characters.toLocaleString()} excerpt characters. Story setting describes the events, not the publication date.</p>}
    {book.samples.length > 0 && <details className="excerpt-details"><summary>{book.samples.length} {result?.evidence?.strategy === 'full-text-v1' ? 'text pages (full extraction)' : 'sampled pages'} · View the text sent to Jev</summary>{book.samples.map(sample => <div key={sample.page}><h5>Page {sample.page}</h5><p>{sample.text}</p></div>)}</details>}
    {!book.example && <>
      {!book.pdfUrl && book.revision && <p className="fine-print">This result came from the earlier browser beta. Reupload the same PDF to retain the original file in the shared workspace.</p>}
      {book.pdfUrl && <a className="text-button" href={book.pdfUrl} download><ArrowDownToLine size={14} /> Download original PDF</a>}
      <ReferenceEditor book={book} onSave={onSave} disabled={busy || saving} />
      {confirmRemove ? <div className="remove-confirmation"><p>Remove “{book.title}” and its PDF from the shared workspace for everyone?</p><button className="delete-button" disabled={busy} onClick={onDelete}><Trash2 size={14} /> Yes, remove book</button><button className="text-button" onClick={() => setConfirmRemove(false)}>Keep book</button></div> : <button className="delete-button" disabled={busy || saving} onClick={() => setConfirmRemove(true)}><Trash2 size={14} /> Remove book</button>}
    </>}
  </Dialog>;
}

export default function Library() {
  const [books, setBooks] = useState<Book[]>([]);
  const booksRef = useRef<Book[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false); const processing = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState<View>('library');
  const [mode, setMode] = useState<Mode>('grid');
  const [examples, setExamples] = useState(false);
  const [search, setSearch] = useState(''); const [genre, setGenre] = useState(''); const [language, setLanguage] = useState(''); const [level, setLevel] = useState('');
  const [sort, setSort] = useState('recent'); const [help, setHelp] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState(''); const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  function notify(message: string) { setToast(message); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 6000); }
  function commit(next: Book[]) { booksRef.current = next; setBooks(next); }
  function update(id: string, patch: Partial<Book>) { commit(booksRef.current.map(book => book.id === id ? { ...book, ...patch } : book)); }
  function upsert(book: Book) { commit([book, ...booksRef.current.filter(item => item.id !== book.id)]); }
  async function refreshLibrary() {
    try {
      const response = await fetch('/api/library', { cache: 'no-store' });
      const data = await response.json() as { books?: Book[]; error?: string };
      if (!response.ok || !data.books) throw new Error(data.error || 'Shared library could not be loaded.');
      if (!processing.current) commit(data.books);
    } catch (error) { notify((error as Error).message); }
    finally { setLoaded(true); }
  }
  async function persistBook(book: Book) {
    const response = await fetch(`/api/library/${book.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(book) });
    const data = await response.json() as { book?: Book; error?: string };
    if (!response.ok || !data.book) {
      if (response.status === 409 || response.status === 404) {
        const fresh = await fetch('/api/library', { cache: 'no-store' });
        if (fresh.ok) commit((await fresh.json() as { books: Book[] }).books);
      }
      throw new Error(data.error || 'Changes could not be saved.');
    }
    upsert(data.book); return data.book;
  }
  async function saveBook(book: Book) {
    processing.current = true; setBusy(true);
    try { await persistBook(book); notify('Changes saved for everyone in the shared workspace.'); return true; }
    catch (error) { notify((error as Error).message); return false; }
    finally { processing.current = false; setBusy(false); }
  }
  async function removeBook(book: Book) {
    processing.current = true; setBusy(true);
    try {
      const response = await fetch(`/api/library/${book.id}?revision=${book.revision}`, { method: 'DELETE' });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Book could not be removed.');
      commit(booksRef.current.filter(item => item.id !== book.id)); setSelected(null); notify('Book removed from the shared workspace.');
    } catch (error) { notify((error as Error).message); }
    finally { processing.current = false; setBusy(false); await refreshLibrary(); }
  }
  async function refreshConnection() {
    try { const response = await fetch('/api/classify', { cache: 'no-store' }); if (!response.ok) throw new Error(); const state = await response.json() as { configured: boolean }; setConnected(Boolean(state.configured)); return Boolean(state.configured); }
    catch { setConnected(null); return false; }
  }
  useEffect(() => {
    async function initialize() {
      await refreshLibrary();
      // The earlier public beta kept results in this browser. Preserve those
      // books in the user-requested shared workspace; old PDFs were not saved.
      try {
        const earlier = JSON.parse(localStorage.getItem('folio-library-v1') || '[]');
        if (Array.isArray(earlier) && earlier.length) {
          processing.current = true; setBusy(true); let migrated=0; let failed=false;
          for (const original of earlier) {
            if (original.example || !original.hash || !original.samples?.length) continue;
            const book={...original,status:original.result?'complete':'ready'};
            const form=new FormData();form.set('book',JSON.stringify(book));form.set('legacy','true');
            const response=await fetch('/api/library',{method:'POST',body:form});
            if(response.ok)migrated++;else failed=true;
          }
          if(!failed)localStorage.removeItem('folio-library-v1');
          if(migrated)notify(`${migrated} earlier browser results are now in the shared workspace. Reupload their PDFs to retain originals.`);
        }
      } catch { notify('Earlier browser results could not be moved yet. They are still retained in this browser.'); }
      finally { processing.current=false;setBusy(false);await refreshLibrary(); }
    }
    void initialize(); void refreshConnection();
    const timer = setInterval(() => { if (!processing.current) void refreshLibrary(); }, 20000);
    const focus = () => { if (!processing.current) void refreshLibrary(); };
    window.addEventListener('focus', focus);
    return () => { clearInterval(timer); window.removeEventListener('focus', focus); if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  async function classify(original: Book) {
    const full = original.evidenceStrategy === 'full-text-v1' && new TextEncoder().encode(JSON.stringify(original.samples)).length <= EVIDENCE_BYTE_BUDGET;
    const book: Book = { ...original, samples: full ? original.samples : budgetSamples(original.samples), evidenceStrategy: full ? 'full-text-v1' : 'distributed-pages-and-within-page-v1' };
    update(book.id, { status: 'classifying', message: 'Jev is finding this book’s place on your shelf…' });
    try {
      const response = await fetch('/api/classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: book.title, pageCount: book.pageCount, samples: book.samples, strategy: book.evidenceStrategy || 'distributed-pages-and-within-page-v1' }), signal: AbortSignal.timeout(60000) });
      const result = await response.json() as Classification & { error?: string; code?: string };
      if (!response.ok) {
        if (result.code === 'NOT_CONFIGURED') { setConnected(false); await persistBook({ ...book, status: 'ready', message: result.error }); return; }
        throw new Error(result.error || 'Classification could not be completed. Please retry.');
      }
      await persistBook({ ...book, status: 'complete', result: result as Classification, corrections: undefined, message: undefined }); setConnected(true);
    } catch (error) {
      const message = (error as Error).name === 'TimeoutError' ? 'Classification timed out. Your book is saved; please retry.' : (error as Error).message || 'Connection interrupted. Please retry.';
      try { await persistBook({ ...book, status: 'error', message }); } catch { notify(message); }
      update(book.id, { status: booksRef.current.find(item => item.id === book.id)?.result ? 'complete' : 'error', message });
    }
  }
  async function refineBook(book: Book) {
    if (processing.current) return;
    processing.current = true; setBusy(true);
    try {
      const response = await fetch('/api/subjects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({title:book.title,pageCount:book.pageCount,samples:book.samples,strategy:book.evidenceStrategy || 'distributed-pages-and-within-page-v1'}), signal:AbortSignal.timeout(100000) });
      const data = await response.json() as DetailedSubject & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Subject refinement failed.');
      await persistBook({ ...book, detailedSubject:data }); notify('Detailed subject saved for the shared workspace.');
    } catch (error) { notify((error as Error).message); }
    finally { processing.current = false; setBusy(false); }
  }
  async function addFiles(files: File[]) {
    if (processing.current) { notify('Let the current books finish first, then add more.'); return; }
    if (booksRef.current.length + files.length > 50) { notify('The shared library holds up to 50 books. Export and remove some books to make room.'); return; }
    if (files.length > 10) { notify('Please add up to 10 PDFs at a time.'); return; }
    processing.current = true; setBusy(true); setExamples(false); setView('library');
    setSearch(''); setGenre(''); setLanguage(''); setLevel('');
    const isConnected = await refreshConnection();
    try {
      for (const file of files) {
        const id = crypto.randomUUID();
        const book: Book = { id, hash: '', title: file.name.replace(/\.pdf$/i, ''), author: '', filename: file.name, pageCount: 0, size: file.size, addedAt: new Date().toISOString(), samples: [], status: 'extracting', message: 'Opening your PDF…' };
        commit([book, ...booksRef.current]);
        try {
          const extracted = await extractBook(file, message => update(id, { message }));
          if (booksRef.current.some(existing => existing.id !== id && existing.hash === extracted.hash && existing.pdfUrl)) {
            commit(booksRef.current.filter(existing => existing.id !== id)); notify(`${file.name} is already in the shared library.`); continue;
          }
          const ready = { ...book, ...extracted, status: 'ready' as const, message: isConnected ? 'Ready for Jev' : 'Text extracted. Jev will be available once the site owner connects an API key.' };
          const form = new FormData(); form.set('book', JSON.stringify(ready)); form.set('pdf', file);
          const response = await fetch('/api/library', { method: 'POST', body: form });
          const data = await response.json() as { book?: Book; duplicate?: boolean; error?: string };
          if (!response.ok || !data.book) throw new Error(data.error || 'PDF could not be saved.');
          commit(booksRef.current.filter(item => item.id !== id)); upsert(data.book);
          if (data.duplicate) { notify(`${file.name} is already in the shared library.`); continue; }
          if (isConnected) await classify(data.book);
        } catch (error) { commit(booksRef.current.filter(item => item.id !== id)); notify(`${file.name}: ${(error as Error).message}`); }
      }
    } finally { processing.current = false; setBusy(false); await refreshLibrary(); }
  }
  async function retryBooks(items: Book[]) {
    if (processing.current) return;
    processing.current = true; setBusy(true);
    try { await refreshConnection(); for (const book of items) await classify(book); }
    finally { processing.current = false; setBusy(false); await refreshLibrary(); }
  }
  const collection = examples ? exampleBooks : books;
  const reviewCount = books.filter(book => book.result && needsReview(book.result)).length;
  const visible = useMemo(() => collection.filter(book => {
    const data = labels(book); const term = search.toLowerCase().trim();
    return (view !== 'review' || Boolean(book.result && needsReview(book.result))) &&
      (!genre || data.genre === genre) && (!language || data.language === language) && (!level || data.readingLevel === level) &&
      (!term || `${book.title} ${book.author} ${data.genre} ${data.language} ${data.readingLevel} ${data.timePeriod} ${data.subcategory} ${book.result?.form?.label || ''} ${book.result?.audience?.label || ''} ${Object.entries(book.result?.technical?.languages || {}).filter(([,p]) => p >= FACET_THRESHOLD).map(([s]) => s).join(' ')} ${Object.entries(book.result?.technical?.topics || {}).filter(([,p]) => p >= FACET_THRESHOLD).map(([s]) => s).join(' ')}`.toLowerCase().includes(term));
  }).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'pages' ? b.pageCount - a.pageCount : b.addedAt.localeCompare(a.addedAt)), [collection, view, genre, language, level, search, sort]);
  const finished = collection.filter(book => book.result);
  const genres = new Set(finished.map(book => labels(book).genre)); const languages = new Set(finished.map(book => labels(book).language));
  const activeBook = collection.find(book => book.id === selected);
  const readyBooks = books.filter(book => (book.status === 'ready' || book.status === 'error') && book.samples.length > 0);
  function exportLibrary() {
    const content = { exportedAt: new Date().toISOString(), exampleData: examples, taxonomyVersion: TAXONOMY_VERSION, readingScale: 'Jev estimated literacy bands; not Lexile or ATOS', books: visible.map(book => { const { samples, cover, hash, ...metadata } = book; const final = labels(book); return { ...metadata, finalLabels: final, thema: themaForLabel(final.genre), narrowerThema: SUBCATEGORIES[themaForLabel(final.genre)?.code || '']?.find(item => item.code === final.subcategory), languageCodes: languageCodes(final.language), sampledPages: samples.map(s => s.page) }; }) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = examples ? 'folio-example-results.json' : 'folio-library.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); notify('Your library export is ready.');
  }
  function resetFilters() { setSearch(''); setGenre(''); setLanguage(''); setLevel(''); }
  async function trySample() {
    try {
      const response = await fetch('/sample-book.pdf');
      if (!response.ok) throw new Error('The sample PDF could not be loaded.');
      await addFiles([new File([await response.blob()], 'The Lantern Forest.pdf', { type: 'application/pdf' })]);
    } catch { notify('The sample book could not be opened. Please try again.'); }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Folio home"><span className="brand-mark"><BookOpen size={25} strokeWidth={1.6} /></span>folio<span className="brand-dot">.</span></a>
      <div className="workspace-label">YOUR READING SPACE</div>
      <nav aria-label="Main navigation"><button className={view === 'library' ? 'nav-item active' : 'nav-item'} onClick={() => { setView('library'); resetFilters(); }}><LibraryBig size={18} /> Shared library <span>{books.length}</span></button><button className={view === 'review' ? 'nav-item active' : 'nav-item'} onClick={() => { setView('review'); setExamples(false); resetFilters(); }}><CheckCheck size={18} /> To review {reviewCount > 0 && <span>{reviewCount}</span>}</button></nav>
      <div className="sidebar-note"><div className="note-symbol">✳</div><h3>A place for every story.</h3><p>Turn a folder of PDFs into a library you can understand.</p><button onClick={() => setHelp(true)}>Meet your librarian <ArrowUpRight size={14} /></button></div>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => setHelp(true)}><CircleHelp size={18} /> How it works <ArrowUpRight size={14} /></button><div className="powered"><span className="jev-symbol">∵</span><div>Powered by <b>Jev</b><small>TYPE SAFE. BOOK SMART.</small></div></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><LibraryBig size={15} /><span>Workspace</span><span className="slash">/</span><b>{view === 'review' ? 'To review' : 'Shared library'}</b></div><div className="topbar-right"><span className="beta-tag">PUBLIC BETA</span><button className="icon-button" aria-label="How Folio works" onClick={() => setHelp(true)}><CircleHelp size={18} /></button><span className="avatar"><BookOpen size={16} /></span></div></header>
      <main>
        <div className="page-heading"><div><span className="eyebrow"><span className="tiny-line" /> ONE SHARED TEST WORKSPACE</span><h1>{view === 'review' ? 'A second look.' : 'Our library, understood.'}</h1><p>{view === 'review' ? 'Some stories need a human touch. Review the results Jev is less sure about.' : 'Every book has a story. Let’s find where yours belongs.'}</p></div><button className="primary-button top-upload" disabled={busy} onClick={() => fileInput.current?.click()}><Plus size={17} /> Add books</button></div>
        {view === 'library' && <section className="upload-section" aria-label="Add PDF books">
          <div className={`upload-area ${dragging ? 'dragging' : ''} ${busy ? 'is-busy' : ''}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); void addFiles(Array.from(event.dataTransfer.files)); }}>
            <div className="upload-icon">{busy ? <LoaderCircle size={27} className="spin" /> : <Upload size={27} strokeWidth={1.5} />}<span>{busy ? '…' : '+'}</span></div>
            <h2>{busy ? 'Getting to know your books…' : dragging ? 'A new story for your shelf.' : 'Drop a book. Discover its story.'}</h2><p>Drag your PDFs here, or <button className="inline-button" disabled={busy} onClick={() => fileInput.current?.click()}>browse files</button></p>
            <div className="upload-meta"><span>PDF files</span><i /><span>Up to 25 MB each</span><i /><span>Multiple books welcome</span></div>
          </div>
          <div className="intro-card"><span className="intro-kicker"><Sparkles size={14} /> A LITTLE HELP FROM JEV</span><h2>Beyond<br />the cover.</h2><p>Subject, language, reading level.<br />Story setting, too.<br />The details that make a library yours.</p><div className="book-illustration" aria-hidden="true"><div className="ill-book one"><span>THE<br />NEXT<br />CHAPTER</span><Leaf size={24} /></div><div className="ill-book two"><span>WORLDS<br />WITHIN</span><div className="ill-orbit" /></div><span className="ill-spark a">✳</span><span className="ill-spark b">+</span><span className="ill-shadow" /></div></div>
        </section>}
        <input ref={fileInput} className="visually-hidden" type="file" accept=".pdf,application/pdf" multiple aria-label="Upload PDF books" disabled={busy} onChange={event => { void addFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
        <div className="privacy-line"><ShieldCheck size={14} /><span>Uploads, PDFs, excerpts, and results are shared with everyone using this link.</span><button onClick={() => setHelp(true)}>Learn more <ArrowUpRight size={12} /></button></div>
        <section className="stats" aria-label={examples ? 'Example library statistics' : 'Library statistics'}><div><span className="stat-icon"><BookOpen size={18} /></span><div><span>Total books</span><strong>{collection.length.toString().padStart(2, '0')}<small>on your shelf</small></strong></div></div><div><span className="stat-icon"><Tag size={18} /></span><div><span>Unique genres</span><strong>{genres.size.toString().padStart(2, '0')}<small>worlds to explore</small></strong></div></div><div><span className="stat-icon"><Globe2 size={18} /></span><div><span>Languages</span><strong>{languages.size.toString().padStart(2, '0')}<small>ways to tell a story</small></strong></div></div></section>
        {readyBooks.length > 0 && !examples && <div className="connection-notice"><Sparkles size={17} /><div><strong>{readyBooks.length} {readyBooks.length === 1 ? 'book is' : 'books are'} ready for Jev</strong><p>{connected ? 'Your text is extracted. Pick up where you left off.' : 'The site owner needs to connect a TypeSafe API key to enable live classification.'}</p></div><button className="secondary-button" disabled={busy} onClick={() => void retryBooks(readyBooks)}>Classify books <ArrowRight size={14} /></button></div>}
        <section className="library-section" aria-label="Book library"><div className="library-heading"><div className="library-title"><h2>{view === 'review' ? 'Needs your review' : examples ? 'An example shelf' : 'On our shared shelf'}</h2><span className="count-pill">{visible.length}</span></div><div className="library-actions">{books.length === 0 && view === 'library' && <button className="text-button" onClick={() => { setExamples(!examples); resetFilters(); }}>{examples ? 'Back to my library' : 'Explore example results'} <ArrowUpRight size={14} /></button>}<button className="secondary-button export-button" disabled={!visible.length} onClick={exportLibrary}><ArrowDownToLine size={14} /> Export</button></div></div>
          {examples && <div className="example-banner"><Sparkles size={15} /><span>Example collection · Illustrative labels and confidence, not live Jev results.</span><button onClick={() => { setExamples(false); resetFilters(); }} aria-label="Close examples"><X size={16} /></button></div>}
          <div className="filters"><label className="search-box"><Search size={16} /><input aria-label="Search books" placeholder="Search your books…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={14} /></button>}</label><div className="filter-select"><select aria-label="Filter by genre" value={genre} onChange={event => setGenre(event.target.value)}><option value="">All genres</option>{Array.from(genres).sort().map(value => <option key={value}>{value}</option>)}</select><ChevronDown size={12} /></div><div className="filter-select"><select aria-label="Filter by language" value={language} onChange={event => setLanguage(event.target.value)}><option value="">All languages</option>{Array.from(languages).sort().map(value => <option key={value}>{value}</option>)}</select><ChevronDown size={12} /></div><div className="filter-select level-filter"><select aria-label="Filter by reading level" value={level} onChange={event => setLevel(event.target.value)}><option value="">All reading levels</option>{LEVELS.map(value => <option key={value.label}>{value.label}</option>)}</select><ChevronDown size={12} /></div><div className="view-toggle"><button aria-label="Grid view" aria-pressed={mode === 'grid'} onClick={() => setMode('grid')} className={mode === 'grid' ? 'selected' : ''}><Grid2X2 size={16} /></button><button aria-label="List view" aria-pressed={mode === 'list'} onClick={() => setMode('list')} className={mode === 'list' ? 'selected' : ''}><List size={17} /></button></div></div>
          <div className="results-bar"><span>{visible.length ? `${visible.length} ${visible.length === 1 ? 'book' : 'books'}${examples ? ' in this example collection' : ' in the shared library'}` : 'A fresh shelf, full of possibilities'}</span><label>Sort by: <select aria-label="Sort books" value={sort} onChange={event => setSort(event.target.value)}><option value="recent">Recently added</option><option value="title">Title A–Z</option><option value="pages">Page count</option></select></label></div>
          {!loaded ? <div className="empty-state"><LoaderCircle className="spin" size={26} /><p>Opening your library…</p></div> : visible.length === 0 ? <div className="empty-state"><div className="empty-books" aria-hidden="true"><span /><span /><span /><BookOpen size={34} strokeWidth={1.2} /></div><h3>{search || genre || language || level ? 'No books on this part of the shelf.' : view === 'review' ? 'Everything is in its place.' : 'Good stories start somewhere.'}</h3><p>{search || genre || language || level ? 'Try another search or clear the filters to see your books.' : view === 'review' ? 'Books with uncertain classifications will appear here for a second look.' : 'Add your first PDF and let Jev take care of the details.'}</p>{search || genre || language || level ? <button className="text-button" onClick={resetFilters}>Clear filters <X size={14} /></button> : view === 'library' ? <div className="empty-state-actions"><button className="secondary-button" disabled={busy} onClick={() => fileInput.current?.click()}><Plus size={15} /> Add your first book</button><button className="text-button" disabled={busy} onClick={() => void trySample()}>Try a sample book <ArrowUpRight size={14} /></button></div> : <button className="text-button" onClick={() => setView('library')}>Back to your library <ArrowRight size={14} /></button>}</div> : <div className={`books ${mode}`}>
            {visible.map(book => { const data = labels(book); const running = book.status === 'extracting' || book.status === 'classifying'; return <article key={book.id} className="book-card"><button className="cover-button" onClick={() => setSelected(book.id)} aria-label={`View ${book.title}`}><Cover book={book} /><span className="cover-open">Open book details <ArrowUpRight size={15} /></span></button><div className="book-information"><div className="book-status">{book.example ? <span className="example-label">EXAMPLE</span> : running ? <span className="processing-label"><LoaderCircle size={12} className="spin" /> {book.status === 'extracting' ? 'Reading PDF' : 'Classifying'}</span> : book.result ? <span className={needsReview(book.result) ? 'review-label' : 'classified-label'}>{needsReview(book.result) ? <CircleHelp size={12} /> : <Check size={12} />}{needsReview(book.result) ? 'To review' : book.result.reviewed ? 'Reviewed' : 'Classified'}</span> : <span className={book.status === 'error' ? 'error-label' : 'ready-label'}>{book.status === 'error' ? 'Needs attention' : 'Ready for Jev'}</span>}<span>{book.pageCount > 0 ? `${book.pageCount} pp.` : 'PDF'}</span></div><button className="book-title-button" onClick={() => setSelected(book.id)}><h3>{book.title}</h3></button><p className="book-author">{book.author || book.filename}</p>{book.result ? <><span className="genre-tag">{data.genre}</span><div className="book-details"><span><Globe2 size={12} />{data.language}</span><span><GraduationCap size={14} />{data.readingLevel}</span></div></> : <div className="book-message" role={running ? 'status' : undefined}>{book.message}</div>}{!running && !book.result && book.samples.length > 0 && <button className="text-button retry-button" disabled={busy} onClick={() => void retryBooks([book])}>Classify <ArrowRight size={14} /></button>}</div></article>; })}
          </div>}
        </section>
        <footer className="page-footer"><span><a href="/testing">Sampling tests</a> · <a href="/validation">Reference validation</a></span><span>Made for the love of reading <Leaf size={13} /></span></footer>
      </main>
    </div>
    {toast && <div className="toast" role="status"><Check size={17} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={16} /></button></div>}
    {activeBook && <Details key={`${activeBook.id}-${activeBook.revision}`} book={activeBook} busy={busy} onClose={() => setSelected(null)} onSave={saveBook} onRefine={() => void refineBook(activeBook)} onDelete={() => void removeBook(activeBook)} onRetry={() => { setSelected(null); void retryBooks([activeBook]); }} />}
    {help && <Dialog title="A little order for your books" onClose={() => setHelp(false)}><div className="help-intro"><BookOpen size={30} strokeWidth={1.4} /><p>Folio gives every book a place on your shelf, with a little help from TypeSafe Jev.</p></div><ol className="help-steps"><li><b>Bring your books.</b><p>Drop up to 10 searchable PDFs at a time, 25 MB each. Scanned books need OCR first.</p></li><li><b>Let Jev read between the lines.</b><p>Short books use full text when they fit the budget. Longer books use up to 18 distributed pages, with passages within long pages. One Jev request asks about subject, subcategories, language, reading complexity, story setting, audience, form, and computing topics and languages.</p></li><li><b>Find a place on your shelf.</b><p>Filter your books, inspect confidence, correct labels, and export the library with Thema and ISO language codes.</p></li></ol><div className="help-note"><ShieldCheck size={19} /><div><b>One shared public workspace</b><p>PDFs, thumbnails, excerpts, results, corrections, and reference labels are retained on the server and visible to everyone with this link. Only extracted text and metadata go to TypeSafe for classification. Anyone using this beta can add, edit, or remove books. Removal deletes the shared record and stored PDF.</p></div></div><div className="standards-note"><h4>Thoughtful labels, established vocabulary.</h4><p><a href="https://ns.editeur.org/thema/en" target="_blank" rel="noreferrer">Thema 1.6</a> supplies 31 selected broad subject categories. This prototype suggests a primary category and its immediate narrower subject; full publisher metadata usually needs more specific and sometimes multiple subjects.</p><p><a href="https://www.loc.gov/standards/iso639-2/php/code_list.php" target="_blank" rel="noreferrer">ISO 639</a> supplies the language codes. Unlisted or uncertain languages remain undetermined.</p><p>Reading bands are Jev estimates, separate from <a href="https://hub.lexile.com/text-analyzer-user-guide/" target="_blank" rel="noreferrer">Lexile</a> and <a href="https://www.renaissance.com/edword/atos/" target="_blank" rel="noreferrer">ATOS</a>. They do not indicate age suitability. Review non-English results carefully.</p></div><p className="benchmark-link"><a href="/validation">Compare against reference labels <ArrowUpRight size={14} /></a></p><p className="benchmark-link"><a href="/testing">See the public-domain test results <ArrowUpRight size={14} /></a></p><a className="text-button" href="/site-qr.png" target="_blank" rel="noreferrer">Open the phone QR code <ArrowUpRight size={14} /></a><div className="help-footer"><span className={`connection-status ${connected ? 'online' : ''}`}><i />{connected === true ? 'Jev is connected' : connected === false ? 'Waiting for the owner’s TypeSafe API key' : 'Checking Jev connection'}</span><a href="https://docs.typesafe.ai" target="_blank" rel="noreferrer">Meet TypeSafe Jev <ArrowUpRight size={14} /></a></div></Dialog>}
  </div>;
}
