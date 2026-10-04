import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { prepareRequest, normalizeClassification, type BookState } from '../lib/classification.ts';
import { resolveLanguageConflict } from '../lib/language-classification.ts';
import { sampledPageNumbers, LEVELS } from '../lib/catalog.ts';
import { budgetSamples, SAMPLING_VERSION, EVIDENCE_BYTE_BUDGET } from '../lib/evidence.ts';
import { themaForLabel, TAXONOMY_VERSION } from '../lib/standards.ts';
// This developer experiment requires pdftotext. It never embeds a key in output.
const manifest = JSON.parse(await readFile(process.argv[2] || 'outputs/corpus/manifest.json', 'utf8'));
const out = process.argv[3] || 'outputs/benchmark.json';
const envText = await readFile('.dev.vars', 'utf8').catch(() => '');
const key = process.env.TYPESAFE_API_KEY || envText.match(/^TYPESAFE_API_KEY\s*=\s*["']?([^"'\r\n]+)/m)?.[1];
if (!key) throw new Error('Set TYPESAFE_API_KEY in the server environment or .dev.vars.');
const client = new TypeSafeClient({apiKey:key,defaultModel:process.env.TYPESAFE_MODEL || 'jev-1.13.0',logLevel:'off',timeout:30000,retry:{maxRetries:2}});
const report: any = { runAt:new Date().toISOString(), samplingVersion:SAMPLING_VERSION, notes:'Exploratory agreement, not accuracy. Full text is chunked only when needed. Non-language probabilities are averaged by character count; aggregate support is not provider confidence. Language uses the character-weighted vote of resolved chunk labels, never combines partition distributions. Public-domain status is recorded by Gutenberg for the USA. Source images are omitted. Generated PDF pagination affects sampling.', books:[] };
async function evaluate(state: BookState) {
  const payload = prepareRequest(state);
  const raw = await client.systemOne(payload);
  const responses: {usage:typeof raw.usage;model:string;answers:unknown}[]=[raw];
  const result=await resolveLanguageConflict(normalizeClassification(raw),payload.state,async request=>{const response=await client.systemOne(request);responses.push(response);return response;});
  return {result,answers:raw.answers,usage:responses.map(response=>response.usage),requests:responses.length,model:raw.model,characters:state.samples.reduce((n,s)=>n+s.text.length,0)};
}
// Resume only a report with this exact taxonomy/question version.
const existing = await readFile(out, 'utf8').then(JSON.parse).catch(() => null);
if (existing?.taxonomyVersion === TAXONOMY_VERSION && existing?.questionCount === Object.keys(prepareRequest({title:'Budget',pageCount:1,samples:[{page:1,text:'text'}]}).questions).length) report.books = existing.books;
report.taxonomyVersion = TAXONOMY_VERSION; report.questionCount = Object.keys(prepareRequest({title:'Budget',pageCount:1,samples:[{page:1,text:'text'}]}).questions).length;
for (const book of manifest) {
  if (report.books.some((record:any) => record.source === book.source)) continue;
  const extracted = execFileSync('pdftotext', ['-enc','UTF-8',book.pdf,'-'], {maxBuffer:10000000}).toString();
  const pageText = extracted.split('\f'); if (!pageText.at(-1)?.trim()) pageText.pop();
  const pages = pageText.map((text,i)=>({page:i+1,text:text.trim()})).filter(s=>s.text);
  const sampled = budgetSamples(pages.filter(s=>sampledPageNumbers(pageText.length).includes(s.page)));
  const sample = await evaluate({title:book.title,pageCount:pageText.length,samples:sampled});
  const blocks: typeof pages[]=[]; let block: typeof pages=[];
  for (const page of pages) {
    // Every extracted character appears exactly once in the full baseline.
    // Even a single unusually long PDF page is split without truncation.
    for (let start=0;start<page.text.length;start+=10000) {
      const part={page:page.page,text:page.text.slice(start,start+10000)};
      const trial=[...block,part];
      if (Buffer.byteLength(JSON.stringify({title:book.title,pageCount:pageText.length,samples:trial}))>EVIDENCE_BYTE_BUDGET && block.length) {blocks.push(block);block=[];}
      block.push(part);
    }
  }
  if (block.length) blocks.push(block);
  const full=[];
  for (const samples of blocks) full.push(await evaluate({title:book.title,pageCount:pageText.length,samples}));
  const weight=full.reduce((n,r)=>n+r.characters,0);
  const averaged:Record<string,Record<string,number>>={};
  for (const item of full) for (const [name,answer] of Object.entries(item.answers)) {
    const probs=(answer as any).probabilities; if (!probs || name.startsWith('language_')) continue;
    averaged[name] ||= {};
    for (const [label,p] of Object.entries(probs)) averaged[name][label]=(averaged[name][label]||0)+(p as number)*item.characters/weight;
  }
  const best=(name:string)=>Object.entries(averaged[name]).sort((a,b)=>b[1]-a[1])[0][0];
  const languageChunkVotes:Record<string,number>={};
  for(const item of full) languageChunkVotes[item.result.language.label]=(languageChunkVotes[item.result.language.label]||0)+item.characters/weight;
  const fullLanguage=Object.entries(languageChunkVotes).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0][0];
  const broad=best('genre');const parent=themaForLabel(broad)?.code;
  const fullLabels={genre:broad,language:fullLanguage,readingLevel:LEVELS[Number(best('reading_level'))].label,timePeriod:best('time_period'),subcategory:parent && averaged[`subcategory_${parent}`] ? best(`subcategory_${parent}`) : null};
  const sampledLabels={genre:sample.result.genre.label,language:sample.result.language.label,readingLevel:sample.result.readingLevel.label,timePeriod:sample.result.timePeriod?.label,subcategory:sample.result.subcategory?.code || (sample.result.subcategory ? 'Unspecified' : null)};
  const agreement=Object.fromEntries(Object.entries(fullLabels).map(([name,label])=>[name,label===sampledLabels[name as keyof typeof sampledLabels]]));
  const probabilityShift=Object.fromEntries(['genre','reading_level','time_period'].map(name=>[name,Object.entries(averaged[name]).reduce((n,[label,p])=>n+Math.abs(p-(sample.answers as Record<string, any>)[name].probabilities[label]),0)/2]));
  const record={...book,pdfId:Number(book.source.split('/').at(-1)),pageCount:pageText.length,fullMethod:full.length===1?'entire-work-single-request':'entire-work-chunked-weighted-baseline',fullRequests:full.reduce((n,r)=>n+r.requests,0),sampledRequests:sample.requests,fullCharacters:weight,sampledCharacters:sample.characters,sampledPages:sampled.map(s=>s.page),fullLabels,sampledLabels,agreement,probabilityShift,languageChunkVotes,sample:{result:sample.result,usage:sample.usage},fullChunks:full.map(({answers,...rest})=>rest),aggregateProbabilities:averaged};
  report.books.push(record);
  await mkdir(out.slice(0,out.lastIndexOf('/')) || '.',{recursive:true});await writeFile(out,JSON.stringify(report,null,2));
  console.log(JSON.stringify({title:book.title,pages:pageText.length,fullCalls:full.length,fullLabels,sampledLabels,agreement}));
}
