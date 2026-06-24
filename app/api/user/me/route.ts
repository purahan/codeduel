import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { dynamo, TABLE } from "@/lib/dynamo";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await dynamo.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${session.user.id}`, SK: "PROFILE" },
      })
    );

    if (!result.Item) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const item = result.Item;
    const wins = item.wins ?? 0;
    const losses = item.losses ?? 0;

    return Response.json({
      userId: session.user.id,
      username: item.username ?? session.user.name ?? "Coder",
      avatar: item.avatar ?? session.user.image ?? null,
      elo: item.elo ?? 1200,
      wins,
      losses,
      totalMatches: wins + losses,
      winRate: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0,
    });
  } catch (err) {
    console.error("User fetch error:", err);
    return Response.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}
