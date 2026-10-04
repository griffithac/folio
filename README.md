# Folio — Book Classifier

Folio reads PDF books in the browser and uses TypeSafe Jev to suggest their subject/genre, narrower subject, language, reading complexity, and narrative setting period. The app supports multiple uploads, thumbnails, duplicate detection, search and filters, uncertainty review, manual correction, and JSON export. An original sample PDF lets testers exercise the real pipeline.

The public beta uses **one shared public workspace**. D1 retains book records, sampled text, Jev predictions, human corrections, reference labels and revisions. R2 retains uploaded PDFs. Everyone with the link can see, download, edit and remove books. The API key remains server-only. Deletion removes the shared record and PDF. Earlier browser-beta results are migrated when that browser opens the updated library; the earlier beta did not retain originals, so those PDFs must be reuploaded to attach them. Concurrent writes use revision checks to avoid overwriting another tester’s edits. This public demo is separate from the private customer workspaces needed for a commercial product.

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

Apply each pending migration once per local database, including `drizzle/0001_bizarre_sage.sql` for shared books. The database is shared by dev and production previews through `.wrangler/state`. To preview the compiled Worker, copy the ignored `.dev.vars` to `dist/server/.dev.vars`, then run `pnpm run start` (normally port 8787). Deployment through Sites applies hosted schema migrations separately. Never replay migrations already applied to a database.

`pnpm run typecheck` checks TypeScript. `pnpm run test` runs offline tests with no billable requests. The SDK’s custom transport is used to verify the typed API contract.

## Hosting and configuration

`.openai/hosting.json` records the Sites project ID, D1 and R2 bindings. Preserve the ID when publishing updates. The site’s audience is public at the user’s request. Configure runtime values with Sites environment-variable tools, then deploy to apply the environment revision:

- `TYPESAFE_API_KEY`: secret, server only. The supplied project key has been configured in Sites, never in source or browser code.
- `TYPESAFE_MODEL`: `jev-latest` by default. The actual model ID is recorded with every result; pin a verified version for reproducible benchmarks.
- `CLASSIFICATION_DAILY_LIMIT`: 250 requests per UTC day across the public test site. The atomic D1 quota also counts failed upstream requests. This protects the shared project key but is not a per-person entitlement.

The public health endpoint reports only whether Jev is configured, not its credentials. Classification accepts bounded JSON, validates excerpt lengths and page numbers, rejects cross-origin browser submissions, validates every returned probability distribution and taxonomy key, and gives recoverable errors. SDK request-body logging is disabled.

## Standards research — verified October 3, 2026

A book’s subject, literary genre, language, reading complexity, and audience are distinct dimensions. There is no single standard that supplies them all.

| Dimension | Industry vocabulary or measure | Recommendation and prototype behavior |
| --- | --- | --- |
| North American publishing subjects | [BISAC, maintained by BISG](https://www.bisg.org/complete-bisac-subject-headings-list) | Use for publisher/retailer interoperability. The official currently published list is the 2025 edition. Preserve exact codes, edition, primary subject and additional subjects. BISG distinguishes free online selection from licensing the complete list for incorporation into business systems. No full BISAC list is embedded in this app. |
| International publishing subjects | [Thema 1.6, EDItEUR](https://ns.editeur.org/thema/en) | The initial pass uses 31 selected broad categories and 28 immediate-child branches. The automatic detailed pass searches all 3,422 subject nodes in 20 sections, explores multiple branches, and retains independently supported subjects with exact source passages. Official codes, headings, source version and scope notes are preserved. Qualifiers and certified catalog assignments remain separate work. |
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
- 25 MB per PDF, 10 files per batch, 50 books in the shared workspace.
- PDFs of up to 18 pages use all extracted text when the evidence JSON fits 14 KB. Larger works use up to 18 distributed pages and 1,000 characters per page, including beginning/middle/ending passages within long pages. A 14 KB UTF-8 evidence budget bounds multibyte scripts. Byte guards reserve room below the provider context limits; they are not exact tokenizer counts.
- Six estimated literacy bands: early reader (K–2), elementary (3–5), middle school (6–8), high school (9–12), college/adult, specialist.
- The detailed subject search explores at most six candidate paths per depth and two broader-parent fallback rounds. Search pruning is disclosed, so multiple returned subjects are not a guarantee of exhaustive per-book recall. Thema qualifiers are retained in the official data but are not assigned yet.
- PDFs and results persist across browsers in the shared public workspace. This beta has no user accounts or edit permissions; anyone with the link can change records.
- Original PDFs uploaded after the shared-workspace update are retained. Earlier results require the same PDF to be reuploaded to attach an original.
- Confidence is provider output, not a measured success rate. Human corrections do not overwrite the original judgment.

The integration uses [TypeSafe’s official JavaScript SDK](https://docs.typesafe.ai/sdk/javascript) and [agent skill](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md). The skill was fetched into `.agents/skills/typesafe-ai/SKILL.md` for this project.

## One-pass questions and context strategy

Each app classification uses one `systemOne` request with 70 independent questions: primary subject, dominant language, literacy complexity, story setting, 28 scoped subject branches, book form, intended audience, assumed technical experience, 21 technical-language presence questions and 14 computing-topic presence questions. Questions cannot read another answer. The app consumes only the narrower answer associated with the chosen primary subject. Leaf parents without children stay at their own code. Unspecified subcategories remain unassigned; lower confidence routes to human review. The context checks include all fanout questions. Jev's documented limits are 64k tokens total and 32k for state plus the longest question ([models](https://docs.typesafe.ai/models)); English is strongest.

Story setting includes prehistory, ancient BCE, early CE, medieval subdivisions, centuries, two nineteenth-century halves, each twentieth-century decade and contemporary decades, plus broad fallback periods, the future, multiple periods, imaginary/timeless settings and uncertainty. The question prefers the finest period supported by the excerpts. These are prototype temporal bins, not full Thema time qualifiers. Dates describe narrated events, not publication.

## Detailed subjects across all books

New classifications automatically search the complete unmodified [Thema 1.6 source](https://www.editeur.org/files/Thema/1.6/v1.6_en/20250410_Thema_v1.6_en.json), covering 3,422 subject nodes in 20 sections. Existing books can use “Find detailed subject” or “Refine subject again.” The source retains all original qualifiers, exact codes, canonical headings and scope notes and is attributed to EDItEUR under its [license](https://doi.org/10.4400/nwgj). The copied license is in `lib/data/EDITEUR-LICENSE.txt`; supplementary Folio tags remain separate.

The detailed pass uses up to six parallel candidate branches at each depth, with a separate section-applicability judgment so secondary subjects are not forced to compete as exclusive labels. Choice distributions guide the bounded search. Length-normalized path scores rank candidates and are **not** calibrated correctness probabilities. Root sections are never assigned as book subjects. Multiple verified descendants replace redundant ancestor suggestions.

Final candidates must pass two separate Jev Noul checks at the same pilot threshold of 0.8: substantial book-level subject support and direct support in the selected source passage. Code selects and copies exact passages by PDF page and source offsets; it never asks Jev to generate a quote. Shared-record validation rejects fabricated quotations, invalid official paths, invented headings, inconsistent assignments and mismatched evidence. Artificial sampling-gap markers are excluded from quotations. A failed narrow subject can fall back to an independently checked official parent without lowering the support threshold. Children's codes require evidence of a younger audience, not merely the word “textbook.” These are model support checks, **not independent expert validation**.

The search uses at most twelve requests, all counted against the public daily quota. Context guards and automatic question batching bound each request. A model-version change during a search fails closed. Unresolved or pruned alternatives remain visible and route the book to review. Review approval is kept separate from raw candidate probabilities and external reference labels. This is a multi-subject suggestion system over the full subject taxonomy, not a certified or guaranteed complete publisher catalog record.

`node --experimental-strip-types scripts/subject-benchmark.ts` runs original developer regression fixtures across all twenty subject sections plus mixed subjects, printed prompt injection, and uninformative front matter. It requires the ignored server key, pins Jev 1.13.0 by default, records actual responses/usage, and caches by exact model/state/questions in ignored `outputs/subject-response-cache`. Developer fixtures demonstrate workflow coverage and known regressions; they do not estimate accuracy on real books.

Supplementary metadata includes form, suggested intended audience (based on selected ONIX audience concepts), and independent technical tags. Natural language stays separate from code languages; HTML and CSS are explicitly markup/style languages. The 0.7 yes-probability display threshold is an unvalidated pilot policy. Audience is not a content-suitability guarantee. Technical prerequisites and prose difficulty are separate fields. ISBN, edition, publication date, publisher and series should come from verifiable source metadata; the app does not invent them.

## Public-domain pilot

The current report compares eight works spanning children’s fiction, fantasy, literary fiction, memoir, romance, science fiction, mystery and horror. Searchable text PDFs and sampled Jev results are preloaded in the shared workspace. Generated PDFs omit illustrations and the Gutenberg wrapper. Project Gutenberg lists their public-domain status in the USA; that is not a claim of worldwide status.

`/testing` shows actual Jev 1.13.0 method comparisons, per-dimension agreements, disagreements, evidence coverage and request counts using the v3 questions. Every extracted baseline character is covered by consecutive chunks when it cannot fit one request. Probabilities are averaged by character count; this aggregate support is not provider confidence. Full coverage in chunks has its own loss of cross-chunk context. Method agreement is not accuracy. Setting disagreements for Austen and Wells and reading-band disagreements for French prose and Sherlock Holmes illustrate why the sampling policy needs broader evaluation.

`/validation` compares uncorrected predictions with separately recorded reference labels. Initial catalog/publisher mappings are **provisional**, pending independent review; no expert-validated accuracy is claimed. A reference records its source, scope, edition, review status and development/holdout split. Only supplied verified labels enter verified-reference metrics. Published ATOS/Lexile measures are shown separately, without conversion to a Jev band. Initial ATOS references include Peter Rabbit (4.2), Alice (7.4), Pride and Prejudice (12.0), and The Time Machine (7.4), with official Renaissance links and edition-match caveats. They do not certify these generated Gutenberg PDFs.

Reproduce with `python3 scripts/prepare-corpus.py` (requires reportlab), then `node --experimental-strip-types scripts/benchmark.ts`. Requires `pdftotext` and server-side `TYPESAFE_API_KEY` or ignored `.dev.vars`. Benchmark calls are billable, pin `jev-1.13.0`, and record probabilities, usage and method agreements in ignored `outputs`. `public/benchmarks.json` contains a shareable summary. Use `scripts/seed-library.ts <site-origin>` to preload the known test PDFs through the ordinary API; it deduplicates by file fingerprint and never overwrites tester corrections.

## Completion audit for the robust-classification goal

Implemented and checked: complete subject taxonomy coverage; multiple candidate paths and subject suggestions; canonical-code validation; independent dimensions in one initial pass; exact source passages and support gates; bounded context and request budgets; official parent fallback; shared persistence, optimistic concurrency, deletion and raw-result/reference separation; reproducible regression and sampling tests.

Still required before claiming exhaustive, validated classification: independently adjudicated multi-label reference books and untouched holdout evaluation; precision/recall and unsupported-label analysis by subject and language; broader sampling/full-text evaluation for long and uneven books; official place/time/interest/education/style qualifiers; expanded language handling beyond the selected 56 languages; reading-band validation independent of audience and technical prerequisites; handling scans, complex layouts, missing text and image-dependent works; and measured/calibrated review policies. The active goal remains incomplete. No test suite or confidence threshold alone proves universal correctness.
