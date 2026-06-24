import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo, TABLE } from "@/lib/dynamo";
import { getProblemById } from "@/lib/problems";

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
    myRole: match.player1.userId === userId ? "player1" : "player2",
  });
}
