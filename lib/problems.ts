import problems from "@/app/data/problems.json";
import { Problem } from "./types";

const allProblems = problems as Problem[];

export function getProblemById(id: string): Problem | undefined {
  return allProblems.find((p) => p.id === id);
}

export function getRandomProblem(difficulty?: "easy" | "medium" | "hard"): Problem {
  const pool = difficulty
    ? allProblems.filter((p) => p.difficulty === difficulty)
    : allProblems;

  return pool[Math.floor(Math.random() * pool.length)];
}

export function getAllProblems(): Problem[] {
  return allProblems;
}
