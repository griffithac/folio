import catalog from './data/iso-639-2.json' with { type: 'json' };

export const LANGUAGE_CATALOG = { version: catalog.version, source: catalog.source, sha256: catalog.sha256 };
export const LANGUAGE_CODES = catalog.languages.slice().sort((a, b) => a.label.localeCompare(b.label, 'en'));
export const languageCodes = (label: string) => LANGUAGE_CODES.find(item => item.label === label);
export const languageByCode = (code: string) => LANGUAGE_CODES.find(item => item.iso639_2 === code);
export const LANGUAGE_METHOD = 'partitioned-iso-639-2-v1' as const;
export const LANGUAGE_NONE = 'none';
// Stable, disjoint partitions. Every ordinary ISO 639-2 code appears once.
const ordinary = LANGUAGE_CODES.filter(item => !['mul', 'und', 'zxx'].includes(item.iso639_2)).sort((a, b) => a.iso639_2.localeCompare(b.iso639_2));
export const LANGUAGE_GROUPS = Array.from({ length: 3 }, (_, i) => {
  const languages = ordinary.slice(i * 161, (i + 1) * 161);
  return { id: `language_${i}`, criteria: {
    ...Object.fromEntries(languages.map(item => [item.iso639_2, item.english + (item.collective ? '; collective' : item.iso639_2 === 'nor' ? '; prefer Bokmål or Nynorsk if identifiable' : '')])),
    mul: 'Multiple substantial prose languages, with no single dominant language.',
    zxx: 'No natural linguistic content (only code, notation, formulas or music).',
    none: 'Dominant language is outside this group, or cannot be identified.',
  } };
});
export function languageCriteria(codes: string[]) {
  return Object.fromEntries([...codes.map(code => [code, languageByCode(code)?.english || code]), ['und', 'Language cannot be determined from the evidence.']]);
}
export const LANGUAGE_INSTRUCTION = 'Identify the dominant natural prose language using samples[].text. Ignore programming/markup languages, languages mentioned, and incidental foreign quotations. Prefer a specific language over a collective; select none if that language is outside these options. Use mul only with no dominant prose language; zxx only with no natural linguistic content. Apply evidencePolicy.';
