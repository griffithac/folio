import { LEVELS, bookNeedsReview, type Book, type ReferenceLabels } from './catalog.ts';
import { subjectNode } from './hierarchy.ts';
import { hasIndependentReview, isSubjectAncestor, subjectAncestors } from './references.ts';

export const DIMENSIONS = ['detailedSubject', 'genre', 'subcategory', 'language', 'readingLevel', 'timePeriod'] as const;
export type Dimension = typeof DIMENSIONS[number];
export type EvaluationSplit = 'all' | 'development' | 'holdout';
export type ReferenceStatus = 'verified' | 'provisional';
export const EVALUATION_VERSION = 'reference-evaluation-v2';

export function prediction(book: Book, dimension: Dimension): string | undefined {
  if (dimension === 'detailedSubject') return book.detailedSubject?.code;
  if (!book.result) return undefined;
  if (dimension === 'subcategory') return book.result.subcategory ? book.result.subcategory.code || 'Unspecified' : undefined;
  return book.result[dimension]?.label;
}
const statusMatches = (reference: ReferenceLabels, status: ReferenceStatus) => reference.status === status && (status !== 'verified' || hasIndependentReview(reference));
const selectedReferences = (books: Book[], status: ReferenceStatus, split: EvaluationSplit) => books.filter(book => book.reference && statusMatches(book.reference, status) && (split === 'all' || book.reference.split === split));

export function evaluateReferences(books: Book[], status: ReferenceStatus, split: EvaluationSplit = 'all') {
  const selected = selectedReferences(books, status, split);
  return DIMENSIONS.map(dimension => {
    // Missing predictions stay in the denominator instead of silently disappearing.
    const pairs = selected.filter(book => book.reference!.labels[dimension] && !(status === 'verified' && (dimension === 'language' || dimension === 'readingLevel') && book.reference!.scope !== 'edition'));
    const predicted = pairs.filter(book => prediction(book, dimension) !== undefined);
    const correct = predicted.filter(book => book.reference!.labels[dimension] === prediction(book, dimension)).length;
    const distances = dimension === 'readingLevel' ? predicted.flatMap(book => {
      const gold = LEVELS.findIndex(l => l.label === book.reference!.labels.readingLevel);
      const actual = LEVELS.findIndex(l => l.label === prediction(book, dimension));
      return gold < 0 || actual < 0 ? [] : [Math.abs(gold - actual)];
    }) : [];
    return {
      dimension, count: pairs.length, predicted: predicted.length, missing: pairs.length - predicted.length, correct,
      accuracy: pairs.length ? correct / pairs.length : null, coverage: pairs.length ? predicted.length / pairs.length : null,
      bandComparisons: distances.length, meanBandError: distances.length ? distances.reduce((a, b) => a + b, 0) / distances.length : null,
      adjacentBand: distances.filter(d => d <= 1).length,
    };
  });
}

export function subjectPredictions(book: Book): string[] {
  const detail = book.detailedSubject;
  return [...new Set(detail?.subjects ? detail.subjects.filter(s => s.status === 'supported').map(s => s.code) : detail?.code ? [detail.code] : [])].sort();
}
export function subjectReference(book: Book): ReferenceLabels['subjectReference'] | undefined {
  // A legacy primary-only label never establishes an exhaustive subject set.
  return book.reference?.subjectReference || (book.reference?.labels.detailedSubject ? { codes: [book.reference.labels.detailedSubject], coverage: 'partial', taxonomyVersion: 'Thema 1.6' } : undefined);
}
type Counts = { tp: number; fp: number; fn: number };
function rates({ tp, fp, fn }: Counts) {
  return { precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null, f1: 2 * tp + fp + fn ? 2 * tp / (2 * tp + fp + fn) : null };
}
const sectionOf = (code: string) => subjectAncestors(code).at(-1) || code;
export function evaluateSubjects(books: Book[], status: ReferenceStatus, split: EvaluationSplit = 'all') {
  const selected = selectedReferences(books, status, split).filter(book => subjectReference(book));
  const rows = selected.map(book => {
    const reference = subjectReference(book)!;
    const expected = [...new Set(reference.codes)].sort(), actual = subjectPredictions(book);
    const matched = actual.filter(code => expected.includes(code));
    const missing = expected.filter(code => !actual.includes(code));
    const extras = actual.filter(code => !expected.includes(code));
    return {
      id: book.id, title: book.title, coverage: reference.coverage, expected, actual, matched, missing, extras,
      searched: Boolean(book.detailedSubject), needsReview: bookNeedsReview(book), model: book.detailedSubject?.model || null,
      exact: Boolean(book.detailedSubject) && !missing.length && !extras.length,
      broader: extras.flatMap(predicted => missing.filter(gold => isSubjectAncestor(predicted, gold)).map(gold => ({ predicted, reference: gold }))),
      narrower: extras.flatMap(predicted => missing.filter(gold => isSubjectAncestor(gold, predicted)).map(gold => ({ predicted, reference: gold }))),
    };
  });
  const complete = rows.filter(row => row.coverage === 'complete'), partial = rows.filter(row => row.coverage === 'partial');
  const counts: Counts = { tp: 0, fp: 0, fn: 0 }, sectionCounts: Counts = { tp: 0, fp: 0, fn: 0 };
  const labelCounts = new Map<string, Counts>();
  for (const row of complete) {
    counts.tp += row.matched.length; counts.fp += row.extras.length; counts.fn += row.missing.length;
    for (const code of new Set([...row.expected, ...row.actual])) {
      const label = labelCounts.get(code) || { tp: 0, fp: 0, fn: 0 };
      if (row.matched.includes(code)) label.tp++;
      else if (row.extras.includes(code)) label.fp++;
      else label.fn++;
      labelCounts.set(code, label);
    }
    const expectedSections = [...new Set(row.expected.map(sectionOf))], predictedSections = [...new Set(row.actual.map(sectionOf))];
    sectionCounts.tp += predictedSections.filter(code => expectedSections.includes(code)).length;
    sectionCounts.fp += predictedSections.filter(code => !expectedSections.includes(code)).length;
    sectionCounts.fn += expectedSections.filter(code => !predictedSections.includes(code)).length;
  }
  const perLabel = [...labelCounts].sort(([a], [b]) => a.localeCompare(b)).map(([code, totals]) => ({ code, heading: subjectNode(code)?.CodeDescription || code, ...totals, support: totals.tp + totals.fn, predictions: totals.tp + totals.fp, ...rates(totals) }));
  const f1s = perLabel.map(label => label.f1 ?? 0);
  const partialKnown = partial.reduce((n, row) => n + row.expected.length, 0), partialMatches = partial.reduce((n, row) => n + row.matched.length, 0);
  return {
    count: rows.length, complete: complete.length, partial: partial.length,
    searched: complete.filter(row => row.searched).length, assigned: complete.filter(row => row.actual.length).length,
    missingSearch: complete.filter(row => !row.searched).length, abstained: complete.filter(row => row.searched && !row.actual.length).length,
    needsReview: complete.filter(row => row.needsReview).length, exact: complete.filter(row => row.exact).length,
    exactAgreement: complete.length ? complete.filter(row => row.exact).length / complete.length : null,
    micro: { ...counts, ...rates(counts) }, macroF1: f1s.length ? f1s.reduce((a, b) => a + b, 0) / f1s.length : null,
    section: { ...sectionCounts, ...rates(sectionCounts) }, perLabel, rows,
    partialKnown, partialMatches, partialKnownRecall: partialKnown ? partialMatches / partialKnown : null,
    models: [...new Set(complete.flatMap(row => row.model ? [row.model] : []))].sort(),
  };
}

export function evaluationWarnings(books: Book[]): string[] {
  const warnings: string[] = [];
  const legacy = books.filter(book => book.reference?.status === 'verified' && !hasIndependentReview(book.reference));
  if (legacy.length) warnings.push(`${legacy.length} reference(s) marked verified lack an independent review record and are excluded from verified metrics.`);
  const notBlind = books.filter(book => book.reference && hasIndependentReview(book.reference) && book.reference.split === 'holdout' && !book.reference.review?.modelBlind);
  if (notBlind.length) warnings.push(`${notBlind.length} holdout reference(s) were reviewed with model predictions visible. This can bias agreement; they are not a blind labeling study.`);
  const groups = new Map<string, Set<string>>(), fingerprints = new Map<string, Set<string>>();
  for (const book of books) {
    if (!book.reference) continue;
    const key = book.reference.workKey?.toLowerCase().trim();
    if (key) { const splits = groups.get(key) || new Set<string>(); splits.add(book.reference.split); groups.set(key, splits); }
    if (book.hash) { const splits = fingerprints.get(book.hash) || new Set<string>(); splits.add(book.reference.split); fingerprints.set(book.hash, splits); }
  }
  const leakage = [...groups.values()].filter(splits => splits.size > 1).length;
  if (leakage) warnings.push(`${leakage} work group(s) occur in both development and holdout. Keep versions of the same work in one split before treating holdout results as independent.`);
  const duplicates = [...fingerprints.values()].filter(splits => splits.size > 1).length;
  if (duplicates) warnings.push(`${duplicates} identical PDF fingerprint(s) occur in both development and holdout. These copies cannot establish an independent holdout.`);
  return warnings;
}

export function buildValidationReport(books: Book[], split: EvaluationSplit = 'all', exportedAt = new Date().toISOString()) {
  const selected = books.filter(book => split === 'all' || book.reference?.split === split);
  return {
    version: EVALUATION_VERSION, exportedAt, split, taxonomy: 'Thema 1.6',
    verified: evaluateReferences(books, 'verified', split), provisional: evaluateReferences(books, 'provisional', split),
    verifiedSubjects: evaluateSubjects(books, 'verified', split), provisionalSubjects: evaluateSubjects(books, 'provisional', split),
    warnings: evaluationWarnings(books),
    records: selected.map(book => ({
      id: book.id, hash: book.hash, title: book.title, author: book.author, filename: book.filename, pageCount: book.pageCount,
      revision: book.revision, pdfUrl: book.pdfUrl, sourceUrl: book.sourceUrl, evidenceStrategy: book.evidenceStrategy, samples: book.samples,
      result: book.result, detailedSubject: book.detailedSubject, reference: book.reference,
    })),
  };
}
