// Judge0 language IDs
export const LANGUAGE_IDS: Record<string, number> = {
  python:     71,
  javascript: 63,
  cpp:        54,
  java:       62,
  typescript: 74,
};

// Judge0 status IDs
export const STATUS = {
  IN_QUEUE:           1,
  PROCESSING:         2,
  ACCEPTED:           3,
  WRONG_ANSWER:       4,
  TIME_LIMIT:         5,
  COMPILATION_ERROR:  6,
  RUNTIME_ERROR_SIGSEGV: 7,
  RUNTIME_ERROR_SIGXFSZ: 8,
  RUNTIME_ERROR_SIGFPE:  9,
  RUNTIME_ERROR_SIGABRT: 10,
  RUNTIME_ERROR_NZEC:    11,
  RUNTIME_ERROR_OTHER:   12,
  INTERNAL_ERROR:     13,
  EXEC_FORMAT_ERROR:  14,
};

export type ExecutionResult = {
  passed: boolean;
  status: string;
  runtimeMs: number | null;
  memoryKb: number | null;
  stderr: string | null;
};

const JUDGE0_URL = "https://judge0-ce.p.rapidapi.com";
const HEADERS = {
  "Content-Type": "application/json",
  "X-RapidAPI-Key": process.env.JUDGE0_API_KEY!,
  "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
};

// Run code against a single test case
async function runSingle(
  code: string,
  language: string,
  input: string,
  expectedOutput: string,
  timeLimitMs: number,
  memoryLimitKb: number
): Promise<ExecutionResult> {
  // Submit to Judge0
  const submitRes = await fetch(`${JUDGE0_URL}/submissions`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      source_code:      code,
      language_id:      LANGUAGE_IDS[language],
      stdin:            input,
      expected_output:  expectedOutput,
      cpu_time_limit:   timeLimitMs / 1000,   // Judge0 uses seconds
      memory_limit:     memoryLimitKb,
    }),
  });

  const { token } = await submitRes.json();

  // Poll for result — Judge0 is async
  let attempts = 0;
  while (attempts < 10) {
    await new Promise((r) => setTimeout(r, 1500)); // wait 1.5s between polls

    const resultRes = await fetch(
      `${JUDGE0_URL}/submissions/${token}?fields=status,stdout,stderr,time,memory`,
      { headers: HEADERS }
    );

    const result = await resultRes.json();

    // Still processing
    if (result.status?.id <= 2) {
      attempts++;
      continue;
    }

    return {
      passed:    result.status?.id === STATUS.ACCEPTED,
      status:    mapStatus(result.status?.id),
      runtimeMs: result.time ? Math.round(result.time * 1000) : null,
      memoryKb:  result.memory ?? null,
      stderr:    result.stderr ?? null,
    };
  }

  // Timed out waiting for Judge0
  return {
    passed:    false,
    status:    "time_limit",
    runtimeMs: null,
    memoryKb:  null,
    stderr:    "Execution timed out",
  };
}

// Run code against ALL test cases — stops at first failure
export async function runAllTestCases(
  code: string,
  language: string,
  testCases: { input: string; expectedOutput: string }[],
  timeLimitMs: number,
  memoryLimitKb: number
): Promise<{
  allPassed: boolean;
  passed: number;
  total: number;
  firstFailure: ExecutionResult | null;
  runtimeMs: number | null;
}> {
  let passed = 0;
  let firstFailure: ExecutionResult | null = null;
  let totalRuntime = 0;

  for (const tc of testCases) {
    const result = await runSingle(
      code,
      language,
      tc.input,
      tc.expectedOutput,
      timeLimitMs,
      memoryLimitKb
    );

    if (result.passed) {
      passed++;
      if (result.runtimeMs) totalRuntime += result.runtimeMs;
    } else {
      firstFailure = result;
      break; // stop at first failure
    }
  }

  return {
    allPassed:    passed === testCases.length,
    passed,
    total:        testCases.length,
    firstFailure,
    runtimeMs:    totalRuntime > 0 ? totalRuntime : null,
  };
}

function mapStatus(statusId: number): string {
  switch (statusId) {
    case STATUS.ACCEPTED:           return "accepted";
    case STATUS.WRONG_ANSWER:       return "wrong_answer";
    case STATUS.TIME_LIMIT:         return "time_limit";
    case STATUS.COMPILATION_ERROR:  return "compilation_error";
    default:                        return "runtime_error";
  }
}
