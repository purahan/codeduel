# CodeDuel

A real-time competitive coding platform where two developers race to solve the same problem. First to pass all test cases wins. ELO-based matchmaking, live opponent status, and an AI hint coach powered by Gemini.

## Tech Stack

- **Frontend & API** — Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Database** — AWS DynamoDB (single-table design with GSI for leaderboards)
- **Code Execution** — Judge0 sandboxed execution engine
- **AI Hints** — Google Gemini 2.0 Flash
- **Auth** — NextAuth.js with GitHub OAuth
- **Deployment** — Vercel

## Architecture

```
Player A ──┐
           ├── Next.js API Routes ── DynamoDB (matches, leaderboard, queue)
Player B ──┘         │
                      ├── Judge0 (sandboxed code execution)
                      └── Gemini API (Socratic hint generation)
```

## Getting Started

1. Clone the repo
2. Copy `.env.example` to `.env.local` and fill in your keys
3. Run `npm install`
4. Run `npm run dev`
5. Open [http://localhost:3000](http://localhost:3000)

## DynamoDB Schema

Single-table design. Key access patterns:

| Entity | PK | SK | Notes |
|---|---|---|---|
| Match session | `MATCH#<id>` | `META` | TTL set to +1hr |
| Player submission | `MATCH#<id>` | `SUB#<userId>` | |
| User profile | `USER#<id>` | `PROFILE` | |
| Leaderboard entry | `USER#<id>` | `LEADERBOARD` | GSI1PK=`LEADERBOARD#GLOBAL`, GSI1SK=elo (Number) |

## Built for

H0: Hack the Zero Stack — Devpost hackathon (June 2026)
