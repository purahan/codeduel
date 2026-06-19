// Piston API — free, open source, no API key required
// Docs: https://github.com/engineer-man/piston

const PISTON_URL = "https://emkc.org/api/v2/piston";

const LANGUAGE_MAP: Record<string, { language: string; version: string }> = {
  python:     { language: "python",     version: "3.10.0" },
  javascript: { language: "javascript", version: "18.15.0" },
  cpp:        { language: "c++",        version: "10.2.0" },
  java:       { language: "java",       version: "15.0.2" },
  typescript: { language: "typescript", version: "5.0.3" },
};

export type ExecutionResult = {
  passed:    boolean;
  status:    string;
  runtimeMs: number | null;
  memoryKb:  number | null;
  stderr:    string | null;
  stdout:    string | null;
};

async function runSingle(
  code: string,
  language: string,
  input: string,
  expectedOutput: string
): Promise<ExecutionResult> {
  const lang = LANGUAGE_MAP[language];
  if (!lang) {
    return {
      passed: false, status: "unsupported_language",
      runtimeMs: null, memoryKb: null,
      stderr: `Language ${language} not supported`, stdout: null,
    };
  }

  const start = Date.now();

  const res = await fetch(`${PISTON_URL}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language: lang.language,
      version:  lang.version,
      files:    [{ content: code }],
      stdin:    input,
    }),
  });

  const runtimeMs = Date.now() - start;
  const data = await res.json();
  const run = data.run;

  const actualOutput = (run?.stdout ?? "").trim();
  const expected     = expectedOutput.trim();
  const passed       = actualOutput === expected;

  if (run?.stderr && !passed) {
    return {
      passed: false, status: "runtime_error",
      runtimeMs, memoryKb: null,
      stderr: run.stderr, stdout: run.stdout,
    };
  }

  return {
    passed,
    status:    passed ? "accepted" : "wrong_answer",
    runtimeMs,
    memoryKb:  null,
    stderr:    run?.stderr ?? null,
    stdout:    run?.stdout ?? null,
  };
}

export async function runAllTestCases(
  code: string,
  language: string,
  testCases: { input: string; expectedOutput: string }[],
  _timeLimitMs: number,
  _memoryLimitKb: number
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
    const result = await runSingle(code, language, tc.input, tc.expectedOutput);

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
