import { sampledPageNumbers, type Book } from './catalog';
import { budgetSamples, EVIDENCE_BYTE_BUDGET } from './evidence';
import { selectSourceEvidence, SOURCE_SCAN_CHARACTER_LIMIT } from './source-sampling';
import { extractPageText, MAX_PDF_PAGE_TEXT_CHARACTERS } from './pdf-text';
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

export async function extractBook(file: File, onProgress: (message: string) => void, fullSourceScan = false): Promise<Partial<Book>> {
  if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF file to add to your library.');
  if (file.size > MAX_PDF_BYTES) throw new Error('This PDF is larger than 25 MB. Please upload a smaller file.');
  const buffer = await file.arrayBuffer();
  if (!new TextDecoder().decode(buffer.slice(0, 1024)).includes('%PDF-')) throw new Error('This file is not a valid PDF.');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))).map(n => n.toString(16).padStart(2, '0')).join('');
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const loading = pdfjs.getDocument({ data: buffer, useSystemFonts: true, enableXfa: false, maxImageSize: 4_000_000, cMapUrl: '/pdf-cmaps/', cMapPacked: true, standardFontDataUrl: '/pdf-fonts/' });
  loading.onPassword = () => { void loading.destroy(); };
  let pdf;
  try { pdf = await loading.promise; }
  catch (error) {
    if ((error as Error).name === 'PasswordException' || (error as Error).message.includes('Worker was destroyed')) throw new Error('This PDF is password protected. Upload an unlocked copy.');
    throw new Error('This PDF could not be opened. It may be damaged or unsupported.');
  }
  try {
    if (pdf.numPages > 20000) throw new Error('This PDF has more than 20,000 pages. Please split it into smaller files.');
    const pages = fullSourceScan || pdf.numPages <= 18 ? Array.from({ length: pdf.numPages }, (_, i) => i + 1) : sampledPageNumbers(pdf.numPages); const samples = [];
    const started = Date.now(); let characters = 0;
    for (const number of pages) {
      onProgress(`Reading page ${number} of ${pdf.numPages}`);
      const page = await pdf.getPage(number); const content = await page.getTextContent();
      const remainingTextBudget = SOURCE_SCAN_CHARACTER_LIMIT - characters;
      const text = extractPageText(content.items, fullSourceScan ? remainingTextBudget : MAX_PDF_PAGE_TEXT_CHARACTERS);
      if (text) { samples.push({ page: number, text }); characters += text.length; }
      page.cleanup();
      if (fullSourceScan && (characters > SOURCE_SCAN_CHARACTER_LIMIT || Date.now() - started > 120000)) throw new Error('Full-source scanning reached its text or time limit. The existing evidence and results are retained.');
    }
    if (samples.reduce((sum, sample) => sum + sample.text.length, 0) < 200) throw new Error('Not enough readable text was found. This may be a scanned PDF. Run OCR on it, then upload the searchable PDF.');
    let title = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '); let author = '';
    try {
      const { info } = await pdf.getMetadata(); const metadata = info as { Title?: string; Author?: string };
      if (metadata.Title?.trim() && !/^(untitled|document|microsoft|word|pdf)/i.test(metadata.Title)) title = metadata.Title.trim();
      author = metadata.Author?.trim().slice(0, 200) ?? '';
    } catch { /* Metadata is optional. */ }
    let cover: string | undefined;
    try {
      const page = await pdf.getPage(1); const base = page.getViewport({ scale: 1 }); const viewport = page.getViewport({ scale: 240 / base.width });
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (context && canvas.height < 2000) { await page.render({ canvasContext: context, canvas, viewport }).promise; cover = canvas.toDataURL('image/jpeg', 0.7); }
    } catch { /* Thumbnail failures do not prevent classification. */ }
    const full = pdf.numPages <= 18 && new TextEncoder().encode(JSON.stringify(samples)).length <= EVIDENCE_BYTE_BUDGET;
    return { title: title.slice(0, 240), author, hash, cover, pageCount: pdf.numPages, ...(fullSourceScan ? selectSourceEvidence(samples, pdf.numPages) : { samples: full ? samples : budgetSamples(samples), evidenceStrategy: full ? 'full-text-v1' as const : 'distributed-pages-and-within-page-v1' as const }) };
  } finally { await pdf.destroy(); }
}
