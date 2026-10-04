import type { DetailedSubject } from './hierarchy.ts';
import { THEMA, LANGUAGE_CODES } from './standards.ts';
import type { LanguageAnalysis } from './language-classification.ts';
import type { DetailedQualifiers } from './qualifier-search.ts';
export const GENRES: Record<string, string> = Object.fromEntries([...THEMA.map(item => [item.label, `Thema ${item.code}: ${item.heading}`]), ['Other / uncertain', 'No selected category fits, or insufficient evidence.']]);
export const LANGUAGES: Record<string, string> = Object.fromEntries(LANGUAGE_CODES.map(item => [item.label, item.english]));
export const TIME_PERIODS: Record<string, string> = {
  'Prehistory': 'Before approximately 3000 BCE, before widespread written records; use only when the setting supports this.',
  'Ancient BCE (3000–1 BCE)': 'Ancient civilizations from approximately 3000 BCE through 1 BCE.',
  'BC / BCE': 'Main events take place before 1 CE, including prehistory and ancient civilizations before the common era.',
  '1–499 CE': 'Main events take place in the first five centuries of the common era.',
  '500–999': 'Early medieval setting between 500 and 999 CE.',
  '1000–1499': 'Medieval setting between 1000 and 1499 CE.',
  '500–1499': 'Main events take place between 500 and 1499 CE, broadly medieval times.',
  '1500s': 'Main events take place in 1500–1599 CE.',
  '1600s': 'Main events take place in 1600–1699 CE.',
  '1700s': 'Main events take place in 1700–1799 CE.',
  '1800–1849': 'First half of the nineteenth century, including the Regency and early Victorian period.',
  '1850–1899': 'Second half of the nineteenth century, including the later Victorian period.',
  '1800s': 'Main events take place in 1800–1899 CE.',
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => {
    const year = 1900 + i * 10;
    return [`${year}–${year + 9}`, `Main events take place in ${year} through ${year + 9} CE.`];
  })),
  '1900s': 'Main events take place in 1900–1999 CE.',
  '2000–2009': 'Main events take place in 2000 through 2009 CE.',
  '2010–2019': 'Main events take place in 2010 through 2019 CE.',
  '2020s / present': 'Main events take place in the 2020s up to the contemporary present, or explicitly today.',
  '2000s / present': 'Main events take place in 2000–2026 CE or explicitly in the contemporary present.',
  'Future': 'Main events take place after the contemporary present or in an explicitly futuristic setting.',
  'Multiple periods': 'Substantial main events span more than one listed period; not merely a passing recollection.',
  'Timeless / imaginary': 'The setting is a fairy-tale or imaginary world without a supported real-world historical period.',
  'Not applicable / uncertain': 'The work has no narrative or historical temporal focus, or the excerpts do not support a period. Do not infer from the publication date.',
};
export const LEVELS = [
  { label: 'Early reader', range: 'Grades K–2', description: 'Very short, simple sentences, basic concrete vocabulary, frequent repetition; early independent literacy (approximately US grades K–2).' },
  { label: 'Elementary', range: 'Grades 3–5', description: 'Common vocabulary and straightforward sentences; simple plots or explanations with limited inference (approximately US grades 3–5).' },
  { label: 'Middle school', range: 'Grades 6–8', description: 'Moderately varied vocabulary, longer sentences, figurative language and inference without specialized prerequisites (approximately US grades 6–8).' },
  { label: 'High school', range: 'Grades 9–12', description: 'Complex sentences, abstract ideas, substantial figurative language or demanding vocabulary; strong secondary-school literacy (approximately US grades 9–12).' },
  { label: 'College & adult', range: 'College / adult', description: 'Dense literary or expository prose, sophisticated abstraction, substantial interpretation, or vocabulary requiring advanced literacy.' },
  { label: 'Advanced', range: 'Specialist', description: 'Highly technical, specialized, or scholarly prose requiring subject knowledge, dense syntax, or advanced academic literacy.' },
] as const;
export type Excerpt = { page: number; text: string };
export type Judgment = { label: string; confidence: number; probabilities: Record<string, number> };
export type Classification = {
  genre: Judgment & { code?: string; standard?: string; heading?: string }; language: Judgment & { iso639_1?: string | null; iso639_2?: string };
  subcategory?: Judgment & { code?: string; parentCode: string; heading?: string };
  timePeriod?: Judgment; form?: Judgment; audience?: Judgment;
  technical?: { experience: Judgment; languages: Record<string, number>; topics: Record<string, number> };
  readingLevel: Judgment & { score: number; range: string };
  model: string; reviewed: boolean; taxonomyVersion?: string;
  languageAnalysis?: LanguageAnalysis;
  evidence?: { strategy: string; pages: number[]; characters: number; questionCount: number };
};
export type Book = {
  id: string; hash: string; title: string; author: string; filename: string;
  pageCount: number; size: number; addedAt: string; cover?: string;
  samples: Excerpt[]; status: 'extracting' | 'ready' | 'classifying' | 'complete' | 'error';
  evidenceStrategy?: 'full-text-v1' | 'distributed-pages-and-within-page-v1' | 'full-source-contiguous-v1';
  sourceSampling?: import('./source-sampling.ts').SourceSampling;
  evidenceRuns?: { id: string; createdAt: string; strategy: string }[];
  revision?: number; pdfUrl?: string; sourceUrl?: string;
  reference?: ReferenceLabels; detailedSubject?: DetailedSubject; qualifiers?: DetailedQualifiers;
  message?: string; result?: Classification; example?: boolean;
  corrections?: { genre: string; language: string; readingLevel: string; subcategory?: string; timePeriod?: string };
};
export type ReferenceLabels = {
  status: 'provisional' | 'verified'; sourceName: string; sourceUrl: string;
  scope: 'work' | 'edition'; edition: string; notes: string;
  labels: { detailedSubject?: string; genre?: string; subcategory?: string; language?: string; readingLevel?: string; timePeriod?: string };
  subjectReference?: { codes: string[]; coverage: 'complete' | 'partial'; taxonomyVersion: 'Thema 1.6' };
  qualifierReference?: {
    taxonomyVersion: 'Thema 1.6';
    dimensions: Partial<Record<'1' | '2' | '3' | '4' | '5' | '6', {
      codes: string[]; coverage: 'complete' | 'partial';
      links?: { code: string; subjectCodes: string[]; coverage: 'complete' | 'partial' }[];
    }>>;
  };
  review?: {
    reviewer: string; reviewerRole: string; method: 'publisher-metadata' | 'catalog-metadata' | 'expert-review';
    reviewedAt: string; independent: boolean; editionMatched: boolean; modelBlind: boolean;
  };
  workKey?: string;
  readingMeasure?: { system: 'ATOS' | 'Lexile'; value: string; sourceUrl: string; edition: string };
  split: 'development' | 'holdout'; updatedAt: string;
};
export function needsReview(result: Classification, threshold = 0.7) {
  return !result.reviewed && (result.genre.confidence < threshold || result.language.confidence < threshold ||
    result.languageAnalysis?.needsReview || result.readingLevel.confidence < threshold || (result.subcategory && result.subcategory.confidence < threshold) || (result.timePeriod && result.timePeriod.confidence < threshold) || result.genre.label === 'Other / uncertain' || result.language.label === 'Other / uncertain');
}
export function bookNeedsReview(book: Book) {
  return Boolean((book.result && needsReview(book.result)) || (book.detailedSubject?.needsReview && !book.detailedSubject.reviewed) || (book.qualifiers?.needsReview && !book.qualifiers.reviewed));
}
export function sampledPageNumbers(pageCount: number): number[] {
  return [...new Set([
    ...Array.from({ length: Math.min(3, pageCount) }, (_, i) => i + 1),
    ...Array.from({ length: Math.min(15, pageCount) }, (_, i) => 1 + Math.round(i * (pageCount - 1) / Math.max(1, Math.min(15, pageCount) - 1))),
  ])].sort((a, b) => a - b);
}
