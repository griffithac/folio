"""Download three Gutenberg texts and typeset text-only benchmark PDFs.
Requires reportlab. Generated files stay under ignored outputs/corpus.
"""
from pathlib import Path
import re, json, urllib.request
from html import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
root=Path('outputs/corpus'); root.mkdir(parents=True,exist_ok=True)
books=[]
for n,title,author,lang in [(14838,'The Tale of Peter Rabbit','Beatrix Potter','English'),(11,'Alice’s Adventures in Wonderland','Lewis Carroll','English'),(14790,'La Parure','Guy de Maupassant','French'),(148,'The Autobiography of Benjamin Franklin','Benjamin Franklin','English'),(1342,'Pride and Prejudice','Jane Austen','English'),(35,'The Time Machine','H. G. Wells','English'),(1661,'The Adventures of Sherlock Holmes','Arthur Conan Doyle','English'),(345,'Dracula','Bram Stoker','English')]:
 source=root/f'pg{n}.txt'; url=f'https://www.gutenberg.org/cache/epub/{n}/pg{n}.txt'
 if not source.exists(): source.write_text(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=30).read().decode('utf-8-sig'))
 text=source.read_text()
 text=re.split(r'\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*',text,flags=re.I)[-1]
 text=re.split(r'\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK',text,flags=re.I)[0]
 if n==14790:
  start=text.index('LA PARURE'); end=text.index('LE BONHEUR',start); text=text[start:end]
 text=re.sub(r'\[(?:Illustration|image)[^\]]*\]', '',text,flags=re.I)
 text=re.sub(r'\n{3,}','\n\n',text).strip()
 path=root/f'{n}.pdf'; style=getSampleStyleSheet()['BodyText'];style.fontSize=11;style.leading=16
 story=[]
 for para in text.split('\n\n'):
  para=' '.join(para.split())
  if para: story += [Paragraph(escape(para),style),Spacer(1,8)]
 SimpleDocTemplate(str(path),title=title,author=author,leftMargin=50,rightMargin=50,topMargin=50,bottomMargin=50).build(story)
 books.append({'title':title,'author':author,'language':lang,'source':f'https://www.gutenberg.org/ebooks/{n}','textSource':url,'pdf':str(path),'scope':'La Parure story only, extracted from the collection' if n==14790 else 'Entire work, excluding Gutenberg license and illustrations','textCharacters':len(text)})
 print(title,len(text))
(root/'manifest.json').write_text(json.dumps(books,ensure_ascii=False,indent=2))
