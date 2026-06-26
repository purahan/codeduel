import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { dynamo, TABLE } from "@/lib/dynamo";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import sql from "@/lib/postgres";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id as string;
  const ghId   = parseInt(userId);

  try {
    // 1 — Core profile from DynamoDB (source of truth for ELO/wins/losses)
    const dynResult = await dynamo.send(
      new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: "PROFILE" } })
    );
    const dynItem = dynResult.Item;

    // 2 — PostgreSQL user row (for relational data)
    const pgRows = await sql`SELECT id, created_at FROM users WHERE github_id = ${ghId}`;
    const pgUser = pgRows[0] ?? null;

    // 3 — ELO history (from match results)
    const eloHistory = pgUser ? await sql`
      SELECT
        played_at,
        CASE WHEN winner_id = ${pgUser.id} THEN winner_elo_after ELSE loser_elo_after END AS elo
      FROM user_match_history
      WHERE winner_id = ${pgUser.id} OR loser_id = ${pgUser.id}
      ORDER BY played_at ASC
      LIMIT 50
    ` : [];

    // 4 — Recent matches with opponent info
    const recentMatches = pgUser ? await sql`
      SELECT
        m.match_id, m.played_at, m.problem_title,
        m.winner_id, m.loser_id,
        m.winner_elo_after - m.winner_elo_before AS winner_elo_change,
        m.loser_elo_after - m.loser_elo_before   AS loser_elo_change,
        m.ended_by,
        w.github_username AS winner_name, w.avatar_url AS winner_avatar,
        l.github_username AS loser_name,  l.avatar_url AS loser_avatar
      FROM user_match_history m
      LEFT JOIN users w ON w.id = m.winner_id
      LEFT JOIN users l ON l.id = m.loser_id
      WHERE m.winner_id = ${pgUser.id} OR m.loser_id = ${pgUser.id}
      ORDER BY m.played_at DESC
      LIMIT 10
    ` : [];

    const mappedMatches = recentMatches.map((m: any) => {
      const isWin = m.winner_id === pgUser?.id;
      return {
        matchId:         m.match_id,
        problem:         m.problem_title ?? "Unknown",
        opponent:        isWin ? m.loser_name  : m.winner_name,
        opponentAvatar:  isWin ? m.loser_avatar : m.winner_avatar,
        result:          isWin ? "WIN" : "LOSS",
        eloChange:       isWin ? `+${m.winner_elo_change}` : `${m.loser_elo_change}`,
        endedBy:         m.ended_by,
        playedAt:        m.played_at,
      };
    });

    // 5 — Activity heatmap (duels per day for past year)
    const activityRows = pgUser ? await sql`
      SELECT DATE(played_at) AS date, COUNT(*) AS count
      FROM user_match_history
      WHERE (winner_id = ${pgUser.id} OR loser_id = ${pgUser.id})
        AND played_at > NOW() - INTERVAL '1 year'
      GROUP BY DATE(played_at)
      ORDER BY DATE(played_at) ASC
    ` : [];
    const activityMap: Record<string, number> = {};
    activityRows.forEach((r: any) => {
      const d = typeof r.date === "string" ? r.date.split("T")[0] : (r.date as Date).toISOString().split("T")[0];
      activityMap[d] = parseInt(r.count);
    });

    // 6 — Compute peak ELO
    const peakElo = eloHistory.length > 0
      ? Math.max(...eloHistory.map((r: any) => r.elo))
      : (dynItem?.elo ?? 1200);

    // 7 — Compute global rank
    const rankRows = pgUser ? await sql`
      SELECT COUNT(*) AS rank
      FROM users u2
      JOIN (SELECT MAX(mr2.winner_elo_after) as elo, mr2.winner_id as user_id
            FROM match_results mr2 GROUP BY mr2.winner_id
            UNION
            SELECT MAX(mr2.loser_elo_after) as elo, mr2.loser_id as user_id
            FROM match_results mr2 GROUP BY mr2.loser_id) elos ON elos.user_id = u2.id
      WHERE elos.elo > ${dynItem?.elo ?? 1200}
    ` : [];
    const globalRank = rankRows.length > 0 ? parseInt(rankRows[0].rank) + 1 : null;

    const wins   = dynItem?.wins   ?? 0;
    const losses = dynItem?.losses ?? 0;

    return NextResponse.json({
      username:     dynItem?.username ?? session.user.name ?? "Coder",
      avatar:       dynItem?.avatar ?? session.user.image ?? null,
      githubUrl:    `https://github.com/${dynItem?.username ?? ""}`,
      elo:          dynItem?.elo ?? 1200,
      peakElo,
      globalRank,
      wins,
      losses,
      totalMatches: wins + losses,
      winRate:      wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0,
      joinedAt:     pgUser?.created_at ?? null,
      eloHistory:   eloHistory.map((r: any) => ({
        label: new Date(r.played_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        elo:   r.elo,
      })),
      recentMatches: mappedMatches,
      activityMap,
    });

  } catch (err) {
    console.error("Profile fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}
