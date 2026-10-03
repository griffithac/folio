import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { budgetSamples } from '../lib/evidence.ts';
import { sampledPageNumbers, type Book, type ReferenceLabels } from '../lib/catalog.ts';
import { sharedBookSchema } from '../lib/shared.ts';
const origin=process.argv[2];if(!origin || !/^https?:\/\//.test(origin))throw new Error('Pass the target Folio origin.');
const report=JSON.parse(await readFile('outputs/benchmark-v3-full.json','utf8'));
const expected:Record<number,string>={14838:'Children’s fiction',11:'Fantasy',14790:'Literary fiction',148:'Memoir',1342:'Romance',35:'Science fiction',1661:'Crime & mystery',345:'Horror'};
const measures:Record<number,{value:string;q:number}>={14838:{value:'4.2',q:15796},11:{value:'7.4',q:52290},1342:{value:'12.0',q:714},35:{value:'7.4',q:12799}};
for(const record of report.books) {
  const bytes=await readFile(record.pdf);const pages=execFileSync('pdftotext',['-enc','UTF-8',record.pdf,'-'],{maxBuffer:10000000}).toString().split('\f');if(!pages.at(-1)?.trim())pages.pop();
  const samples=budgetSamples(pages.map((text,i)=>({page:i+1,text:text.trim()})).filter(s=>s.text&&sampledPageNumbers(pages.length).includes(s.page)));
  const measure=measures[record.pdfId];
  const reference:ReferenceLabels={status:'provisional',sourceName:record.pdfId===148?'Library of Congress Franklin guide + Gutenberg language metadata':'Project Gutenberg catalog subjects / language; Folio subject crosswalk',sourceUrl:record.pdfId===148?'https://guides.loc.gov/finding-benjamin-franklin/autobiography':record.source,scope:'work',edition:record.scope,notes:'Work-level catalog headings mapped to the selected broad Thema subjects. This mapping awaits independent review. No expert reading-band or setting label has been supplied. Generated PDF edition and pagination differ from commercial editions. '+(record.pdfId===14790?'The source catalog describes a French collection; this fixture contains only La Parure.':''),labels:{genre:expected[record.pdfId],language:record.pdfId===14790?'French':'English'},split:'development',updatedAt:new Date().toISOString(),...(measure?{readingMeasure:{system:'ATOS' as const,value:measure.value,sourceUrl:`https://www.arbookfind.com/bookdetailprint.aspx?l=EN&q=${measure.q}`,edition:'Official Renaissance entry for this original/unabridged work. Exact Gutenberg-text-to-listed-edition match has not been verified; this score is not certified for the generated PDF.'}}:{})};
  const book:Book={id:randomUUID(),hash:createHash('sha256').update(bytes).digest('hex'),title:record.title,author:record.author,filename:`${record.title}.pdf`,pageCount:pages.length,size:bytes.length,addedAt:new Date().toISOString(),samples,status:'complete',evidenceStrategy:'distributed-pages-and-within-page-v1',sourceUrl:record.source,reference,result:{...record.sample.result,evidence:{strategy:'distributed-pages-and-within-page-v1',pages:samples.map(s=>s.page),characters:samples.reduce((n,s)=>n+s.text.length,0),questionCount:report.questionCount}}};
  sharedBookSchema.parse(book);
  const form=new FormData();form.set('book',JSON.stringify(book));form.set('pdf',new File([bytes],book.filename,{type:'application/pdf'}));
  const response=await fetch(`${origin}/api/library`,{method:'POST',body:form});const data=await response.json() as {book?:Book;duplicate?:boolean;error?:string};
  if(!response.ok)throw new Error(`${book.title}: ${response.status} ${data.error}`);
  console.log(JSON.stringify({title:book.title,status:response.status,duplicate:Boolean(data.duplicate),id:data.book?.id}));
}
