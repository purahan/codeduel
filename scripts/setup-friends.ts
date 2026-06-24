import fs from "fs";
import postgres from "postgres";

// Load .env.local manually
const envFile = fs.readFileSync(".env.local", "utf-8");
const dbUrlMatch = envFile.match(/^DATABASE_URL=(.*)$/m);
const dbUrl = dbUrlMatch ? dbUrlMatch[1].replace(/["']/g, '') : "";

const sql = postgres(dbUrl, {
  ssl: "require",
  max: 1, // Only need 1 connection for this script
});

async function run() {
  try {
    console.log("Connecting to Aurora PostgreSQL...");

    await sql`
      CREATE TABLE IF NOT EXISTS friendships (
          id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id_1    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          user_id_2    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status       VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'accepted')),
          created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    console.log("Created 'friendships' table.");

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_friendships_users 
      ON friendships (LEAST(user_id_1, user_id_2), GREATEST(user_id_1, user_id_2));
    `;
    console.log("Created unique index for friendships.");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_friendships_user1 ON friendships(user_id_1);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_friendships_user2 ON friendships(user_id_2);
    `;
    console.log("Created lookup indexes.");

    // Update match_results to support friendly matches
    await sql`
      ALTER TABLE match_results 
      ADD COLUMN IF NOT EXISTS is_ranked BOOLEAN NOT NULL DEFAULT TRUE;
    `;
    console.log("Added 'is_ranked' column to match_results.");

    console.log("Migration complete!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await sql.end();
  }
}

run();
