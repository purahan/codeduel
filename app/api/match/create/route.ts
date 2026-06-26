import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  PutCommand, GetCommand, DeleteCommand, ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { dynamo, TABLE } from "@/lib/dynamo";
import { getRandomProblem, getProblemById } from "@/lib/problems";
import { v4 as uuidv4 } from "uuid";

const MATCH_DURATION_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
  // 1 — Auth
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id as string;
  const username = session.user.name ?? "anonymous";

  let requestedProblemId: string | undefined = undefined;
  try {
    const body = await req.json();
    requestedProblemId = body.problemId;
  } catch (err) { }

  // 2 — Get current ELO
  const userItem = await dynamo.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${userId}`, SK: "PROFILE" },
    })
  );
  const myElo: number = userItem.Item?.elo ?? 1200;

  // Check for active matchmaking ban 
  const banUntil = userItem.Item?.queueBanUntil ?? 0;
  const isDevBypass = userItem.Item?.username === "Rishabh9877" || userItem.Item?.username === "Rishabh-pec";
  if (!isDevBypass && Date.now() < banUntil) {
    const secondsLeft = Math.ceil((banUntil - Date.now()) / 1000);
    return NextResponse.json(
      {
        error: "Queue Banned",
        message: `You abandoned a match early. You can queue again in ${secondsLeft} seconds.`,
        secondsLeft
      },
      { status: 403 }
    );
  }

  // 3 — Guard: already in a live (non-expired) match?
  const activeMatchScan = await dynamo.send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression:
        "SK = :sk AND #s = :active AND (player1.userId = :uid OR player2.userId = :uid)",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":sk": "META",
        ":active": "active",
        ":uid": userId,
      },
      // No Limit — DynamoDB's Limit applies BEFORE FilterExpression, so a
      // small limit would miss matches that aren't in the first N raw rows.
    })
  );
  const nowMs = Date.now();
  const validActive = (activeMatchScan.Items ?? []).filter(
    (item) => (item.startedAt ?? 0) + MATCH_DURATION_MS > nowMs
  );
  if (validActive.length > 0) {
    return NextResponse.json(
      { error: "Already in an active match", matchId: validActive[0].matchId },
      { status: 409 }
    );
  }

  // 4 — Check if already in queue (don't exit — just track it).
  //     Both players can race into the queue at the same time. When the
  //     polling loop re-calls this route we must still try to match them.
  const existingQueue = await dynamo.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `QUEUE#${userId}`, SK: "WAITING" },
    })
  );
  const alreadyInQueue = !!existingQueue.Item;

  // 5 — Scan queue for eligible opponents (non-expired, within ±200 ELO)
  const nowSec = Math.floor(Date.now() / 1000);

  const queueScan = await dynamo.send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression:
        "begins_with(PK, :prefix) AND SK = :sk AND userId <> :me AND #ttl > :now",
      ExpressionAttributeNames: { "#ttl": "ttl" },
      ExpressionAttributeValues: {
        ":prefix": "QUEUE#",
        ":sk": "WAITING",
        ":me": userId,
        ":now": nowSec,
      },
    })
  );

  const nowMsCurrent = Date.now();
  const eligible = (queueScan.Items ?? []).filter(
    (item) => {
      const opponentWaitTime = nowMsCurrent - (item.queuedAt ?? nowMsCurrent);
      let allowedDiff = 200;
      if (opponentWaitTime > 60000) allowedDiff = 800;
      else if (opponentWaitTime >= 30000) allowedDiff = 400;

      return Math.abs((item.elo ?? 1200) - myElo) <= allowedDiff &&
        (!requestedProblemId || !item.requestedProblemId || item.requestedProblemId === requestedProblemId);
    }
  );

  // 6a — Opponent found: atomically claim them then create the match
  for (const opponent of eligible) {
    try {
      await dynamo.send(
        new DeleteCommand({
          TableName: TABLE,
          Key: { PK: `QUEUE#${opponent.userId}`, SK: "WAITING" },
          ConditionExpression: "attribute_exists(PK)",
        })
      );

      // Also remove ourselves from the queue if we were in it
      if (alreadyInQueue) {
        await dynamo.send(
          new DeleteCommand({
            TableName: TABLE,
            Key: { PK: `QUEUE#${userId}`, SK: "WAITING" },
          })
        ).catch(() => { });
      }

      const matchId = uuidv4();
      const finalProblemId = requestedProblemId || opponent.requestedProblemId;
      const problem = finalProblemId ? (getProblemById(finalProblemId) || getRandomProblem()) : getRandomProblem();
      const now = Date.now();
      const ttl = Math.floor(now / 1000) + 3600;

      await dynamo.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            PK: `MATCH#${matchId}`,
            SK: "META",
            matchId,
            problemId: problem.id,
            status: "active",
            startedAt: now,
            finishedAt: null,
            winnerId: null,
            endedBy: null,
            player1: {
              userId,
              username,
              elo: myElo,
              hintsUsed: 0,
              submitted: false,
              passed: false,
            },
            player2: {
              userId: opponent.userId,
              username: opponent.username,
              elo: opponent.elo ?? 1200,
              hintsUsed: 0,
              submitted: false,
              passed: false,
            },
            ttl,
          },
        })
      );

      return NextResponse.json({ matchId, status: "matched" });

    } catch (err: any) {
      if (err instanceof ConditionalCheckFailedException) {
        continue; // Opponent already claimed — try next
      }
      throw err;
    }
  }

  // 6b — No opponent: add/refresh own queue entry
  const ttl = Math.floor(Date.now() / 1000) + 300;

  await dynamo.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `QUEUE#${userId}`,
        SK: "WAITING",
        userId,
        username,
        elo: myElo,
        queuedAt: Date.now(),
        ttl,
        requestedProblemId,
      },
    })
  );

  return NextResponse.json({ status: "queued" });
}
