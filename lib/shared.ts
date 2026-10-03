import { z } from 'zod';
import { GENRES, LANGUAGES, LEVELS, TIME_PERIODS } from './catalog.ts';
import { subjectNode } from './hierarchy.ts';
import { SUBCATEGORIES } from './subcategories.ts';
import { themaForLabel } from './standards.ts';
import { inputSchema } from './classification.ts';
const webUrl = z.string().url().max(2000).refine(s => /^https?:\/\//.test(s));
const optionalLabel = (keys:string[]) => z.string().refine(s => keys.includes(s)).optional();
export const referenceSchema = z.object({
  status:z.enum(['provisional','verified']),sourceName:z.string().trim().min(1).max(200),sourceUrl:webUrl,
  scope:z.enum(['work','edition']),edition:z.string().max(240),notes:z.string().max(4000),
  labels:z.object({detailedSubject:z.string().max(6).refine(s=>s.length>1&&Boolean(subjectNode(s))).optional(),genre:optionalLabel(Object.keys(GENRES)),subcategory:z.string().max(12).optional(),language:optionalLabel(Object.keys(LANGUAGES)),readingLevel:optionalLabel(LEVELS.map(l=>l.label)),timePeriod:optionalLabel(Object.keys(TIME_PERIODS))}),
  readingMeasure:z.object({system:z.enum(['ATOS','Lexile']),value:z.string().min(1).max(20),sourceUrl:webUrl,edition:z.string().min(1).max(240)}).optional(),
  split:z.enum(['development','holdout']),updatedAt:z.string().datetime(),
}).refine(r=>Object.values(r.labels).some(Boolean)||Boolean(r.readingMeasure),{message:'Add at least one reference label or measure.'}).refine(r=>!r.labels.subcategory || r.labels.subcategory==='Unspecified' || Boolean(r.labels.genre && SUBCATEGORIES[themaForLabel(r.labels.genre)?.code || '']?.some(item=>item.code===r.labels.subcategory)),{message:'Reference subcategory must belong to the reference genre.'});
const judgment=z.object({label:z.string().max(240),confidence:z.number().finite().min(0).max(1),probabilities:z.record(z.number().finite().min(0).max(1))});
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
  detailedSubject:z.object({code:z.string().max(6).optional(),heading:z.string().max(240).optional(),path:z.array(z.object({code:z.string().max(6),heading:z.string().max(240),confidence:z.number().min(0).max(1),probabilities:z.record(z.number().min(0).max(1))})).max(6),model:z.string().max(100),version:z.string().max(100),requests:z.number().int().min(0).max(6),needsReview:z.boolean(),stoppedReason:z.string().max(240)}).optional(),
  revision:z.number().int().min(1).optional(),sourceUrl:webUrl.optional(),reference:referenceSchema.optional(),
  corrections:z.object({genre:z.string().max(100),language:z.string().max(100),readingLevel:z.string().max(100),subcategory:z.string().max(12).optional(),timePeriod:z.string().max(100).optional()}).optional(),
}).superRefine((book,ctx)=>{
  if(book.status!=='error' && !inputSchema.safeParse({title:book.title,pageCount:book.pageCount,samples:book.samples,strategy:book.evidenceStrategy}).success)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Readable bounded evidence is required.'});
  if(book.status==='complete'&&!book.result)ctx.addIssue({code:z.ZodIssueCode.custom,message:'A completed book needs results.'});
});
export const MAX_UPLOAD=25*1024*1024+400000;
export const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export function sameOrigin(request:Request){const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin;}
export async function limitedBody(request:Request,limit:number){
  if(Number(request.headers.get('content-length'))>limit)throw new Error('Request is too large.');
  const reader=request.body?.getReader();if(!reader)throw new Error('A request body is required.');let size=0;
  return new Response(new ReadableStream<Uint8Array>({async pull(controller){const {value,done}=await reader.read();if(done){controller.close();return;}size+=value.length;if(size>limit){await reader.cancel();controller.error(new Error('Request is too large.'));return;}controller.enqueue(value);},cancel(){return reader.cancel();}}),{headers:{'Content-Type':request.headers.get('content-type')||'application/json'}});
}
