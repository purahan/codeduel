"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { useMatchmaking } from "@/hooks/useMatchmaking";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

interface ProfileData {
  username: string; avatar: string | null; githubUrl: string;
  elo: number; peakElo: number; globalRank: number | null;
  wins: number; losses: number; totalMatches: number; winRate: number;
  joinedAt: string | null;
  eloHistory: { label: string; elo: number }[];
  recentMatches: { matchId: string; problem: string; opponent: string; opponentAvatar: string | null; result: "WIN" | "LOSS"; eloChange: string; playedAt: string }[];
  activityMap: Record<string, number>;
}

// ── Activity Calendar ───────────────────────────────────────────────────────
function ActivityCalendar({ data }: { data: Record<string, number> }) {
  const weeks = useMemo(() => {
    const today = new Date();
    const days: { date: string; count: number }[] = [];
    for (let i = 364; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const k = d.toISOString().split("T")[0];
      days.push({ date: k, count: data[k] ?? 0 });
    }
    const pad = new Date(days[0].date).getDay();
    const cells: ({ date: string; count: number } | null)[] = [...Array(pad).fill(null), ...days];
    const grid: (typeof cells[0])[][] = [];
    for (let i = 0; i < cells.length; i += 7) grid.push(cells.slice(i, i + 7));
    return grid;
  }, [data]);

  const color = (n: number) => {
    if (n === 0) return "rgba(255,255,255,0.05)";
    if (n <= 1) return "rgba(139,142,255,0.25)";
    if (n <= 3) return "rgba(139,142,255,0.5)";
    if (n <= 5) return "rgba(139,142,255,0.7)";
    return "rgba(139,142,255,0.95)";
  };

  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <div style={{ display: "flex", gap: 2 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {week.map((day, di) => (
              <div key={di} title={day ? `${day.date}: ${day.count} duels` : ""} style={{
                width: 11, height: 11, borderRadius: 2,
                background: day ? color(day.count) : "transparent",
                cursor: day ? "default" : "default",
              }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Trophy logic ────────────────────────────────────────────────────────────
function computeTrophies(wins: number, elo: number, totalMatches: number) {
  const all = [
    { id: "first_win",  name: "First Blood",      desc: "Win your first duel",        icon: "⚔️",  earned: wins >= 1 },
    { id: "w10",        name: "On A Roll",         desc: "Win 10 duels",               icon: "🔥",  earned: wins >= 10 },
    { id: "w50",        name: "Veteran",           desc: "Win 50 duels",               icon: "🛡️",  earned: wins >= 50 },
    { id: "elo1400",    name: "Expert",            desc: "Reach 1400 ELO",             icon: "💎",  earned: elo >= 1400 },
    { id: "elo1800",    name: "Master",            desc: "Reach 1800 ELO",             icon: "👑",  earned: elo >= 1800 },
    { id: "elo2200",    name: "Grandmaster",       desc: "Reach 2200 ELO",             icon: "🏆",  earned: elo >= 2200 },
    { id: "m25",        name: "Battle Hardened",   desc: "Play 25 matches",            icon: "🎯",  earned: totalMatches >= 25 },
    { id: "m100",       name: "Centurion",         desc: "Play 100 matches",           icon: "💯",  earned: totalMatches >= 100 },
  ];
  return all;
}

// ── Rank label ──────────────────────────────────────────────────────────────
function eloRank(elo: number) {
  if (elo >= 2200) return { label: "GRANDMASTER", color: "#fbbf24" };
  if (elo >= 1800) return { label: "MASTER",      color: "#a78bfa" };
  if (elo >= 1400) return { label: "EXPERT",      color: "#38bdf8" };
  if (elo >= 1100) return { label: "ADVANCED",    color: "#4ade80" };
  return               { label: "BEGINNER",    color: "#94a3b8" };
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { matchState, setShowMatchModal, handleCancel } = useMatchmaking();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  useEffect(() => { if (status === "unauthenticated") router.push("/"); }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/user/profile").then(r => r.json()).then(d => {
      if (!d.error) setProfile(d);
    }).finally(() => setLoading(false));
  }, [status]);

  if (status === "loading" || loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0c0e", color: "#fff", fontFamily: "JetBrains Mono, monospace", fontSize: 14 }}>
      Loading profile…
    </div>
  );

  if (!profile) return null;

  const rank = eloRank(profile.elo);
  const trophies = computeTrophies(profile.wins, profile.elo, profile.totalMatches);
  const earnedTrophies = trophies.filter(t => t.earned);
  const lockedTrophies = trophies.filter(t => !t.earned);
  const winRate = profile.winRate;

  const eloChartData = profile.eloHistory.length >= 2
    ? profile.eloHistory
    : [{ label: "Start", elo: 1200 }, { label: "Now", elo: profile.elo }];

  const S: Record<string, React.CSSProperties> = {
    page:      { minHeight: "100vh", background: "#0b0c0e", color: "#f5f3ec", fontFamily: "'JetBrains Mono', monospace" },
    nav:       { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", height: 56, borderBottom: "1px solid #2a2c30", position: "sticky", top: 0, background: "#0b0c0e", zIndex: 40 },
    brand:     { fontWeight: 700, fontSize: 16, color: "#f5f3ec", textDecoration: "none", letterSpacing: -0.5 },
    navLinks:  { display: "flex", gap: 28 },
    navLink:   { color: "#8a8c82", textDecoration: "none", fontSize: 13, fontWeight: 500 },
    navLinkAct:{ color: "#f5f3ec", textDecoration: "none", fontSize: 13, fontWeight: 600 },
    main:      { maxWidth: 960, margin: "0 auto", padding: "36px 24px 64px" },
    card:      { background: "#111317", border: "1px solid #2a2c30", borderRadius: 12, padding: 24 },
    grid2:     { display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, marginTop: 24 },
    sectionHdr:{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
    sectionTtl:{ fontSize: 13, fontWeight: 600, color: "#f5f3ec", letterSpacing: 0.5, textTransform: "uppercase" as const },
    muted:     { color: "#8a8c82", fontSize: 12 },
    sk:        { background: "linear-gradient(90deg,#1e2025 25%,#2a2c30 50%,#1e2025 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite", borderRadius: 6 },
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        a:hover { opacity: 0.8; }
        .trophy-card:hover { border-color: rgba(139,142,255,0.3) !important; transform: translateY(-1px); }
        .match-row:hover { background: rgba(255,255,255,0.02) !important; }
      `}</style>

      <div style={S.page}>
        {/* NAV */}
        <nav style={S.nav}>
          <Link href="/" style={S.brand}>CodeDuel</Link>
          <div style={S.navLinks}>
            <Link href="/dashboard" style={S.navLink}>Dashboard</Link>
            <Link href="/leaderboard" style={S.navLink}>Leaderboard</Link>
            <Link href="/friends" style={S.navLink}>Friends</Link>
            <Link href="/profile" style={S.navLinkAct}>Profile</Link>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {matchState === "queued"
              ? <button onClick={handleCancel} style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.4)", color: "#f87171", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Cancel search</button>
              : <button onClick={() => setShowMatchModal(true)} style={{ background: "#7c3aed", border: "none", color: "#fff", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 600 }}>⚡ Find Match</button>
            }
            <div style={{ position: "relative" }}>
              <div onClick={() => setShowProfileMenu(v => !v)} style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid #2a2c30", overflow: "hidden", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: "#1a1c20", fontSize: 13, fontWeight: 600 }}>
                {session?.user?.image ? <img src={session.user.image} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : (session?.user?.name?.[0] ?? "?").toUpperCase()}
              </div>
              {showProfileMenu && (
                <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, background: "#111317", border: "1px solid #2a2c30", borderRadius: 8, overflow: "hidden", zIndex: 50 }}>
                  <button onClick={() => signOut({ callbackUrl: "/" })} style={{ background: "none", border: "none", color: "#f87171", padding: "10px 20px", cursor: "pointer", fontSize: 12, fontFamily: "inherit", whiteSpace: "nowrap" }}>Sign Out</button>
                </div>
              )}
            </div>
          </div>
        </nav>

        <main style={S.main}>
          {/* PROFILE HEADER */}
          <div style={{ ...S.card, display: "flex", gap: 28, alignItems: "flex-start" }}>
            <div style={{ width: 100, height: 100, borderRadius: 14, overflow: "hidden", border: "2px solid #2a2c30", flexShrink: 0, background: "#1a1c20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, fontWeight: 700, color: "#8a8c82" }}>
              {profile.avatar ? <img src={profile.avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : profile.username[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ background: "rgba(139,142,255,0.12)", color: rank.color, border: `1px solid ${rank.color}40`, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>{rank.label}</span>
                {profile.globalRank && <span style={S.muted}>#{profile.globalRank} globally</span>}
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5, marginBottom: 2 }}>{profile.username}</h1>
              <p style={{ ...S.muted, marginBottom: 14 }}>@{profile.username.toLowerCase()}</p>
              <div style={{ display: "flex", gap: 12 }}>
                <a href={profile.githubUrl} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.05)", border: "1px solid #2a2c30", borderRadius: 6, padding: "5px 12px", color: "#f5f3ec", textDecoration: "none", fontSize: 12 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                  GitHub
                </a>
              </div>
            </div>
          </div>

          {/* STATS ROW */}
          <div style={{ ...S.card, marginTop: 16, display: "flex", alignItems: "center" }}>
            {[
              { label: "ELO",         value: profile.elo.toString() },
              { label: "Peak ELO",    value: profile.peakElo.toString() },
              { label: "Win Rate",    value: `${winRate}%` },
              { label: "Total Duels", value: profile.totalMatches.toString() },
              { label: "Wins",        value: profile.wins.toString() },
              { label: "Losses",      value: profile.losses.toString() },
            ].map((s, i) => (
              <div key={s.label} style={{ flex: 1, display: "flex", alignItems: "center" }}>
                {i > 0 && <div style={{ width: 1, height: 40, background: "#2a2c30", marginRight: 24 }} />}
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#f5f3ec" }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: "#8a8c82", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 2 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* MAIN 2-COL GRID */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, marginTop: 20, alignItems: "start" }}>

            {/* LEFT COL */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* ELO CHART */}
              <div style={S.card}>
                <div style={S.sectionHdr}>
                  <span style={S.sectionTtl}>ELO Progression</span>
                  <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#8a8c82" }}>
                    <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#8b8eff", marginRight: 4 }} />Current: {profile.elo}</span>
                    <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#4a4860", marginRight: 4 }} />Peak: {profile.peakElo}</span>
                  </div>
                </div>
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={eloChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="eloGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2025" vertical={false} />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#4a4860", fontSize: 10, fontFamily: "JetBrains Mono" }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#4a4860", fontSize: 10, fontFamily: "JetBrains Mono" }} domain={["dataMin - 100", "dataMax + 100"]} />
                      <Tooltip contentStyle={{ background: "#111317", border: "1px solid #2a2c30", borderRadius: 8, fontSize: 12, fontFamily: "JetBrains Mono" }} labelStyle={{ color: "#8a8c82" }} itemStyle={{ color: "#f5f3ec" }} cursor={{ stroke: "#7c3aed", strokeWidth: 1, strokeDasharray: "4 4" }} />
                      <Area type="monotone" dataKey="elo" stroke="#8b8eff" strokeWidth={2} fill="url(#eloGrad)" dot={false} activeDot={{ r: 4, fill: "#8b8eff", stroke: "#0b0c0e", strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* RECENT MATCHES */}
              <div style={S.card}>
                <div style={S.sectionHdr}>
                  <span style={S.sectionTtl}>Recent Duels</span>
                </div>
                {profile.recentMatches.length === 0 ? (
                  <div style={{ ...S.muted, textAlign: "center", padding: "24px 0" }}>No matches played yet.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {profile.recentMatches.map(m => (
                      <div key={m.matchId} className="match-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 8, borderLeft: `2px solid ${m.result === "WIN" ? "#4ade80" : "#f87171"}`, background: "rgba(255,255,255,0.01)", transition: "background 0.15s" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#f5f3ec" }}>{m.problem}</div>
                          <div style={{ fontSize: 11, color: "#8a8c82", marginTop: 2 }}>vs @{m.opponent} · {new Date(m.playedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: m.result === "WIN" ? "#4ade80" : "#f87171" }}>{m.eloChange} ELO</div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: m.result === "WIN" ? "#4ade80" : "#f87171", letterSpacing: 1, marginTop: 2 }}>{m.result}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* TROPHY CABINET */}
              <div style={S.card}>
                <div style={S.sectionHdr}>
                  <span style={S.sectionTtl}>Trophy Cabinet</span>
                  <span style={S.muted}>{earnedTrophies.length}/{trophies.length} earned</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  {trophies.map(t => (
                    <div key={t.id} className="trophy-card" style={{ background: t.earned ? "rgba(139,142,255,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${t.earned ? "rgba(139,142,255,0.2)" : "#1e2025"}`, borderRadius: 10, padding: "14px 10px", textAlign: "center", opacity: t.earned ? 1 : 0.4, transition: "all 0.2s", cursor: "default" }}>
                      <div style={{ fontSize: 24, marginBottom: 6 }}>{t.icon}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#f5f3ec", marginBottom: 2 }}>{t.name}</div>
                      <div style={{ fontSize: 10, color: "#8a8c82" }}>{t.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT COL */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* ACTIVITY CALENDAR */}
              <div style={S.card}>
                <div style={S.sectionHdr}>
                  <span style={S.sectionTtl}>Activity</span>
                  <span style={S.muted}>{Object.values(profile.activityMap).filter(v => v > 0).length} active days</span>
                </div>
                <ActivityCalendar data={profile.activityMap} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                  <span style={{ fontSize: 9, color: "#4a4860", textTransform: "uppercase", letterSpacing: 1 }}>Less</span>
                  <div style={{ display: "flex", gap: 3 }}>
                    {["rgba(255,255,255,0.05)", "rgba(139,142,255,0.25)", "rgba(139,142,255,0.5)", "rgba(139,142,255,0.7)", "rgba(139,142,255,0.95)"].map((c, i) => (
                      <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 9, color: "#4a4860", textTransform: "uppercase", letterSpacing: 1 }}>More</span>
                </div>
              </div>

              {/* JOURNEY TIMELINE */}
              <div style={S.card}>
                <div style={{ ...S.sectionHdr, marginBottom: 20 }}>
                  <span style={S.sectionTtl}>Journey</span>
                </div>
                <div style={{ position: "relative", paddingLeft: 24 }}>
                  <div style={{ position: "absolute", left: 7, top: 4, bottom: 4, width: 1, background: "#2a2c30" }} />
                  {[
                    profile.elo >= 2200 && { label: "Reached Grandmaster", date: "Milestone" },
                    profile.elo >= 1800 && { label: "Reached Master",      date: "Milestone" },
                    profile.elo >= 1400 && { label: "Reached Expert",      date: "Milestone" },
                    profile.wins >= 50  && { label: "50 Wins",             date: "Achievement" },
                    profile.wins >= 10  && { label: "10 Wins",             date: "Achievement" },
                    profile.wins >= 1   && { label: "First Victory",       date: "Achievement" },
                    profile.joinedAt    && { label: "Joined CodeDuel",     date: new Date(profile.joinedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" }) },
                  ].filter(Boolean).slice(0, 5).map((m: any, i) => (
                    <div key={i} style={{ position: "relative", marginBottom: 20 }}>
                      <div style={{ position: "absolute", left: -20, top: 4, width: 8, height: 8, borderRadius: "50%", background: i === 0 ? "#8b8eff" : "#2a2c30", border: `2px solid ${i === 0 ? "#8b8eff" : "#3a3c40"}` }} />
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#f5f3ec" }}>{m.label}</div>
                      <div style={{ fontSize: 10, color: "#8a8c82", marginTop: 2 }}>{m.date}</div>
                    </div>
                  ))}
                  {[profile.elo >= 2200, profile.elo >= 1800, profile.elo >= 1400, profile.wins >= 50, profile.wins >= 10, profile.wins >= 1, profile.joinedAt].filter(Boolean).length === 0 && (
                    <div style={{ ...S.muted, fontSize: 12 }}>Play your first match to start your journey!</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
