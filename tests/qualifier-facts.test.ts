import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifierCalendarRange, qualifierFacts, type QualifierFacts } from '../lib/qualifier-facts.ts';
import { qualifierNodes } from '../lib/qualifier-catalog.ts';
import { refineQualifiers } from '../lib/qualifier-search.ts';
import { validateQualifiers } from '../lib/qualifier-validation.ts';
const samples = [{ page: 1, text: 'The first part of the story is set in 1808, the second in 1872. Copyright 2025. Cambridge English examinations and FCE practice papers are discussed. A pet is mentioned.' }];
test('official numeric time ranges are computed in code, including BCE order and the BCE/CE boundary', () => {
  assert.deepEqual(qualifierCalendarRange('3MNB'), { start: { year: 1800, era: 'CE' }, end: { year: 1850, era: 'CE' } });
  assert.deepEqual(qualifierCalendarRange('3C-AA-E'), { start: { year: 2686, era: 'BCE' }, end: { year: 323, era: 'BCE' } });
  assert.deepEqual(qualifierCalendarRange('3KB-AA-E'), { start: { year: 332, era: 'BCE' }, end: { year: 630, era: 'CE' } });
  assert.deepEqual(qualifierCalendarRange('3BD-JP-J'), { start: { year: 16500, era: 'BCE' }, end: { year: 1000, era: 'BCE' } });
  assert.equal(qualifierCalendarRange('3A'), undefined); assert.equal(qualifierCalendarRange('4LEA'), undefined);
  assert.equal(qualifierNodes.filter(n => qualifierCalendarRange(n.CodeValue)).length, 254);
});
test('mixed-period facts retain only actual matching years with exact source offsets', () => {
  const early = qualifierFacts('3MNB', samples), late = qualifierFacts('3MNQV', samples);
  assert.deepEqual(early.matches.filter(m => m.kind === 'year').map(m => m.year), [1808]);
  assert.deepEqual(late.matches.filter(m => m.kind === 'year').map(m => m.year), [1872]);
  for (const m of [...early.matches, ...late.matches]) assert.equal(m.text, samples[0].text.slice(m.start, m.end));
  // A literal year match remains a candidate even in copyright metadata. It
  // cannot bypass the separate source-role and subject judgments.
  const current = qualifierFacts('3MR', samples); assert.equal(current.matches.some(m => m.text === '2025'), true);
});
test('BCE eras are explicit or shared within a bounded written range; unrelated bare years stay unmarked', () => {
  const text = 'The account covers 2686 to 323 BCE. Another chapter discusses 400 BCE to 20 CE. Published 2025. The appendix lists 1808 units.';
  const ancient = qualifierFacts('3C-AA-E', [{ page: 2, text }]);
  assert.ok(ancient.matches.some(m => m.year === 2686 && m.era === 'BCE' && m.eraBasis === 'shared-range'));
  assert.ok(ancient.matches.some(m => m.year === 323 && m.era === 'BCE' && m.eraBasis === 'explicit'));
  assert.ok(!ancient.matches.some(m => m.year === 2025 || m.year === 1808));
  const early = qualifierFacts('3MNB', [{ page: 2, text }]); assert.equal(early.matches[0].eraBasis, 'unmarked');
  const cross = qualifierFacts('3KB-AA-E', [{ page: 2, text: 'Events in 1 BCE, 1 CE and AD 12. No event in 0 CE.' }]);
  assert.deepEqual(cross.matches.filter(m => m.kind === 'year').map(m => [m.year, m.era]), [[1, 'BCE'], [1, 'CE'], [12, 'CE']]);
});
test('shared eras respect prefix and suffix spans, reject invalid years and retain explicit cross-era markers', () => {
  const text = 'BC 2686–323. 2686 BCE to 323 BCE. 400 BCE to AD 20. 0 to 323 BCE. 9999999 to 323 BCE.';
  const facts = qualifierFacts('3C-AA-E', [{ page: 1, text }]);
  assert.ok(facts.matches.some(m => m.text === 'BC 2686' && m.eraBasis === 'explicit'));
  assert.ok(facts.matches.some(m => m.text === '323' && m.eraBasis === 'shared-range'));
  assert.ok(facts.matches.some(m => m.text === '2686 BCE' && m.eraBasis === 'explicit'));
  assert.ok(facts.matches.some(m => m.text === '400 BCE' && m.eraBasis === 'explicit'));
  assert.ok(!facts.matches.some(m => m.year === 0 || m.year! > 999999));
  for (const m of facts.matches) assert.equal(m.text, text.slice(m.start, m.end));
  const cross = qualifierFacts('3KB-AA-E', [{ page: 1, text }]);
  assert.ok(cross.matches.some(m => m.text === 'AD 20' && m.era === 'CE' && m.eraBasis === 'explicit'));
});
test('official names and listed aliases preserve literal spans, plural examination forms and acronym case', () => {
  const facts = qualifierFacts('4LEA', samples);
  assert.ok(facts.matches.some(m => m.text === 'Cambridge English examinations' && m.alias === 'Cambridge English Exams'));
  assert.ok(facts.matches.some(m => m.text === 'FCE')); assert.ok(!facts.matches.some(m => m.text === 'pet'));
  for (const m of facts.matches) assert.equal(m.text, samples[0].text.slice(m.start, m.end));
  assert.equal(qualifierFacts('4LEA', [{ page: 1, text: 'A visit to Cambridge University and an English garden.' }]).matches.length, 0);
});
test('bounded assistance discloses truncated matches without pretending to cover every mention', () => {
  const facts = qualifierFacts('4LEA', [{ page: 1, text: 'FCE '.repeat(20) }]);
  assert.equal(facts.matchCount, 20); assert.equal(facts.matches.length, 12); assert.equal(facts.truncated, true);
});
test('facts cannot bypass failed source judgments, and forged computed facts are rejected', async () => {
  const state = { title: 'Fixture', pageCount: 1, samples: [{ page: 1, text: 'Cambridge English examinations are described in a course introduction. '.repeat(4) }] };
  const result = await refineQualifiers(state, ['CJB'], async p => ({ model: 'fixture', answers: Object.fromEntries(Object.entries(p.questions).map(([id, q]) => {
    if (q.type === 'noul') return [id, { type: 'noul', noul: id === 'family_4' ? .95 : id.startsWith('family_') ? .01 : .05 }];
    assert.equal(q.type, 'choice'); const keys = Object.keys(q.criteria);
    const selected = id.startsWith('branch_4_') ? '4L' : id.startsWith('branch_4L_') ? '4LE' : id.startsWith('branch_4LE_') ? '4LEA' : id.startsWith('passage_') ? keys[0] : 'No qualifier here';
    return [id, { type: 'choice', choice: selected, confidence: .99, probabilities: Object.fromEntries(keys.map(k => [k, k === selected ? 1 : 0])) }];
  })) }));
  assert.equal(result.qualifiers.length, 0); assert.ok(result.candidates.some(c => c.sourceFacts?.matches.length)); validateQualifiers(result, state, ['CJB']);
  const invalid = structuredClone(result); invalid.candidates.find(c => c.sourceFacts?.matches.length)!.sourceFacts!.matches[0].text = 'Invented';
  assert.throws(() => validateQualifiers(invalid, state, ['CJB']), /Source facts/);
});
test('quotation checks receive only their exact quotation and facts computed from it', async () => {
  const state = { title: 'Fixture', pageCount: 2, samples: [{ page: 1, text: 'This part takes place in 1872.' }, { page: 2, text: 'This part takes place in 1808. UnquotedSentinel.' }] };
  let checked = false;
  const result = await refineQualifiers(state, ['FV'], async payload => ({ model: 'fixture', answers: Object.fromEntries(Object.entries(payload.questions).map(([id, q]) => {
    if (id === 'quote_3MNB') {
      const quotation = (payload.state as Record<string, { page: number; text: string; facts: QualifierFacts }>)['3MNB'];
      assert.equal(quotation.text, state.samples[0].text); assert.equal(quotation.page, 1);
      assert.deepEqual(quotation.facts, qualifierFacts('3MNB', [state.samples[0]]));
      assert.ok(!JSON.stringify(payload.state).includes('UnquotedSentinel'));
      assert.ok(!JSON.stringify(payload.state).includes('1808'));
      assert.ok(!JSON.stringify(q).includes('UnquotedSentinel'));
      assert.ok(!JSON.stringify(q).includes('1808'));
      checked = true;
    }
    if (q.type === 'noul') return [id, { type: 'noul', noul: id === 'family_3' ? .96 : id.startsWith('family_') || id.startsWith('quote_') ? .01 : .96 }];
    assert.equal(q.type, 'choice'); const keys = Object.keys(q.criteria);
    const route: Record<string, string> = { branch_3_0: '3M', branch_3M_0: '3MN', branch_3MN_0: '3MNB' };
    const selected = route[id] || (id.startsWith('passage_') ? keys[0] : 'No qualifier here');
    return [id, { type: 'choice', choice: selected, confidence: .99, probabilities: Object.fromEntries(keys.map(k => [k, k === selected ? 1 : 0])) }];
  })) }));
  assert.equal(checked, true); assert.equal(result.qualifiers.length, 0);
  assert.ok(result.candidates.find(c => c.code === '3MNB')!.sourceFacts!.matches.some(m => m.text === '1808'));
  validateQualifiers(result, state, ['FV']);
});
