import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? "eu-north-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
const dynamo = DynamoDBDocumentClient.from(client);
const TABLE = "CodeDuelTable";

const sql = postgres(process.env.DATABASE_URL || "", { ssl: "require" });

async function syncUsers() {
  console.log("🔄 Starting DynamoDB -> PostgreSQL User Sync...");

  try {
    let exclusiveStartKey: any = undefined;
    let syncedCount = 0;

    do {
      const result = await dynamo.send(new ScanCommand({
        TableName: TABLE,
        FilterExpression: "SK = :profileSk AND begins_with(PK, :userPk)",
        ExpressionAttributeValues: {
          ":profileSk": "PROFILE",
          ":userPk": "USER#",
        },
        ExclusiveStartKey: exclusiveStartKey,
      }));

      const items = result.Items || [];
      console.log(`   Found ${items.length} users in current page. Syncing...`);

      for (const user of items) {
        const ghId = parseInt(user.userId);
        const ghUsername = user.username ?? "anonymous";
        
        await sql`
          INSERT INTO users (github_id, github_username, email, avatar_url, last_login_at)
          VALUES (${ghId}, ${ghUsername}, ${user.email ?? null}, ${user.avatar ?? null}, NOW())
          ON CONFLICT (github_id) 
          DO UPDATE SET 
            avatar_url = EXCLUDED.avatar_url,
            github_username = EXCLUDED.github_username
        `;
        syncedCount++;
      }

      exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);

    console.log(`✅ Sync complete! ${syncedCount} users have been successfully restored to PostgreSQL.`);
    process.exit(0);

  } catch (error) {
    console.error("❌ Failed to sync users:", error);
    process.exit(1);
  }
}

syncUsers();
