import test from 'node:test';
import assert from 'node:assert/strict';
import type { Book, ReferenceLabels } from '../lib/catalog.ts';
import type { DetailedSubject } from '../lib/hierarchy.ts';
import { subjectNode } from '../lib/hierarchy.ts';
import { referenceSchema } from '../lib/references.ts';
import { buildValidationReport, evaluateReferences, evaluateSubjects, evaluationWarnings, prediction } from '../lib/validation.ts';

const date = '2026-10-03T00:00:00.000Z';
const review: NonNullable<ReferenceLabels['review']> = { reviewer: 'Test reviewer', reviewerRole: 'Test fixture author', method: 'expert-review', reviewedAt: date, independent: true, editionMatched: true, modelBlind: true };
const reference: ReferenceLabels = { status: 'verified', sourceName: 'Independent fixture', sourceUrl: 'https://example.org/fixture', scope: 'edition', edition: 'Fixture edition', notes: 'Developer fixture, not an expert-labeled book.', labels: {}, split: 'holdout', updatedAt: date, review };
const detail = (codes: string[], model = 'fixture'): DetailedSubject => ({
  code: codes[0], heading: codes[0] ? subjectNode(codes[0])!.CodeDescription : undefined, path: [], model, version: 'Thema 1.6', requests: 1, needsReview: !codes.length, stoppedReason: 'Fixture',
  subjects: codes.map(code => ({ code, heading: subjectNode(code)!.CodeDescription, path: [], rankingScore: .9, sectionProbability: .9, supportProbability: .9, status: 'supported' })),
});
function book(id: string, expected: string[], actual?: string[], coverage: 'complete' | 'partial' = 'complete'): Book {
  return {
    id, hash: id.repeat(64), title: `Fixture ${id}`, author: '', filename: `${id}.pdf`, pageCount: 1, size: 1000, addedAt: date, samples: [{ page: 1, text: 'Fixture text.' }], status: 'ready',
    reference: { ...reference, subjectReference: { codes: expected, coverage, taxonomyVersion: 'Thema 1.6' } }, detailedSubject: actual ? detail(actual) : undefined,
  };
}
test('multi-label metrics match independently calculated pooled and per-code counts', () => {
  const report = evaluateSubjects([book('a', ['UMX', 'KJMB'], ['UMX', 'FBC']), book('b', ['UMX'], []), book('c', ['FKC'], ['FKC', 'FKW'])], 'verified', 'holdout');
  assert.deepEqual(report.micro, { tp: 2, fp: 2, fn: 2, precision: .5, recall: .5, f1: .5 });
  assert.ok(Math.abs(report.macroF1! - 1 / 3) < 1e-12);
  assert.equal(report.perLabel.find(l => l.code === 'UMX')?.support, 2);
  assert.equal(report.perLabel.find(l => l.code === 'FKW')?.f1, 0);
  assert.equal(report.exact, 0); assert.equal(report.complete, 3);
  assert.equal(report.assigned, 2); assert.equal(report.abstained, 1);
  assert.equal(report.section.tp, 2); assert.equal(report.section.fp, 1); assert.equal(report.section.fn, 2);
  assert.equal(report.section.precision, 2 / 3); assert.equal(report.section.recall, .5);
});
test('secondary subjects, order and duplicate predictions do not change exact-set matches', () => {
  const report = evaluateSubjects([book('a', ['UMX', 'KJMB'], ['KJMB', 'UMX', 'UMX'])], 'verified');
  assert.equal(report.exactAgreement, 1); assert.equal(report.micro.tp, 2); assert.equal(report.micro.fp, 0);
});
test('missing searches and explicit abstentions retain all missed reference labels', () => {
  const report = evaluateSubjects([book('a', ['UMX']), book('b', ['FKC'], [])], 'verified');
  assert.equal(report.complete, 2); assert.equal(report.missingSearch, 1); assert.equal(report.abstained, 1);
  assert.equal(report.micro.fn, 2); assert.equal(report.micro.recall, 0); assert.equal(report.micro.precision, null);
  assert.equal(report.exactAgreement, 0);
});
test('empty complete references distinguish an explicit no-subject decision from a missing search', () => {
  const report = evaluateSubjects([book('a', [], []), book('b', []), book('c', [], ['UMX'])], 'verified');
  assert.equal(report.exact, 1); assert.equal(report.exactAgreement, 1 / 3);
  assert.equal(report.micro.fp, 1); assert.equal(report.micro.recall, null); assert.equal(report.micro.precision, 0);
  assert.equal(evaluateSubjects([], 'verified').macroF1, null);
});
test('partial and legacy primary-only labels never turn unjudged extras into false positives', () => {
  const partial = book('a', ['UMX'], ['UMX', 'KJMB'], 'partial');
  const legacy = { ...book('b', [], ['FKC', 'FKW']), reference: { ...reference, labels: { detailedSubject: 'FKC' } } };
  const report = evaluateSubjects([partial, legacy], 'verified');
  assert.equal(report.complete, 0); assert.equal(report.partial, 2);
  assert.equal(report.partialKnownRecall, 1); assert.equal(report.micro.fp, 0); assert.equal(report.micro.precision, null);
  assert.equal(report.rows[0].extras[0], 'KJMB'); assert.equal(report.exactAgreement, null);
});
test('official ancestry is diagnosed without crediting a broader label as an exact match', () => {
  const report = evaluateSubjects([book('a', ['UMX'], ['UM']), book('b', ['UM'], ['UMX'])], 'verified');
  assert.equal(report.micro.tp, 0); assert.equal(report.micro.fp, 2); assert.equal(report.micro.fn, 2);
  assert.equal(report.section.precision, 1); assert.equal(report.section.recall, 1);
  assert.deepEqual(report.rows[0].broader, [{ predicted: 'UM', reference: 'UMX' }]);
  assert.deepEqual(report.rows[1].narrower, [{ predicted: 'UMX', reference: 'UM' }]);
});
test('status and split selection keep provisional and development labels separate', () => {
  const holdout = book('a', ['UMX'], ['UMX']);
  const development = { ...book('b', ['FKC'], ['FKW']), reference: { ...book('b', ['FKC']).reference!, split: 'development' as const } };
  const provisional = { ...book('c', ['UMX'], []), reference: { ...book('c', ['UMX']).reference!, status: 'provisional' as const, review: undefined } };
  assert.equal(evaluateSubjects([holdout, development, provisional], 'verified', 'holdout').complete, 1);
  assert.equal(evaluateSubjects([holdout, development, provisional], 'verified', 'development').micro.fp, 1);
  assert.equal(evaluateSubjects([holdout, development, provisional], 'provisional').micro.fn, 1);
});
test('scalar agreement counts missing predictions and separates ordinal error comparisons', () => {
  const gold = { ...reference, labels: { genre: 'Fantasy', readingLevel: 'High school', subcategory: 'Unspecified' } };
  const missing = { ...book('a', []), reference: gold };
  const predicted = { ...book('b', []), reference: gold, result: { genre: { label: 'Fantasy', confidence: .8, probabilities: { Fantasy: 1 } }, language: { label: 'English', confidence: .8, probabilities: { English: 1 } }, readingLevel: { label: 'Middle school', confidence: .8, probabilities: { '2': 1 }, score: 2, range: 'Grades 6–8' }, model: 'fixture', reviewed: false } };
  const report = evaluateReferences([missing, predicted], 'verified');
  const genre = report.find(m => m.dimension === 'genre')!;
  assert.equal(genre.count, 2); assert.equal(genre.correct, 1); assert.equal(genre.missing, 1); assert.equal(genre.accuracy, .5);
  const reading = report.find(m => m.dimension === 'readingLevel')!;
  assert.equal(reading.bandComparisons, 1); assert.equal(reading.meanBandError, 1); assert.equal(reading.adjacentBand, 1);
  assert.equal(prediction(predicted, 'subcategory'), undefined);
  assert.equal(report.find(m => m.dimension === 'subcategory')!.missing, 2);
});
test('raw predictions remain unchanged by human correction or review approval', () => {
  const original = book('a', ['UMX'], ['FKC']);
  const corrected = { ...original, corrections: { genre: 'Computing', language: 'French', readingLevel: 'High school' }, detailedSubject: { ...original.detailedSubject!, reviewed: true } };
  assert.deepEqual(evaluateSubjects([corrected], 'verified').micro, evaluateSubjects([original], 'verified').micro);
});
test('verified labels need reviewer provenance and correct edition scope', () => {
  const valid = { ...reference, labels: { genre: 'Fantasy' } };
  assert.equal(referenceSchema.safeParse(valid).success, true);
  for (const invalid of [{ ...valid, review: undefined }, { ...valid, review: { ...review, independent: false } }, { ...valid, review: { ...review, reviewer: ' ' } }, { ...valid, review: { ...review, editionMatched: false } }, { ...valid, edition: '' }, { ...valid, scope: 'work', labels: { language: 'English' } }]) assert.equal(referenceSchema.safeParse(invalid).success, false);
  const legacy = { ...book('a', ['UMX'], ['UMX']), reference: { ...valid, review: undefined } };
  assert.equal(evaluateReferences([legacy], 'verified').find(m => m.dimension === 'genre')!.count, 0);
  assert.equal(evaluateSubjects([legacy], 'verified').complete, 0);
  assert.ok(evaluationWarnings([legacy]).some(w => w.includes('review record')));
});
test('subject references reject nonexistent codes, routing roots, qualifiers, duplicates, ancestors and inconsistent primary', () => {
  const valid = { ...reference, subjectReference: { codes: ['UMX', 'KJMB'], coverage: 'complete', taxonomyVersion: 'Thema 1.6' } };
  assert.equal(referenceSchema.safeParse(valid).success, true);
  for (const codes of [['NOTREAL'], ['U'], ['3MP'], ['UMX', 'UMX'], ['UM', 'UMX']]) assert.equal(referenceSchema.safeParse({ ...valid, subjectReference: { ...valid.subjectReference, codes } }).success, false);
  assert.equal(referenceSchema.safeParse({ ...valid, labels: { detailedSubject: 'FKC' } }).success, false);
  assert.equal(referenceSchema.safeParse({ ...valid, subjectReference: { ...valid.subjectReference, codes: [], coverage: 'partial' } }).success, false);
  assert.equal(referenceSchema.safeParse({ ...valid, subjectReference: { ...valid.subjectReference, codes: [] } }).success, true);
});
test('holdout leakage and visible predictions produce explicit warnings', () => {
  const a = book('a', ['UMX'], ['UMX']);
  const b = { ...book('b', ['UMX'], ['UMX']), reference: { ...reference, workKey: 'Same work', split: 'development' as const } };
  const c = { ...a, reference: { ...a.reference!, workKey: 'same WORK', review: { ...review, modelBlind: false } } };
  const warnings = evaluationWarnings([b, c]);
  assert.equal(warnings.length, 2); assert.ok(warnings.some(w => w.includes('both development and holdout'))); assert.ok(warnings.some(w => w.includes('predictions visible')));
  assert.ok(evaluationWarnings([{ ...a, reference: { ...a.reference!, workKey: 'First key' } }, { ...a, reference: { ...a.reference!, workKey: 'Different key', split: 'development' } }]).some(w => w.includes('identical PDF fingerprint')));
});
test('export contains a reproducible raw snapshot and keeps split selection and corrections separate', () => {
  const a = { ...book('a', ['UMX'], ['UMX']), corrections: { genre: 'Computing', language: 'French', readingLevel: 'High school' }, cover: 'private-to-the-library-thumbnail' };
  const b = { ...book('b', ['FKC'], ['FKW']), reference: { ...book('b', ['FKC']).reference!, split: 'development' as const } };
  const report = buildValidationReport([a, b], 'holdout', date);
  assert.equal(report.version, 'reference-evaluation-v2'); assert.equal(report.exportedAt, date); assert.equal(report.split, 'holdout');
  assert.equal(report.records.length, 1); assert.equal(report.records[0].id, 'a');
  assert.deepEqual(report.records[0].samples, a.samples); assert.deepEqual(report.records[0].reference?.review, review);
  assert.deepEqual(report.records[0].detailedSubject, a.detailedSubject);
  assert.equal(Object.hasOwn(report.records[0], 'corrections'), false); assert.equal(Object.hasOwn(report.records[0], 'cover'), false);
  assert.equal(report.verifiedSubjects.micro.recall, 1);
});
