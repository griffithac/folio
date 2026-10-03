import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceSchema, sharedBookSchema, limitedBody } from '../lib/shared.ts';
import { evaluateReferences } from '../lib/validation.ts';
import { subjectNodes, childrenOf, hierarchyQuestion, refineSubject } from '../lib/hierarchy.ts';
import type { Book, Classification, ReferenceLabels } from '../lib/catalog.ts';
const judgment=(label:string)=>({label,confidence:.8,probabilities:{[label]:1}});
const result:Classification={genre:judgment('Fantasy'),language:judgment('English'),readingLevel:{...judgment('Middle school'),score:2,range:'Grades 6–8'},model:'fixture',reviewed:false};
const reference:ReferenceLabels={status:'verified',sourceName:'Independent reference',sourceUrl:'https://example.org/reference',scope:'edition',edition:'Test edition',notes:'Independently supplied labels',labels:{genre:'Fantasy',language:'English',readingLevel:'High school'},split:'holdout',updatedAt:'2026-10-03T00:00:00.000Z'};
const book:Book={id:'f62a7034-60c2-4fa5-96ef-6965d539141f',hash:'a'.repeat(64),title:'Book',author:'Author',filename:'book.pdf',pageCount:1,size:1000,addedAt:'2026-10-03T00:00:00.000Z',samples:[{page:1,text:'Readable book text. '.repeat(30)}],status:'complete',result,reference,revision:1};
test('reference scoring uses original predictions, independent status, split and matching bands',()=>{
  const corrected={...book,corrections:{genre:'Romance',language:'French',readingLevel:'High school'}};
  const metrics=evaluateReferences([corrected],'verified','holdout');
  assert.equal(metrics.find(m=>m.dimension==='genre')?.correct,1);
  assert.equal(metrics.find(m=>m.dimension==='readingLevel')?.correct,0);
  assert.equal(metrics.find(m=>m.dimension==='readingLevel')?.meanBandError,1);
  assert.equal(evaluateReferences([corrected],'provisional')[0].count,0);
  assert.equal(evaluateReferences([corrected],'verified','development')[1].count,0);
  const measuresOnly={...book,reference:{...reference,labels:{},readingMeasure:{system:'ATOS' as const,value:'7.4',sourceUrl:'https://example.org/measure',edition:'Other edition'}}};
  assert.ok(evaluateReferences([measuresOnly],'verified').every(m=>m.count===0));
});
test('shared records reject incomplete states, unsafe covers and false hierarchy references',()=>{
  assert.equal(sharedBookSchema.safeParse(book).success,true);
  assert.equal(sharedBookSchema.safeParse({...book,status:'classifying'}).success,false);
  assert.equal(sharedBookSchema.safeParse({...book,status:'complete',result:undefined}).success,false);
  assert.equal(sharedBookSchema.safeParse({...book,cover:'data:text/html;base64,abc'}).success,false);
  assert.equal(referenceSchema.safeParse({...reference,labels:{genre:'Fantasy',subcategory:'FBC'}}).success,false);
  assert.equal(referenceSchema.safeParse({...reference,labels:{detailedSubject:'UMX'}}).success,true);
  assert.equal(referenceSchema.safeParse({...reference,labels:{detailedSubject:'U'}}).success,false);
  assert.equal(referenceSchema.safeParse({...reference,sourceUrl:'javascript:alert(1)'}).success,false);
});
test('streamed request limits work even without content-length',async()=>{
  const request=new Request('https://example.org',{method:'POST',body:'a'.repeat(500)});
  await assert.rejects(async()=>await (await limitedBody(request,100)).text());
});
test('full taxonomy traverses every book section without crossing branches or assigning routing roots',async()=>{
  assert.equal(childrenOf('').length,20);assert.ok(subjectNodes.length>3000);
  for(const node of subjectNodes)assert.ok(!node.CodeParent||subjectNodes.some(n=>n.CodeValue===node.CodeParent));
  const route=['U','UM','UMX'];let index=0;
  const answer=(parent:string,selected:string)=>({model:'fixture',answers:{subject:{type:'choice',choice:selected,confidence:.9,probabilities:Object.fromEntries(Object.keys(hierarchyQuestion(parent).criteria).map(k=>[k,k===selected?1:0]))}}});
  const detailed=await refineSubject({title:'Programming',pageCount:1,samples:book.samples},async payload=>{const parent=index?route[index-1]:'';const response=answer(parent,route[index]);index++;return response;});
  assert.equal(detailed.code,'UMX');assert.equal(detailed.requests,3);assert.deepEqual(detailed.path.map(p=>p.code),route);
  const unsupported=await refineSubject({title:'Unknown',pageCount:1,samples:book.samples},async()=>answer('','No narrower subject'));
  assert.equal(unsupported.code,undefined);assert.equal(unsupported.needsReview,true);
});
