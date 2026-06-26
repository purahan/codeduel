import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo, TABLE } from "@/lib/dynamo";
import { calcElo } from "@/lib/elo";
import sql from "@/lib/postgres";

/**
 * Public HTTP POST Gateway for Match Forfeits / Rage-Quits.
 * Path: /api/match/forfeit
 * Triggered when a player voluntarily clicks "Leave Match" or disconnects.
 */
export async function POST(req: Request) {
  try {
    // 1 — AUTHENTICATION CHECK
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUserId = (session.user as any).id as string;
    const { matchId } = await req.json();

    if (!matchId) {
      return NextResponse.json({ error: "matchId is required" }, { status: 400 });
    }

    // 2 — FETCH MATCH STATE
    const matchResult = await dynamo.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `MATCH#${matchId}`, SK: "META" },
      })
    );

    const match = matchResult.Item;
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // 3 — STATE VALIDATION
    if (match.status !== "active") {
      return NextResponse.json({ error: "Conflict", message: "Match is already finalized." }, { status: 409 });
    }

    // 4 — VERIFY THE LEAVER IS ACTUALLY IN THIS MATCH
    const isPlayer1 = match.player1.userId === currentUserId;
    const isPlayer2 = match.player2.userId === currentUserId;
    if (!isPlayer1 && !isPlayer2) {
      return NextResponse.json({ error: "Forbidden", message: "You are not a participant in this match." }, { status: 403 });
    }

    // 5 — CHOOSE WINNER AND LOSER BASED ON WHO FORFEITED
    // The person making this API call is the leaver (loser). The other person wins automatically.
    const loserObj  = isPlayer1 ? match.player1 : match.player2;
    const winnerObj = isPlayer1 ? match.player2 : match.player1;

    const winnerId = winnerObj.userId;
    const loserId  = loserObj.userId;

    // Fetch the live profile ELOs instead of relying on the old match snapshot
    const [winnerRes, loserRes] = await Promise.all([
      dynamo.send(new GetCommand({ TableName: TABLE, Key: { PK: `USER#${winnerId}`, SK: "PROFILE" } })),
      dynamo.send(new GetCommand({ TableName: TABLE, Key: { PK: `USER#${loserId}`, SK: "PROFILE" } }))
    ]);

    // ── 90-Second Remake & Escalating Ban Check ──
    const forfeitTime = Date.now();
    const elapsedSeconds = (forfeitTime - match.startedAt) / 1000;

    if (elapsedSeconds <= 90) {
      const currentLeaves = loserRes.Item?.earlyLeaveCount ?? 0;
      const newLeaveCount = currentLeaves + 1;
      
      // Escalating Math: 3m -> 5m -> 7m ... capped at 120m
      const banMinutes = Math.min(120, 3 + (newLeaveCount - 1) * 2);
      const bannedUntil = forfeitTime + (banMinutes * 60 * 1000);

      await dynamo.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: TABLE,
                Key: { PK: `MATCH#${matchId}`, SK: "META" },
                UpdateExpression: "SET #s = :status, finishedAt = :now, endedBy = :by",
                ExpressionAttributeNames: { "#s": "status" },
                ExpressionAttributeValues: {
                  ":status": "cancelled",
                  ":now":    forfeitTime,
                  ":by":     "early_forfeit"
                }
              }
            },
            {
              Update: {
                TableName: TABLE,
                Key: { PK: `USER#${loserId}`, SK: "PROFILE" },
                UpdateExpression: "SET queueBanUntil = :ban, earlyLeaveCount = :cnt",
                ExpressionAttributeValues: {
                  ":ban": bannedUntil,
                  ":cnt": newLeaveCount
                }
              }
            }
          ]
        })
      );

      const finalizedMatch = {
        ...match,
        status: "cancelled",
        finishedAt: forfeitTime,
        endedBy: "early_forfeit"
      };

      return NextResponse.json({ status: "cancelled", bannedUntil, match: finalizedMatch }, { status: 200 });
    }

    const liveWinnerElo = winnerRes.Item?.elo ?? winnerObj.elo;
    const liveLoserElo  = loserRes.Item?.elo ?? loserObj.elo;

    const newWinnerElo = calcElo(liveWinnerElo, liveLoserElo, true);
    const newLoserElo  = calcElo(liveLoserElo, liveWinnerElo, false);

    const now = Date.now();

    // 6 — EXECUTE ATOMIC TRANSACTION WITH OPTIMISTIC LOCKING
    await dynamo.send(
      new TransactWriteCommand({
        TransactItems: [
          // Update Match Status to "forfeited"
          {
            Update: {
              TableName: TABLE,
              Key: { PK: `MATCH#${matchId}`, SK: "META" },
              UpdateExpression: "SET #s = :status, winnerId = :wid, finishedAt = :now, endedBy = :by",
              ExpressionAttributeNames: { "#s": "status" },
              ExpressionAttributeValues: {
                ":status": "forfeited",
                ":wid":      winnerId,
                ":now":      now,
                ":by":       "forfeit"
              }
            }
          },

          // Update Winner Profile (with Concurrency Protection)
          {
            Update: {
              TableName: TABLE,
              Key: { PK: `USER#${winnerId}`, SK: "PROFILE" },
              UpdateExpression: "SET elo = :elo ADD wins :one",
              ConditionExpression: "elo = :liveElo",
              ExpressionAttributeValues: {
                ":elo":     newWinnerElo,
                ":liveElo": liveWinnerElo,
                ":one":     1
              }
            }
          },

          // Update Winner Leaderboard Entry
          {
            Put: {
              TableName: TABLE,
              Item: {
                PK:       `USER#${winnerId}`,
                SK:       "LEADERBOARD",
                GSI1PK:   "LEADERBOARD#GLOBAL",
                GSI1SK:   newWinnerElo,
                userId:   winnerId,
                username: winnerObj.username
              }
            }
          },

          // Update Loser Profile (with Concurrency Protection)
          {
            Update: {
              TableName: TABLE,
              Key: { PK: `USER#${loserId}`, SK: "PROFILE" },
              UpdateExpression: "SET elo = :elo ADD losses :one",
              ConditionExpression: "elo = :liveElo",
              ExpressionAttributeValues: {
                ":elo":     newLoserElo,
                ":liveElo": liveLoserElo,
                ":one":     1
              }
            }
          },

          // Update Loser Leaderboard Entry
          {
            Put: {
              TableName: TABLE,
              Item: {
                PK:       `USER#${loserId}`,
                SK:       "LEADERBOARD",
                GSI1PK:   "LEADERBOARD#GLOBAL",
                GSI1SK:   newLoserElo,
                userId:   loserId,
                username: loserObj.username
              }
            }
          }
        ]
      })
    );

    // 7 — SYNC MATCH RESULT TO AURORA POSTGRESQL
    try {
      const durationSeconds = Math.floor((now - match.startedAt) / 1000);
      const winnerGhId = parseInt(winnerObj.userId);
      const loserGhId = parseInt(loserObj.userId);
      const problemId = match.problemId;

      await sql`
        INSERT INTO match_results (
          match_id, problem_id, winner_id, loser_id,
          winner_elo_before, winner_elo_after,
          loser_elo_before, loser_elo_after,
          duration_seconds, ended_by, played_at
        ) VALUES (
          ${matchId},
          (SELECT id FROM problems WHERE slug = ${problemId}),
          (SELECT id FROM users WHERE github_id = ${winnerGhId}),
          (SELECT id FROM users WHERE github_id = ${loserGhId}),
          ${winnerObj.elo}, ${newWinnerElo},
          ${loserObj.elo}, ${newLoserElo},
          ${durationSeconds}, 'forfeit', NOW()
        )
      `;
    } catch (err) {
      console.error("Failed to sync match_result to Postgres:", err);
    }

    const finalizedMatch = {
      ...match,
      status: "forfeited",
      winnerId: winnerId,
      finishedAt: now,
      endedBy: "forfeit",
      player1: { ...match.player1, elo: isPlayer1 ? newLoserElo : newWinnerElo },
      player2: { ...match.player2, elo: isPlayer1 ? newWinnerElo : newLoserElo }
    };

    return NextResponse.json({
      status: "forfeited",
      leaverId: loserId,
      winnerId: winnerId,
      match: finalizedMatch,
      data: {
        winner: { id: winnerId, newElo: newWinnerElo },
        loser:  { id: loserId, newElo: newLoserElo }
      }
    }, { status: 200 });

  } catch (error: any) {
    console.error("[API Match Forfeit Critical Error]:", error);

    if (error.name === "TransactionCanceledException" && error.message.includes("ConditionalCheckFailed")) {
      return NextResponse.json(
        { error: "CONCURRENCY_CONFLICT", message: "Profiles were updated out-of-band mid-flight. Forfeit processed late." },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: error.message }, { status: 500 });
  }
}
