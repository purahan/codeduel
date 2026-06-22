import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GetCommand, UpdateCommand, PutCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo, TABLE } from "@/lib/dynamo";
import { getProblemById } from "@/lib/problems";
import { runAllTestCases } from "@/lib/piston";
import { calcElo } from "@/lib/elo";

export async function POST(req: Request) {
  try {
    // 1 — Auth
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id as string;
    const { matchId, code, language } = await req.json();

    if (!matchId || !code || !language) {
      return NextResponse.json({ error: "matchId, code and language are required" }, { status: 400 });
    }

    // 2 — Fetch match from DynamoDB
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

    // 3 — Validate player is in this match
    const isPlayer1 = match.player1.userId === userId;
    const isPlayer2 = match.player2.userId === userId;
    if (!isPlayer1 && !isPlayer2) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 4 — Match must still be active
    if (match.status !== "active") {
      return NextResponse.json({ error: "Match already finished" }, { status: 409 });
    }

    // 5 — Get problem
    const problem = getProblemById(match.problemId);
    if (!problem) {
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }

    // 6 — Run all test cases through Judge0/Piston
    // NOTE: This network call creates a 1-5s processing delay where data states could drift
    const execution = await runAllTestCases(
      code,
      language,
      problem.testCases, // run ALL including hidden ones
      problem.timeLimit,
      problem.memoryLimit
    );

    const myRole = isPlayer1 ? "player1" : "player2";
    const opponentRole = isPlayer1 ? "player2" : "player1";

    // 7 — Write submission record to DynamoDB
    const now = Date.now();
    const ttl = Math.floor(now / 1000) + 3600;

    await dynamo.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `MATCH#${matchId}`,
          SK: `SUB#${userId}#${now}`,
          matchId,
          userId,
          language,
          code,
          status:      execution.allPassed ? "accepted" : (execution.firstFailure?.status ?? "wrong_answer"),
          testsPassed:  execution.passed,
          testsTotal:   execution.total,
          runtimeMs:    execution.runtimeMs,
          submittedAt:  now,
          ttl,
        },
      })
    );

    // 8 — Update player's submission status on the match META item
    await dynamo.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `MATCH#${matchId}`, SK: "META" },
        UpdateExpression: `SET ${myRole}.submitted = :t, ${myRole}.passed = :passed`,
        ExpressionAttributeValues: {
          ":t":      true,
          ":passed": execution.allPassed,
        },
      })
    );

    // 9 — If all test cases passed: this player wins, end the match + update ELO
    if (execution.allPassed) {
      const winner = match[myRole];
      const loser  = match[opponentRole];

      const newWinnerElo = calcElo(winner.elo, loser.elo, true);
      const newLoserElo  = calcElo(loser.elo, winner.elo, false);

      // Secure atomic multi-item cloud transaction with concurrency verification expressions
      await dynamo.send(
        new TransactWriteCommand({
          TransactItems: [
            // Mark match finished
            {
              Update: {
                TableName: TABLE,
                Key: { PK: `MATCH#${matchId}`, SK: "META" },
                UpdateExpression:
                  "SET #s = :finished, winnerId = :wid, finishedAt = :now, endedBy = :by",
                ExpressionAttributeNames: { "#s": "status" },
                ExpressionAttributeValues: {
                  ":finished": "finished",
                  ":wid":      userId,
                  ":now":      now,
                  ":by":       "submission",
                },
              },
            },

            // Winner profile (Protected via Optimistic Locking condition check)
            {
              Update: {
                TableName: TABLE,
                Key: { PK: `USER#${winner.userId}`, SK: "PROFILE" },
                UpdateExpression: "SET elo = :elo ADD wins :one",
                ConditionExpression: "elo = :oldElo",
                ExpressionAttributeValues: {
                  ":elo": newWinnerElo,
                  ":oldElo": winner.elo,
                  ":one": 1,
                },
              },
            },

            // Winner leaderboard entry
            {
              Put: {
                TableName: TABLE,
                Item: {
                  PK:       `USER#${winner.userId}`,
                  SK:       "LEADERBOARD",
                  GSI1PK:   "LEADERBOARD#GLOBAL",
                  GSI1SK:   newWinnerElo,
                  userId:   winner.userId,
                  username: winner.username,
                },
              },
            },

            // Loser profile (Protected via Optimistic Locking condition check)
            {
              Update: {
                TableName: TABLE,
                Key: { PK: `USER#${loser.userId}`, SK: "PROFILE" },
                UpdateExpression: "SET elo = :elo ADD losses :one",
                ConditionExpression: "elo = :oldElo",
                ExpressionAttributeValues: {
                  ":elo": newLoserElo,
                  ":oldElo": loser.elo,
                  ":one": 1,
                },
              },
            },

            // Loser leaderboard entry
            {
              Put: {
                TableName: TABLE,
                Item: {
                  PK:       `USER#${loser.userId}`,
                  SK:       "LEADERBOARD",
                  GSI1PK:   "LEADERBOARD#GLOBAL",
                  GSI1SK:   newLoserElo,
                  userId:   loser.userId,
                  username: loser.username,
                },
              },
            },
          ],
        })
      );

      return NextResponse.json({
        result:       "accepted",
        testsPassed:  execution.passed,
        testsTotal:   execution.total,
        runtimeMs:    execution.runtimeMs,
        matchOver:    true,
        won:          true,
        eloChange:    newWinnerElo - winner.elo,
        newElo:       newWinnerElo,
      });
    }

    // 10 — Wrong answer: return feedback without ending the match
    return NextResponse.json({
      result:       execution.firstFailure?.status ?? "wrong_answer",
      testsPassed:  execution.passed,
      testsTotal:   execution.total,
      matchOver:    false,
      won:          false,
      error:        execution.firstFailure?.stderr ?? null,
    });

  } catch (error: any) {
    console.error("[API Match Submit Critical Error]:", error);

    // Capture distributed runtime collisions when an out-of-band write breaks condition locks
    if (error.name === "TransactionCanceledException" && error.message.includes("ConditionalCheckFailed")) {
      return NextResponse.json(
        { 
          error: "CONCURRENCY_CONFLICT", 
          message: "Transaction safely aborted. Player profile metrics drifted mid-flight during evaluation. Please re-submit." 
        }, 
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "An unexpected system execution fault occurred." },
      { status: 500 }
    );
  }
}
