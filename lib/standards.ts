// Selected broad Thema 1.6 categories, verified 2026-10-03 against EDItEUR.
// Canonical headings are distinct from the abbreviated UI labels.
export const THEMA = [
  {
    "code": "FB",
    "label": "Literary fiction",
    "heading": "Fiction: literary and general non-genre",
    "url": "https://ns.editeur.org/thema/en/FB"
  },
  {
    "code": "FM",
    "label": "Fantasy",
    "heading": "Fantasy",
    "url": "https://ns.editeur.org/thema/en/FM"
  },
  {
    "code": "FL",
    "label": "Science fiction",
    "heading": "Science fiction",
    "url": "https://ns.editeur.org/thema/en/FL"
  },
  {
    "code": "FF",
    "label": "Crime & mystery",
    "heading": "Crime and / or mystery fiction",
    "url": "https://ns.editeur.org/thema/en/FF"
  },
  {
    "code": "FH",
    "label": "Thriller & suspense",
    "heading": "Thriller / suspense fiction",
    "url": "https://ns.editeur.org/thema/en/FH"
  },
  {
    "code": "FR",
    "label": "Romance",
    "heading": "Romance",
    "url": "https://ns.editeur.org/thema/en/FR"
  },
  {
    "code": "FV",
    "label": "Historical fiction",
    "heading": "Historical fiction",
    "url": "https://ns.editeur.org/thema/en/FV"
  },
  {
    "code": "FK",
    "label": "Horror",
    "heading": "Horror, ghost stories and supernatural fiction",
    "url": "https://ns.editeur.org/thema/en/FK"
  },
  {
    "code": "FJ",
    "label": "Adventure",
    "heading": "Adventure / action fiction",
    "url": "https://ns.editeur.org/thema/en/FJ"
  },
  {
    "code": "YFB",
    "label": "Children’s fiction",
    "heading": "Children’s / Teenage fiction: General, modern and contemporary fiction",
    "url": "https://ns.editeur.org/thema/en/YFB"
  },
  {
    "code": "DNB",
    "label": "Biography",
    "heading": "Biography: general",
    "url": "https://ns.editeur.org/thema/en/DNB"
  },
  {
    "code": "DNC",
    "label": "Memoir",
    "heading": "Memoirs",
    "url": "https://ns.editeur.org/thema/en/DNC"
  },
  {
    "code": "NH",
    "label": "History",
    "heading": "History",
    "url": "https://ns.editeur.org/thema/en/NH"
  },
  {
    "code": "PD",
    "label": "Science",
    "heading": "Science: general issues",
    "url": "https://ns.editeur.org/thema/en/PD"
  },
  {
    "code": "WN",
    "label": "Nature",
    "heading": "Nature and the natural world: general interest",
    "url": "https://ns.editeur.org/thema/en/WN"
  },
  {
    "code": "PB",
    "label": "Mathematics",
    "heading": "Mathematics",
    "url": "https://ns.editeur.org/thema/en/PB"
  },
  {
    "code": "KJ",
    "label": "Business",
    "heading": "Business and Management",
    "url": "https://ns.editeur.org/thema/en/KJ"
  },
  {
    "code": "KC",
    "label": "Economics",
    "heading": "Economics",
    "url": "https://ns.editeur.org/thema/en/KC"
  },
  {
    "code": "VS",
    "label": "Self-development",
    "heading": "Self-help, personal development and practical advice",
    "url": "https://ns.editeur.org/thema/en/VS"
  },
  {
    "code": "QD",
    "label": "Philosophy",
    "heading": "Philosophy",
    "url": "https://ns.editeur.org/thema/en/QD"
  },
  {
    "code": "QR",
    "label": "Religion",
    "heading": "Religion and beliefs",
    "url": "https://ns.editeur.org/thema/en/QR"
  },
  {
    "code": "TB",
    "label": "Technology",
    "heading": "Technology: general issues",
    "url": "https://ns.editeur.org/thema/en/TB"
  },
  {
    "code": "UM",
    "label": "Programming & software engineering",
    "heading": "Computer programming / software engineering",
    "url": "https://ns.editeur.org/thema/en/UM"
  },
  {
    "code": "UY",
    "label": "Computing",
    "heading": "Computer science",
    "url": "https://ns.editeur.org/thema/en/UY"
  },
  {
    "code": "DC",
    "label": "Poetry",
    "heading": "Poetry / Poems",
    "url": "https://ns.editeur.org/thema/en/DC"
  },
  {
    "code": "DD",
    "label": "Drama",
    "heading": "Plays, playscripts, drama",
    "url": "https://ns.editeur.org/thema/en/DD"
  },
  {
    "code": "WB",
    "label": "Cooking",
    "heading": "Cookery / food and drink / food writing / cookbooks",
    "url": "https://ns.editeur.org/thema/en/WB"
  },
  {
    "code": "WT",
    "label": "Travel",
    "heading": "Travel and holiday",
    "url": "https://ns.editeur.org/thema/en/WT"
  },
  {
    "code": "JN",
    "label": "Education",
    "heading": "Education / Educational sciences / Pedagogy",
    "url": "https://ns.editeur.org/thema/en/JN"
  },
  {
    "code": "AB",
    "label": "Art",
    "heading": "The arts: general topics",
    "url": "https://ns.editeur.org/thema/en/AB"
  },
  {
    "code": "VFD",
    "label": "Health",
    "heading": "Popular medicine and health",
    "url": "https://ns.editeur.org/thema/en/VFD"
  }
] as const;

export const TAXONOMY_VERSION = "thema-1.6-folio-subjects-v4";
export function themaForLabel(label: string) { return THEMA.find(item => item.label === label); }

// Full Library of Congress catalog, using ISO 639-2 terminology codes.
export { LANGUAGE_CODES, languageCodes } from './language-catalog.ts';
