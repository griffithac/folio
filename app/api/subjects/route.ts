import { env } from 'cloudflare:workers';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { inputSchema } from '@/lib/classification';
import { refineSubjects } from '@/lib/subject-search';
import { json, sameOrigin, limitedBody } from '@/lib/shared';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  if(!sameOrigin(request))return json({error:'Use Folio to refine subjects.'},403);
  if(!env.DB||!env.TYPESAFE_API_KEY)return json({error:'Subject refinement is unavailable.'},503);
  if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'Expected JSON book excerpts.'},415);
  let body: unknown;
  try { body=await (await limitedBody(request,100000)).json(); }
  catch(error){return json({error:'Invalid or oversized book excerpt request.'},(error as Error).message.includes('too large')?413:400);}
  const parsed=inputSchema.safeParse(body);
  if(!parsed.success)return json({error:'Readable bounded excerpts are required.'},400);
  try {
    const client=new TypeSafeClient({apiKey:env.TYPESAFE_API_KEY,defaultModel:env.TYPESAFE_MODEL||'jev-latest',timeout:15000,retry:{maxRetries:0},logLevel:'off'});
    const configured=Number(env.CLASSIFICATION_DAILY_LIMIT??250);const limit=Number.isFinite(configured)?Math.max(1,Math.min(10000,Math.floor(configured))):250;
    const operation=AbortSignal.timeout(120000);
    const result=await refineSubjects(parsed.data,async payload=>{
      const quota=await env.DB!.prepare('INSERT INTO classification_quota (day,used) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET used=used+1 WHERE used<? RETURNING used').bind(new Date().toISOString().slice(0,10),limit).first();
      if(!quota)throw new Error('The public site has reached its daily classification limit. Try tomorrow.');
      return await client.systemOne(payload,{signal:AbortSignal.any([operation,AbortSignal.timeout(15000)])});
    });
    return json(result);
  } catch(error) { const quota=(error as Error).message.includes('daily classification'); return json({error:quota?(error as Error).message:'Detailed subjects could not be completed. Your existing results are saved; please retry.'},quota?429:502); }
}
