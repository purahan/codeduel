import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import sql from "@/lib/postgres";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");

  if (!query || query.length < 2) {
    return NextResponse.json({ users: [] });
  }

  try {
    // Search for users containing the query string (case-insensitive)
    // Limit to 5 results to keep the UI clean
    // Exclude the current user from the results
    const ghId = parseInt((session.user as any).id as string);
    
    const users = await sql`
      SELECT github_username as username, avatar_url as avatar
      FROM users
      WHERE github_username ILIKE ${'%' + query + '%'}
        AND github_id != ${ghId}
      LIMIT 5
    `;

    return NextResponse.json({ users });
  } catch (err) {
    console.error("Search failed:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
