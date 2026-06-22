import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo, TABLE } from "./dynamo.ts";
import { calcElo } from "./elo.ts";

/**
 * Core backend orchestrator to handle match finalization.
 * * DESIGN PARADIGMS:
 * 1. Idempotency/Accuracy: Fetches real-time database state before computation.
 * 2. High-Concurrency Safety: Uses AWS DynamoDB TransactWrite with ConditionExpressions
 * (Optimistic Locking) to prevent race conditions across concurrent match updates.
 */
export async function processMatchEnd(winnerId: string, loserId: string) {
  try {
    console.log(`[MatchEngine]: Initiating match finalization. Winner: ${winnerId} | Loser: ${loserId}`);

    // ==========================================
    // STEP 1: THE PULL (Fetch live profiles)
    // ==========================================
    const [winnerRes, loserRes] = await Promise.all([
      dynamo.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${winnerId}`, SK: "PROFILE" }
      })),
      dynamo.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${loserId}`, SK: "PROFILE" }
      }))
    ]);

    // Extract current ELO values, defaulting to 1200 if it's a brand new profile
    const winnerOldElo = winnerRes.Item?.elo ?? 1200;
    const loserOldElo = loserRes.Item?.elo ?? 1200;

    // ==========================================
    // STEP 2: THE COMPUTATION (Run ELO Logic)
    // ==========================================
    const newWinnerElo = calcElo(winnerOldElo, loserOldElo, true);
    const newLoserElo = calcElo(loserOldElo, winnerOldElo, false);

    console.log(`[MatchEngine]: Calculated ELO Transitions:`);
    console.log(` -> Winner (${winnerId}): ${winnerOldElo} -> ${newWinnerElo}`);
    console.log(` -> Loser (${loserId}): ${loserOldElo} -> ${newLoserElo}`);

    // ==========================================
    // STEP 3: HIGH-CONCURRENCY WRITE (Atomic Commit)
    // ==========================================
    // We use TransactWriteCommand so BOTH players are updated simultaneously.
    // If either player's ELO changed in the database while we were calculating, 
    // the ConditionExpression fails, aborting the write to prevent data corruption.
    await dynamo.send(new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLE,
            Key: { PK: `USER#${winnerId}`, SK: "PROFILE" },
            UpdateExpression: "SET elo = :newWinnerElo",
            ConditionExpression: "elo = :winnerOldElo",
            ExpressionAttributeValues: {
              ":newWinnerElo": newWinnerElo,
              ":winnerOldElo": winnerOldElo
            }
          }
        },
        {
          Update: {
            TableName: TABLE,
            Key: { PK: `USER#${loserId}`, SK: "PROFILE" },
            UpdateExpression: "SET elo = :newLoserElo",
            ConditionExpression: "elo = :loserOldElo",
            ExpressionAttributeValues: {
              ":newLoserElo": newLoserElo,
              ":loserOldElo": loserOldElo
            }
          }
        }
      ]
    }));

    console.log(`[MatchEngine]: Database transaction fully committed.`);
    return {
      success: true,
      data: {
        winner: { id: winnerId, oldElo: winnerOldElo, newElo: newWinnerElo },
        loser: { id: loserId, oldElo: loserOldElo, newElo: newLoserElo }
      }
    };

  } catch (error: any) {
    // If the error code is a ConditionalCheckFailedException, it means Optimistic Locking caught a race condition
    if (error.name === "TransactionCanceledException" && error.message.includes("ConditionalCheckFailed")) {
      console.warn("[MatchEngine Concurrency Alert]: Write aborted. Data was modified out-of-band.");
      return {
        success: false,
        error: "CONCURRENCY_CONFLICT",
        message: "Player state changed during calculation. Please retry the operation."
      };
    }

    console.error("[MatchEngine Error]: Critical database transaction failure:", error);
    return {
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: error.message
    };
  }
}
