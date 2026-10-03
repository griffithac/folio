# Folio — Book Classifier

Folio reads PDF books in the browser and uses TypeSafe Jev to suggest their subject/genre, narrower subject, language, reading complexity, and narrative setting period. The app supports multiple uploads, thumbnails, duplicate detection, search and filters, uncertainty review, manual correction, and JSON export. An original sample PDF lets testers exercise the real pipeline.

The public beta intentionally stores each tester’s library on their own device. It has no accounts or cross-device sync. PDFs are never uploaded to the server. Browser storage contains metadata, thumbnails, sampled excerpts, and results. Only those excerpts and supporting metadata are sent to Folio’s classification endpoint and TypeSafe. The server database stores aggregate daily request counts, not books. Removing a book clears its saved browser record. Exports exclude the thumbnail and excerpt text.

## Run locally

Requires Node 22.13 or newer and pnpm 11.19.

```sh
pnpm install
cp .env.example .dev.vars
# Fill TYPESAFE_API_KEY in .dev.vars; never commit this file.
pnpm run db:generate  # Only after changing the database schema.
pnpm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_famous_warbound.sql
pnpm run dev
```

Apply that initial migration once per local database. The database is shared by dev and production previews through `.wrangler/state`. To preview the compiled Worker, copy the ignored `.dev.vars` to `dist/server/.dev.vars`, then run `pnpm run start` (normally port 8787). Deployment through Sites applies hosted schema migrations separately. Never replay migrations already applied to a database.

`pnpm run typecheck` checks TypeScript. `pnpm run test` runs offline tests with no billable requests. The SDK’s custom transport is used to verify the typed API contract.

## Hosting and configuration

`.openai/hosting.json` records the Sites project ID and D1 binding. Preserve the ID when publishing updates. The site’s audience is public at the user’s request. Configure runtime values with Sites environment-variable tools, then deploy to apply the environment revision:

- `TYPESAFE_API_KEY`: secret, server only. The supplied project key has been configured in Sites, never in source or browser code.
- `TYPESAFE_MODEL`: `jev-latest` by default. The actual model ID is recorded with every result; pin a verified version for reproducible benchmarks.
- `CLASSIFICATION_DAILY_LIMIT`: 250 requests per UTC day across the public test site. The atomic D1 quota also counts failed upstream requests. This protects the shared project key but is not a per-person entitlement.

The public health endpoint reports only whether Jev is configured, not its credentials. Classification accepts bounded JSON, validates excerpt lengths and page numbers, rejects cross-origin browser submissions, validates every returned probability distribution and taxonomy key, and gives recoverable errors. SDK request-body logging is disabled.

## Standards research — verified October 3, 2026

A book’s subject, literary genre, language, reading complexity, and audience are distinct dimensions. There is no single standard that supplies them all.

| Dimension | Industry vocabulary or measure | Recommendation and prototype behavior |
| --- | --- | --- |
| North American publishing subjects | [BISAC, maintained by BISG](https://www.bisg.org/complete-bisac-subject-headings-list) | Use for publisher/retailer interoperability. The official currently published list is the 2025 edition. Preserve exact codes, edition, primary subject and additional subjects. BISG distinguishes free online selection from licensing the complete list for incorporation into business systems. No full BISAC list is embedded in this app. |
| International publishing subjects | [Thema 1.6, EDItEUR](https://ns.editeur.org/thema/en) | Used here: 30 selected broad categories and their 27 nonempty immediate-child branches, plus explicit no-match options. Each result includes its verified code, canonical heading, and version. These are provisional broad primary-subject suggestions, not complete or certified Thema catalog assignments. Full adoption needs the hierarchy, narrower categories, multiple applicable subjects, qualifiers and usage notes. |
| Library literary genres/forms | [Library of Congress Genre/Form Terms](https://www.loc.gov/catdir/cpso/genreformgeneral.html) | Appropriate if library interoperability is the goal. LCGFT describes what a work is, separately from what it is about. Keep authorized term/URI separate from subject codes. Not implemented in this beta. |
| Language | [ISO 639-1 and ISO 639-2, Library of Congress code table](https://www.loc.gov/standards/iso639-2/php/code_list.php) | Implemented for 56 named languages plus `mul` (multiple languages) and `und` (undetermined). Exports include two-letter codes where available and ISO 639-2 terminology codes (`fra`, `deu`, `zho`, etc.). Chinese is a broad macrolanguage label; this beta does not identify individual Chinese varieties or script. Unlisted languages are undetermined rather than forced into another language. |
| School reading difficulty | [Lexile / MetaMetrics](https://hub.lexile.com/text-analyzer-user-guide/) and [ATOS / Renaissance](https://www.renaissance.com/edword/atos/) | Use independently obtained measures for the matching edition as benchmark references. Jev does not produce a genuine Lexile or ATOS measurement. MetaMetrics distinguishes estimated classroom ranges from commercial and certified measures. Renaissance’s ATOS analyzer and Bookfinder provide a separate route to ATOS levels. This beta reports only explicitly labeled Jev estimates. |
| Language learner proficiency | [CEFR, Council of Europe](https://www.coe.int/en/web/portfolio/the-common-european-framework-of-reference-%20for-languages-learning-teaching-assessment-cefr-) | Relevant for graded readers and second-language proficiency, not interchangeable with school grade or a general book difficulty measure. A separate optional CEFR task would need its own evaluation set and reading-comprehension rubric. Not implemented here. |

[Thema’s usage rules](https://ns.editeur.org/thema/en/5TFB) call for a primary subject, enough additional subjects to describe the work, appropriate specificity, and relevant qualifiers. Ancestor and descendant codes should not both be assigned as equivalent subjects. The current broad Choice and scoped narrower Choices are a testing prototype; it should not be presented as complete distributor metadata.

[ATOS distinguishes book difficulty, tested reader ability, and interest level](https://arhelp.renaissance.com/hc/en-us/articles/12630557859227-Levels-Book-Interest-and-Reading). A difficult text need not have mature themes, and an easy text need not be appropriate for young children. Folio’s rubric judges vocabulary and syntax, not content suitability. No age recommendation or certified score is inferred.

## What to test against

Start with a separately labeled, held-out set of real books. The synthetic sample PDF and automated code tests are engineering checks, not evidence of classification accuracy.

1. **Subjects:** use publisher-assigned Thema/BISAC metadata for the matching edition. Cover fiction genres and nonfiction subjects, children’s and adult books, hybrid genres and books outside the selected subset. Record all applicable gold subjects. Compare broad predictions with appropriate ancestors; do not count a broad match as a correct leaf assignment. Report per-category precision/recall, macro F1, fallback rate, and reviewed-versus-automatic coverage. For full taxonomy support, follow TypeSafe’s [hierarchical classification cookbook](https://docs.typesafe.ai/cookbooks/hierarchical_classification).
2. **Languages:** use verified ISO codes, include English, Spanish, French, German, CJK and RTL scripts, multilingual books, and languages outside the supported subset. Measure accuracy separately by language and distinguish mixed-language books from books containing short foreign quotations. Test the actual edition/translation, not the language of an original work. TypeSafe notes stronger performance on English in its [current model documentation](https://docs.typesafe.ai/models).
3. **Reading complexity:** cover all six estimated bands with independently measured books, and record available Lexile and ATOS values separately alongside edition, source and language. Define a comparison rule before testing; these scales are not directly convertible or certifications of Folio’s output. Have educators independently review Jev bands. For educator band labels, report weighted agreement and an ordinal error distribution, including adjacent-band errors. Do not turn model confidence into an accuracy claim.
4. **Sampling:** compare the current up-to-18-page excerpts with fuller evidence on a smaller reference set. Include front matter-heavy books, appendices, technical figures, poetry and short picture books. Investigate errors caused by missing evidence separately from model mistakes.
5. **Files and behavior:** searchable versus scanned PDFs, locked and malformed files, file-size limits, duplicate uploads, interrupted requests and reloads, unavailable API key, rate limits, exports, corrections, keyboard navigation and mobile layouts.
6. **Reproducibility:** save model ID, taxonomy version, question/rubric version, excerpt page numbers, raw probabilities, reviewer corrections and evaluation date. Keep model predictions distinct from human corrections. Tune thresholds on a development split, then report performance once on the held-out split. The default review threshold of 0.7 is a starting policy, not a validated optimum.

## Current limits

- Searchable PDFs only; OCR is not implemented. At least 200 characters must be extracted.
- 25 MB per PDF, 10 files per batch, 50 stored books per browser.
- PDFs of up to 18 pages use all extracted text when the evidence JSON fits 20 KB. Larger works use up to 18 distributed pages and 1,000 characters per page, including beginning/middle/ending passages within long pages. A 20 KB UTF-8 sampling budget bounds multibyte scripts. Byte guards reserve room below the provider context limits; they are not exact tokenizer counts.
- Six estimated literacy bands: early reader (K–2), elementary (3–5), middle school (6–8), high school (9–12), college/adult, specialist.
- One selected broad Thema category and one immediate narrower subject when supported. This is not a multi-label full-taxonomy classifier.
- Local browser storage can be cleared or fill up. Exports preserve results but cannot currently be imported into another browser.
- The original PDF is not retained. To redo extraction, upload it again. Saved extracted text allows classification retries.
- Confidence is provider output, not a measured success rate. Human corrections do not overwrite the original judgment.

The integration uses [TypeSafe’s official JavaScript SDK](https://docs.typesafe.ai/sdk/javascript) and [agent skill](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md). The skill was fetched into `.agents/skills/typesafe-ai/SKILL.md` for this project.

## One-pass questions and context strategy

Each app classification uses one `systemOne` request with 31 independent questions: primary subject, dominant language, literacy complexity, story setting, and 27 scoped subject branches. Questions cannot read another answer. The app consumes only the narrower answer associated with the chosen primary subject. Leaf parents without children stay at their own code. Unspecified subcategories remain unassigned; lower confidence routes to human review. The context checks include all fanout questions. Jev's documented limits are 64k tokens total and 32k for state plus the longest question ([models](https://docs.typesafe.ai/models)); English is strongest.

Story setting has independent choices for BC/BCE, 1–499 CE, 500–1499, centuries from 1500s through the present, the future, multiple periods, imaginary/timeless settings, and not applicable/uncertain. These are prototype temporal bins, not full Thema time qualifiers. Dates describe narrated events, not publication.

## Public-domain pilot

Actual Jev 1.13.0 calls compared four works: [Peter Rabbit](https://www.gutenberg.org/ebooks/14838), [Alice in Wonderland](https://www.gutenberg.org/ebooks/11), [La Parure from its collection](https://www.gutenberg.org/ebooks/14790), and [Franklin's autobiography](https://www.gutenberg.org/ebooks/148). Their source catalog pages list public-domain status in the USA. The site exposes the generated searchable test PDFs and results at `/testing`; only original text is reproduced, excluding source images and the Gutenberg license wrapper. Pagination is specific to these test PDFs.

Subject, narrower subject where applicable, language, and setting agreed for all four. Reading bands agreed for three. La Parure was high school with distributed samples and college/adult with full text. Peter Rabbit and La Parure fit one full-text request; Alice used 8 full-coverage chunks and Franklin 20. Chunk probabilities were averaged by character count. Aggregate support is not Jev confidence; chunking has its own loss of cross-chunk context. This is an exploratory method-agreement pilot, not a measured accuracy score or a validated sampling policy. The full app now prefers full text for small works that fit.

Reproduce with `python3 scripts/prepare-corpus.py` (requires reportlab), then `node --experimental-strip-types scripts/benchmark.ts`. Requires `pdftotext` and server-side `TYPESAFE_API_KEY` or ignored `.dev.vars`. The benchmark makes billable calls, pins `jev-1.13.0` by default, and writes probabilities, usage, extracted character counts and per-dimension agreements to ignored `outputs/benchmark.json`. It reuses exactly the production question builder and normalizer. Public summary: `public/benchmarks.json`. Original fixtures and metadata remain under `outputs/corpus`. Do not silently truncate long baseline text or call a chunked baseline a single full-context inference.
