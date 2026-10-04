import test from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { qualifierAncestors, qualifierAssignable, qualifierChildren, qualifierNodes, qualifierQuestionGroups, QUALIFIER_NONE, QUALIFIER_FAMILIES } from '../lib/qualifier-catalog.ts';
import { refineQualifiers, qualifierState, qualifierSubjectAllowed, QUALIFIER_POLICY, QUALIFIER_NO_PASSAGE } from '../lib/qualifier-search.ts';
import { validateQualifiers } from '../lib/qualifier-validation.ts';
import { refineSubjects, type SubjectEvaluator } from '../lib/subject-search.ts';
import { childrenOf, subjectNode } from '../lib/hierarchy.ts';
import { sharedBookSchema } from '../lib/shared.ts';
const state = { title: 'Ignored title', pageCount: 1, samples: [{ page: 1, text: 'This course teaches French for Cambridge English examinations. Ancient Egypt and its architecture are compared with California. Christmas celebrations are described in nineteenth-century Cambridge. Impressionism is the artistic style studied in this guide. '.repeat(3) }] };
function evaluator(targets: string[], options: { noPassage?: boolean; noLink?: boolean; noQuote?: boolean; noSupport?: boolean } = {}): SubjectEvaluator {
  const routes = targets.map(qualifierAncestors);
  return async payload => {
    assert.ok(Buffer.byteLength(JSON.stringify(payload)) <= 60000);
    const answers = Object.fromEntries(Object.entries(payload.questions).map(([id, q]) => {
      assert.ok(Buffer.byteLength(JSON.stringify(payload.state)) + Buffer.byteLength(JSON.stringify(q)) <= 30000);
      if (q.type === 'noul') {
        const p = id.startsWith('family_') ? (routes.some(r => r[0] === id.slice(7)) ? .96 : .01) : id.startsWith('link_') ? (options.noLink ? .05 : .96) : id.startsWith('quote_') ? (options.noQuote ? .05 : .96) : options.noSupport ? .05 : .96;
        return [id, { type: 'noul', noul: p }];
      }
      assert.equal(q.type, 'choice');
      const keys = Object.keys(q.criteria); let selected: string[];
      if (id.startsWith('branch_')) {
        const parent = id.slice(7, id.lastIndexOf('_'));
        selected = [...new Set(routes.filter(r => r.includes(parent)).map(r => r[r.indexOf(parent) + 1]).filter(c => c && keys.includes(c)))];
        if (!selected.length) selected = [QUALIFIER_NONE];
      } else selected = [options.noPassage ? QUALIFIER_NO_PASSAGE : keys[0]];
      return [id, { type: 'choice', choice: selected[0], confidence: selected.length > 1 ? .4 : .98, probabilities: Object.fromEntries(keys.map(k => [k, selected.includes(k) ? 1 / selected.length : 0])) }];
    }));
    return { model: 'jev-fixture', answers };
  };
}
test('all 5,765 official qualifier nodes remain reachable, including numeric parents and deep place codes', () => {
  const seen = new Set<string>();
  function visit(code: string) { seen.add(code); assert.ok(qualifierAncestors(code).length <= QUALIFIER_POLICY.maxDepth); for (const child of qualifierChildren(code)) { assert.equal(child.CodeParent, code); visit(child.CodeValue); } }
  QUALIFIER_FAMILIES.forEach(visit); assert.equal(seen.size, 5765); assert.equal(qualifierNodes.length, 5765);
  assert.equal(qualifierAssignable('5A'), false); assert.equal(qualifierAssignable('6J'), false); assert.equal(qualifierAssignable('5AV'), true); assert.equal(qualifierAssignable('6JA'), true);
  assert.equal(qualifierNodes.filter(n => !qualifierAssignable(n.CodeValue)).length, 33);
});
test('every official menu retains full scope and all children within UTF-8 context limits', () => {
  const long = { ...state, samples: Array.from({ length: 14 }, (_, i) => ({ page: i + 1, text: '漢字🌱'.repeat(80) })) };
  const boundedState = qualifierState(long, ['CF']);
  for (const node of qualifierNodes.filter(n => qualifierChildren(n.CodeValue).length)) {
    const groups = qualifierQuestionGroups(node.CodeValue, boundedState);
    assert.deepEqual(groups.flatMap(g => Object.keys(g.question.criteria).filter(k => k !== QUALIFIER_NONE)), qualifierChildren(node.CodeValue).map(n => n.CodeValue));
    for (const group of groups) { assert.ok(Object.keys(group.question.criteria).length <= 255); assert.ok(Buffer.byteLength(JSON.stringify(boundedState)) + Buffer.byteLength(JSON.stringify(group.question)) <= 30000); }
  }
  const instructions = JSON.stringify(qualifierQuestionGroups('5A', boundedState)[0].question);
  assert.ok(instructions.includes('DO NOT USE: with Y* codes')); assert.ok(instructions.includes('5AR, 5AX and 5AZ'));
});
test('all six dimensions and multiple places and periods are source-backed independent suggestions', async () => {
  const codes = ['1DDU-GB-EACD', '1KBB-US-WPC', '2ADF', '3MNB', '3MNQ', '4LEA', '5HPD', '6JA'];
  const subjects = ['CF', 'AB'];
  const result = await refineQualifiers(state, subjects, evaluator(codes));
  assert.equal(result.status, 'complete', result.stoppedReason);
  assert.deepEqual(new Set(result.qualifiers.map(c => c.code)), new Set(codes));
  validateQualifiers(result, state, subjects);
  for (const c of result.qualifiers) { assert.equal(c.citation!.text, state.samples[0].text.slice(c.citation!.start, c.citation!.end)); assert.deepEqual(c.appliesTo, subjects); }
});
test('missing source passage, failed book support, failed link or failed exact quote cannot assign a qualifier', async () => {
  for (const option of [{ noPassage: true }, { noLink: true }, { noQuote: true }, { noSupport: true }]) {
    const result = await refineQualifiers(state, ['CF'], evaluator(['2ADF'], option));
    assert.equal(result.status, 'complete', result.stoppedReason); assert.equal(result.qualifiers.length, 0); validateQualifiers(result, state, ['CF']);
  }
});
test('educational level cannot be assigned without explicit-purpose support', async () => {
  const good = evaluator(['4TN']);
  const result = await refineQualifiers(state, ['CJ'], async p => {
    const response = await good(p);
    for (const id of Object.keys(p.questions)) if (id.startsWith('purpose_')) response.answers[id] = { type: 'noul', noul: .05 };
    return response;
  });
  assert.equal(result.qualifiers.length, 0); assert.ok(result.candidates.some(c => c.explicitPurposeProbability === .05)); validateQualifiers(result, state, ['CJ']);
});
test('published live qualifier diagnostics preserve exact quotations and all raw assignment gates', async () => {
  const report = JSON.parse(await readFile(new URL('../public/qualifier-regressions.json', import.meta.url), 'utf8'));
  assert.equal(report.cases.length, 8);
  for (const row of report.cases) validateQualifiers(row.result, { pageCount: 1, samples: [{ page: 1, text: row.text }] }, row.subjects);
});
test('official age compatibility overrides a model yes and permits explicit adult accessibility exceptions', async () => {
  assert.equal(qualifierSubjectAllowed('5AK', 'FBA'), false); assert.equal(qualifierSubjectAllowed('5AK', 'YFB'), true);
  assert.equal(qualifierSubjectAllowed('5AV', 'YFB'), false); assert.equal(qualifierSubjectAllowed('5AX', 'FBA'), true);
  const adult = await refineQualifiers(state, ['FBA'], evaluator(['5AK'])); assert.equal(adult.qualifiers.length, 0);
  const ages = await refineQualifiers(state, ['YFB'], evaluator(['5AK', '5AL'])); assert.equal(ages.qualifiers.length, 1); assert.equal(ages.search.pruned, true); validateQualifiers(ages, state, ['YFB']);
});
test('no family evidence requires one request; known parent with no narrower evidence can be assigned', async () => {
  const none = await refineQualifiers(state, ['CF'], evaluator([])); assert.equal(none.requests, 1); assert.equal(none.status, 'complete'); validateQualifiers(none, state, ['CF']);
  const parent = await refineQualifiers(state, ['CF'], evaluator(['2ADF'])); assert.equal(parent.qualifiers[0].code, '2ADF'); assert.ok(parent.routing.some(d => d.parent === '2ADF' && d.choice === QUALIFIER_NONE));
});
test('a weak narrower branch cannot erase a source-backed broader qualifier', async () => {
  const good = evaluator(['5HPDA']);
  const result = await refineQualifiers(state, ['WB'], async p => {
    const response = await good(p);
    for (const [id, q] of Object.entries(p.questions)) {
      if (id === 'support_5HPDA' || id === 'link_5HPDA_WB') response.answers[id] = { type: 'noul', noul: .05 };
      if (id === 'branch_5HPD_0' && q.type === 'choice') response.answers[id] = { type: 'choice', choice: QUALIFIER_NONE, confidence: .8, probabilities: Object.fromEntries(Object.keys(q.criteria).map(k => [k, k === QUALIFIER_NONE ? .85 : k === '5HPDA' ? .15 : 0])) };
    }
    return response;
  });
  assert.equal(result.status, 'complete'); assert.deepEqual(result.qualifiers.map(c => c.code), ['5HPD']); validateQualifiers(result, state, ['WB']);
});
test('partition-local no-match does not discard a supported option in another group', async () => {
  const large = { ...state, samples: [{ page: 1, text: '漢字'.repeat(3500) }] };
  const questionState = qualifierState(large, ['CJ']);
  const split = qualifierNodes.map(n => ({ code: n.CodeValue, groups: qualifierQuestionGroups(n.CodeValue, questionState) })).find(n => n.groups.length > 1);
  assert.ok(split, 'A large state must exercise real adaptive partitions.');
  const target = Object.keys(split.groups.at(-1)!.question.criteria).find(c => c !== QUALIFIER_NONE)!;
  const good = evaluator([target]);
  const result = await refineQualifiers(large, ['CJ'], good);
  assert.equal(result.status, 'complete', result.stoppedReason); assert.ok(result.qualifiers.some(c => c.code === target)); validateQualifiers(result, large, ['CJ']);
});
test('failed upstream attempts count once, while failed verification keeps unassigned candidates for review', async () => {
  const network = await refineQualifiers(state, ['CF'], async () => { throw new Error('network'); }); assert.equal(network.requests, 1); assert.equal(network.status, 'partial'); validateQualifiers(network, state, ['CF']);
  const good = evaluator(['2ADF']);
  const failed = await refineQualifiers(state, ['CF'], async p => { if (Object.keys(p.questions).some(id => id.startsWith('quote_'))) throw new Error('network'); return good(p); });
  assert.equal(failed.status, 'partial'); assert.ok(failed.candidates.length); assert.equal(failed.qualifiers.length, 0); validateQualifiers(failed, state, ['CF']);
});
test('missing answers, model drift and quota failure retain explicit partial diagnostics without assignments', async () => {
  const missing = await refineQualifiers(state, ['CF'], async () => ({ model: 'fixture', answers: {} })); assert.equal(missing.status, 'partial'); assert.equal(missing.qualifiers.length, 0); validateQualifiers(missing, state, ['CF']);
  let calls = 0; const good = evaluator(['2ADF']);
  const drift = await refineQualifiers(state, ['CF'], async p => ({ ...await good(p), model: ++calls === 1 ? 'first' : 'second' })); assert.equal(drift.status, 'partial'); assert.deepEqual(drift.models, ['first', 'second']); validateQualifiers(drift, state, ['CF']);
  const quota = await refineQualifiers(state, ['CF'], good, async () => false); assert.equal(quota.status, 'unavailable'); assert.equal(quota.requests, 0); validateQualifiers(quota, state, ['CF']);
  calls = 0; const later = await refineQualifiers(state, ['CF'], good, async () => ++calls < 3); assert.equal(later.status, 'partial'); assert.equal(later.requests, 2); assert.ok(later.routing.length); validateQualifiers(later, state, ['CF']);
});
test('public persistence rejects forged heading, crossed path, fabricated quote, invalid routing and mismatched subjects', async () => {
  const qualifiers = await refineQualifiers(state, ['CF'], evaluator(['2ADF']));
  const subjectRoute = ['C', 'CF'];
  const detail = await refineSubjects(state, async payload => ({ model: 'fixture', answers: Object.fromEntries(Object.entries(payload.questions).map(([id, q]) => {
    if (q.type === 'noul') return [id, { type: 'noul', noul: id.startsWith('section_') ? (id === 'section_C' ? .96 : .01) : .96 }];
    assert.equal(q.type, 'choice'); const keys = Object.keys(q.criteria); const parent = id.startsWith('branch_') ? id.slice(7) : '';
    const selected = id === 'primary' ? 'C' : id.startsWith('branch_') ? subjectRoute[subjectRoute.indexOf(parent) + 1] || 'No narrower subject' : keys[0];
    return [id, { type: 'choice', choice: selected, confidence: .98, probabilities: Object.fromEntries(keys.map(k => [k, k === selected ? 1 : 0])) }];
  })) }));
  const book = { id: 'db01d084-fc27-4b1d-91ea-142f3940879c', hash: 'a'.repeat(64), title: state.title, author: '', filename: 'fixture.pdf', pageCount: 1, size: 1000, addedAt: '2026-10-03T00:00:00.000Z', samples: state.samples, status: 'ready', detailedSubject: detail, qualifiers };
  assert.equal(sharedBookSchema.safeParse(book).success, true);
  const edits = [
    (q: typeof qualifiers) => { q.candidates[0].heading = 'Fake heading'; },
    (q: typeof qualifiers) => { q.candidates[0].path[0].code = '3MN'; },
    (q: typeof qualifiers) => { q.candidates[0].citation!.text = 'Invented quotation'; },
    (q: typeof qualifiers) => { q.routing[0].probabilities = { invented: 1 }; },
    (q: typeof qualifiers) => { q.subjectCodes = ['AB']; },
    (q: typeof qualifiers) => { q.candidates[0].subjectLinks = { CF: .2 }; },
  ];
  for (const edit of edits) { const invalid = structuredClone(book); edit(invalid.qualifiers); assert.equal(sharedBookSchema.safeParse(invalid).success, false); }
  const reviewed = structuredClone(book); reviewed.qualifiers.reviewed = true; assert.equal(sharedBookSchema.safeParse(reviewed).success, true); assert.deepEqual(reviewed.qualifiers.routing, qualifiers.routing);
});
