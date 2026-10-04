import { qualifierNode } from './qualifier-catalog.ts';
import type { Excerpt } from './catalog.ts';
export type CalendarYear = { year: number; era: 'BCE' | 'CE' };
export type QualifierFacts = {
  method: 'source-facts-v1'; range?: { start: CalendarYear; end: CalendarYear };
  matches: { kind: 'year' | 'name'; page: number; start: number; end: number; text: string; year?: number; era?: 'BCE' | 'CE'; eraBasis?: 'explicit' | 'shared-range' | 'unmarked'; alias?: string }[];
  matchCount: number; truncated: boolean;
};
const numberPattern = '(?:\\d{1,3}(?:[ ,]\\d{3})+|\\d+)';
const eraPattern = '(?:BCE|BC|CE|AD)';
const number = (s: string) => Number(s.replace(/[ ,]/g, ''));
const era = (s: string | undefined): CalendarYear['era'] => /^BC/.test(s || '') ? 'BCE' : 'CE';
// Astronomical year numbering is internal only: 1 BCE = 0; 1 CE = 1.
const ordinal = (value: CalendarYear) => value.era === 'BCE' ? 1 - value.year : value.year;
export function qualifierCalendarRange(code: string): QualifierFacts['range'] {
  const heading = qualifierNode(code)?.CodeDescription;
  if (!heading || code[0] !== '3') return undefined;
  const match = new RegExp(`(?:c\\s*)?(${numberPattern})\\s*(${eraPattern})?\\s+to\\s+(?:c\\s*)?(${numberPattern})\\s*(${eraPattern})?`, 'i').exec(heading);
  if (!match) return undefined;
  const a = { year: number(match[1]), era: era((match[2] || match[4])?.toUpperCase()) };
  const b = { year: number(match[3]), era: era((match[4] || match[2])?.toUpperCase()) };
  if (!a.year || !b.year) return undefined; // No historical year zero.
  return ordinal(a) <= ordinal(b) ? { start: a, end: b } : { start: b, end: a };
}
type YearMention = { start: number; end: number; text: string; year: number; era: CalendarYear['era']; eraBasis: 'explicit' | 'shared-range' | 'unmarked' };
function yearMentions(text: string): YearMention[] {
  const result: YearMention[] = [];
  // Explicit era markers and four-digit unmarked year candidates. Bare values
  // remain candidates, not claims that a page number/model/quantity is a date.
  for (const match of text.matchAll(new RegExp(`\\b(${numberPattern})\\s*(${eraPattern})\\b|\\b(${eraPattern})\\s*(${numberPattern})\\b|\\b([1-9]\\d{3})\\b`, 'gi'))) {
    const start = match.index!, year = number(match[1] || match[4] || match[5]);
    if (!year || year > 999999) continue;
    const marker = match[2] || match[3];
    result.push({ start, end: start + match[0].length, text: match[0], year, era: era(marker?.toUpperCase()), eraBasis: marker ? 'explicit' : 'unmarked' });
  }
  // An era shared by a bounded written range applies to both endpoints. Keep
  // explicit prefix/suffix spans intact, including ranges crossing BCE/CE.
  // An era elsewhere in the paragraph must not be attached to a bare number.
  for (const match of text.matchAll(new RegExp(`\\b(?:(${eraPattern})\\s*)?(${numberPattern})\\s*(${eraPattern})?\\s*(?:to|[–—-])\\s*(?:(${eraPattern})\\s*)?(${numberPattern})\\s*(${eraPattern})?\\b`, 'gid'))) {
    const markers = [match[1] || match[3], match[4] || match[6]];
    if (!markers.some(Boolean)) continue;
    for (const [i, group] of [2, 5].entries()) {
      const year = number(match[group]); if (!year || year > 999999) continue;
      const start = match.indices![group]![0], end = match.indices![group]![1];
      const explicit = result.find(y => y.eraBasis === 'explicit' && y.start <= start && y.end >= end);
      if (explicit) continue;
      const value: YearMention = { start, end, text: text.slice(start, end), year, era: era((markers[i] || markers[1 - i])!.toUpperCase()), eraBasis: 'shared-range' };
      const existing = result.find(y => y.start === start);
      if (existing) Object.assign(existing, value); else result.push(value);
    }
  }
  return result.sort((a, b) => a.start - b.start);
}
const normalizeToken = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/^(?:exams?|examinations?)$/, 'exam');
function aliasesFor(code: string): string[] {
  const node = qualifierNode(code); if (!node) return [];
  const aliases = [node.CodeDescription.replace(/^For\s+/i, '').replace(/\s*\([^)]*\)\s*$/, '').trim()];
  const also = String(node.CodeNotes || '').match(/Also class here:\s*(.*?)(?=Use for:|Use with:|Prefer:|See also:|DO NOT USE:|$)/i)?.[1];
  if (also) aliases.push(...also.split(/[,;]/).map(s => s.trim().replace(/\.$/, '')).filter(s => s.length >= 3 && s.length <= 100));
  return [...new Set(aliases)].filter(a => a.length >= 3);
}
export function qualifierFacts(code: string, samples: Excerpt[]): QualifierFacts {
  const range = qualifierCalendarRange(code);
  const matches: QualifierFacts['matches'] = [];
  if (range) {
    for (const sample of samples) for (const year of yearMentions(sample.text)) {
      const value = ordinal(year);
      if (value >= ordinal(range.start) && value <= ordinal(range.end)) matches.push({ kind: 'year', page: sample.page, ...year });
    }
  }
  for (const sample of samples) {
    const tokens = [...sample.text.matchAll(/[\p{L}\p{N}]+/gu)].map(m => ({ value: normalizeToken(m[0]), raw: m[0], start: m.index!, end: m.index! + m[0].length }));
    for (const alias of aliasesFor(code)) {
      const target = [...alias.matchAll(/[\p{L}\p{N}]+/gu)].map(m => normalizeToken(m[0]));
      if (!target.length) continue;
      for (let i = 0; i <= tokens.length - target.length; i++) {
        if (!target.every((value, j) => tokens[i + j].value === value)) continue;
        const start = tokens[i].start, end = tokens[i + target.length - 1].end;
        // Short uppercase aliases from the official notes are acronyms, not
        // ordinary lowercase words such as a fictional character's pet.
        if (/^[A-Z]{3,6}$/.test(alias) && sample.text.slice(start, end) !== alias) continue;
        if (!matches.some(m => m.kind === 'name' && m.page === sample.page && m.start === start && m.end === end)) matches.push({ kind: 'name', page: sample.page, start, end, text: sample.text.slice(start, end), alias });
      }
    }
  }
  matches.sort((a, b) => a.page - b.page || a.start - b.start || a.kind.localeCompare(b.kind));
  return { method: 'source-facts-v1', ...(range ? { range } : {}), matches: matches.slice(0, 12), matchCount: matches.length, truncated: matches.length > 12 };
}
