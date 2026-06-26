// =============================================================================
// SECURITY-HARDENED CODE EXECUTION MODULE
// =============================================================================
//
// SECURITY NOTE (2026-06-26):
// The previous implementation contained a CRITICAL Remote Code Execution (RCE)
// vulnerability. When the Piston API was unavailable, user-submitted code was
// executed directly on the Vercel Lambda/server using child_process.exec().
// This gave attackers full access to:
//   - process.env (AWS keys, NEXTAUTH_SECRET, DATABASE_URL, GITHUB secrets)
//   - The filesystem (read any file on the Lambda)
//   - The network (exfiltrate data, pivot to internal services)
//   - Full OS-level command execution
//
// THE FIX:
// All local execution code has been PERMANENTLY REMOVED. This module now
// exclusively uses the remote Piston API (sandboxed, isolated containers).
// If Piston is unavailable, we return a structured error — we NEVER fall back
// to local execution under ANY circumstances.
//
// REMOVED IMPORTS: child_process, fs, path, os
// REMOVED FUNCTIONS: local exec() fallback, tmpFile creation
// =============================================================================

import { generatePythonWrapper, generateJavascriptWrapper } from "./wrappers";
import { LANGUAGE_CONFIG, isSupportedLanguage, SUPPORTED_LANGUAGES } from "./languages";

const PISTON_URL = "https://emkc.org/api/v2/piston";

// Timeout for Piston API requests (10 seconds)
const PISTON_TIMEOUT_MS = 10_000;

// Maximum code size to send to Piston (100KB) — prevents abuse
const MAX_CODE_SIZE_BYTES = 100_000;

// NOTE: Supported languages and their Piston configs are defined in lib/languages.ts
// (single source of truth). Do NOT add language entries here.
// TODO(Issue #14): C++, Java, and TypeScript were removed because no execution
// wrappers exist for them yet. Re-enable in lib/languages.ts once wrappers are built.

export type ExecutionResult = {
  passed:    boolean;
  status:    string;
  runtimeMs: number | null;
  memoryKb:  number | null;
  stderr:    string | null;
  stdout:    string | null;
};

/**
 * Execute a single test case against user code using the REMOTE Piston API.
 *
 * SECURITY: This function NEVER executes user code locally.
 * If Piston is unreachable, it returns an execution_service_unavailable error.
 */
async function runSingle(
  code: string,
  language: string,
  input: string,
  expectedOutput: string,
  problemId: string
): Promise<ExecutionResult> {
  // ── Input validation ──────────────────────────────────────────────────────

  // Validate language against strict allowlist (defined in lib/languages.ts)
  if (!isSupportedLanguage(language)) {
    return {
      passed: false, status: "unsupported_language",
      runtimeMs: null, memoryKb: null,
      stderr: `Language "${language}" is not supported. Supported: ${SUPPORTED_LANGUAGES.join(", ")}. More languages coming soon!`,
      stdout: null,
    };
  }

  // Enforce maximum code size to prevent abuse
  if (Buffer.byteLength(code, "utf-8") > MAX_CODE_SIZE_BYTES) {
    return {
      passed: false, status: "code_too_large",
      runtimeMs: null, memoryKb: null,
      stderr: `Code exceeds maximum allowed size of ${MAX_CODE_SIZE_BYTES} bytes`,
      stdout: null,
    };
  }

  const lang = LANGUAGE_CONFIG[language];

  // ── Build wrapped code for supported languages ────────────────────────────

  let finalCode = code;
  if (language === "python") {
    finalCode = generatePythonWrapper(code, problemId);
  } else if (language === "javascript") {
    finalCode = generateJavascriptWrapper(code, problemId);
  }

  // ── Call Piston API (remote sandboxed execution) ──────────────────────────

  const start = Date.now();
  let run: { stdout: string; stderr: string };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PISTON_TIMEOUT_MS);

    const response = await fetch(`${PISTON_URL}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: lang.language,
        version:  lang.version,
        files:    [{ content: finalCode }],
        stdin:    input,
        compile_timeout: 10000,
        run_timeout:     3000,
        compile_memory_limit: -1,
        run_memory_limit:     -1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      // SECURITY: Do NOT fall back to local execution.
      // Return a structured error so the frontend can display an appropriate message.
      console.error(
        `[piston] Remote execution service returned HTTP ${response.status}`
      );
      return {
        passed: false,
        status: "execution_service_unavailable",
        runtimeMs: null,
        memoryKb: null,
        stderr:
          "Code execution service is temporarily unavailable. Please try again in a few moments.",
        stdout: null,
      };
    }

    const data = await response.json();

    // Piston returns { run: { stdout, stderr, code, signal, output } }
    run = {
      stdout: data.run?.stdout ?? "",
      stderr: data.run?.stderr ?? "",
    };
  } catch (err: any) {
    // SECURITY: Network errors, timeouts, DNS failures — return error, NEVER local exec.
    const isAbort = err.name === "AbortError";
    console.error(
      `[piston] ${isAbort ? "Request timed out" : "Network error"}: ${err.message}`
    );
    return {
      passed: false,
      status: "execution_service_unavailable",
      runtimeMs: null,
      memoryKb: null,
      stderr: isAbort
        ? "Code execution timed out. The execution service may be under heavy load."
        : "Code execution service is temporarily unavailable. Please try again in a few moments.",
      stdout: null,
    };
  }

  const runtimeMs = Date.now() - start;

  // ── Compare output ────────────────────────────────────────────────────────

  const actualOutput = (run.stdout ?? "").trim();
  const expected     = expectedOutput.trim();
  const passed       = actualOutput === expected;

  if (run.stderr && !passed) {
    console.error("PISTON ERROR:", run.stderr);
    return {
      passed: false, status: "runtime_error",
      runtimeMs, memoryKb: null,
      stderr: run.stderr, stdout: run.stdout,
    };
  }

  if (!passed) {
    console.log("PISTON WRONG ANSWER:");
    console.log("  Input:", input);
    console.log("  Expected:", expected);
    console.log("  Actual:", actualOutput);
  }

  return {
    passed,
    status:    passed ? "accepted" : "wrong_answer",
    runtimeMs,
    memoryKb:  null,
    stderr:    run.stderr ?? null,
    stdout:    run.stdout ?? null,
  };
}

export async function runAllTestCases(
  code: string,
  language: string,
  testCases: { input: string; expectedOutput: string }[],
  _timeLimitMs: number | undefined,
  _memoryLimitKb: number | undefined,
  problemId: string
): Promise<{
  allPassed:    boolean;
  passed:       number;
  total:        number;
  firstFailure: ExecutionResult | null;
  runtimeMs:    number | null;
}> {
  let passed       = 0;
  let firstFailure: ExecutionResult | null = null;
  let totalRuntime = 0;

  for (const tc of testCases) {
    const result = await runSingle(code, language, tc.input, tc.expectedOutput, problemId);

    // If the execution service is unavailable, fail fast — don't keep retrying
    if (result.status === "execution_service_unavailable") {
      firstFailure = result;
      break;
    }

    if (result.passed) {
      passed++;
      if (result.runtimeMs) totalRuntime += result.runtimeMs;
    } else {
      firstFailure = result;
      break;
    }
  }

  return {
    allPassed: passed === testCases.length,
    passed,
    total:        testCases.length,
    firstFailure,
    runtimeMs: totalRuntime > 0 ? totalRuntime : null,
  };
}
