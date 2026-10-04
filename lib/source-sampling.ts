import type { Excerpt } from './catalog.ts';
import { EVIDENCE_BYTE_BUDGET } from './evidence.ts';
import { qualifierAliases } from './qualifier-facts.ts';
import { qualifierAssignable, qualifierNodes } from './qualifier-catalog.ts';

export const SOURCE_SAMPLING_VERSION = 'full-source-contiguous-v1' as const;
export const SOURCE_SCAN_CHARACTER_LIMIT = 12_000_000;
export type SourceSampling = {
  method: typeof SOURCE_SAMPLING_VERSION; scannedPages: number; textPages: number; characters: number;
  matchedAnchors: number; coveredAnchors: number; pruned: boolean;
  locations: { page: number; start: number; end: number }[];
};
type Anchor = { key: string; start: number; end: number };
type Trie = { children: Map<string, Trie>; aliases: { key: string; acronym?: string }[] };
const normalize = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/^(?:exams?|examinations?)$/, 'exam');
let trie: Trie | undefined;
function aliasIndex() {
  if (trie) return trie;
  trie = { children: new Map(), aliases: [] };
  for (const node of qualifierNodes.filter(n => n.CodeValue[0] !== '3' && qualifierAssignable(n.CodeValue))) {
    for (const alias of qualifierAliases(node.CodeValue)) {
      const words = [...alias.matchAll(/[\p{L}\p{N}]+/gu)].map(m => normalize(m[0]));
      if (!words.length) continue;
      let branch = trie;
      for (const word of words) {
        if (!branch.children.has(word)) branch.children.set(word, { children: new Map(), aliases: [] });
        branch = branch.children.get(word)!;
      }
      branch.aliases.push({ key: node.CodeValue, ...(/^[A-Z]{3,6}$/.test(alias) ? { acronym: alias } : {}) });
    }
  }
  return trie;
}
export function sourceAnchors(text: string): Anchor[] {
  const tokens = [...text.matchAll(/[\p{L}\p{N}]+/gu)].map(m => ({ value: normalize(m[0]), start: m.index!, end: m.index! + m[0].length }));
  const anchors: Anchor[] = [];
  const index = aliasIndex();
  for (let i = 0; i < tokens.length; i++) {
    let branch: Trie | undefined = index;
    for (let j = i; j < tokens.length; j++) {
      branch = branch.children.get(tokens[j].value); if (!branch) break;
      for (const alias of branch.aliases) {
        const start = tokens[i].start, end = tokens[j].end;
        if (!alias.acronym || text.slice(start, end) === alias.acronym) anchors.push({ key: alias.key, start, end });
      }
    }
  }
  // These are candidate dates, including quantities and metadata, not verified
  // historical content. The semantic and quotation checks still decide usage.
  for (const match of text.matchAll(/\b(?:[1-9]\d{3}|\d{1,6}\s*(?:BCE|BC|CE|AD)|(?:BCE|BC|CE|AD)\s*\d{1,6})\b/gi)) anchors.push({ key: `date:${match[0].toUpperCase().replace(/\s+/g, ' ')}`, start: match.index!, end: match.index! + match[0].length });
  return anchors.sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));
}
type Window = { page: number; start: number; end: number; text: string; anchors: Set<string> };
const byteSize = (text: string) => new TextEncoder().encode(JSON.stringify(text)).length;
function windowAt(page: Excerpt, center: number, anchors: Anchor[], byteLimit: number): Window {
  const nearby = page.text.slice(Math.max(0, center - 400), center + 400);
  const width = Math.max(40, Math.min(1000, Math.floor(byteLimit / Math.max(1, byteSize(nearby) / Math.max(1, nearby.length))) - 40));
  let start = Math.max(0, Math.min(page.text.length - width, Math.floor(center - width / 2)));
  // Keep a complete preceding sentence when it fits the bounded quotation.
  const before = page.text.slice(start, Math.min(center, start + 160));
  const boundary = /[.!?。！？]\s+/g.exec(before);
  if (boundary) start += boundary.index + boundary[0].length;
  else if (start > 0 && /[\p{L}\p{N}]/u.test(page.text[start - 1])) {
    const next = /\s/u.exec(page.text.slice(start, start + 60)); if (next) start += next.index + next[0].length;
  }
  if (/[\uDC00-\uDFFF]/.test(page.text[start] || '')) start++;
  let end = Math.min(page.text.length, start + width);
  while (end > start && byteSize(page.text.slice(start, end)) > byteLimit) end--;
  if (/[\uD800-\uDBFF]/.test(page.text[end - 1] || '')) end--;
  if (end < page.text.length) {
    const last = Math.max(page.text.lastIndexOf(' ', end - 1), page.text.lastIndexOf('\n', end - 1));
    if (last > start + (end - start) * .65) end = last;
  }
  while (start < end && /\s/u.test(page.text[start])) start++;
  while (end > start && /\s/u.test(page.text[end - 1])) end--;
  return { page: page.page, start, end, text: page.text.slice(start, end), anchors: new Set(anchors.filter(a => a.start >= start && a.end <= end).map(a => a.key)) };
}

export function selectSourceEvidence(pages: Excerpt[], pageCount: number) {
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 20000 || new Set(pages.map(p => p.page)).size !== pages.length || pages.some(p => p.page < 1 || p.page > pageCount || !p.text.trim())) throw new Error('Use unique readable source pages within the PDF.');
  const characters = pages.reduce((sum, p) => sum + p.text.length, 0);
  if (characters > SOURCE_SCAN_CHARACTER_LIMIT) throw new Error('The source scan exceeds the bounded text limit.');
  if (characters < 200) throw new Error('Not enough readable text was found. This may be a scanned PDF; OCR is needed.');
  const ordered = [...pages].sort((a, b) => a.page - b.page);
  const full = pageCount <= 18 && new TextEncoder().encode(JSON.stringify(ordered)).length <= EVIDENCE_BYTE_BUDGET;
  if (full) return { samples: ordered, evidenceStrategy: 'full-text-v1' as const, sourceSampling: undefined };
  const limit = Math.min(18, ordered.length), byteLimit = Math.floor((EVIDENCE_BYTE_BUDGET - 1500) / limit);
  const indexed = ordered.map(page => ({ page, anchors: sourceAnchors(page.text) }));
  const allKeys = new Set(indexed.flatMap(p => p.anchors.map(a => a.key)));
  const frequencies = new Map<string, number>();
  for (const { anchors } of indexed) for (const key of new Set(anchors.map(a => a.key))) frequencies.set(key, (frequencies.get(key) || 0) + 1);
  const selected: Window[] = [], covered = new Set<string>();
  function add(window: Window) { selected.push(window); for (const key of window.anchors) covered.add(key); }
  let windowPruned = false;
  const candidates = indexed.flatMap(({ page, anchors }) => {
    const allCenters = [...new Set(anchors.map(a => Math.floor((a.start + a.end) / 2)))];
    if (allCenters.length > 24) windowPruned = true;
    const centers = allCenters.length <= 24 ? allCenters : Array.from({ length: 24 }, (_, i) => allCenters[Math.round(i * (allCenters.length - 1) / 23)]);
    const windows = centers.map(center => windowAt(page, center, anchors, byteLimit));
    return windows.filter((w, i) => w.anchors.size && !windows.slice(0, i).some(p => p.start === w.start));
  });
  const weight = (key: string) => (key.startsWith('date:') ? .65 : 1) * ((frequencies.get(key) || 0) > 1 ? 1.25 : 1);
  const score = (w: Window) => [...w.anchors].reduce((n, key) => n + (covered.has(key) ? .1 : 1) * weight(key), 0);
  const baseCount = Math.min(9, limit);
  // Keep fixed page coverage, including books with fewer than nine text pages.
  // Within each page, retain a coherent useful window rather than always taking
  // its beginning and wasting available context on a repeated header.
  for (let i = 0; i < baseCount; i++) {
    const position = Math.round(i * (indexed.length - 1) / Math.max(1, baseCount - 1));
    const { page, anchors } = indexed[position];
    const offset = Math.floor((page.text.length - Math.min(600, page.text.length)) * ((i % 3) / 2));
    const baseline = windowAt(page, offset + 300, anchors, byteLimit);
    const useful = candidates.filter(w => w.page === page.page).sort((a, b) => score(b) - score(a) || a.start - b.start)[0];
    add(useful && score(useful) > score(baseline) ? useful : baseline);
  }
  while (selected.length < limit) {
    const available = candidates.filter(w => !selected.some(s => s.page === w.page));
    available.sort((a, b) => {
      return score(b) - score(a) || a.page - b.page || a.start - b.start;
    });
    if (!available.length) {
      const next = indexed.find(p => !selected.some(s => s.page === p.page.page)); if (!next) break;
      add(windowAt(next.page, 240, next.anchors, byteLimit));
    } else add(available[0]);
  }
  selected.sort((a, b) => a.page - b.page);
  const samples = selected.map(({ page, text }) => ({ page, text }));
  if (samples.some(p => !p.text.trim()) || samples.reduce((n, p) => n + p.text.length, 0) < 200) throw new Error('Not enough readable text remains in the selected evidence. Existing results are retained.');
  if (new TextEncoder().encode(JSON.stringify(samples)).length > EVIDENCE_BYTE_BUDGET) throw new Error('Selected evidence exceeds the context budget.');
  const sourceSampling: SourceSampling = { method: SOURCE_SAMPLING_VERSION, scannedPages: pageCount, textPages: ordered.length, characters, matchedAnchors: allKeys.size, coveredAnchors: covered.size, pruned: windowPruned || covered.size < allKeys.size,
    locations: selected.map(({ page, start, end }) => ({ page, start, end })) };
  return { samples, evidenceStrategy: SOURCE_SAMPLING_VERSION, sourceSampling };
}
