import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import sql from "@/lib/postgres";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ghId = parseInt((session.user as any).id as string);

  try {
    // 1. Get the Postgres user UUID and created_at
    const userRows = await sql`SELECT id, created_at FROM users WHERE github_id = ${ghId}`;
    if (userRows.length === 0) {
      return NextResponse.json({ error: "User not found in Postgres" }, { status: 404 });
    }
    const pgUserId = userRows[0].id;
    const joinedAt = userRows[0].created_at;

    // 2. Fetch Recent Matches from the user_match_history VIEW
    const recentMatches = await sql`
      SELECT 
        match_id, played_at, ended_by, duration_seconds,
        problem_title, problem_difficulty,
        winner_id, loser_id,
        winner_elo_before, winner_elo_after,
        loser_elo_before, loser_elo_after
      FROM user_match_history
      WHERE winner_id = ${pgUserId} OR loser_id = ${pgUserId}
      ORDER BY played_at DESC
      LIMIT 10
    `;

    // Map matches for the frontend
    // We need to resolve opponent usernames. Since we only have IDs, we do a join
    const enrichedMatches = await sql`
      SELECT 
        m.match_id, m.played_at, m.problem_title,
        m.winner_id, m.loser_id,
        m.winner_elo_after - m.winner_elo_before AS winner_elo_change,
        m.loser_elo_after - m.loser_elo_before AS loser_elo_change,
        w.github_username AS winner_name,
        l.github_username AS loser_name,
        w.avatar_url AS winner_avatar,
        l.avatar_url AS loser_avatar
      FROM user_match_history m
      LEFT JOIN users w ON w.id = m.winner_id
      LEFT JOIN users l ON l.id = m.loser_id
      WHERE m.winner_id = ${pgUserId} OR m.loser_id = ${pgUserId}
      ORDER BY m.played_at DESC
      LIMIT 5
    `;

    const mappedMatches = enrichedMatches.map(m => {
      const isWin = m.winner_id === pgUserId;
      return {
        matchId: m.match_id,
        opponent: isWin ? m.loser_name : m.winner_name,
        opponentAvatar: isWin ? m.loser_avatar : m.winner_avatar,
        problem: m.problem_title,
        result: isWin ? "Win" : "Loss",
        elo: isWin ? `+${m.winner_elo_change}` : `${m.loser_elo_change}`,
        playedAt: m.played_at,
      };
    });

    // 3. Fetch Activity Heatmap data (submissions count per day for last 365 days)
    const activityData = await sql`
      SELECT 
        DATE(submitted_at) as date, 
        COUNT(*) as count
      FROM submissions
      WHERE user_id = ${pgUserId} 
        AND submitted_at > NOW() - INTERVAL '1 year'
      GROUP BY DATE(submitted_at)
      ORDER BY DATE(submitted_at) ASC
    `;
    const activityMap: Record<string, number> = {};
    activityData.forEach(row => {
      // row.date might be a Date object or string depending on postgres.js mapping
      const dateStr = typeof row.date === 'string' ? row.date.split('T')[0] : row.date.toISOString().split('T')[0];
      activityMap[dateStr] = parseInt(row.count);
    });

    // 4. Fetch ELO History (we get it from match results)
    const eloHistoryRows = await sql`
      SELECT 
        played_at,
        CASE WHEN winner_id = ${pgUserId} THEN winner_elo_after ELSE loser_elo_after END as elo
      FROM user_match_history
      WHERE winner_id = ${pgUserId} OR loser_id = ${pgUserId}
      ORDER BY played_at ASC
    `;

    return NextResponse.json({
      recentMatches: mappedMatches,
      activityMap,
      eloHistory: eloHistoryRows,
      joinedAt
    });

  } catch (err) {
    console.error("Dashboard data fetch failed:", err);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
