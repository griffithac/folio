import { env } from 'cloudflare:workers';
import { sharedBookSchema, sameOrigin, json, limitedBody, MAX_BOOK_METADATA } from '@/lib/shared';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function PUT(request:Request,context:Context){
  if(!sameOrigin(request))return json({error:'Use Folio to edit shared books.'},403);
  if(!env.DB)return json({error:'Shared library is unavailable.'},503);
  try{
    const {id}=await context.params;const body=await (await limitedBody(request,MAX_BOOK_METADATA)).json();const parsed=sharedBookSchema.safeParse(body);
    if(!parsed.success||parsed.data.id!==id||!parsed.data.revision)return json({error:'Valid book details and a revision are required.'},400);
    const current=await env.DB.prepare('SELECT hash,record,pdf_key FROM shared_books WHERE id=?').bind(id).first<{hash:string;record:string;pdf_key:string}>();
    if(!current)return json({error:'This book has been removed from the shared library.'},404);
    const original=JSON.parse(current.record);const book={...parsed.data,hash:current.hash,size:original.size,filename:original.filename,addedAt:original.addedAt};const revision=book.revision;delete book.revision;
    const saved=await env.DB.prepare('UPDATE shared_books SET record=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? RETURNING revision').bind(JSON.stringify(book),new Date().toISOString(),id,revision).first<{revision:number}>();
    if(!saved)return json({error:'Another tester updated this book. Reload its details before saving.'},409);
    return json({book:{...book,revision:saved.revision,...(current.pdf_key?{pdfUrl:`/api/library/${id}/pdf`}:{})}});
  }catch{return json({error:'Changes could not be saved. Please retry.'},400);}
}
export async function DELETE(request:Request,context:Context){
  if(!sameOrigin(request))return json({error:'Use Folio to remove shared books.'},403);
  if(!env.DB||!env.BUCKET)return json({error:'Shared library is unavailable.'},503);
  const {id}=await context.params;
  // Check revision so a stale dialog cannot remove a newly edited book.
  const revision=Number(new URL(request.url).searchParams.get('revision'));
  if(!Number.isInteger(revision)||revision<1)return json({error:'A current revision is required.'},400);
  const removed=await env.DB.prepare('DELETE FROM shared_books WHERE id=? AND revision=? RETURNING pdf_key').bind(id,revision).first<{pdf_key:string}>();
  if(!removed)return json({error:'This book changed or was removed. Refresh the library.'},409);
  if(removed.pdf_key)await env.BUCKET.delete(removed.pdf_key);return json({removed:true});
}
