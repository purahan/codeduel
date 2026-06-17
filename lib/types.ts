export type Difficulty = "easy" | "medium" | "hard";

export interface Problem {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  tags: string[];
  testCases: TestCase[];
  starterCode: Record<string, string>; // language -> starter code
}

export interface TestCase {
  input: string;
  expectedOutput: string;
  isHidden: boolean;
}

export interface MatchSession {
  matchId: string;
  player1: PlayerSlot;
  player2: PlayerSlot;
  problemId: string;
  status: "waiting" | "active" | "finished";
  startedAt: number;
  finishedAt?: number;
  winnerId?: string;
  ttl: number;
}

export interface PlayerSlot {
  userId: string;
  username: string;
  elo: number;
  hintsUsed: number;
  submitted: boolean;
  passed: boolean;
}

export interface UserProfile {
  userId: string;
  username: string;
  elo: number;
  wins: number;
  losses: number;
  createdAt: number;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  elo: number;
  wins: number;
  losses: number;
}
