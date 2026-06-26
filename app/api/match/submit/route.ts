import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GetCommand, UpdateCommand, PutCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo, TABLE } from "@/lib/dynamo";
import { getProblemById } from "@/lib/problems";
import { runAllTestCases } from "@/lib/piston";
import { calcElo } from "@/lib/elo";
import sql from "@/lib/postgres";
import { isSupportedLanguage } from "@/lib/languages";

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

    if (!isSupportedLanguage(language)) {
      return NextResponse.json({
        result: "unsupported_language",
        testsPassed: 0,
        testsTotal: 0,
        matchOver: false,
        won: false,
        error: "This language is not yet supported. More languages coming soon!"
      });
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

    // 6 — Run all test cases through Piston (free, open-source sandbox)
    // SECURITY: Code is ONLY executed remotely via the Piston API (sandboxed containers).
    // If Piston is unavailable, runAllTestCases returns an execution_service_unavailable
    // status. We return HTTP 503 — we NEVER execute user code locally.
    const execution = await runAllTestCases(
      code,
      language,
      problem.testCases, // run ALL including hidden ones
      problem.timeLimit,
      problem.memoryLimit,
      problem.id
    );

    // SECURITY: If the execution service is down, return 503 immediately.
    // Do NOT record a submission or update match state when we couldn't actually run the code.
    if (execution.firstFailure?.status === "execution_service_unavailable") {
      return NextResponse.json(
        {
          error: "EXECUTION_SERVICE_UNAVAILABLE",
          message: "Code execution service is temporarily unavailable. Please try again in a few moments.",
        },
        { status: 503 }
      );
    }

    const myRole = isPlayer1 ? "player1" : "player2";
    const opponentRole = isPlayer1 ? "player2" : "player1";

    // 7 — Write submission record to DynamoDB
    const now = Date.now();
    const ttl = Math.floor(now / 1000) + 3600;
    const dbStatus = execution.allPassed ? "accepted" : (execution.firstFailure?.status ?? "wrong_answer");

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
          status:       dbStatus,
          testsPassed:  execution.passed,
          testsTotal:   execution.total,
          runtimeMs:    execution.runtimeMs,
          submittedAt:  now,
          ttl,
        },
      })
    );

    // Sync submission to Aurora PostgreSQL
    try {
      const ghId = parseInt(userId);
      await sql`
        INSERT INTO submissions (
          match_id, user_id, problem_id, language, code, status,
          test_cases_passed, test_cases_total, runtime_ms, submitted_at
        ) VALUES (
          ${matchId},
          (SELECT id FROM users WHERE github_id = ${ghId}),
          (SELECT id FROM problems WHERE slug = ${problem.id}),
          ${language}, ${code}, ${dbStatus},
          ${execution.passed}, ${execution.total}, ${execution.runtimeMs}, NOW()
        )
      `;
    } catch (err) {
      console.error("Failed to sync submission to Postgres:", err);
    }

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

      const [winnerProfileResult, loserProfileResult] = await Promise.all([
        dynamo.send(new GetCommand({ TableName: TABLE, Key: { PK: `USER#${winner.userId}`, SK: "PROFILE" } })),
        dynamo.send(new GetCommand({ TableName: TABLE, Key: { PK: `USER#${loser.userId}`, SK: "PROFILE" } }))
      ]);

      const liveWinnerElo = winnerProfileResult.Item?.elo ?? 1200;
      const liveLoserElo = loserProfileResult.Item?.elo ?? 1200;

      const newWinnerElo = calcElo(liveWinnerElo, liveLoserElo, true);
      const newLoserElo  = calcElo(liveLoserElo, liveWinnerElo, false);

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
                  "SET #s = :status, winnerId = :wid, finishedAt = :now, endedBy = :by",
                ExpressionAttributeNames: { "#s": "status" },
                ExpressionAttributeValues: {
                  ":status": "finished",
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
                UpdateExpression: "SET elo = :newElo ADD wins :one",
                ConditionExpression: "elo = :liveElo", // Must match the Pre-Flight live read!
                ExpressionAttributeValues: {
                  ":newElo": newWinnerElo,
                  ":liveElo": liveWinnerElo,
                  ":one": 1
                }
              }
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
                UpdateExpression: "SET elo = :newElo ADD losses :one",
                ConditionExpression: "elo = :liveElo", // Must match the Pre-Flight live read!
                ExpressionAttributeValues: {
                  ":newElo": newLoserElo,
                  ":liveElo": liveLoserElo,
                  ":one": 1
                }
              }
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

      // Sync match_results to Aurora PostgreSQL
      try {
        const durationSeconds = Math.floor((now - match.startedAt) / 1000);
        const winnerGhId = parseInt(winner.userId);
        const loserGhId = parseInt(loser.userId);

        await sql`
          INSERT INTO match_results (
            match_id, problem_id, winner_id, loser_id,
            winner_elo_before, winner_elo_after,
            loser_elo_before, loser_elo_after,
            duration_seconds, ended_by, played_at
          ) VALUES (
            ${matchId},
            (SELECT id FROM problems WHERE slug = ${problem.id}),
            (SELECT id FROM users WHERE github_id = ${winnerGhId}),
            (SELECT id FROM users WHERE github_id = ${loserGhId}),
            ${winner.elo}, ${newWinnerElo},
            ${loser.elo}, ${newLoserElo},
            ${durationSeconds}, 'submission', NOW()
          )
        `;
      } catch (err) {
        console.error("Failed to sync match_result to Postgres:", err);
      }

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
