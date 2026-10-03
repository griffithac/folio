import { cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
mkdirSync('public', { recursive: true });
cpSync(path.join(root, 'build/pdf.worker.min.mjs'), 'public/pdf.worker.min.mjs');
cpSync(path.join(root, 'cmaps'), 'public/pdf-cmaps', { recursive: true });
cpSync(path.join(root, 'standard_fonts'), 'public/pdf-fonts', { recursive: true });
