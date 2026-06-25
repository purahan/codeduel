import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
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

async function wipeDatabase() {
  console.log("🧹 Starting full database wipe...");

  try {
    // 1. Wipe DynamoDB
    console.log(`\n📦 Scanning DynamoDB table: ${TABLE}...`);
    let exclusiveStartKey: any = undefined;
    let deletedCount = 0;

    do {
      const result = await dynamo.send(new ScanCommand({
        TableName: TABLE,
        ExclusiveStartKey: exclusiveStartKey,
      }));

      const items = result.Items || [];
      console.log(`   Found ${items.length} items in current page. Deleting...`);

      // Delete items sequentially to avoid throttling limits on small tables
      for (const item of items) {
        await dynamo.send(new DeleteCommand({
          TableName: TABLE,
          Key: { PK: item.PK, SK: item.SK }
        }));
        deletedCount++;
      }

      exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);

    console.log(`✅ DynamoDB wiped! Deleted ${deletedCount} total items.`);

    // 2. Wipe PostgreSQL
    console.log(`\n🐘 Connecting to Aurora PostgreSQL...`);
    await sql`TRUNCATE TABLE friendships CASCADE`;
    await sql`TRUNCATE TABLE match_results CASCADE`;
    await sql`TRUNCATE TABLE users CASCADE`;
    
    console.log(`✅ PostgreSQL wiped! All relational data deleted.`);

    console.log("\n🎉 Database is completely fresh! Ready for your teammates.");
    process.exit(0);

  } catch (error) {
    console.error("❌ Failed to wipe database:", error);
    process.exit(1);
  }
}

wipeDatabase();
