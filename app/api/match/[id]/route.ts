import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GetCommand, UpdateCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo, TABLE } from "@/lib/dynamo";
import { getProblemById } from "@/lib/problems";
import { calcElo } from "@/lib/elo";
import sql from "@/lib/postgres";

const MATCH_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id as string;
  const { id: matchId } = await params;

  // Fetch match from DynamoDB
  const result = await dynamo.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `MATCH#${matchId}`, SK: "META" },
    })
  );

  if (!result.Item) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const match = result.Item;

  // Security: only players in this match can see it
  if (
    match.player1.userId !== userId &&
    match.player2.userId !== userId
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const myRole = match.player1.userId === userId ? "player1" : "player2";
  const opponentRole = myRole === "player1" ? "player2" : "player1";

  // Auto-expire: if the match is still "active" but the timer has run out,
  // mark it finished server-side so players aren't stuck in it.
  if (
    match.status === "active" &&
    Date.now() - match.startedAt >= MATCH_DURATION_MS
  ) {
    const now = Date.now();
    await dynamo.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `MATCH#${matchId}`, SK: "META" },
        UpdateExpression:
          "SET #s = :finished, finishedAt = :now, endedBy = :reason",
        ConditionExpression: "#s = :active", // only if still active (race-safe)
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":finished": "finished",
          ":active":   "active",
          ":now":      now,
          ":reason":   "timeout",
        },
      })
    ).catch(() => {
      // If two clients race here, one will get ConditionalCheckFailed — ignore it
    });

    // Return the match as finished so the client shows "Time's Up"
    match.status     = "finished";
    match.finishedAt = now;
    match.endedBy    = "timeout";
  } else if (match.status === "active") {
    // ── Ghost Abandon Heartbeat ──
    // 1. Update my last ping
    const now = Date.now();
    await dynamo.send(new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `MATCH#${matchId}`, SK: "META" },
      UpdateExpression: `SET ${myRole}.lastPingAt = :now`,
      ExpressionAttributeValues: { ":now": now }
    })).catch(() => {});

    // 2. Check opponent's last ping
    const opponent = match[opponentRole];
    const opponentLastPingAt = opponent.lastPingAt ?? match.startedAt;
    
    if (now - opponentLastPingAt > 15000) {
      // Opponent disconnected!
      const winnerId = userId;
      const loserId = opponent.userId;

      // Fetch live profiles for accurate ELO calculation
      const [winnerRes, loserRes] = await Promise.all([
        dynamo.send(new GetCommand({ TableName: TABLE, Key: { PK: `USER#${winnerId}`, SK: "PROFILE" } })),
        dynamo.send(new GetCommand({ TableName: TABLE, Key: { PK: `USER#${loserId}`, SK: "PROFILE" } }))
      ]);

      const liveWinnerElo = winnerRes.Item?.elo ?? match[myRole].elo;
      const liveLoserElo  = loserRes.Item?.elo ?? opponent.elo;

      const newWinnerElo = calcElo(liveWinnerElo, liveLoserElo, true);
      const newLoserElo  = calcElo(liveLoserElo, liveWinnerElo, false);

      try {
        await dynamo.send(new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: TABLE,
                Key: { PK: `MATCH#${matchId}`, SK: "META" },
                UpdateExpression: "SET #s = :status, winnerId = :wid, finishedAt = :now, endedBy = :by",
                ConditionExpression: "#s = :active",
                ExpressionAttributeNames: { "#s": "status" },
                ExpressionAttributeValues: {
                  ":status": "forfeited",
                  ":wid": winnerId,
                  ":now": now,
                  ":by": "timeout_disconnect"
                }
              }
            },
            {
              Update: {
                TableName: TABLE,
                Key: { PK: `USER#${winnerId}`, SK: "PROFILE" },
                UpdateExpression: "SET elo = :elo ADD wins :one",
                ConditionExpression: "elo = :liveElo",
                ExpressionAttributeValues: { ":elo": newWinnerElo, ":liveElo": liveWinnerElo, ":one": 1 }
              }
            },
            {
              Put: {
                TableName: TABLE,
                Item: {
                  PK: `USER#${winnerId}`, SK: "LEADERBOARD", GSI1PK: "LEADERBOARD#GLOBAL", GSI1SK: newWinnerElo,
                  userId: winnerId, username: match[myRole].username
                }
              }
            },
            {
              Update: {
                TableName: TABLE,
                Key: { PK: `USER#${loserId}`, SK: "PROFILE" },
                UpdateExpression: "SET elo = :elo ADD losses :one",
                ConditionExpression: "elo = :liveElo",
                ExpressionAttributeValues: { ":elo": newLoserElo, ":liveElo": liveLoserElo, ":one": 1 }
              }
            },
            {
              Put: {
                TableName: TABLE,
                Item: {
                  PK: `USER#${loserId}`, SK: "LEADERBOARD", GSI1PK: "LEADERBOARD#GLOBAL", GSI1SK: newLoserElo,
                  userId: loserId, username: opponent.username
                }
              }
            }
          ]
        }));

        // Sync to Postgres
        try {
          const durationSeconds = Math.floor((now - match.startedAt) / 1000);
          const winnerGhId = parseInt(winnerId);
          const loserGhId = parseInt(loserId);
          await sql`
            INSERT INTO match_results (
              match_id, problem_id, winner_id, loser_id,
              winner_elo_before, winner_elo_after, loser_elo_before, loser_elo_after,
              duration_seconds, ended_by, played_at
            ) VALUES (
              ${matchId}, (SELECT id FROM problems WHERE slug = ${match.problemId}),
              (SELECT id FROM users WHERE github_id = ${winnerGhId}),
              (SELECT id FROM users WHERE github_id = ${loserGhId}),
              ${match[myRole].elo}, ${newWinnerElo}, ${opponent.elo}, ${newLoserElo},
              ${durationSeconds}, 'timeout_disconnect', NOW()
            )
          `;
        } catch (e) {
          console.error("Failed to sync ghost abandon to pg:", e);
        }

        match.status = "forfeited";
        match.finishedAt = now;
        match.winnerId = winnerId;
        match.endedBy = "timeout_disconnect";
        match[myRole].elo = newWinnerElo;
        match[opponentRole].elo = newLoserElo;
      } catch (err) {
        // Condition check failed means someone else updated the match or ELO concurrently
      }
    }
  }

  // Attach problem data (from local JSON, not DB)
  const problem = getProblemById(match.problemId);
  if (!problem) {
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }

  // Strip hidden test cases — only reveal after match ends
  const visibleProblem = {
    ...problem,
    testCases:
      match.status === "finished"
        ? problem.testCases
        : problem.testCases.filter((tc) => !tc.isHidden),
  };

  return NextResponse.json({
    match: {
      matchId:    match.matchId,
      status:     match.status,
      startedAt:  match.startedAt,
      finishedAt: match.finishedAt ?? null,
      winnerId:   match.winnerId   ?? null,
      endedBy:    match.endedBy    ?? null,
      player1:    match.player1,
      player2:    match.player2,
    },
    problem: visibleProblem,
    myRole,
  });
}
