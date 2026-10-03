import { env } from 'cloudflare:workers';
import { json } from '@/lib/shared';
export const dynamic='force-dynamic';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  if(!env.DB||!env.BUCKET)return json({error:'Shared book storage is unavailable.'},503);
  const {id}=await context.params;const row=await env.DB.prepare('SELECT pdf_key,record FROM shared_books WHERE id=?').bind(id).first<{pdf_key:string;record:string}>();
  if(!row)return json({error:'Book not found.'},404);const pdf=await env.BUCKET.get(row.pdf_key);if(!pdf)return json({error:'PDF not found.'},404);
  const book=JSON.parse(row.record);
  return new Response(pdf.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(book.filename)}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
