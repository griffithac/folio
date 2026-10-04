import { z } from 'zod';
export { referenceSchema } from './references.ts';
import { referenceSchema } from './references.ts';
import { subjectNode, hierarchyQuestion } from './hierarchy.ts';
import { SUBJECT_SEARCH_POLICY } from './subject-search.ts';
import { inputSchema } from './classification.ts';
const webUrl = z.string().url().max(2000).refine(s => /^https?:\/\//.test(s));
const judgment=z.object({label:z.string().max(240),confidence:z.number().finite().min(0).max(1),probabilities:z.record(z.number().finite().min(0).max(1))});
const probability=z.number().finite().min(0).max(1);
const subjectCode=z.string().max(6).refine(code=>code.length>1&&Boolean(subjectNode(code)));
const subjectPath=z.array(z.object({code:z.string().max(6),heading:z.string().max(1000),confidence:probability,probabilities:z.record(probability)})).max(6).superRefine((path,ctx)=>{
  for(let i=0;i<path.length;i++){
    const step=path[i],parent=i?path[i-1].code:'';const node=subjectNode(step.code);
    if(!node||node.CodeParent!==parent||step.heading!==node.CodeDescription){ctx.addIssue({code:z.ZodIssueCode.custom,message:'Invalid official subject path.'});continue;}
    const keys=Object.keys(hierarchyQuestion(parent).criteria);
    if(keys.some(k=>!Object.hasOwn(step.probabilities,k))||Object.keys(step.probabilities).some(k=>!keys.includes(k))||Math.abs(Object.values(step.probabilities).reduce((a,b)=>a+b,0)-1)>.06)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Invalid subject path distribution.'});
  }
});
const subjectCitation=z.object({page:z.number().int().min(1).max(20000),start:z.number().int().min(0),end:z.number().int().min(1),text:z.string().min(1).max(480),supportProbability:probability});
const subjectCandidate=z.object({code:subjectCode,heading:z.string().max(1000),path:subjectPath,rankingScore:probability,sectionProbability:probability,supportProbability:probability,status:z.enum(['supported','insufficient-support','no-passage']),citation:subjectCitation.optional()}).superRefine((candidate,ctx)=>{
  if(subjectNode(candidate.code)?.CodeDescription!==candidate.heading||candidate.path.at(-1)?.code!==candidate.code)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Subject must match its official path and heading.'});
  if(candidate.status==='supported'&&(!candidate.citation||candidate.supportProbability<SUBJECT_SEARCH_POLICY.supportThreshold||candidate.citation.supportProbability<SUBJECT_SEARCH_POLICY.supportThreshold))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Assigned subjects require both support checks.'});
});
const detailedSubjectSchema=z.object({code:subjectCode.optional(),heading:z.string().max(1000).optional(),path:subjectPath,model:z.string().max(100),version:z.string().max(100),requests:z.number().int().min(0).max(12),needsReview:z.boolean(),reviewed:z.boolean().optional(),stoppedReason:z.string().max(400),method:z.literal('beam-and-source-check-v1').optional(),subjects:z.array(subjectCandidate).max(6).optional(),candidates:z.array(subjectCandidate).max(18).optional(),search:z.object({beamWidth:z.number().int().min(1).max(6),exploredParents:z.array(z.string().max(6)).max(40),pruned:z.boolean(),supportThreshold:probability}).optional()}).superRefine((detail,ctx)=>{
  if(detail.code&&(detail.path.at(-1)?.code!==detail.code||subjectNode(detail.code)?.CodeDescription!==detail.heading))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Primary subject must match its path.'});
  if(detail.method){
    if(!detail.subjects||!detail.candidates||!detail.search||detail.search.supportThreshold!==SUBJECT_SEARCH_POLICY.supportThreshold)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Subject search diagnostics are required.'});
    if(detail.subjects?.[0]?.code!==detail.code)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Primary subject must be the first supported subject.'});
    if(new Set(detail.subjects?.map(s=>s.code)).size!==detail.subjects?.length||detail.subjects?.some(s=>s.status!=='supported'||!detail.candidates?.some(c=>c.code===s.code&&JSON.stringify(c)===JSON.stringify(s))))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Assigned subjects must be unique supported candidates.'});
  }
});
const result=z.object({
  genre:judgment.extend({code:z.string().max(12).optional(),standard:z.string().max(120).optional(),heading:z.string().max(240).optional()}),
  language:judgment.extend({iso639_1:z.string().max(3).nullable().optional(),iso639_2:z.string().max(3).optional()}),
  subcategory:judgment.extend({code:z.string().max(12).optional(),parentCode:z.string().max(12),heading:z.string().max(240).optional()}).optional(),
  form:judgment.optional(),audience:judgment.optional(),technical:z.object({experience:judgment,languages:z.record(z.number().min(0).max(1)),topics:z.record(z.number().min(0).max(1))}).optional(),
  timePeriod:judgment.optional(),readingLevel:judgment.extend({score:z.number().finite().min(0).max(5),range:z.string().max(50)}),
  model:z.string().min(1).max(100),reviewed:z.boolean(),taxonomyVersion:z.string().max(100).optional(),
  evidence:z.object({strategy:z.string().max(100),pages:z.array(z.number().int().min(1).max(20000)).max(18),characters:z.number().int().min(0).max(22000),questionCount:z.number().int().min(1).max(100)}).optional(),
});
export const sharedBookSchema=z.object({
  id:z.string().uuid(),hash:z.string().max(64),title:z.string().trim().min(1).max(240),author:z.string().max(200),filename:z.string().min(1).max(240),
  pageCount:z.number().int().min(0).max(20000),size:z.number().int().min(0).max(25*1024*1024),addedAt:z.string().datetime(),
  cover:z.string().max(200000).refine(s=>/^data:image\/(jpeg|png);base64,/.test(s)).optional(),
  samples:z.array(z.object({page:z.number().int().min(1).max(20000),text:z.string().min(1).max(22000)})).max(18),
  status:z.enum(['ready','complete','error']),message:z.string().max(1000).optional(),result:result.optional(),
  evidenceStrategy:z.enum(['full-text-v1','distributed-pages-and-within-page-v1']).optional(),
  detailedSubject:detailedSubjectSchema.optional(),
  revision:z.number().int().min(1).optional(),sourceUrl:webUrl.optional(),reference:referenceSchema.optional(),
  corrections:z.object({genre:z.string().max(100),language:z.string().max(100),readingLevel:z.string().max(100),subcategory:z.string().max(12).optional(),timePeriod:z.string().max(100).optional()}).optional(),
}).superRefine((book,ctx)=>{
  if(book.status!=='error' && !inputSchema.safeParse({title:book.title,pageCount:book.pageCount,samples:book.samples,strategy:book.evidenceStrategy}).success)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Readable bounded evidence is required.'});
  if(book.status==='complete'&&!book.result)ctx.addIssue({code:z.ZodIssueCode.custom,message:'A completed book needs results.'});
  for(const candidate of book.detailedSubject?.candidates||[]){
    const citation=candidate.citation;if(!citation)continue;
    const sample=book.samples.find(s=>s.page===citation.page);
    if(!sample||citation.end<=citation.start||sample.text.slice(citation.start,citation.end)!==citation.text||citation.text.includes('[… excerpt gap …]'))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Subject quotation must match the book evidence exactly.'});
  }
});
export const MAX_UPLOAD=25*1024*1024+400000;
export const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export function sameOrigin(request:Request){const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin;}
export async function limitedBody(request:Request,limit:number){
  if(Number(request.headers.get('content-length'))>limit)throw new Error('Request is too large.');
  const reader=request.body?.getReader();if(!reader)throw new Error('A request body is required.');let size=0;
  return new Response(new ReadableStream<Uint8Array>({async pull(controller){const {value,done}=await reader.read();if(done){controller.close();return;}size+=value.length;if(size>limit){await reader.cancel();controller.error(new Error('Request is too large.'));return;}controller.enqueue(value);},cancel(){return reader.cancel();}}),{headers:{'Content-Type':request.headers.get('content-type')||'application/json'}});
}
