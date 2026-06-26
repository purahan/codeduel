// =============================================================================
// SECURITY-HARDENED CODE EXECUTION MODULE
// =============================================================================
//
// EXECUTION BACKENDS (priority order):
//   1. Judge0 CE via RapidAPI (if JUDGE0_API_KEY is set)
//   2. Self-hosted Piston (if PISTON_URL is set)
//   3. Public Piston (emkc.org — DEPRECATED, whitelist-only since Feb 2026)
//
// SECURITY NOTE:
// All code execution happens REMOTELY in sandboxed containers.
// We NEVER execute user code locally under ANY circumstances.
// =============================================================================

import { generatePythonWrapper, generateJavascriptWrapper } from "./wrappers";
import { LANGUAGE_CONFIG, isSupportedLanguage, SUPPORTED_LANGUAGES } from "./languages";

// ── Backend Configuration ────────────────────────────────────────────────────

const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY || "";
const JUDGE0_HOST = process.env.JUDGE0_HOST || "judge0-ce.p.rapidapi.com";
const PISTON_URL = process.env.PISTON_URL || "https://emkc.org/api/v2/piston";

// Timeout for API requests (12 seconds — Judge0 can be slower than Piston)
const API_TIMEOUT_MS = 12_000;

// Maximum code size to send (100KB) — prevents abuse
const MAX_CODE_SIZE_BYTES = 100_000;

export type ExecutionResult = {
  passed:    boolean;
  status:    string;
  runtimeMs: number | null;
  memoryKb:  number | null;
  stderr:    string | null;
  stdout:    string | null;
};

// ── Judge0 Backend ───────────────────────────────────────────────────────────

async function runViaJudge0(
  code: string,
  languageId: number,
  stdin: string
): Promise<{ stdout: string; stderr: string; time: number | null } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    // Judge0 expects base64-encoded source_code and stdin
    const b64Code  = Buffer.from(code, "utf-8").toString("base64");
    const b64Stdin = Buffer.from(stdin, "utf-8").toString("base64");

    const response = await fetch(
      `https://${JUDGE0_HOST}/submissions?base64_encoded=true&wait=true&fields=stdout,stderr,time,memory,status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-host": JUDGE0_HOST,
          "x-rapidapi-key": JUDGE0_API_KEY,
        },
        body: JSON.stringify({
          source_code: b64Code,
          language_id: languageId,
          stdin: b64Stdin,
          cpu_time_limit: 5,
          wall_time_limit: 10,
          memory_limit: 256000,
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[judge0] HTTP ${response.status}: ${await response.text().catch(() => "no body")}`);
      return null;
    }

    const data = await response.json();

    // Judge0 returns base64-encoded stdout/stderr
    const stdout = data.stdout ? Buffer.from(data.stdout, "base64").toString("utf-8") : "";
    const stderr = data.stderr ? Buffer.from(data.stderr, "base64").toString("utf-8") : "";
    const time   = data.time ? parseFloat(data.time) * 1000 : null; // seconds → ms

    return { stdout, stderr, time };
  } catch (err: any) {
    const isAbort = err.name === "AbortError";
    console.error(`[judge0] ${isAbort ? "Timed out" : "Error"}: ${err.message}`);
    return null;
  }
}

// ── Piston Backend (Fallback) ────────────────────────────────────────────────

async function runViaPiston(
  code: string,
  language: string,
  version: string,
  stdin: string
): Promise<{ stdout: string; stderr: string; time: number | null } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const response = await fetch(`${PISTON_URL}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language,
        version,
        files:    [{ content: code }],
        stdin,
        compile_timeout: 10000,
        run_timeout:     3000,
        compile_memory_limit: -1,
        run_memory_limit:     -1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[piston] HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Check for whitelist rejection (Piston shut down public access Feb 2026)
    if (data.message && data.message.includes("whitelist")) {
      console.error(`[piston] Public API rejected: ${data.message}`);
      return null;
    }

    return {
      stdout: data.run?.stdout ?? "",
      stderr: data.run?.stderr ?? "",
      time:   null, // Piston doesn't return CPU time separately
    };
  } catch (err: any) {
    const isAbort = err.name === "AbortError";
    console.error(`[piston] ${isAbort ? "Timed out" : "Error"}: ${err.message}`);
    return null;
  }
}

// ── Unified Single-Test Runner ───────────────────────────────────────────────

/**
 * Execute a single test case against user code using a REMOTE sandbox.
 * Tries Judge0 first (if configured), then falls back to Piston.
 *
 * SECURITY: This function NEVER executes user code locally.
 */
async function runSingle(
  code: string,
  language: string,
  input: string,
  expectedOutput: string,
  problemId: string
): Promise<ExecutionResult> {
  // ── Input validation ──────────────────────────────────────────────────────

  if (!isSupportedLanguage(language)) {
    return {
      passed: false, status: "unsupported_language",
      runtimeMs: null, memoryKb: null,
      stderr: `Language "${language}" is not supported. Supported: ${SUPPORTED_LANGUAGES.join(", ")}. More languages coming soon!`,
      stdout: null,
    };
  }

  if (Buffer.byteLength(code, "utf-8") > MAX_CODE_SIZE_BYTES) {
    return {
      passed: false, status: "code_too_large",
      runtimeMs: null, memoryKb: null,
      stderr: `Code exceeds maximum allowed size of ${MAX_CODE_SIZE_BYTES} bytes`,
      stdout: null,
    };
  }

  const lang = LANGUAGE_CONFIG[language];

  // ── Build wrapped code ────────────────────────────────────────────────────

  let finalCode = code;
  if (language === "python") {
    finalCode = generatePythonWrapper(code, problemId);
  } else if (language === "javascript") {
    finalCode = generateJavascriptWrapper(code, problemId);
  }

  // ── Execute via backend (Judge0 → Piston fallback) ────────────────────────

  const start = Date.now();
  let result: { stdout: string; stderr: string; time: number | null } | null = null;

  // Try Judge0 first if API key is configured
  if (JUDGE0_API_KEY) {
    result = await runViaJudge0(finalCode, lang.judge0Id, input);
  }

  // Fall back to Piston if Judge0 failed or isn't configured
  if (!result) {
    result = await runViaPiston(finalCode, lang.language, lang.version, input);
  }

  // Both backends failed
  if (!result) {
    return {
      passed: false,
      status: "execution_service_unavailable",
      runtimeMs: null,
      memoryKb: null,
      stderr: JUDGE0_API_KEY
        ? "Code execution service is temporarily unavailable. Please try again in a few moments."
        : "No execution backend configured. Please set JUDGE0_API_KEY in environment variables.",
      stdout: null,
    };
  }

  const runtimeMs = result.time ?? (Date.now() - start);

  // ── Compare output ────────────────────────────────────────────────────────

  const actualOutput = (result.stdout ?? "").trim();
  const expected     = expectedOutput.trim();
  const passed       = actualOutput === expected;

  if (result.stderr && !passed) {
    console.error("EXECUTION ERROR:", result.stderr);
    return {
      passed: false, status: "runtime_error",
      runtimeMs, memoryKb: null,
      stderr: result.stderr, stdout: result.stdout,
    };
  }

  if (!passed) {
    console.log("WRONG ANSWER:");
    console.log("  Input:", input);
    console.log("  Expected:", expected);
    console.log("  Actual:", actualOutput);
  }

  return {
    passed,
    status:    passed ? "accepted" : "wrong_answer",
    runtimeMs,
    memoryKb:  null,
    stderr:    result.stderr ?? null,
    stdout:    result.stdout ?? null,
  };
}

// ── Run All Test Cases ───────────────────────────────────────────────────────

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
