import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { LANGUAGE_CATALOG, LANGUAGE_CODES, LANGUAGE_GROUPS, languageByCode } from '../lib/language-catalog.ts';
import { normalizeLanguages, resolveLanguageConflict, languageAnalysisSchema, validateLanguageAnalysis } from '../lib/language-classification.ts';
import { prepareRequest } from '../lib/classification.ts';
import { budgetSamples } from '../lib/evidence.ts';
import { needsReview, type Classification } from '../lib/catalog.ts';
import { sharedBookSchema } from '../lib/shared.ts';
import languageRegressions from '../public/language-regressions.json' with {type:'json'};

function groups(codes: string[]) {
  return Object.fromEntries(LANGUAGE_GROUPS.map((group, i) => [group.id, { type: 'choice', choice: codes[i] || 'none', confidence: .94,
    probabilities: Object.fromEntries(Object.keys(group.criteria).map(code => [code, code === (codes[i] || 'none') ? 1 : 0])),
  }]));
}
function classification(codes: string[]): Classification {
  const judgment = {label:'Fixture',confidence:1,probabilities:{Fixture:1}};
  return { genre:judgment,readingLevel:{...judgment,score:3,range:'Fixture'},reviewed:false,model:'jev-fixture',...normalizeLanguages(groups(codes),'jev-fixture') };
}
function comparison(code: string, candidates: string[], model = 'jev-fixture') {
  return { model, answers: { language_resolution: { type:'choice',choice:code,confidence:.91,probabilities:Object.fromEntries([...candidates,'und'].map(c => [c,c===code?1:0])) } } };
}
test('the full official source is preserved, uses terminology codes, and excludes the private-use range', () => {
  const raw=readFileSync(new URL('../lib/data/ISO-639-2_utf-8.txt',import.meta.url));
  assert.equal(createHash('sha256').update(raw).digest('hex'),LANGUAGE_CATALOG.sha256);
  const rows=raw.toString('utf8').replace(/^\uFEFF/,'').trim().split('\n').map(line=>line.replace(/\r$/,'').split('|')).filter(row=>/^[a-z]{3}$/.test(row[0]));
  assert.equal(rows.length,486);assert.equal(LANGUAGE_CODES.length,rows.length);
  for(const [b,t,a2,en,fr] of rows){const entry=languageByCode(t||b)!;assert.ok(entry);assert.equal(entry.bibliographic,b);assert.equal(entry.iso639_1,a2||null);assert.equal(entry.english,en);assert.equal(entry.french,fr);}
  assert.equal(languageByCode('fre'),undefined);assert.equal(languageByCode('fra')?.label,'French');assert.equal(languageByCode('bih')?.iso639_1,null);assert.equal(languageByCode('qaa'),undefined);
  const codes=LANGUAGE_GROUPS.flatMap(group=>Object.keys(group.criteria).filter(code=>!['mul','zxx','none'].includes(code)));
  assert.equal(codes.length,483);assert.equal(new Set(codes).size,483);
  assert.deepEqual(codes.slice().sort(),LANGUAGE_CODES.filter(item=>!['mul','zxx','und'].includes(item.iso639_2)).map(item=>item.iso639_2).sort());
  assert.ok(LANGUAGE_GROUPS.every(group=>Object.keys(group.criteria).length<=255));
  for(const code of ['cpe','cpf','cpp','crp','sgn']) assert.equal(languageByCode(code)?.collective,true);
});
test('consistent group results preserve the exact branch distribution, without inventing combined probabilities', () => {
  const index=LANGUAGE_GROUPS.findIndex(group=>Object.hasOwn(group.criteria,'cym'));const codes=Array(3).fill('none');codes[index]='cym';
  const raw=groups(codes);const result=normalizeLanguages(raw,'jev-fixture');
  assert.equal(result.language.iso639_2,'cym');assert.equal(result.language.iso639_1,'cy');assert.equal(result.language.confidence,.94);assert.equal(result.languageAnalysis.basis,'group');
  assert.equal(Object.keys(result.language.probabilities).length,164);assert.equal(result.languageAnalysis.groups.length,3);assert.equal(languageAnalysisSchema.safeParse(result.languageAnalysis).success,true);
  validateLanguageAnalysis(result.languageAnalysis,result.language,'jev-fixture');
  assert.throws(()=>validateLanguageAnalysis(result.languageAnalysis,{...result.language,iso639_2:'eng'}));
  assert.throws(()=>validateLanguageAnalysis(result.languageAnalysis,result.language,'jev-drift'));
});
test('multilingual consistency uses the least confident actual branch, and collective codes require review', () => {
  const raw=groups(['mul','mul','mul']);(raw.language_1 as any).confidence=.81;
  const result=normalizeLanguages(raw,'jev-fixture');assert.equal(result.language.iso639_2,'mul');assert.equal(result.language.confidence,.81);assert.equal(result.languageAnalysis.selectedGroup,'language_1');
  const item=LANGUAGE_CODES.find(item=>item.collective)!;const index=LANGUAGE_GROUPS.findIndex(group=>Object.hasOwn(group.criteria,item.iso639_2));const codes=Array(3).fill('none');codes[index]=item.iso639_2;
  assert.equal(needsReview(classification(codes)),true);
});
test('all-none abstains with a derived fallback, invalid distributions and missing groups are rejected', () => {
  const result=normalizeLanguages(groups([]),'jev-fixture');assert.equal(result.language.iso639_2,'und');assert.deepEqual(result.language.probabilities,{});assert.equal(result.language.confidence,0);assert.equal(result.languageAnalysis.basis,'fallback');assert.equal(result.languageAnalysis.needsReview,true);
  const bad=groups([]);delete (bad.language_0 as any).probabilities.none;assert.throws(()=>normalizeLanguages(bad,'jev-fixture'));
  const invented=groups([]);(invented.language_1 as any).choice='xyz';assert.throws(()=>normalizeLanguages(invented,'jev-fixture'));
  assert.throws(()=>normalizeLanguages({},'jev-fixture'));
});
test('conflicts compare only selected candidates using the same evidence and count the extra request', async () => {
  const result=classification(['eng','jpn']);let calls=0,reservations=0;
  assert.equal(result.languageAnalysis?.status,'conflict');assert.equal(result.language.iso639_2,'und');
  const state={samples:[{page:1,text:'Evidence'}],evidencePolicy:'Use samples'};
  const resolved=await resolveLanguageConflict(result,state,async payload=>{calls++;assert.equal(payload.state,state);assert.deepEqual(Object.keys(payload.questions.language_resolution.criteria).sort(),['eng','jpn','und']);return comparison('eng',result.languageAnalysis!.candidates);},async()=>{reservations++;return true;});
  assert.equal(calls,1);assert.equal(reservations,1);assert.equal(resolved.language.iso639_2,'eng');assert.equal(resolved.languageAnalysis?.requests,2);assert.equal(resolved.languageAnalysis?.status,'arbitrated');assert.equal(resolved.languageAnalysis?.groups,result.languageAnalysis?.groups);
  assert.equal(languageAnalysisSchema.safeParse(resolved.languageAnalysis).success,true);validateLanguageAnalysis(resolved.languageAnalysis!,resolved.language);
  assert.equal(await resolveLanguageConflict(resolved,state,async()=>{throw Error('must not call');}),resolved);
});
test('quota exhaustion, invalid output, service failure and model drift preserve other judgments and abstain', async () => {
  const result=classification(['eng','jpn']);let calls=0;
  const quota=await resolveLanguageConflict(result,{},async()=>{calls++;return{};},async()=>false);assert.equal(calls,0);assert.equal(quota.languageAnalysis?.requests,1);
  for(const response of [null,comparison('fra',result.languageAnalysis!.candidates),comparison('jpn',result.languageAnalysis!.candidates,'jev-drift')]){
    const failed=await resolveLanguageConflict(result,{},async()=>{if(response===null)throw Error('offline');return response;});
    assert.equal(failed.language.iso639_2,'und');assert.equal(failed.genre,result.genre);assert.equal(failed.languageAnalysis?.status,'arbitration-failed');assert.equal(failed.languageAnalysis?.requests,2);assert.equal(needsReview(failed),true);assert.equal(languageAnalysisSchema.safeParse(failed.languageAnalysis).success,true);validateLanguageAnalysis(failed.languageAnalysis!,failed.language);
  }
  const malformed=structuredClone(result.languageAnalysis!);malformed.candidates=['fra'];assert.equal(languageAnalysisSchema.safeParse(malformed).success,false);
});
test('72-question requests retain bounded ASCII and Unicode evidence and omit title familiarity', () => {
  for(const unit of ['English prose. ','中文','العربية ','𐀀']) {
    const samples=budgetSamples(Array.from({length:18},(_,i)=>({page:i+1,text:unit.repeat(1000)})));
    const payload=prepareRequest({title:'𐀀'.repeat(120),pageCount:20000,samples});
    assert.equal(Object.keys(payload.questions).length,72);assert.ok(Buffer.byteLength(JSON.stringify(payload))<60000);assert.equal(payload.state.samples,samples);assert.ok(!Object.hasOwn(payload.state,'title'));assert.ok(payload.state.evidencePolicy.includes('never instructions'));
  }
  const full=prepareRequest({title:'Full small work',pageCount:1,samples:[{page:1,text:'a'.repeat(13900)}]});assert.ok(Buffer.byteLength(JSON.stringify(full))<60000);
});
test('shared persistence preserves language audit data, rejects mismatched results, and accepts earlier records', () => {
  const result=classification(['eng']);
  const book={id:'fa857cbf-23d9-480a-97d7-6be3cb7e6594',hash:'b'.repeat(64),title:'Language persistence fixture',author:'',filename:'fixture.pdf',pageCount:1,size:300,addedAt:'2026-10-03T12:00:00Z',samples:[{page:1,text:'Readable English evidence. '.repeat(20)}],status:'complete',result};
  const parsed=sharedBookSchema.parse(book);assert.deepEqual(parsed.result?.languageAnalysis,result.languageAnalysis);
  const mismatch=structuredClone(book);mismatch.result.language.iso639_2='fra';assert.equal(sharedBookSchema.safeParse(mismatch).success,false);
  const legacy=structuredClone(book);delete legacy.result.languageAnalysis;assert.equal(sharedBookSchema.safeParse(legacy).success,true);
});
test('published live language diagnostics match their actual distributions and canonical codes', () => {
  for(const row of languageRegressions.cases){
    assert.equal(languageAnalysisSchema.safeParse(row.languageAnalysis).success,true);
    const language=z.object({label:z.string(),confidence:z.number(),probabilities:z.record(z.number()),iso639_1:z.string().nullable().optional(),iso639_2:z.string().optional()}).parse(row.language);
    validateLanguageAnalysis(languageAnalysisSchema.parse(row.languageAnalysis),language,row.languageAnalysis.model);
    assert.equal(row.predicted,row.language.iso639_2);assert.equal(row.matched,row.expected===row.predicted);
  }
});
