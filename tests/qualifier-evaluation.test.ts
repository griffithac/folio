import test from 'node:test';
import assert from 'node:assert/strict';
import type { Book, ReferenceLabels } from '../lib/catalog.ts';
import type { DetailedQualifiers } from '../lib/qualifier-search.ts';
import { QUALIFIER_FAMILIES, QUALIFIER_VERSION, qualifierNode, type QualifierFamily } from '../lib/qualifier-catalog.ts';
import { referenceSchema } from '../lib/references.ts';
import { evaluateQualifiers, qualifierPredictions } from '../lib/qualifier-evaluation.ts';
import { buildValidationReport, evaluationWarnings } from '../lib/validation.ts';
const date = '2026-10-04T00:00:00.000Z';
const reference: ReferenceLabels = { status: 'verified', sourceName: 'Developer fixture', sourceUrl: 'https://example.org/fixture', scope: 'edition', edition: 'Fixture edition', notes: 'Synthetic data to test evaluation; not expert labels for a book.', labels: {}, split: 'holdout', updatedAt: date,
  review: { reviewer: 'Fixture reviewer', reviewerRole: 'Developer test fixture', method: 'expert-review', reviewedAt: date, independent: true, editionMatched: true, modelBlind: true } };
type Dimensions = NonNullable<ReferenceLabels['qualifierReference']>['dimensions'];
function book(id: string, dimensions: Dimensions, actual?: string[], links: Record<string, string[]> = {}, status: DetailedQualifiers['status'] = 'complete'): Book {
  const qualifiers: DetailedQualifiers | undefined = actual ? { method: 'qualifier-beam-and-source-check-v1', version: QUALIFIER_VERSION, model: 'fixture', models: ['fixture'], requests: 1, status, needsReview: true, stoppedReason: 'Fixture', subjectCodes: ['FV'], applicability: {}, routing: [], candidates: [],
    qualifiers: actual.map(code => ({ code, heading: qualifierNode(code)!.CodeDescription, family: code[0] as QualifierFamily, path: [], rankingScore: .9, supportProbability: .9, subjectLinks: {}, appliesTo: links[code] || ['FV'], status: 'supported' })), search: { beamWidth: 4, maxDepth: 10, pruned: false, exploredParents: [], supportThreshold: .8 } } : undefined;
  return { id, hash: id.repeat(64), title: `Fixture ${id}`, author: '', filename: `${id}.pdf`, pageCount: 1, size: 1000, addedAt: date, status: 'ready', samples: [{ page: 1, text: 'Fixture text.' }],
    qualifiers, reference: { ...reference, qualifierReference: { taxonomyVersion: 'Thema 1.6', dimensions } } };
}
test('qualifier metrics pool independent dimension counts and include extra-only codes in macro F1', () => {
  const report = evaluateQualifiers([book('a', { '1': { codes: ['1DDF', '1DDU'], coverage: 'complete' } }, ['1DDF', '1HBE']), book('b', { '1': { codes: ['1DDF'], coverage: 'complete' } }, []), book('c', { '3': { codes: ['3MNB'], coverage: 'complete' } }, ['3MNB', '3MNQ'])], 'verified', 'holdout');
  assert.deepEqual(report.micro, { tp: 2, fp: 2, fn: 2, precision: .5, recall: .5, f1: .5 });
  assert.ok(Math.abs(report.macroF1! - 1 / 3) < 1e-12);
  assert.equal(report.perLabel.find(row => row.code === '3MNQ')!.f1, 0);
  assert.deepEqual([report.perFamily[0].tp, report.perFamily[0].fp, report.perFamily[0].fn], [1, 1, 2]);
  assert.deepEqual([report.perFamily[2].tp, report.perFamily[2].fp, report.perFamily[2].fn], [1, 1, 0]);
  assert.equal(report.complete, 3); assert.equal(report.fullyReferenced, 0); assert.equal(report.exactAgreement, null);
});
test('unreviewed dimensions and partial-reference extras remain outside precision and exact agreement', () => {
  const report = evaluateQualifiers([book('a', { '3': { codes: ['3MNB'], coverage: 'partial' } }, ['3MNB', '3MNQ', '1DDF'])], 'verified');
  assert.equal(report.complete, 0); assert.equal(report.partialKnownRecall, 1); assert.equal(report.micro.precision, null); assert.equal(report.micro.fp, 0);
  assert.deepEqual(report.rows[0].extras, ['3MNQ']); assert.equal(report.rows.length, 1); assert.equal(report.perFamily[0].complete, 0);
});
test('missing, interrupted and unavailable qualifier runs retain missed reference codes', () => {
  const dimension: Dimensions = { '3': { codes: ['3MNB'], coverage: 'complete' } };
  const report = evaluateQualifiers([book('a', dimension), book('b', dimension, []), book('c', dimension, ['3MNB'], {}, 'partial'), book('d', dimension, [], {}, 'unavailable')], 'verified');
  assert.equal(report.micro.fn, 4); assert.equal(report.micro.tp, 0); assert.equal(report.micro.recall, 0); assert.equal(report.exactDimensions, 0);
  assert.deepEqual(report.runs, { complete: 1, partial: 1, unavailable: 1, missing: 1 });
  assert.deepEqual(qualifierPredictions(book('c', dimension, ['3MNB'], {}, 'partial')), []);
});
test('all-six-dimension exact agreement distinguishes an explicit empty result from missing or incomplete runs', () => {
  const empty = Object.fromEntries(QUALIFIER_FAMILIES.map(f => [f, { codes: [], coverage: 'complete' as const }])) as Dimensions;
  const report = evaluateQualifiers([book('a', empty, []), book('b', empty), book('c', empty, [], {}, 'partial')], 'verified');
  assert.equal(report.fullyReferenced, 3); assert.equal(report.exactBooks, 1); assert.equal(report.exactAgreement, 1 / 3);
  assert.equal(report.complete, 18); assert.equal(report.exactDimensions, 6); assert.equal(report.dimensionAgreement, 1 / 3);
  assert.equal(report.micro.f1, null); assert.equal(report.macroF1, null);
});
test('official ancestor differences are reported without crediting a broad or narrow code as an exact match', () => {
  const report = evaluateQualifiers([book('a', { '3': { codes: ['3MNBA'], coverage: 'complete' } }, ['3MNB']), book('b', { '3': { codes: ['3MNB'], coverage: 'complete' } }, ['3MNBA'])], 'verified');
  assert.equal(report.micro.tp, 0); assert.equal(report.micro.fp, 2); assert.equal(report.micro.fn, 2);
  assert.deepEqual(report.rows[0].broader, [{ predicted: '3MNB', reference: '3MNBA' }]);
  assert.deepEqual(report.rows[1].narrower, [{ predicted: '3MNBA', reference: '3MNB' }]);
});
test('correct codes attached to wrong subjects fail the independent relationship comparison', () => {
  const dimension: Dimensions = { '3': { codes: ['3MNB'], coverage: 'complete', links: [{ code: '3MNB', subjectCodes: ['FV'], coverage: 'complete' }] } };
  const report = evaluateQualifiers([book('a', dimension, ['3MNB'], { '3MNB': ['WBR'] })], 'verified');
  assert.equal(report.micro.f1, 1); assert.deepEqual(report.links.micro, { tp: 0, fp: 1, fn: 1, precision: 0, recall: 0, f1: 0 });
  assert.deepEqual(report.links.rows[0].missing, ['FV']); assert.deepEqual(report.links.rows[0].extras, ['WBR']);
  const partial = structuredClone(dimension); partial['3']!.links![0].coverage = 'partial';
  const known = evaluateQualifiers([book('b', partial, ['3MNB'], { '3MNB': ['FV', 'WBR'] })], 'verified');
  assert.equal(known.links.micro.precision, null); assert.equal(known.links.partialKnownRecall, 1); assert.equal(known.links.micro.fp, 0);
});
test('status, split and edition provenance keep provisional and ineligible references separate', () => {
  const dimensions: Dimensions = { '3': { codes: ['3MNB'], coverage: 'complete' } };
  const a = book('a', dimensions, ['3MNB']), b = book('b', dimensions, []), c = book('c', dimensions, []), d = book('d', dimensions, ['3MNB']);
  b.reference!.split = 'development'; c.reference!.status = 'provisional'; c.reference!.review = undefined; d.reference!.scope = 'work';
  assert.equal(evaluateQualifiers([a, b, c, d], 'verified', 'holdout').count, 1);
  assert.equal(evaluateQualifiers([a, b, c, d], 'verified', 'development').micro.fn, 1);
  assert.equal(evaluateQualifiers([a, b, c, d], 'provisional').micro.fn, 1);
  assert.ok(evaluationWarnings([d]).some(w => w.includes('qualifier reference')));
  const legacy = structuredClone(a); legacy.reference!.review = undefined;
  assert.equal(evaluateQualifiers([legacy], 'verified').count, 0);
});
test('reference validation rejects invalid codes, dimensions, redundant ancestors, ages and relationships', () => {
  const valid = book('a', { '3': { codes: ['3MNB'], coverage: 'complete', links: [{ code: '3MNB', subjectCodes: ['FV'], coverage: 'complete' }] } }).reference!;
  assert.equal(referenceSchema.safeParse(valid).success, true);
  for (const dimensions of [{}, { '3': { codes: ['NOTREAL'], coverage: 'complete' } }, { '3': { codes: ['3'], coverage: 'complete' } }, { '3': { codes: ['FV'], coverage: 'complete' } }, { '3': { codes: ['1DDF'], coverage: 'complete' } }, { '3': { codes: ['3MNB', '3MNB'], coverage: 'complete' } }, { '3': { codes: ['3MN', '3MNB'], coverage: 'complete' } }, { '3': { codes: [], coverage: 'partial' } }, { '7': { codes: [], coverage: 'complete' } }, { '5': { codes: ['5AK', '5AL'], coverage: 'complete' } }, { '5': { codes: ['5A'], coverage: 'complete' } }]) {
    assert.equal(referenceSchema.safeParse({ ...valid, qualifierReference: { taxonomyVersion: 'Thema 1.6', dimensions } }).success, false);
  }
  for (const links of [[{ code: '3MNQ', subjectCodes: ['FV'], coverage: 'complete' }], [{ code: '3MNB', subjectCodes: [], coverage: 'complete' }], [{ code: '3MNB', subjectCodes: ['FV', 'FV'], coverage: 'complete' }], [{ code: '3MNB', subjectCodes: ['F', 'BADCODE'], coverage: 'complete' }]]) {
    assert.equal(referenceSchema.safeParse({ ...valid, qualifierReference: { taxonomyVersion: 'Thema 1.6', dimensions: { '3': { codes: ['3MNB'], coverage: 'complete', links } } } }).success, false);
  }
  assert.equal(referenceSchema.safeParse({ ...valid, subjectReference: { codes: ['WBR'], coverage: 'complete', taxonomyVersion: 'Thema 1.6' } }).success, false);
  assert.equal(referenceSchema.safeParse({ ...valid, qualifierReference: { taxonomyVersion: 'Thema 1.6', dimensions: { '5': { codes: ['5AK'], coverage: 'complete', links: [{ code: '5AK', subjectCodes: ['FBA'], coverage: 'complete' }] } } } }).success, false);
  assert.equal(referenceSchema.safeParse({ ...valid, qualifierReference: { taxonomyVersion: 'Thema 1.6', dimensions: { '3': { codes: [], coverage: 'complete' } } } }).success, true);
});
test('validation export includes raw qualifier judgments and reference relationships without applying corrections or approvals', () => {
  const a = book('a', { '3': { codes: ['3MNB'], coverage: 'complete' } }, ['3MNQ']);
  const before = structuredClone(a); const original = evaluateQualifiers([a], 'verified');
  a.qualifiers!.reviewed = true; a.corrections = { genre: 'Computing', language: 'French', readingLevel: 'High school' };
  assert.deepEqual(evaluateQualifiers([a], 'verified').micro, original.micro);
  const snapshot = structuredClone(a); const report = buildValidationReport([a], 'holdout', date);
  assert.equal(report.version, 'reference-evaluation-v3'); assert.equal(report.exportedAt, date);
  assert.deepEqual(report.records[0].qualifiers, a.qualifiers); assert.deepEqual(report.records[0].reference, a.reference);
  assert.deepEqual(report.verifiedQualifiers.micro, original.micro); assert.equal(Object.hasOwn(report.records[0], 'corrections'), false);
  assert.deepEqual(a, snapshot); assert.deepEqual(before.qualifiers!.qualifiers, a.qualifiers!.qualifiers);
});
