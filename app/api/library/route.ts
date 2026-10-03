import { env } from 'cloudflare:workers';
import { sharedBookSchema, sameOrigin, json, limitedBody, MAX_UPLOAD } from '@/lib/shared';
export const dynamic='force-dynamic';
export async function GET(){
  if(!env.DB)return json({error:'Shared library is unavailable.'},503);
  const rows=await env.DB.prepare('SELECT record, revision, pdf_key FROM shared_books ORDER BY updated_at DESC').all<{record:string;revision:number;pdf_key:string}>();
  return json({books:rows.results.map(row=>({...JSON.parse(row.record),revision:row.revision,...(row.pdf_key ? {pdfUrl:`/api/library/${JSON.parse(row.record).id}/pdf`} : {})}))});
}
export async function POST(request:Request){
  if(!sameOrigin(request))return json({error:'Use the shared library from Folio.'},403);
  if(!env.DB||!env.BUCKET)return json({error:'Shared book storage is unavailable.'},503);
  let key:string|undefined;
  try{
    const bounded=await limitedBody(request,MAX_UPLOAD);const form=await bounded.formData();
    const parsed=sharedBookSchema.safeParse(JSON.parse(String(form.get('book'))));const file=form.get('pdf');const legacy=form.get('legacy')==='true';
    if(!parsed.success||(!(file instanceof File)&&!legacy))return json({error:'A PDF and valid book details are required.'},400);
    let bytes:ArrayBuffer|undefined;let hash=parsed.data.hash;
    if(file instanceof File){
      if(file.size>25*1024*1024)return json({error:'PDFs must be 25 MB or smaller.'},413);
      bytes=await file.arrayBuffer();if(!new TextDecoder().decode(bytes.slice(0,1024)).includes('%PDF-'))return json({error:'This file is not a valid PDF.'},400);
      hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
    }else if(!/^[a-f0-9]{64}$/.test(hash))return json({error:'Earlier browser results need a valid PDF fingerprint.'},400);
    const duplicate=await env.DB.prepare('SELECT record,revision,pdf_key FROM shared_books WHERE hash=?').bind(hash).first<{record:string;revision:number;pdf_key:string}>();
    if(duplicate){
      if(bytes&&!duplicate.pdf_key){
        const existing=JSON.parse(duplicate.record);key=`books/${existing.id}/${crypto.randomUUID()}.pdf`;await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'application/pdf'}});
        const attached=await env.DB.prepare('UPDATE shared_books SET pdf_key=?,revision=revision+1 WHERE id=? AND pdf_key=? RETURNING revision').bind(key,existing.id,'').first<{revision:number}>();
        if(attached){duplicate.pdf_key=key;duplicate.revision=attached.revision;}else await env.BUCKET.delete(key);
        key=undefined;
      }
      return json({book:{...JSON.parse(duplicate.record),revision:duplicate.revision,...(duplicate.pdf_key?{pdfUrl:`/api/library/${JSON.parse(duplicate.record).id}/pdf`}:{})},duplicate:true});
    }
    const book={...parsed.data,hash,size:file instanceof File?file.size:parsed.data.size,addedAt:legacy?parsed.data.addedAt:new Date().toISOString()};delete book.revision;
    if(bytes){key=`books/${book.id}/${crypto.randomUUID()}.pdf`;await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'application/pdf'}});}
    const saved=await env.DB.prepare('INSERT INTO shared_books (id,hash,record,pdf_key,revision,updated_at) SELECT ?,?,?,?,1,? WHERE (SELECT COUNT(*) FROM shared_books)<50 ON CONFLICT DO NOTHING RETURNING id').bind(book.id,hash,JSON.stringify(book),key||'',new Date().toISOString()).first();
    if(!saved){if(key)await env.BUCKET.delete(key);key=undefined;return json({error:'The shared library is full, or this book was just added by another tester. Refresh the library.'},409);}
    return json({book:{...book,revision:1,...(key?{pdfUrl:`/api/library/${book.id}/pdf`}:{})}},201);
  }catch{if(key)await env.BUCKET.delete(key);return json({error:'The book could not be saved. Check the PDF and retry.'},400);}
}
