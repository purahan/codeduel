import postgres from "postgres";

// Use the DATABASE_URL from .env.local
// For Neon/Aurora serverless, we usually need ssl="require"
const sql = postgres(process.env.DATABASE_URL || "", {
  ssl: "require",
  max: 10, // connection pool size
  idle_timeout: 20,
});

export default sql;
