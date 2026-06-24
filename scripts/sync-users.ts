import fs from "fs";
import postgres from "postgres";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const envFile = fs.readFileSync(".env.local", "utf-8");
const dbUrlMatch = envFile.match(/^DATABASE_URL=(.*)$/m);
const dbUrl = dbUrlMatch ? dbUrlMatch[1].replace(/["']/g, '') : "";

const sql = postgres(dbUrl, { ssl: "require", max: 5 });

// DynamoDB config
const regionMatch = envFile.match(/^AWS_REGION=(.*)$/m);
const accessMatch = envFile.match(/^AWS_ACCESS_KEY_ID=(.*)$/m);
const secretMatch = envFile.match(/^AWS_SECRET_ACCESS_KEY=(.*)$/m);

const client = new DynamoDBClient({
  region: regionMatch ? regionMatch[1].replace(/["']/g, '') : "eu-north-1",
  credentials: {
    accessKeyId: accessMatch ? accessMatch[1].replace(/["']/g, '') : "",
    secretAccessKey: secretMatch ? secretMatch[1].replace(/["']/g, '') : "",
  },
});
const dynamo = DynamoDBDocumentClient.from(client);

async function run() {
  try {
    console.log("Fetching existing users from DynamoDB...");
    const scan = await dynamo.send(
      new ScanCommand({
        TableName: "CodeDuelTable",
        FilterExpression: "SK = :sk",
        ExpressionAttributeValues: { ":sk": "PROFILE" },
      })
    );

    const users = scan.Items || [];
    console.log(`Found ${users.length} users. Syncing to Aurora Postgres...`);

    let synced = 0;
    for (const u of users) {
      if (!u.userId) continue;
      
      const ghId = parseInt(u.userId);
      const ghUsername = u.username || "anonymous";
      const email = u.email || null;
      const avatar = u.avatar || null;

      try {
        await sql`
          INSERT INTO users (github_id, github_username, email, avatar_url, last_login_at)
          VALUES (${ghId}, ${ghUsername}, ${email}, ${avatar}, NOW())
          ON CONFLICT (github_id) DO NOTHING
        `;
        synced++;
      } catch (err) {
        console.error(`Failed to sync ${ghUsername}:`, err);
      }
    }

    console.log(`Successfully synced ${synced} users!`);
  } catch (error) {
    console.error("Sync failed:", error);
  } finally {
    await sql.end();
  }
}

run();
