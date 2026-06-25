import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo, TABLE } from "@/lib/dynamo";
import { calcElo } from "@/lib/elo";

/**
 * Public HTTP POST Gateway for Match Lifecycle Timeouts.
 * Path: /api/match/timeout
 * Triggered when the frontend countdown clock hits 00:00.
 */
export async function POST(req: Request) {
  try {
    // 1 — AUTHENTICATION GUARD
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { matchId } = await req.json();
    if (!matchId) {
      return NextResponse.json({ error: "matchId is required" }, { status: 400 });
    }

    // 2 — FETCH CURRENT LIVE MATCH STATE
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

    // 3 — STATE VALIDATION: Ensure the match is actually still running
    if (match.status !== "active") {
      return NextResponse.json({ error: "Conflict", message: "Match is already finalized." }, { status: 409 });
    }

    // 4 — DETERMINE WINNER BASED ON PARTIAL PROGRESS
    const p1 = match.player1;
    const p2 = match.player2;

    // Fallback to 0 if they haven't submitted anything yet
    const p1Score = p1.testsPassed ?? 0;
    const p2Score = p2.testsPassed ?? 0;

    let isTie = p1Score === p2Score;
    let winnerId = "";
    let loserId = "";

    if (!isTie) {
      winnerId = p1Score > p2Score ? p1.userId : p2.userId;
      loserId  = p1Score > p2Score ? p2.userId : p1.userId;
    }

    const now = Date.now();
    const transactItems: any[] = [
      // Always item 1: Update the match status to "timed_out"
      {
        Update: {
          TableName: TABLE,
          Key: { PK: `MATCH#${matchId}`, SK: "META" },
          UpdateExpression: "SET #s = :status, finishedAt = :now, endedBy = :by, tie = :isTie" + (!isTie ? ", winnerId = :wid" : ""),
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":status": "timed_out",
            ":now": now,
            ":by": "timeout",
            ":isTie": isTie,
            ...(!isTie && { ":wid": winnerId })
          }
        }
      }
    ];

    let newWinnerElo = 0;
    let newLoserElo = 0;

    // 5 — CONSTRUCT TRANSACTION PATH BASED ON OUTCOME
    if (!isTie) {
      // Find out which helper object maps to winner vs loser to get their historical ELOs
      const winnerObj = p1.userId === winnerId ? p1 : p2;
      const loserObj  = p1.userId === loserId ? p1 : p2;

      newWinnerElo = calcElo(winnerObj.elo, loserObj.elo, true);
      newLoserElo  = calcElo(loserObj.elo, winnerObj.elo, false);

      // Append Winner Profile Update (with Optimistic Lock Guard)
      transactItems.push({
        Update: {
          TableName: TABLE,
          Key: { PK: `USER#${winnerId}`, SK: "PROFILE" },
          UpdateExpression: "SET elo = :elo ADD wins :one",
          ConditionExpression: "elo = :oldElo",
          ExpressionAttributeValues: { ":elo": newWinnerElo, ":oldElo": winnerObj.elo, ":one": 1 }
        }
      });

      // Append Winner Leaderboard Entry
      transactItems.push({
        Put: {
          TableName: TABLE,
          Item: {
            PK: `USER#${winnerId}`, SK: "LEADERBOARD", GSI1PK: "LEADERBOARD#GLOBAL", GSI1SK: newWinnerElo,
            userId: winnerId, username: winnerObj.username
          }
        }
      });

      // Append Loser Profile Update (with Optimistic Lock Guard)
      transactItems.push({
        Update: {
          TableName: TABLE,
          Key: { PK: `USER#${loserId}`, SK: "PROFILE" },
          UpdateExpression: "SET elo = :elo ADD losses :one",
          ConditionExpression: "elo = :oldElo",
          ExpressionAttributeValues: { ":elo": newLoserElo, ":oldElo": loserObj.elo, ":one": 1 }
        }
      });

      // Append Loser Leaderboard Entry
      transactItems.push({
        Put: {
          TableName: TABLE,
          Item: {
            PK: `USER#${loserId}`, SK: "LEADERBOARD", GSI1PK: "LEADERBOARD#GLOBAL", GSI1SK: newLoserElo,
            userId: loserId, username: loserObj.username
          }
        }
      });
    }

    // 6 — EXECUTE ATOMIC TRANSACTION WRITE
    if (transactItems.length > 0) {
      await dynamo.send(new TransactWriteCommand({ TransactItems: transactItems }));
    }

    return NextResponse.json({
      status: "timed_out",
      isTie,
      scores: { [p1.userId]: p1Score, [p2.userId]: p2Score },
      ...(!isTie && { winnerId, newWinnerElo, newLoserElo })
    }, { status: 200 });

  } catch (error: any) {
    console.error("[API Match Timeout Critical Error]:", error);

    if (error.name === "TransactionCanceledException" && error.message.includes("ConditionalCheckFailed")) {
      return NextResponse.json(
        { error: "CONCURRENCY_CONFLICT", message: "Profiles updated out-of-band during calculation. Retry timeout sync." },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: error.message }, { status: 500 });
  }
}
