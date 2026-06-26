// =============================================================================
// SINGLE SOURCE OF TRUTH: Supported Languages
// =============================================================================
//
// Both the frontend (language selector) and backend (execution engine) derive
// from this module. To add a new language, add it here — and nowhere else.
//
// TODO(Issue #14): Re-enable C++ and Java once self-hosted Piston is integrated
// and wrappers (lib/wrappers.ts) are implemented for those languages.
// When re-enabling:
//   1. Add the language key to SUPPORTED_LANGUAGES
//   2. Add the label to LANGUAGE_LABELS
//   3. Add the Piston runtime config to LANGUAGE_CONFIG
//   4. Implement generate<Lang>Wrapper() in lib/wrappers.ts
// =============================================================================

/** The set of language keys that are currently executable end-to-end. */
export const SUPPORTED_LANGUAGES = ["python", "javascript"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Human-readable labels for the UI language selector. */
export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  python:     "Python 3",
  javascript: "JavaScript",
};

/** Piston + Judge0 runtime configuration for each supported language. */
export const LANGUAGE_CONFIG: Record<SupportedLanguage, { language: string; version: string; judge0Id: number }> = {
  python:     { language: "python",     version: "3.10.0", judge0Id: 71 },
  javascript: { language: "javascript", version: "18.15.0", judge0Id: 93 },
};

/** Type guard: is this string a supported language key? */
export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(lang);
}
