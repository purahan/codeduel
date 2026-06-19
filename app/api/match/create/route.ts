import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PutCommand, GetCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo, TABLE } from "@/lib/dynamo";
import { getRandomProblem } from "@/lib/problems";
import { v4 as uuidv4 } from "uuid";

export async function POST() {
  // 1 — Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id as string;
  const username = session.user.name ?? "anonymous";

  // 2 — Get user's current ELO from DynamoDB
  const userItem = await dynamo.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${userId}`, SK: "PROFILE" },
    })
  );

  const myElo: number = userItem.Item?.elo ?? 1200;

  // 3 — Check if this user is already in queue
  const existingQueue = await dynamo.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `QUEUE#${userId}`, SK: "WAITING" },
    })
  );

  if (existingQueue.Item) {
    return NextResponse.json(
      { error: "Already in queue" },
      { status: 409 }
    );
  }

  // 4 — Scan for an opponent in the queue with ELO within ±200
  const queueScan = await dynamo.send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression: "begins_with(PK, :prefix) AND SK = :sk AND userId <> :me",
      ExpressionAttributeValues: {
        ":prefix": "QUEUE#",
        ":sk": "WAITING",
        ":me": userId,
      },
    })
  );

  const opponents = (queueScan.Items ?? []).filter(
    (item) => Math.abs((item.elo ?? 1200) - myElo) <= 200
  );

  // 5a — Opponent found: create a match immediately
  if (opponents.length > 0) {
    const opponent = opponents[0];
    const matchId = uuidv4();
    const problem = getRandomProblem(); // random difficulty for now
    const now = Date.now();
    const ttl = Math.floor(now / 1000) + 3600; // 1 hour TTL

    // Write match session to DynamoDB
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

    // Remove opponent from queue
    await dynamo.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { PK: `QUEUE#${opponent.userId}`, SK: "WAITING" },
      })
    );

    return NextResponse.json({ matchId, status: "matched" });
  }

  // 5b — No opponent found: join the queue
  const ttl = Math.floor(Date.now() / 1000) + 300; // 5 min TTL

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
      },
    })
  );

  return NextResponse.json({ status: "queued" });
}
