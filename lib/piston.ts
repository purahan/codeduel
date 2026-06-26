// =============================================================================
// SECURITY-HARDENED CODE EXECUTION MODULE
// =============================================================================

import { generatePythonWrapper, generateJavascriptWrapper } from "./wrappers";
import { LANGUAGE_CONFIG, isSupportedLanguage, SUPPORTED_LANGUAGES, SupportedLanguage } from "./languages";

const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY || "";
const JUDGE0_HOST = process.env.JUDGE0_HOST || "judge0-ce.p.rapidapi.com";
const PISTON_URL = process.env.PISTON_URL || "https://emkc.org/api/v2/piston";

const API_TIMEOUT_MS = 15_000;
const MAX_CODE_SIZE_BYTES = 100_000;

export type ExecutionResult = {
  passed:    boolean;
  status:    string;
  runtimeMs: number | null;
  memoryKb:  number | null;
  stderr:    string | null;
  stdout:    string | null;
};

type RunResponse = {
  stdout: string;
  stderr: string;
  time: number | null;
  compileError?: string;
  isTLE?: boolean;
};

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  let lastError: Error = new Error("Fetch failed");
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      
      if (res.status === 429) {
        if (i < retries) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
          continue;
        }
        throw new Error("RATE_LIMITED");
      }
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res;
    } catch (err: any) {
      lastError = err;
      if (i < retries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        continue;
      }
    }
  }
  throw lastError;
}

async function runViaJudge0(code: string, languageId: number, stdin: string): Promise<RunResponse | null> {
  try {
    const b64Code  = Buffer.from(code, "utf-8").toString("base64");
    const b64Stdin = Buffer.from(stdin, "utf-8").toString("base64");

    const response = await fetchWithRetry(
      `https://${JUDGE0_HOST}/submissions?base64_encoded=true&wait=true&fields=stdout,stderr,compile_output,time,memory,status`,
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
      }
    );

    const data = await response.json();

    const stdout = data.stdout ? Buffer.from(data.stdout, "base64").toString("utf-8") : "";
    const stderr = data.stderr ? Buffer.from(data.stderr, "base64").toString("utf-8") : "";
    const compileOutput = data.compile_output ? Buffer.from(data.compile_output, "base64").toString("utf-8") : "";
    const time = data.time ? parseFloat(data.time) * 1000 : null;
    const statusId = data.status?.id;

    if (statusId === 11) { // Compilation Error
      return { stdout, stderr, time, compileError: compileOutput };
    }
    
    if (statusId === 5) { // Time Limit Exceeded
      return { stdout, stderr, time, isTLE: true };
    }

    return { stdout, stderr, time };
  } catch (err: any) {
    console.error(`[judge0] Error: ${err.message}`);
    return null;
  }
}

async function runViaPiston(code: string, language: string, version: string, stdin: string): Promise<RunResponse | null> {
  try {
    const response = await fetchWithRetry(`${PISTON_URL}/execute`, {
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
    });

    const data = await response.json();

    if (data.message && data.message.includes("whitelist")) {
      console.error(`[piston] Public API rejected: ${data.message}`);
      return null;
    }

    const compileError = data.compile?.stderr || data.compile?.stdout ? (data.compile.stderr || data.compile.stdout) : undefined;
    if (data.compile && data.compile.code !== 0) {
       return { stdout: "", stderr: "", time: null, compileError };
    }

    const stdout = data.run?.stdout ?? "";
    const stderr = data.run?.stderr ?? "";
    const isTLE = data.run?.signal === "SIGKILL";

    return { stdout, stderr, time: null, isTLE };
  } catch (err: any) {
    console.error(`[piston] Error: ${err.message}`);
    if (err.message === "RATE_LIMITED") {
      throw new Error("RATE_LIMITED");
    }
    return null;
  }
}

async function runBatch(
  code: string,
  language: string,
  inputs: string[],
  problemId: string
): Promise<{ result: RunResponse, isRateLimited: boolean, serviceDown: boolean }> {
  if (Buffer.byteLength(code, "utf-8") > MAX_CODE_SIZE_BYTES) {
    return { result: { stdout: "", stderr: "Code exceeds max size", time: null, compileError: "Code too large" }, isRateLimited: false, serviceDown: false };
  }

  const lang = LANGUAGE_CONFIG[language as SupportedLanguage];
  let finalCode = code;
  if (language === "python") {
    finalCode = generatePythonWrapper(code, problemId);
  } else if (language === "javascript") {
    finalCode = generateJavascriptWrapper(code, problemId);
  }

  const stdin = JSON.stringify(inputs);
  const start = Date.now();
  
  let result: RunResponse | null = null;
  let isRateLimited = false;

  if (JUDGE0_API_KEY) {
    result = await runViaJudge0(finalCode, lang.judge0Id, stdin);
  }

  if (!result) {
    try {
      result = await runViaPiston(finalCode, lang.language, lang.version, stdin);
    } catch (e: any) {
      if (e.message === "RATE_LIMITED") {
        isRateLimited = true;
      }
    }
  }

  if (!result) {
    return { result: { stdout: "", stderr: "", time: null }, isRateLimited, serviceDown: true };
  }

  if (result.time === null) {
    result.time = Date.now() - start;
  }
  
  return { result, isRateLimited, serviceDown: false };
}

export async function runAllTestCases(
  code: string,
  language: string,
  testCases: { input: string; expectedOutput: string }[],
  _timeLimitMs: number | undefined,
  _memoryLimitKb: number | undefined,
  problemId: string
): Promise<{
  allPassed: boolean;
  passed: number;
  total: number;
  firstFailure: ExecutionResult | null;
  runtimeMs: number | null;
}> {
  if (!isSupportedLanguage(language)) {
    return {
      allPassed: false, passed: 0, total: testCases.length,
      firstFailure: {
        passed: false, status: "unsupported_language", runtimeMs: null, memoryKb: null,
        stderr: "Language not supported", stdout: null
      },
      runtimeMs: null
    };
  }

  const inputs = testCases.map(tc => tc.input);
  const { result, isRateLimited, serviceDown } = await runBatch(code, language, inputs, problemId);

  if (serviceDown) {
    return {
      allPassed: false, passed: 0, total: testCases.length,
      firstFailure: {
        passed: false,
        status: isRateLimited ? "rate_limited" : "execution_service_unavailable",
        runtimeMs: null, memoryKb: null,
        stderr: isRateLimited ? "Code execution rate limited. Please wait and try again." : "Code execution service is temporarily unavailable.",
        stdout: null
      },
      runtimeMs: null
    };
  }

  if (result.compileError) {
    return {
      allPassed: false, passed: 0, total: testCases.length,
      firstFailure: {
        passed: false, status: "compilation_error",
        runtimeMs: result.time, memoryKb: null,
        stderr: result.compileError, stdout: null
      },
      runtimeMs: result.time
    };
  }

  if (result.isTLE) {
    return {
      allPassed: false, passed: 0, total: testCases.length,
      firstFailure: {
        passed: false, status: "time_limit_exceeded",
        runtimeMs: result.time, memoryKb: null,
        stderr: "Time Limit Exceeded", stdout: result.stdout
      },
      runtimeMs: result.time
    };
  }

  // Parse the output block
  const stdoutStr = result.stdout || "";
  const delimiter = "---CODE_DUEL_RESULTS_START---";
  const delimiterIdx = stdoutStr.lastIndexOf(delimiter);

  if (delimiterIdx === -1) {
    // Wrapper crashed before printing results (or syntax error inside code)
    return {
      allPassed: false, passed: 0, total: testCases.length,
      firstFailure: {
        passed: false, status: "runtime_error",
        runtimeMs: result.time, memoryKb: null,
        stderr: result.stderr || "Runtime Error: Execution terminated unexpectedly. Check for infinite loops or syntax errors.", stdout: result.stdout
      },
      runtimeMs: result.time
    };
  }

  const jsonStr = stdoutStr.slice(delimiterIdx + delimiter.length).trim();
  const rawStdout = stdoutStr.slice(0, delimiterIdx).trim();

  let resultsArr: any[] = [];
  try {
    resultsArr = JSON.parse(jsonStr);
  } catch (e) {
    return {
      allPassed: false, passed: 0, total: testCases.length,
      firstFailure: {
        passed: false, status: "runtime_error",
        runtimeMs: result.time, memoryKb: null,
        stderr: "Failed to parse execution results. " + (result.stderr || ""), stdout: rawStdout
      },
      runtimeMs: result.time
    };
  }

  let passed = 0;
  let firstFailure: ExecutionResult | null = null;
  let totalRuntime = result.time || 0;

  for (let i = 0; i < testCases.length; i++) {
    const expected = testCases[i].expectedOutput.trim();
    const res = resultsArr[i];
    
    if (res && typeof res === "object" && res.error) {
      firstFailure = {
        passed: false, status: "runtime_error",
        runtimeMs: totalRuntime, memoryKb: null,
        stderr: res.traceback || res.error, stdout: rawStdout
      };
      break;
    }
    
    const actualOutput = res !== null && res !== undefined ? String(res).trim() : "";
    
    if (actualOutput === expected) {
      passed++;
    } else {
      firstFailure = {
        passed: false, status: "wrong_answer",
        runtimeMs: totalRuntime, memoryKb: null,
        stderr: result.stderr || null, stdout: rawStdout
      };
      break;
    }
  }

  return {
    allPassed: passed === testCases.length,
    passed,
    total: testCases.length,
    firstFailure,
    runtimeMs: totalRuntime > 0 ? totalRuntime : null,
  };
}
