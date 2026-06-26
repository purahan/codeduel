// =============================================================================
// SECURITY-HARDENED CODE EXECUTION MODULE
// =============================================================================

import { 
  generatePythonWrapper, 
  generateJavascriptWrapper,
  generateCppWrapper,
  generateJavaWrapper
} from "./wrappers";
import { LANGUAGE_CONFIG, isSupportedLanguage, SUPPORTED_LANGUAGES } from "./languages";

const PISTON_URL = process.env.PISTON_URL || "https://emkc.org/api/v2/piston";

// Timeout for API requests
const API_TIMEOUT_MS = 12_000;

// Maximum code size to send (100KB)
const MAX_CODE_SIZE_BYTES = 100_000;

export type ExecutionResult = {
  passed:    boolean;
  status:    string;
  runtimeMs: number | null;
  memoryKb:  number | null;
  stderr:    string | null;
  stdout:    string | null;
};

// ── Piston Backend ────────────────────────────────────────────────

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
        files: [{ content: code }],
        stdin,
        compile_timeout: 10000,
        run_timeout: 3000,
        compile_memory_limit: -1,
        run_memory_limit: -1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[piston] HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.message && data.message.includes("whitelist")) {
      console.error(`[piston] Public API rejected: ${data.message}`);
      return null;
    }

    return {
      stdout: data.run?.stdout ?? "",
      stderr: data.compile?.stderr || data.run?.stderr || "",
      time: null,
    };
  } catch (err: any) {
    const isAbort = err.name === "AbortError";
    console.error(`[piston] ${isAbort ? "Timed out" : "Error"}: ${err.message}`);
    return null;
  }
}

// ── Unified Single-Test Runner ───────────────────────────────────────────────

async function runSingle(
  code: string,
  language: string,
  input: string,
  expectedOutput: string,
  problemId: string
): Promise<ExecutionResult> {
  if (!isSupportedLanguage(language)) {
    return {
      passed: false, status: "unsupported_language",
      runtimeMs: null, memoryKb: null,
      stderr: `Language "${language}" is not supported. Supported: ${SUPPORTED_LANGUAGES.join(", ")}.`,
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

  let finalCode = code;
  if (language === "python") {
    finalCode = generatePythonWrapper(code, problemId);
  } else if (language === "javascript") {
    finalCode = generateJavascriptWrapper(code, problemId);
  } else if (language === "cpp") {
    finalCode = generateCppWrapper(code, problemId);
  } else if (language === "java") {
    finalCode = generateJavaWrapper(code, problemId);
  }

  const start = Date.now();
  const result = await runViaPiston(finalCode, lang.language, lang.version, input);

  if (!result) {
    return {
      passed: false,
      status: "execution_service_unavailable",
      runtimeMs: null,
      memoryKb: null,
      stderr: "Code execution service is temporarily unavailable.",
      stdout: null,
    };
  }

  const runtimeMs = result.time ?? (Date.now() - start);

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
