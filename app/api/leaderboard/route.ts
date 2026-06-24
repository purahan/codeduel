import { NextResponse } from "next/server";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo, TABLE } from "@/lib/dynamo";

export async function GET() {
  try {
    // Query the GSI — sorted by ELO (GSI1SK) descending
    const result = await dynamo.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": "LEADERBOARD#GLOBAL",
        },
        ScanIndexForward: false, // descending ELO
        Limit: 50,
      })
    );

    const entries = (result.Items ?? []).map((item, index) => ({
      rank: index + 1,
      userId: item.userId,
      username: item.username,
      avatar: item.avatar ?? null,
      elo: item.GSI1SK, // GSI1SK stores the ELO as a number for sorting
    }));

    return NextResponse.json({ entries });
  } catch (err) {
    console.error("Leaderboard fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}
