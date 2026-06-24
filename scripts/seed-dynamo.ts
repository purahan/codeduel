/**
 * CodeDuel — DynamoDB Seed Script
 * --------------------------------
 * Run once to populate CodeDuelTable with initial data.
 *
 * Usage:
 *   npx ts-node --skip-project scripts/seed-dynamo.ts
 *
 * Requires these env vars (same as your .env.local):
 *   AWS_REGION
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 */
 
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const TABLE = "CodeDuelTable";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? "eu-north-1",
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const dynamo = DynamoDBDocumentClient.from(client);

// ─── SEED USERS ───────────────────────────────────────────────────────────────
// Add your real GitHub user ID and username here.
// You can find your GitHub user ID at: https://api.github.com/users/YOUR_USERNAME

const SEED_USERS = [
  {
    userId:   "70795912",       // ← replace with your real GitHub user ID
    username: "purahan",        // ← replace with your GitHub username
    email:    null,
    avatar:   "https://avatars.githubusercontent.com/u/70795912",
    elo:      1200,
    wins:     0,
    losses:   0,
  },
  // Add more users here if you want to demo a leaderboard with multiple entries
  {
    userId:   "11111111",
    username: "ghost_coder",
    email:    null,
    avatar:   "https://avatars.githubusercontent.com/u/11111111",
    elo:      1340,
    wins:     8,
    losses:   3,
  },
  {
    userId:   "22222222",
    username: "ByteNinja",
    email:    null,
    avatar:   "https://avatars.githubusercontent.com/u/22222222",
    elo:      1285,
    wins:     5,
    losses:   4,
  },
  {
    userId:   "33333333",
    username: "AlgoKing",
    email:    null,
    avatar:   "https://avatars.githubusercontent.com/u/33333333",
    elo:      1420,
    wins:     15,
    losses:   4,
  },
  {
    userId:   "44444444",
    username: "NullPointer",
    email:    null,
    avatar:   "https://avatars.githubusercontent.com/u/44444444",
    elo:      1150,
    wins:     3,
    losses:   7,
  },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function nowMs()  { return Date.now(); }
function nowSecs(offsetSeconds = 0) {
  return Math.floor(Date.now() / 1000) + offsetSeconds;
}

// ─── SEED FUNCTIONS ───────────────────────────────────────────────────────────

async function seedUsers() {
  console.log("\n📦 Seeding users + leaderboard entries...");

  for (const user of SEED_USERS) {
    // 1. USER PROFILE
    await dynamo.send(new PutCommand({
      TableName: TABLE,
      Item: {
        PK:        `USER#${user.userId}`,
        SK:        "PROFILE",
        userId:    user.userId,
        username:  user.username,
        email:     user.email,
        avatar:    user.avatar,
        elo:       user.elo,
        wins:      user.wins,
        losses:    user.losses,
        createdAt: nowMs(),
      },
    }));

    // 2. LEADERBOARD ENTRY (uses GSI1)
    await dynamo.send(new PutCommand({
      TableName: TABLE,
      Item: {
        PK:       `USER#${user.userId}`,
        SK:       "LEADERBOARD",
        GSI1PK:   "LEADERBOARD#GLOBAL",
        GSI1SK:   user.elo,             // Number — sorted by ELO descending via GSI
        userId:   user.userId,
        username: user.username,
        avatar:   user.avatar,
        wins:     user.wins,
        losses:   user.losses,
      },
    }));

    console.log(`  ✓ ${user.username} (ELO: ${user.elo})`);
  }
}

async function seedDemoMatch() {
  console.log("\n🎮 Seeding a demo finished match...");

  const matchId = "demo-match-00000000-0000-0000-0000-000000000001";
  const player1 = SEED_USERS[0]; // purahan
  const player2 = SEED_USERS[1]; // ghost_coder
  const startedAt = nowMs() - 1000 * 60 * 8; // 8 minutes ago
  const finishedAt = nowMs() - 1000 * 60 * 2; // ended 2 minutes ago
  const ttl = nowSecs(3600);                   // expires in 1 hour

  // MATCH META
  await dynamo.send(new PutCommand({
    TableName: TABLE,
    Item: {
      PK:         `MATCH#${matchId}`,
      SK:         "META",
      matchId,
      problemId:  "two-sum",
      status:     "finished",
      startedAt,
      finishedAt,
      winnerId:   player1.userId,
      endedBy:    "submission",
      player1: {
        userId:     player1.userId,
        username:   player1.username,
        elo:        player1.elo,
        hintsUsed:  1,
        submitted:  true,
        passed:     true,
      },
      player2: {
        userId:     player2.userId,
        username:   player2.username,
        elo:        player2.elo,
        hintsUsed:  0,
        submitted:  true,
        passed:     false,
      },
      ttl,
    },
  }));

  // PLAYER 1 SUBMISSION (winning)
  await dynamo.send(new PutCommand({
    TableName: TABLE,
    Item: {
      PK:           `MATCH#${matchId}`,
      SK:           `SUB#${player1.userId}#${startedAt + 1000 * 60 * 6}`,
      matchId,
      userId:       player1.userId,
      language:     "python",
      code:         "def twoSum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i",
      status:       "accepted",
      testsPassed:  3,
      testsTotal:   3,
      runtimeMs:    42,
      submittedAt:  startedAt + 1000 * 60 * 6,
      ttl,
    },
  }));

  // PLAYER 2 SUBMISSION (wrong answer)
  await dynamo.send(new PutCommand({
    TableName: TABLE,
    Item: {
      PK:           `MATCH#${matchId}`,
      SK:           `SUB#${player2.userId}#${startedAt + 1000 * 60 * 7}`,
      matchId,
      userId:       player2.userId,
      language:     "javascript",
      code:         "function twoSum(nums, target) {\n  return [];\n}",
      status:       "wrong_answer",
      testsPassed:  0,
      testsTotal:   3,
      runtimeMs:    null,
      submittedAt:  startedAt + 1000 * 60 * 7,
      ttl,
    },
  }));

  console.log(`  ✓ Demo match seeded (${player1.username} beat ${player2.username} on Two Sum)`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Seeding CodeDuelTable in ${process.env.AWS_REGION ?? "eu-north-1"}...`);
  console.log(`   Table: ${TABLE}`);

  try {
    await seedUsers();
    await seedDemoMatch();
    console.log("\n✅ Seed complete!\n");
    console.log("Verify in AWS Console:");
    console.log("  DynamoDB → Tables → CodeDuelTable → Explore table items");
    console.log("  Filter: GSI1PK = LEADERBOARD#GLOBAL  →  should show all users sorted by ELO\n");
  } catch (err: any) {
    console.error("\n❌ Seed failed:", err.message ?? err);
    console.error("\nCommon causes:");
    console.error("  - AWS credentials not set in .env.local");
    console.error("  - Table name mismatch (check CodeDuelTable exists in eu-north-1)");
    console.error("  - GSI1 not created on the table\n");
    process.exit(1);
  }
}

main();
