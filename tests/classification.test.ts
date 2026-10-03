import test from 'node:test';
import assert from 'node:assert/strict';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { GENRES, LANGUAGES, LEVELS, TIME_PERIODS, needsReview, sampledPageNumbers } from '../lib/catalog.ts';
import { bookQuestions, inputSchema, normalizeClassification, prepareRequest } from '../lib/classification.ts';
import { budgetSamples } from '../lib/evidence.ts';
import { SUBCATEGORIES } from '../lib/subcategories.ts';
import { languageCodes, themaForLabel } from '../lib/standards.ts';

function answer() {
  const probabilities = (keys: string[], selected: string) => Object.fromEntries(keys.map(key => [key, key === selected ? 1 : 0]));
  return { model: 'jev-fixture', usage: { input_tokens: 900, output_tokens: 30 }, answers: {
    genre: { type: 'choice', choice: 'Fantasy', confidence: 1, probabilities: probabilities(Object.keys(GENRES), 'Fantasy') },
    language: { type: 'choice', choice: 'English', confidence: 1, probabilities: probabilities(Object.keys(LANGUAGES), 'English') },
    time_period: { type: 'choice', choice: 'Timeless / imaginary', confidence: 1, probabilities: probabilities(Object.keys(TIME_PERIODS), 'Timeless / imaginary') },
    subcategory_FM: { type: 'choice', choice: 'FMB', confidence: 1, probabilities: probabilities([...SUBCATEGORIES.FM.map(i => i.code), 'Unspecified'], 'FMB') },
    reading_level: { type: 'score', score: 2.2, confidence: 0.8, probabilities: { '0': 0, '1': 0, '2': 0.8, '3': 0.2, '4': 0, '5': 0 } },
  } };
}
test('sampling includes front matter and the last page, without duplicating short PDFs', () => {
  for (const count of [1, 2, 3, 12, 250, 20000]) {
    const pages = sampledPageNumbers(count);
    assert.equal(pages[0], 1); assert.equal(pages.at(-1), count);
    assert.ok(pages.length <= 18); assert.equal(pages.length, new Set(pages).size);
    assert.ok(pages.every(page => page >= 1 && page <= count));
  }
});
test('rejects unreadable, oversized, and inconsistent excerpt inputs', () => {
  assert.equal(inputSchema.safeParse({ title: 'Book', pageCount: 1, samples: [{ page: 1, text: 'Too short' }] }).success, false);
  assert.equal(inputSchema.safeParse({ title: 'Book', pageCount: 1, samples: [{ page: 2, text: 'a'.repeat(220) }] }).success, false);
  assert.equal(inputSchema.safeParse({ title: 'Book', pageCount: 1, samples: [{ page: 1, text: 'a'.repeat(1001) }] }).success, false);
  assert.equal(inputSchema.safeParse({ title: 'Book', pageCount: 200, samples: [{ page: 100, text: 'a'.repeat(220) }] }).success, true);
});
test('questions use independent subject, language, and ordered complexity judgments', () => {
  const questions = bookQuestions();
  assert.equal(questions.genre.type, 'choice'); assert.equal(questions.language.type, 'choice'); assert.equal(questions.reading_level.type, 'score');
  assert.ok(Object.hasOwn(questions.genre.criteria, 'Other / uncertain'));
  assert.ok(Object.hasOwn(questions.language.criteria, 'Multilingual'));
  assert.equal(questions.reading_level.criteria.length, LEVELS.length);
});
test('normalization preserves provider confidence, versions, and official codes', () => {
  const result = normalizeClassification(answer());
  assert.equal(result.genre.code, 'FM'); assert.equal(result.language.iso639_2, 'eng');
  assert.equal(result.language.iso639_1, 'en'); assert.equal(result.readingLevel.label, 'Middle school');
  assert.equal(result.readingLevel.score, 2.2); assert.equal(result.readingLevel.confidence, 0.8);
  assert.equal(result.model, 'jev-fixture'); assert.ok(result.taxonomyVersion?.startsWith('thema-1.6'));
});
test('uses the most probable reading band rather than inventing one by rounding the mean', () => {
  const fixture = answer(); fixture.answers.reading_level.probabilities = { '0': 0.55, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0.45 };
  fixture.answers.reading_level.score = 2.25;
  assert.equal(normalizeClassification(fixture).readingLevel.label, 'Early reader');
});
test('rejects unknown categories, invalid distributions, and incomplete output', () => {
  const fixture = answer(); fixture.answers.genre.choice = 'invented category';
  assert.throws(() => normalizeClassification(fixture));
  const invalid = answer(); invalid.answers.language.probabilities.English = 1.5;
  assert.throws(() => normalizeClassification(invalid));
  const incomplete = answer(); delete (incomplete.answers.genre.probabilities as Record<string, number>).Fantasy;
  assert.throws(() => normalizeClassification(incomplete));
  assert.throws(() => normalizeClassification({ model: 'jev', answers: {} }));
});
test('uncertainty in any dimension is reviewed; a human review resolves the flag', () => {
  const result = normalizeClassification(answer()); assert.equal(needsReview(result), false);
  result.language.confidence = 0.3; assert.equal(needsReview(result), true);
  result.reviewed = true; assert.equal(needsReview(result), false);
});
test('ISO uses terminology codes and an explicit undetermined fallback', () => {
  assert.equal(languageCodes('French')?.iso639_2, 'fra');
  assert.equal(languageCodes('German')?.iso639_2, 'deu');
  assert.equal(languageCodes('Multilingual')?.iso639_2, 'mul');
  assert.equal(languageCodes('Other / uncertain')?.iso639_2, 'und');
  assert.equal(themaForLabel('Other / uncertain'), undefined);
});
test('official SDK sends the typed contract and consumes answers without text parsing', async () => {
  let request: Record<string, unknown> | undefined;
  const client = new TypeSafeClient({ apiKey: 'offline-test-key', logLevel: 'off', fetch: async (url, init) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    request = JSON.parse(String(init?.body));
    return Response.json(answer());
  } });
  const raw = await client.systemOne({ state: { title: 'Fixture', samples: [{ page: 1, text: 'A dragon flew over the forest.' }] }, questions: bookQuestions() });
  assert.equal(request?.model, 'jev-latest');
  assert.equal(normalizeClassification(raw).genre.code, 'FM');
});

test('scoped subcategory fanout uses only the chosen parent and preserves setting', () => {
  const questions = bookQuestions();
  assert.equal(Object.keys(questions).length, 31);
  const result = normalizeClassification(answer());
  assert.equal(result.subcategory?.code, 'FMB');
  assert.equal(result.subcategory?.parentCode, 'FM');
  assert.equal(result.timePeriod?.label, 'Timeless / imaginary');
  const invalid = answer(); invalid.answers.subcategory_FM.choice = 'FBC';
  assert.throws(() => normalizeClassification(invalid));
});
test('distributed text remains bounded for multibyte scripts and a full fanout request', () => {
  const samples = budgetSamples(Array.from({length: 18}, (_, i) => ({page: i + 1, text: '開始' + '中文'.repeat(2500) + '結束'})));
  assert.ok(samples.every(s => s.text.length <= 1000 && s.text.includes('開始') && s.text.includes('結束')));
  const payload = prepareRequest({title: 'Book', pageCount: 5000, samples});
  assert.ok(Buffer.byteLength(JSON.stringify(payload)) < 60000);
  assert.throws(() => prepareRequest({title: 'Book', pageCount: 1, samples: [{page:1, text: 'a'.repeat(40000)}]}));
});
test('full-text mode permits short complete works while bounding aggregate evidence', () => {
  assert.equal(inputSchema.safeParse({title:'Short story',pageCount:8,strategy:'full-text-v1',samples:[{page:1,text:'a'.repeat(16000)}]}).success,true);
  assert.equal(inputSchema.safeParse({title:'Long story',pageCount:100,strategy:'full-text-v1',samples:[{page:1,text:'a'.repeat(16000)}]}).success,false);
  assert.equal(inputSchema.safeParse({title:'Short story',pageCount:8,strategy:'full-text-v1',samples:[{page:1,text:'a'.repeat(22000)}]}).success,false);
});
