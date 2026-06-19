import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo, TABLE } from "@/lib/dynamo";

// Polled every 2s by the frontend after joining queue
// Returns matchId once a match has been created for this user
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id as string;

  // Scan for a match that includes this user and is active
  const result = await dynamo.send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression:
        "SK = :sk AND (player1.userId = :uid OR player2.userId = :uid) AND #s = :active",
      ExpressionAttributeValues: {
        ":sk": "META",
        ":uid": userId,
        ":active": "active",
      },
      ExpressionAttributeNames: {
        "#s": "status", // "status" is a reserved word in DynamoDB
      },
    })
  );

  if (result.Items && result.Items.length > 0) {
    return NextResponse.json({
      status: "matched",
      matchId: result.Items[0].matchId,
    });
  }

  return NextResponse.json({ status: "waiting" });
}
