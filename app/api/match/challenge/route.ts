import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PutCommand, QueryCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo, TABLE } from "@/lib/dynamo";
import { getRandomProblem } from "@/lib/problems";
import { v4 as uuidv4 } from "uuid";

// Send a challenge or Accept a challenge
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id as string;
  const username = session.user.name ?? "anonymous";
  const avatar = session.user.image ?? null;

  try {
    const body = await req.json();
    const { action, targetId } = body;

    if (!action || !targetId) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    if (action === "send") {
      // 1. Send a challenge to targetId
      // Store in DynamoDB so it auto-expires in 5 minutes
      const now = Date.now();
      await dynamo.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            PK: `CHALLENGE#${targetId}`,
            SK: `CHALLENGE#${userId}`,
            challengerId: userId,
            challengerName: username,
            challengerAvatar: avatar,
            createdAt: now,
            ttl: Math.floor(now / 1000) + 300, // 5 mins
          },
        })
      );
      return NextResponse.json({ success: true });
    }

    if (action === "accept") {
      // 2. Accept a challenge from targetId (they are the challenger)
      const now = Date.now();
      const challengerId = targetId;

      // Delete the challenge (atomic check)
      try {
        await dynamo.send(
          new DeleteCommand({
            TableName: TABLE,
            Key: { PK: `CHALLENGE#${userId}`, SK: `CHALLENGE#${challengerId}` },
            ConditionExpression: "attribute_exists(PK)",
          })
        );
      } catch (e) {
        return NextResponse.json({ error: "Challenge expired or invalid" }, { status: 400 });
      }

      // We need to fetch the challenger's ELO and username from DynamoDB
      // (Wait, we have their name/avatar in the challenge object, but let's just make the match)
      // Actually, we don't have their ELO. For unranked matches, ELO doesn't matter much.
      // But let's fetch it anyway.
      const challengerProfile = await dynamo.send(
        new GetCommand({ TableName: TABLE, Key: { PK: `USER#${challengerId}`, SK: "PROFILE" } })
      );
      const myProfile = await dynamo.send(
        new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: "PROFILE" } })
      );

      const matchId = uuidv4();
      const problem = getRandomProblem();

      await dynamo.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            PK: `MATCH#${matchId}`,
            SK: "META",
            matchId,
            problemId: problem.id,
            status: "active",
            isRanked: false, // Friendly match!
            startedAt: now,
            ttl: Math.floor(now / 1000) + 3600, // 1 hour
            player1: {
              userId: challengerId,
              username: challengerProfile.Item?.username ?? "Player 1",
              avatar: challengerProfile.Item?.avatar ?? null,
              elo: challengerProfile.Item?.elo ?? 1200,
              submitted: false,
            },
            player2: {
              userId: userId,
              username: username,
              avatar: avatar,
              elo: myProfile.Item?.elo ?? 1200,
              submitted: false,
            },
          },
        })
      );

      return NextResponse.json({ matchId });
    }

    if (action === "decline") {
      // 3. Decline a challenge
      await dynamo.send(
        new DeleteCommand({
          TableName: TABLE,
          Key: { PK: `CHALLENGE#${userId}`, SK: `CHALLENGE#${targetId}` },
        })
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("Challenge error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
