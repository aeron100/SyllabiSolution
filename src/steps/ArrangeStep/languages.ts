/**
 * Short list of document languages for the cover form (BCP-47 primary tags).
 * The list is deliberately short (DESIGN.md §10 "plain words, no text walls");
 * an unknown current value is prepended so the select never shows a wrong choice.
 */
export interface LanguageOption {
  code: string;
  name: string;
}

export const LANGUAGES: readonly LanguageOption[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ko', name: 'Korean' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'ja', name: 'Japanese' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'ru', name: 'Russian' },
];

export function languageOptions(current: string): LanguageOption[] {
  const code = current.trim();
  if (!code || LANGUAGES.some((l) => l.code === code)) return [...LANGUAGES];
  return [{ code, name: code }, ...LANGUAGES];
}
