import test from 'node:test';
import assert from 'node:assert/strict';
import { refineSubjects, sourcePassages, type SubjectEvaluator } from '../lib/subject-search.ts';
import { subjectNode, childrenOf } from '../lib/hierarchy.ts';
import { sharedBookSchema } from '../lib/shared.ts';
import type { Book } from '../lib/catalog.ts';
const state={title:'Untitled fixture',pageCount:1,samples:[{page:1,text:'This practical guide teaches Python programming and explains budgeting for a small company. '.repeat(10)}]};
function lineage(code:string):string[]{const node=subjectNode(code)!;return node.CodeParent?[...lineage(node.CodeParent),code]:[code];}
function evaluator(targets:string[],options:{primary?:string;unsupported?:string[];quoteUnsupported?:string[];noPassage?:boolean}={}):SubjectEvaluator{
  const routes=targets.map(lineage);const root=options.primary||routes[0]?.[0]||'U';
  return async payload=>{
    assert.ok(Buffer.byteLength(JSON.stringify(payload))<=60000);
    for(const q of Object.values(payload.questions))assert.ok(Buffer.byteLength(JSON.stringify(payload.state))+Buffer.byteLength(JSON.stringify(q))<=30000);
    const answers=Object.fromEntries(Object.entries(payload.questions).map(([id,q])=>{
      if(q.type==='noul'){
        const code=id.slice(id.indexOf('_')+1);
        const probability=id.startsWith('section_')?(routes.some(r=>r[0]===code)?.96:.01):id.startsWith('quote_')?(options.quoteUnsupported?.includes(code)?.05:.96):(options.unsupported?.includes(code)?.05:.96);
        return [id,{type:'noul',noul:probability}];
      }
      assert.equal(q.type,'choice');const keys=Object.keys(q.criteria);let selected:string[];
      if(id==='primary')selected=[root];
      else if(id.startsWith('branch_')){
        const parent=id.slice(7);selected=[...new Set(routes.filter(r=>r.includes(parent)).map(r=>r[r.indexOf(parent)+1]||'No narrower subject'))];
        if(!selected.length)selected=['No narrower subject'];
      }else selected=[options.noPassage?'No supporting passage':keys[0]];
      return [id,{type:'choice',choice:selected[0],confidence:selected.length>1?.45:.98,probabilities:Object.fromEntries(keys.map(k=>[k,selected.includes(k)?1/selected.length:0]))}];
    }));
    return {model:'jev-fixture',answers};
  };
}
test('multiple subject search preserves nonexclusive subjects with checked source quotes',async()=>{
  const result=await refineSubjects(state,evaluator(['UMX','KJ']));
  assert.deepEqual(result.subjects?.map(s=>s.code),['UMX','KJ']);
  assert.equal(result.method,'beam-and-source-check-v1');assert.equal(result.code,'UMX');
  for(const candidate of result.subjects!){assert.equal(candidate.citation?.text,state.samples[0].text.slice(candidate.citation!.start,candidate.citation!.end));assert.equal(candidate.status,'supported');}
});
test('an unsupported early primary branch cannot lock out a supported alternative',async()=>{
  const result=await refineSubjects(state,evaluator(['UMX','WBN'],{primary:'U',unsupported:['UMX','UM']}));
  assert.equal(result.code,'WBN');assert.ok(result.candidates?.some(c=>c.code==='UMX'&&c.status==='insufficient-support'));assert.equal(result.needsReview,true);
});
test('no section evidence, no selected passage, or a failed quotation check leaves subjects unassigned',async()=>{
  const none=await refineSubjects(state,evaluator([]));assert.equal(none.code,undefined);assert.equal(none.requests,1);
  const noPassage=await refineSubjects(state,evaluator(['UMX'],{noPassage:true}));assert.equal(noPassage.code,undefined);assert.equal(noPassage.candidates?.[0].status,'no-passage');
  const contradicted=await refineSubjects(state,evaluator(['UMX'],{quoteUnsupported:['UMX','UM']}));assert.equal(contradicted.code,undefined);assert.equal(contradicted.candidates?.[0].supportProbability,.96);assert.equal(contradicted.candidates?.[0].citation?.supportProbability,.05);
});
test('failed narrow subject support falls back to a separately checked official parent',async()=>{
  const result=await refineSubjects(state,evaluator(['UMX'],{unsupported:['UMX']}));
  assert.equal(result.code,'UM');assert.ok(result.subjects?.[0].citation);assert.equal(result.subjects?.[0].supportProbability,.96);assert.ok(result.candidates?.some(c=>c.code==='UMX'&&c.status==='insufficient-support'));
});
test('supported descendants remove redundant ancestors without conflating unrelated subjects',async()=>{
  const result=await refineSubjects(state,evaluator(['WB','WBN','UMX']));
  assert.ok(result.candidates?.some(c=>c.code==='WB'));assert.ok(result.subjects?.some(c=>c.code==='WBN'));assert.ok(!result.subjects?.some(c=>c.code==='WB'));assert.ok(result.subjects?.some(c=>c.code==='UMX'));
});
test('source passages preserve exact offsets, scripts and artificial sampling gaps',()=>{
  const text='🦉學習中文。'.repeat(130)+'\n[… excerpt gap …]\n'+'Long source passage. '.repeat(80);
  const passages=sourcePassages({title:'Text',pageCount:1,samples:[{page:1,text}]});
  for(const p of passages){assert.equal(p.text,text.slice(p.start,p.end));assert.ok(!p.text.includes('excerpt gap'));assert.ok(p.text.length<=480);assert.ok(!/[\uD800-\uDBFF]$/.test(p.text));}
  assert.equal(passages.map(p=>p.text).join(''),text.replace('\n[… excerpt gap …]\n',''));
});
test('shared records reject fabricated quotes, wrong headings and crossed subject paths',async()=>{
  const detailed=await refineSubjects(state,evaluator(['UMX']));
  const book:Book={id:'db01d084-fc27-4b1d-91ea-142f3940879c',hash:'a'.repeat(64),title:state.title,author:'',filename:'fixture.pdf',pageCount:1,size:1000,addedAt:'2026-10-03T00:00:00.000Z',samples:state.samples,status:'ready',detailedSubject:detailed};
  assert.equal(sharedBookSchema.safeParse(book).success,true);
  const invalid=structuredClone(book);invalid.detailedSubject!.candidates![0].citation!.text='Fabricated quote';assert.equal(sharedBookSchema.safeParse(invalid).success,false);
  const wrongHeading=structuredClone(book);wrongHeading.detailedSubject!.heading='Invented official subject';assert.equal(sharedBookSchema.safeParse(wrongHeading).success,false);
  const crossed=structuredClone(book);crossed.detailedSubject!.path[1].code='WB';assert.equal(sharedBookSchema.safeParse(crossed).success,false);
});
test('every official section can reach every descendant within the configured depth',()=>{
  const visit=(parent:string,depth:number)=>{assert.ok(depth<=6);for(const n of childrenOf(parent)){assert.equal(n.CodeParent,parent);visit(n.CodeValue,depth+1);}};visit('',0);
});
test('missing answers, invalid evidence distributions and changing model versions fail closed',async()=>{
  await assert.rejects(()=>refineSubjects(state,async()=>({model:'fixture',answers:{}})));
  const good=evaluator(['UMX']);let calls=0;
  await assert.rejects(()=>refineSubjects(state,async payload=>({...await good(payload),model:++calls===1?'first-model':'different-model'})),/version changed/);
  await assert.rejects(()=>refineSubjects(state,async payload=>{const result=await good(payload);for(const id of Object.keys(result.answers))if(id.startsWith('passage_'))(result.answers[id] as {probabilities:Record<string,number>}).probabilities={invalid:1};return result;}),/evidence selection/);
});
