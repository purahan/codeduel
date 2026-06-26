// =============================================================================
// SINGLE SOURCE OF TRUTH: Supported Languages
// =============================================================================
//
// Both the frontend (language selector) and backend (execution engine) derive
// from this module. To add a new language, add it here — and nowhere else.
//
// TODO(Issue #14): Expand C++ and Java wrappers to support Trees and Linked Lists.
// For now they support standard primitives and arrays.
// =============================================================================

export const SUPPORTED_LANGUAGES = ["python", "javascript", "cpp", "java"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Human-readable labels for the UI language selector. */
export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  python:     "Python 3",
  javascript: "JavaScript",
  cpp:        "C++",
  java:       "Java",
};

/** Piston runtime configuration for each supported language. */
export const LANGUAGE_CONFIG: Record<SupportedLanguage, { language: string; version: string }> = {
  python:     { language: "python",     version: "3.10.0" },
  javascript: { language: "javascript", version: "18.15.0" },
  cpp:        { language: "c++",        version: "*" },
  java:       { language: "java",       version: "*" },
};

/** Type guard: is this string a supported language key? */
export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(lang);
}
