// Piston API — free, open source, no API key required
// Docs: https://github.com/engineer-man/piston

import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { generatePythonWrapper, generateJavascriptWrapper } from "./wrappers";

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
  expectedOutput: string,
  problemId: string
): Promise<ExecutionResult> {
  const lang = LANGUAGE_MAP[language];
  if (!lang) {
    return {
      passed: false, status: "unsupported_language",
      runtimeMs: null, memoryKb: null,
      stderr: `Language ${language} not supported`, stdout: null,
    };
  }

  // Piston API is dead (whitelist only), falling back to local execution!
  let run: any = { stdout: "", stderr: "" };
  let runtimeMs = 0;

  if (language === "python" || language === "javascript") {
    const ext = language === "python" ? ".py" : ".js";
    const cmd = language === "python" ? "python3" : "node";
    const tmpFile = path.join(os.tmpdir(), `code_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    
    let finalCode = code;
    if (language === "python") {
      finalCode = generatePythonWrapper(code, problemId);
    } else if (language === "javascript") {
      finalCode = generateJavascriptWrapper(code, problemId);
    }

    await fs.writeFile(tmpFile, finalCode);
    
    const start = Date.now();
    try {
      const result = await new Promise<{stdout: string, stderr: string}>((resolve, reject) => {
        const child = exec(`${cmd} ${tmpFile}`, { timeout: 3000 }, (error, stdout, stderr) => {
          if (error && error.killed) reject(new Error("Timeout"));
          else resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
        });
        if (input && child.stdin) {
          child.stdin.write(input);
          child.stdin.end();
        }
      });
      run.stdout = result.stdout;
      run.stderr = result.stderr;
    } catch (err: any) {
      run.stderr = err.message || "Execution failed";
    }
    runtimeMs = Date.now() - start;
    await fs.unlink(tmpFile).catch(() => {});
  } else {
    return {
      passed: false, status: "unsupported_language",
      runtimeMs: null, memoryKb: null,
      stderr: "Local fallback currently only supports Python and JavaScript. Piston API is disabled.", stdout: null,
    };
  }

  const actualOutput = (run?.stdout ?? "").trim();
  const expected     = expectedOutput.trim();
  const passed       = actualOutput === expected;

  if (run?.stderr && !passed) {
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
    stderr:    run?.stderr ?? null,
    stdout:    run?.stdout ?? null,
  };
}

export async function runAllTestCases(
  code: string,
  language: string,
  testCases: { input: string; expectedOutput: string }[],
  _timeLimitMs: number,
  _memoryLimitKb: number,
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
