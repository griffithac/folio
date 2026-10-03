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

export const TAXONOMY_VERSION = "thema-1.6-folio-subjects-v2";
export function themaForLabel(label: string) { return THEMA.find(item => item.label === label); }

// ISO 639-2/T and ISO 639-1 codes from the Library of Congress registration table.
export const LANGUAGE_CODES = [
  {
    "label": "English",
    "iso639_1": "en",
    "iso639_2": "eng"
  },
  {
    "label": "Spanish",
    "iso639_1": "es",
    "iso639_2": "spa"
  },
  {
    "label": "French",
    "iso639_1": "fr",
    "iso639_2": "fra"
  },
  {
    "label": "German",
    "iso639_1": "de",
    "iso639_2": "deu"
  },
  {
    "label": "Italian",
    "iso639_1": "it",
    "iso639_2": "ita"
  },
  {
    "label": "Portuguese",
    "iso639_1": "pt",
    "iso639_2": "por"
  },
  {
    "label": "Dutch",
    "iso639_1": "nl",
    "iso639_2": "nld"
  },
  {
    "label": "Russian",
    "iso639_1": "ru",
    "iso639_2": "rus"
  },
  {
    "label": "Ukrainian",
    "iso639_1": "uk",
    "iso639_2": "ukr"
  },
  {
    "label": "Polish",
    "iso639_1": "pl",
    "iso639_2": "pol"
  },
  {
    "label": "Arabic",
    "iso639_1": "ar",
    "iso639_2": "ara"
  },
  {
    "label": "Hebrew",
    "iso639_1": "he",
    "iso639_2": "heb"
  },
  {
    "label": "Hindi",
    "iso639_1": "hi",
    "iso639_2": "hin"
  },
  {
    "label": "Bengali",
    "iso639_1": "bn",
    "iso639_2": "ben"
  },
  {
    "label": "Chinese",
    "iso639_1": "zh",
    "iso639_2": "zho"
  },
  {
    "label": "Japanese",
    "iso639_1": "ja",
    "iso639_2": "jpn"
  },
  {
    "label": "Korean",
    "iso639_1": "ko",
    "iso639_2": "kor"
  },
  {
    "label": "Turkish",
    "iso639_1": "tr",
    "iso639_2": "tur"
  },
  {
    "label": "Vietnamese",
    "iso639_1": "vi",
    "iso639_2": "vie"
  },
  {
    "label": "Indonesian",
    "iso639_1": "id",
    "iso639_2": "ind"
  },
  {
    "label": "Thai",
    "iso639_1": "th",
    "iso639_2": "tha"
  },
  {
    "label": "Greek",
    "iso639_1": "el",
    "iso639_2": "ell"
  },
  {
    "label": "Swedish",
    "iso639_1": "sv",
    "iso639_2": "swe"
  },
  {
    "label": "Danish",
    "iso639_1": "da",
    "iso639_2": "dan"
  },
  {
    "label": "Norwegian",
    "iso639_1": "no",
    "iso639_2": "nor"
  },
  {
    "label": "Finnish",
    "iso639_1": "fi",
    "iso639_2": "fin"
  },
  {
    "label": "Latin",
    "iso639_1": "la",
    "iso639_2": "lat"
  },
  {
    "label": "Czech",
    "iso639_1": "cs",
    "iso639_2": "ces"
  },
  {
    "label": "Romanian",
    "iso639_1": "ro",
    "iso639_2": "ron"
  },
  {
    "label": "Hungarian",
    "iso639_1": "hu",
    "iso639_2": "hun"
  },
  {
    "label": "Persian",
    "iso639_1": "fa",
    "iso639_2": "fas"
  },
  {
    "label": "Urdu",
    "iso639_1": "ur",
    "iso639_2": "urd"
  },
  {
    "label": "Tamil",
    "iso639_1": "ta",
    "iso639_2": "tam"
  },
  {
    "label": "Telugu",
    "iso639_1": "te",
    "iso639_2": "tel"
  },
  {
    "label": "Swahili",
    "iso639_1": "sw",
    "iso639_2": "swa"
  },
  {
    "label": "Afrikaans",
    "iso639_1": "af",
    "iso639_2": "afr"
  },
  {
    "label": "Catalan",
    "iso639_1": "ca",
    "iso639_2": "cat"
  },
  {
    "label": "Serbian",
    "iso639_1": "sr",
    "iso639_2": "srp"
  },
  {
    "label": "Croatian",
    "iso639_1": "hr",
    "iso639_2": "hrv"
  },
  {
    "label": "Slovak",
    "iso639_1": "sk",
    "iso639_2": "slk"
  },
  {
    "label": "Slovenian",
    "iso639_1": "sl",
    "iso639_2": "slv"
  },
  {
    "label": "Malay",
    "iso639_1": "ms",
    "iso639_2": "msa"
  },
  {
    "label": "Tagalog",
    "iso639_1": "tl",
    "iso639_2": "tgl"
  },
  {
    "label": "Estonian",
    "iso639_1": "et",
    "iso639_2": "est"
  },
  {
    "label": "Lithuanian",
    "iso639_1": "lt",
    "iso639_2": "lit"
  },
  {
    "label": "Latvian",
    "iso639_1": "lv",
    "iso639_2": "lav"
  },
  {
    "label": "Icelandic",
    "iso639_1": "is",
    "iso639_2": "isl"
  },
  {
    "label": "Irish",
    "iso639_1": "ga",
    "iso639_2": "gle"
  },
  {
    "label": "Welsh",
    "iso639_1": "cy",
    "iso639_2": "cym"
  },
  {
    "label": "Basque",
    "iso639_1": "eu",
    "iso639_2": "eus"
  },
  {
    "label": "Galician",
    "iso639_1": "gl",
    "iso639_2": "glg"
  },
  {
    "label": "Maltese",
    "iso639_1": "mt",
    "iso639_2": "mlt"
  },
  {
    "label": "Nepali",
    "iso639_1": "ne",
    "iso639_2": "nep"
  },
  {
    "label": "Marathi",
    "iso639_1": "mr",
    "iso639_2": "mar"
  },
  {
    "label": "Gujarati",
    "iso639_1": "gu",
    "iso639_2": "guj"
  },
  {
    "label": "Punjabi",
    "iso639_1": "pa",
    "iso639_2": "pan"
  },
  {
    "label": "Multilingual",
    "iso639_1": null,
    "iso639_2": "mul"
  },
  {
    "label": "Other / uncertain",
    "iso639_1": null,
    "iso639_2": "und"
  }
] as const;
export function languageCodes(label: string) { return LANGUAGE_CODES.find(item => item.label === label); }
