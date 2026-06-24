# CodeDuel

A real-time competitive coding platform where two developers race to solve the same problem. First to pass all test cases wins. ELO-based matchmaking, live opponent status, an AI hint coach, and an AI-assisted tiebreaker — all powered by Gemini.

## Tech Stack

- **Frontend & API** — Next.js 16 (App Router), TypeScript, Tailwind CSS
- **Database** — AWS DynamoDB (single-table design with GSI for leaderboards)
- **Code Execution** — [Piston](https://github.com/engineer-man/piston) — free, open-source, no API key required
- **AI Hints & Tiebreaker** — Google Gemini 2.0 Flash (`gemini-2.0-flash`)
- **Auth** — NextAuth.js with GitHub OAuth
- **Deployment** — Vercel

## Architecture

```
Player A ──┐
           ├── Next.js API Routes ── DynamoDB (matches, leaderboard, queue)
Player B ──┘         │
                      ├── Piston API (sandboxed code execution — Python, JS, C++, Java, TS)
                      └── Gemini API (Socratic hint coach + tiebreaker narration)
```

## Getting Started

1. Clone the repo
2. Copy `.env.example` to `.env.local` and fill in your keys
3. Run `npm install`
4. Run `npm run dev`
5. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

| Variable | Purpose |
|---|---|
| `AWS_ACCESS_KEY_ID` | DynamoDB access |
| `AWS_SECRET_ACCESS_KEY` | DynamoDB access |
| `AWS_REGION` | AWS region (e.g. `eu-north-1`) |
| `GEMINI_API_KEY` | AI hints + tiebreaker narration |
| `NEXTAUTH_SECRET` | NextAuth session signing |
| `NEXTAUTH_URL` | App base URL |
| `GITHUB_CLIENT_ID` | GitHub OAuth |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth |

> **No `JUDGE0_API_KEY` or `ANTHROPIC_API_KEY` needed.** Piston is free and keyless; Gemini replaces Anthropic.

## DynamoDB Schema

Single-table design. Key access patterns:

| Entity | PK | SK | Notes |
|---|---|---|---|
| Match session | `MATCH#<id>` | `META` | TTL set to +1hr |
| Player submission | `MATCH#<id>` | `SUB#<userId>#<ts>` | |
| User profile | `USER#<id>` | `PROFILE` | |
| Leaderboard entry | `USER#<id>` | `LEADERBOARD` | GSI1PK=`LEADERBOARD#GLOBAL`, GSI1SK=elo (Number) |
| Queue entry | `QUEUE#<userId>` | `WAITING` | TTL set to +5min |

## AI Features

### Hint Coach
Three-tier Socratic hints per match (max 3 total):
- **Tier 1** — Conceptual nudge (right data structure / algorithm family)
- **Tier 2** — High-level approach (no code)
- **Tier 3** — Concrete pseudocode sketch

### Tiebreaker Judge
When both players submit a correct solution within the same window, Piston measures actual runtime deterministically. Gemini then narrates _why_ one solution won (e.g. "O(n) vs O(n²)") — it explains the score, it doesn't set it.

## Built for

H0: Hack the Zero Stack — Devpost hackathon (June 2026)
