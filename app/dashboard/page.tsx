"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { useMatchmaking } from "@/hooks/useMatchmaking";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  userId: string;
  username: string;
  avatar?: string;
  elo: number;
  wins: number;
  losses: number;
}



// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateEloHistory(currentElo: number) {
  const points = 20;
  let elo = currentElo;
  const history = [elo];
  for (let i = 1; i < points; i++) {
    const change = Math.round((Math.random() - 0.52) * 28);
    elo = Math.max(800, elo - change);
    history.unshift(elo);
  }
  const months = ["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"];
  return history.map((e, i) => ({ label: months[Math.floor(i * months.length / points)], elo: e }));
}

function generateActivityData(): Record<string, number> {
  const data: Record<string, number> = {};
  const today = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    const recency = 1 - i / 365;
    data[key] = Math.random() < recency * 0.38 ? Math.floor(Math.random() * 5) + 1 : 0;
  }
  return data;
}

function ActivityCalendar({ data, joinedDate }: { data: Record<string, number>, joinedDate?: string | null }) {
  const [hoveredDay, setHoveredDay] = useState<{ x: number; y: number; text: React.ReactNode } | null>(null);

  const weeks: { date: string; count: number }[][] = [];
  
  // Generate the last 365 days (ending today)
  const fullKeys: string[] = [];
  const today = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    fullKeys.push(d.toISOString().split("T")[0]);
  }

  // pad to start on Sunday
  const firstDay = new Date(fullKeys[0]).getDay();
  let week: { date: string; count: number }[] = [];
  for (let p = 0; p < firstDay; p++) week.push({ date: "", count: -1 });
  
  for (const key of fullKeys) {
    week.push({ date: key, count: data[key] || 0 });
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length) weeks.push(week);

  const cellColor = (count: number) => {
    if (count < 0) return "transparent";
    if (count === 0) return "rgba(255,255,255,0.04)";
    if (count === 1) return "rgba(139,142,255,0.18)";
    if (count === 2) return "rgba(139,142,255,0.36)";
    if (count === 3) return "rgba(139,142,255,0.55)";
    return "rgba(139,142,255,0.85)";
  };

  const monthLabels: { label: string; col: number }[] = [];
  weeks.forEach((w, i) => {
    const first = w.find(d => d.date);
    if (first?.date) {
      const m = new Date(first.date);
      if (m.getDate() <= 7) {
        monthLabels.push({
          label: m.toLocaleString("default", { month: "short" }),
          col: i
        });
      }
    }
  });

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ position: "relative", paddingTop: 20, minWidth: weeks.length * 14, paddingBottom: 10 }}>
        {/* Custom Tooltip */}
        {hoveredDay && (
          <div style={{
            position: "fixed",
            left: hoveredDay.x,
            top: hoveredDay.y - 8,
            transform: "translate(-50%, -100%)",
            background: "#0d0d14",
            border: "1px solid #8b8eff",
            borderRadius: 6,
            padding: "6px 10px",
            color: "#fff",
            fontSize: 11,
            fontFamily: "JetBrains Mono, monospace",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 10,
            boxShadow: "0 4px 12px rgba(0,0,0,0.5), 0 0 10px rgba(139,142,255,0.25)"
          }}>
            {hoveredDay.text}
            <div style={{
              position: "absolute",
              bottom: -5,
              left: "50%",
              transform: "translateX(-50%) rotate(45deg)",
              width: 8,
              height: 8,
              background: "#0d0d14",
              borderRight: "1px solid #8b8eff",
              borderBottom: "1px solid #8b8eff",
            }} />
          </div>
        )}

        {/* Month labels */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 18, display: "flex" }}>
          {monthLabels.map((m, i) => (
            <span key={i} style={{
              position: "absolute", left: m.col * 14,
              fontSize: 10, fontFamily: "JetBrains Mono, monospace",
              color: "rgba(255,255,255,0.25)", whiteSpace: "nowrap"
            }}>{m.label}</span>
          ))}
        </div>
        {/* Grid */}
        <div style={{ display: "flex", gap: 2 }} onMouseLeave={() => setHoveredDay(null)}>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {week.map((day, di) => {
                const isJoinedDay = joinedDate === day.date;
                const rawCount = day.count;
                const displayCount = isJoinedDay ? Math.max(1, rawCount) : rawCount;
                const isValid = day.date !== "";
                
                let text: React.ReactNode = "";
                if (isValid) {
                  const dateStr = new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  if (isJoinedDay) {
                    text = (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
                        <span style={{ color: "#7cff6b", fontWeight: 700 }}>You joined CodeDuel! 🎉</span>
                        <span style={{ color: "rgba(255,255,255,0.7)" }}>
                          {rawCount > 0 ? `${rawCount} submission${rawCount !== 1 ? "s" : ""} · ${dateStr}` : `No submissions · ${dateStr}`}
                        </span>
                      </div>
                    );
                  } else if (displayCount > 0) {
                    text = `${displayCount} submission${displayCount !== 1 ? "s" : ""} · ${dateStr}`;
                  } else {
                    text = `No submissions · ${dateStr}`;
                  }
                }
                
                return (
                  <div key={di} 
                    onMouseEnter={(e) => {
                      if (!isValid) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredDay({
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                        text
                      });
                    }}
                    style={{
                      width: 11, height: 11, borderRadius: 2,
                      background: cellColor(displayCount),
                      border: displayCount > 0 ? "1px solid rgba(139,142,255,0.15)" : "none",
                      cursor: isValid ? "pointer" : "default",
                      transition: "opacity .15s",
                    }} 
                  />
                );
              })}
            </div>
          ))}
        </div>
        {/* Legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, justifyContent: "flex-end" }}>
          <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "rgba(255,255,255,0.25)" }}>Less</span>
          {[0,1,2,3,4].map(l => (
            <div key={l} style={{ width: 11, height: 11, borderRadius: 2, background: cellColor(l), border: l > 0 ? "1px solid rgba(139,142,255,0.15)" : "none" }} />
          ))}
          <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "rgba(255,255,255,0.25)" }}>More</span>
        </div>
      </div>
    </div>
  );
}

const PROBLEMS = [
  { title: "Merge Intervals",     diff: "medium", tags: ["arrays","sorting"] },
  { title: "Trapping Rain Water", diff: "hard",   tags: ["two-pointers","dp"] },
  { title: "Valid Anagram",       diff: "easy",   tags: ["hash-map","string"] },
];
const MOCK_MATCHES = [
  { opponent: "CodeMaster99", problem: "Two Sum",     result: "Win",  elo: +14, ago: "2h ago"  },
  { opponent: "NullPointer",  problem: "LRU Cache",   result: "Loss", elo: -11, ago: "5h ago"  },
  { opponent: "ByteNinja",    problem: "Word Search",  result: "Win",  elo: +18, ago: "1d ago"  },
  { opponent: "AlgoKing",     problem: "Coin Change",  result: "Win",  elo: +9,  ago: "2d ago"  },
  { opponent: "SyntaxError",  problem: "Merge Intervals", result: "Loss", elo: -8, ago: "3d ago" },
];

const DIFF_COLORS: Record<string, string> = {
  easy:   "#4ade80",
  medium: "#fbbf24",
  hard:   "#f87171",
};

// ─── Custom chart tooltip ─────────────────────────────────────────────────────

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0d0d14", border: "1px solid rgba(139,142,255,0.2)",
      borderRadius: 6, padding: "8px 12px",
      fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "#e8e6f0",
    }}>
      <div style={{ color: "#8b8eff" }}>{payload[0].value} ELO</div>
      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 2 }}>{payload[0].payload.label}</div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(() => {
    if (typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem("dash_profile") || "null"); } catch(e){}
    }
    return null;
  });
  const { matchState, showMatchModal, setShowMatchModal, handleFindMatch, handleCancel } = useMatchmaking();
  const [eloHistory, setEloHistory] = useState<{ label: string; elo: number }[]>(() => {
    if (typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem("dash_eloHistory") || "[]"); } catch(e){}
    }
    return [];
  });
  const [activityData, setActivityData] = useState<Record<string, number>>(() => {
    if (typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem("dash_activityData") || "{}"); } catch(e){}
    }
    return {};
  });
  const [recentMatches, setRecentMatches] = useState<any[]>(() => {
    if (typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem("dash_recentMatches") || "[]"); } catch(e){}
    }
    return [];
  });
  const [joinedDate, setJoinedDate] = useState<string | null>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("dash_joinedDate");
    return null;
  });
  const [isLoaded, setIsLoaded] = useState(() => {
    if (typeof window !== "undefined") {
      return !!localStorage.getItem("dash_profile");
    }
    return false;
  });
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    
    Promise.all([
      fetch("/api/user/me").then(r => r.ok ? r.json() : null),
      fetch("/api/user/dashboard").then(r => r.ok ? r.json() : null)
    ])
    .then(([meData, dashData]) => {
      if (meData) {
        setProfile(meData);
        localStorage.setItem("dash_profile", JSON.stringify(meData));
      }
      if (dashData && !dashData.error) {
        // Map postgres history to Recharts format
        const history = dashData.eloHistory.map((h: any) => ({
          label: new Date(h.played_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          elo: h.elo
        }));
        
        // If they have no history, set a flat line of their current ELO
        if (history.length === 0 && meData) {
          history.push({ label: "Start", elo: meData.elo });
          history.push({ label: "Today", elo: meData.elo });
        }
        
        setEloHistory(history);
        localStorage.setItem("dash_eloHistory", JSON.stringify(history));

        setActivityData(dashData.activityMap || {});
        localStorage.setItem("dash_activityData", JSON.stringify(dashData.activityMap || {}));

        setRecentMatches(dashData.recentMatches || []);
        localStorage.setItem("dash_recentMatches", JSON.stringify(dashData.recentMatches || []));

        if (dashData.joinedAt) {
          const dateStr = dashData.joinedAt.split('T')[0];
          setJoinedDate(dateStr);
          localStorage.setItem("dash_joinedDate", dateStr);
        }
      }
      setIsLoaded(true);
    })
    .catch(() => setIsLoaded(true));
  }, [status]);



  if (status === "loading") return (
    <div style={{ minHeight: "100vh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 28, height: 28, border: "2px solid rgba(255,255,255,0.08)", borderTop: "2px solid #8b8eff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const elo = profile?.elo ?? 1200;
  const wins = profile?.wins ?? 0;
  const losses = profile?.losses ?? 0;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

        :root {
          --bg:     #000;
          --bg2:    #060608;
          --bg3:    #0d0d14;
          --border: rgba(255,255,255,0.06);
          --border2:rgba(255,255,255,0.10);
          --indigo: #8b8eff;
          --text:   #e8e6f0;
          --muted:  #4a4860;
          --muted2: #8a8898;
          --green:  #4ade80;
          --red:    #f87171;
          --gold:   #fbbf24;
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: var(--bg);
          color: var(--text);
          font-family: system-ui, -apple-system, sans-serif;
          -webkit-font-smoothing: antialiased;
          background-image: radial-gradient(rgba(255,255,255,0.018) 1px, transparent 1px);
          background-size: 26px 26px;
        }

        /* ── NAV ── */
        .db-nav {
          position: sticky; top: 0; z-index: 50;
          height: 52px; display: flex; align-items: center; justify-content: space-between;
          padding: 0 28px;
          background: rgba(0,0,0,0.8); backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--border);
        }
        .db-brand { font-size: 14px; font-weight: 700; letter-spacing: -0.02em; }
        .db-nav-links { display: flex; gap: 4px; }
        .db-nav-link {
          font-size: 13px; color: var(--muted2); padding: 6px 12px; border-radius: 6px;
          text-decoration: none; transition: color .15s, background .15s;
        }
        .db-nav-link:hover { color: var(--text); background: rgba(255,255,255,0.04); }
        .db-nav-link.active { color: var(--text); font-weight: 600; }
        .db-nav-right { display: flex; align-items: center; gap: 10px; }

        /* Find Match button states */
        .find-btn {
          font-size: 13px; font-weight: 700;
          padding: 8px 18px; border-radius: 7px; border: none; cursor: pointer;
          display: flex; align-items: center; gap: 7px;
          transition: opacity .15s, transform .1s;
        }
        .find-btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .find-btn:active { transform: scale(0.97) translateY(0); }
        .find-btn-idle    { background: var(--text); color: #000; }
        .find-btn-queued  { background: rgba(139,142,255,0.12); color: var(--indigo); border: 1px solid rgba(139,142,255,0.25); }
        .find-btn-cancel  {
          background: none; border: 1px solid var(--border2); color: var(--muted2);
          font-size: 12px; font-weight: 500; padding: 6px 12px;
        }
        .find-btn-cancel:hover { color: var(--red); border-color: rgba(248,113,113,0.3); background: rgba(248,113,113,0.04); }

        .avatar-btn {
          width: 30px; height: 30px; border-radius: 50%;
          background: rgba(139,142,255,0.12); border: 1px solid rgba(139,142,255,0.2);
          overflow: hidden; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; color: var(--indigo);
          font-family: 'JetBrains Mono', monospace;
        }

        /* ── LAYOUT ── */
        .db-main { max-width: 960px; margin: 0 auto; padding: 40px 24px 80px; }

        /* ── HEADER ROW ── */
        .db-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          margin-bottom: 32px; flex-wrap: wrap; gap: 16px;
        }
        .db-welcome { font-size: clamp(22px, 3vw, 28px); font-weight: 700; letter-spacing: -0.03em; }
        .db-sub { font-size: 13px; color: var(--muted2); margin-top: 4px; }
        .elo-pill {
          display: flex; align-items: center; gap: 10px;
          background: var(--bg3); border: 1px solid rgba(139,142,255,0.2);
          border-radius: 10px; padding: 10px 18px;
          box-shadow: 0 0 20px rgba(139,142,255,0.05);
        }
        .elo-label {
          font-size: 10px; font-family: 'JetBrains Mono', monospace;
          color: var(--indigo); letter-spacing: 0.12em; text-transform: uppercase;
        }
        .elo-val { font-size: 26px; font-weight: 800; letter-spacing: -0.04em; }

        /* ── CARD ── */
        .card {
          background: var(--bg3);
          border: 1px solid var(--border2);
          border-radius: 10px; overflow: hidden;
          margin-bottom: 12px;
        }
        .card-hdr {
          padding: 16px 20px; border-bottom: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between;
          background: rgba(0,0,0,0.2);
        }
        .card-title { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
        .card-body { padding: 20px; }

        /* ── CHART ── */
        .chart-period {
          font-size: 10.5px; font-family: 'JetBrains Mono', monospace;
          color: var(--muted2); background: rgba(255,255,255,0.04);
          border: 1px solid var(--border2); border-radius: 5px;
          padding: 3px 9px; cursor: default;
        }

        /* ── STATS ROW ── */
        .stats-row {
          display: grid; grid-template-columns: repeat(4, 1fr);
          border-top: 1px solid var(--border);
        }
        @media(max-width:640px){ .stats-row { grid-template-columns: repeat(2,1fr); } }
        .stat-cell {
          padding: 18px 20px;
          border-right: 1px solid var(--border);
          text-align: center;
        }
        .stat-cell:last-child { border-right: none; }
        .stat-label {
          font-size: 10px; font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.09em; text-transform: uppercase;
          color: var(--muted2); margin-bottom: 8px;
        }
        .stat-val {
          font-size: 22px; font-weight: 800; letter-spacing: -0.03em;
        }

        /* ── RECENT MATCHES ── */
        .match-table { width: 100%; border-collapse: collapse; }
        .match-table th {
          font-size: 10px; font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.09em; text-transform: uppercase;
          color: var(--muted); padding: 10px 16px;
          border-bottom: 1px solid var(--border); text-align: left;
          background: rgba(0,0,0,0.12);
        }
        .match-table td { padding: 13px 16px; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .match-table tr:last-child td { border-bottom: none; }
        .match-table tr:hover td { background: rgba(255,255,255,0.015); }
        .opp-name { font-weight: 500; }
        .vs-text { font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace; margin-right: 4px; }
        .result-win  { color: var(--green); font-weight: 700; font-size: 12px; font-family: 'JetBrains Mono', monospace; }
        .result-loss { color: var(--red);   font-weight: 700; font-size: 12px; font-family: 'JetBrains Mono', monospace; }
        .elo-pos { color: var(--green); font-family: 'JetBrains Mono', monospace; font-size: 12.5px; font-weight: 600; }
        .elo-neg { color: var(--red);   font-family: 'JetBrains Mono', monospace; font-size: 12.5px; font-weight: 600; }
        .time-cell { color: var(--muted2); font-size: 12px; font-family: 'JetBrains Mono', monospace; }

        /* ── PROBLEMS ── */
        .problems-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; padding: 16px 20px; }
        @media(max-width:640px){ .problems-grid { grid-template-columns: 1fr; } }
        .prob-card {
          padding: 16px; border-radius: 8px;
          border: 1px solid var(--border2);
          background: rgba(255,255,255,0.02);
          transition: border-color .2s, background .2s;
          cursor: pointer;
        }
        .prob-card:hover { border-color: rgba(139,142,255,0.25); background: rgba(139,142,255,0.03); }
        .prob-diff {
          font-size: 9.5px; font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.1em; text-transform: uppercase;
          font-weight: 700; margin-bottom: 8px;
        }
        .prob-name { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 10px; }
        .prob-action {
          font-size: 11px; font-family: 'JetBrains Mono', monospace;
          color: var(--indigo); background: rgba(139,142,255,0.06);
          border: 1px solid rgba(139,142,255,0.15);
          padding: 4px 10px; border-radius: 4px; display: inline-block;
          transition: background .15s;
        }
        .prob-card:hover .prob-action { background: rgba(139,142,255,0.12); }

        /* ── QUEUED OVERLAY ── */
        .queue-banner {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 20px; border-radius: 8px; margin-bottom: 20px;
          background: rgba(139,142,255,0.06); border: 1px solid rgba(139,142,255,0.2);
          animation: pulse-border 2.5s ease-in-out infinite;
        }
        @keyframes pulse-border {
          0%,100%{ border-color: rgba(139,142,255,0.2); }
          50%{ border-color: rgba(139,142,255,0.5); }
        }
        .queue-text {
          font-size: 13px; color: var(--indigo); font-weight: 600;
          display: flex; align-items: center; gap: 10px;
        }
        .queue-spinner {
          width: 14px; height: 14px;
          border: 2px solid rgba(139,142,255,0.2);
          border-top-color: var(--indigo);
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        
        @keyframes shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }
        .skeleton {
          animation: shimmer 2s infinite linear;
          background: linear-gradient(to right, rgba(255,255,255,0.05) 4%, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.05) 36%);
          background-size: 1000px 100%;
          border-radius: 4px;
        }

        .recharts-cartesian-grid-horizontal line,
        .recharts-cartesian-grid-vertical   line { stroke: rgba(255,255,255,0.05) !important; }
        .recharts-xAxis .recharts-text,
        .recharts-yAxis .recharts-text { fill: rgba(255,255,255,0.3) !important; font-size: 11px !important; }
      `}</style>

      {/* NAV */}
      <nav className="db-nav">
        <Link href="/" className="db-brand">CodeDuel</Link>
        <div className="db-nav-links">
          <Link href="/dashboard" className="db-nav-link active">Dashboard</Link>
          <Link href="/leaderboard" className="db-nav-link">Leaderboard</Link>
          <Link href="/friends" className="db-nav-link">Friends</Link>
          <Link href="/profile" className="db-nav-link">Profile</Link>
        </div>
        <div className="db-nav-right">
          {matchState === "queued" ? (
            <button className="find-btn find-btn-cancel" onClick={handleCancel}>Cancel search</button>
          ) : (
            <button className="find-btn find-btn-idle" onClick={() => setShowMatchModal(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
              Find Match
            </button>
          )}
          
          <div style={{ position: "relative" }}>
            <div 
              className="avatar-btn" 
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              style={{ cursor: "pointer" }}
            >
              {session?.user?.image
                ? <img src={session.user.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : (session?.user?.name?.[0] ?? "?").toUpperCase()
              }
            </div>
            {showProfileMenu && (
              <div style={{
                position: "absolute", top: "100%", right: 0, marginTop: 8,
                background: "var(--bg3)", border: "1px solid rgba(248,113,113,0.3)",
                borderRadius: 6, overflow: "hidden", zIndex: 50,
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
              }}>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  style={{
                    background: "rgba(248,113,113,0.1)", border: "none", color: "var(--red)",
                    padding: "10px 16px", cursor: "pointer", width: "100%", whiteSpace: "nowrap",
                    display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600,
                    fontFamily: "'JetBrains Mono', monospace", transition: "background 0.15s"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(248,113,113,0.2)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "rgba(248,113,113,0.1)"}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* MATCH MODAL */}
      {showMatchModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
        }}>
          <div style={{
            background: "var(--bg3)", border: "1px solid var(--border2)",
            borderRadius: 12, padding: 30, width: "100%", maxWidth: 400,
            boxShadow: "0 20px 40px rgba(0,0,0,0.4)"
          }}>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>Select Match Type</h2>
            <p style={{ color: "var(--muted2)", fontSize: 13, marginBottom: 24 }}>How would you like to play?</p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button 
                onClick={() => { setShowMatchModal(false); handleFindMatch(); }}
                style={{
                  background: "var(--indigo)", color: "#fff", border: "none",
                  padding: "14px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
                  transition: "opacity 0.2s"
                }}
                onMouseOver={(e) => (e.currentTarget.style.opacity = "0.9")}
                onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
              >
                <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>⚡</div>
                Play Random Opponent
              </button>

              <button 
                onClick={() => { setShowMatchModal(false); router.push("/friends"); }}
                style={{
                  background: "rgba(255,255,255,0.05)", color: "var(--text)", border: "1px solid var(--border)",
                  padding: "14px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
                  transition: "background 0.2s"
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                onMouseOut={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
              >
                <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>👥</div>
                Challenge a Friend
              </button>
            </div>

            <button 
              onClick={() => setShowMatchModal(false)}
              style={{
                width: "100%", background: "transparent", border: "none", color: "var(--muted2)",
                marginTop: 20, cursor: "pointer", fontSize: 13, padding: 8
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <main className="db-main">

        {/* Searching banner */}
        {matchState === "queued" && (
          <div className="queue-banner">
            <span className="queue-text">
              <span className="queue-spinner" />
              Searching for an opponent near your ELO ({elo})...
            </span>
            <button className="find-btn find-btn-cancel" onClick={handleCancel} style={{ padding: "4px 10px", fontSize: 11 }}>
              Cancel
            </button>
          </div>
        )}

        {/* Header */}
        <div className="db-header">
          <div>
            {!isLoaded ? (
              <>
                <div className="skeleton" style={{ width: 250, height: 28, marginBottom: 8, borderRadius: 6 }}></div>
                <div className="skeleton" style={{ width: 180, height: 16, borderRadius: 4 }}></div>
              </>
            ) : (
              <>
                <h1 className="db-welcome">Welcome back, {profile?.username ?? session?.user?.name ?? "developer"}</h1>
                <p className="db-sub">Your coding arena is ready.</p>
              </>
            )}
          </div>
          <div className="elo-pill">
            <span className="elo-label">ELO</span>
            {!isLoaded ? <div className="skeleton" style={{ width: 40, height: 24 }}></div> : <span className="elo-val">{elo}</span>}
          </div>
        </div>

        {/* ELO History Chart */}
        <div className="card">
          <div className="card-hdr">
            <span className="card-title">ELO History</span>
            <span className="chart-period">Last 12 months</span>
          </div>
          <div style={{ padding: "16px 12px 4px", position: "relative" }}>
            {!isLoaded && <div className="skeleton" style={{ position: "absolute", top: 16, left: 12, right: 12, bottom: 4, zIndex: 10, borderRadius: 8 }}></div>}
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={eloHistory} margin={{ top: 4, right: 12, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.3)" }} tickLine={false} axisLine={false} interval={1} />
                <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.3)" }} tickLine={false} axisLine={false} width={36} domain={["auto","auto"]} />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone" dataKey="elo"
                  stroke="#8b8eff" strokeWidth={2}
                  dot={{ fill: "#8b8eff", r: 3, strokeWidth: 0 }}
                  activeDot={{ fill: "#8b8eff", r: 5, strokeWidth: 0, stroke: "rgba(139,142,255,0.3)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Stats Row */}
          <div className="stats-row">
            <div className="stat-cell">
              <div className="stat-label">Win Rate</div>
              <div className="stat-val" style={{ color: winRate > 50 ? "var(--green)" : winRate > 0 ? "var(--gold)" : "var(--muted2)" }}>
                {!isLoaded ? <div className="skeleton" style={{ width: 60, height: 24 }}></div> : `${winRate}%`}
              </div>
            </div>
            <div className="stat-cell">
              <div className="stat-label">Current Streak</div>
              <div className="stat-val" style={{ color: "var(--indigo)" }}>
                {!isLoaded ? <div className="skeleton" style={{ width: 80, height: 24 }}></div> : (wins > 0 ? `${wins} Wins` : "0 Wins")}
              </div>
            </div>
            <div className="stat-cell">
              <div className="stat-label">Total Matches</div>
              <div className="stat-val">
                {!isLoaded ? <div className="skeleton" style={{ width: 40, height: 24 }}></div> : total}
              </div>
            </div>
            <div className="stat-cell">
              <div className="stat-label">Avg. Duel Time</div>
              <div className="stat-val" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 20 }}>
                {!isLoaded ? <div className="skeleton" style={{ width: 70, height: 24 }}></div> : "12:45"}
              </div>
            </div>
          </div>
        </div>

        {/* Activity Calendar */}
        <div className="card">
          <div className="card-hdr">
            <span className="card-title">Your Duel Activity</span>
            <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--muted2)" }}>
              {!isLoaded ? <div className="skeleton" style={{ width: 100, height: 14, display: "inline-block" }}></div> : `${Object.values(activityData).filter(v => v > 0).length} active days`}
            </span>
          </div>
          <div className="card-body" style={{ position: "relative" }}>
            {!isLoaded && <div className="skeleton" style={{ position: "absolute", inset: 0, zIndex: 10, borderRadius: 8 }}></div>}
            <ActivityCalendar data={activityData} joinedDate={joinedDate} />
          </div>
        </div>

        {/* Recent Matches */}
        <div className="card">
          <div className="card-hdr">
            <span className="card-title">Recent Matches</span>
            <Link href="/leaderboard" style={{ fontSize: 12, color: "var(--indigo)", textDecoration: "none", fontFamily: "JetBrains Mono, monospace" }}>
              View All →
            </Link>
          </div>
          <table className="match-table">
            <thead>
              <tr>
                <th>Opponent</th>
                <th>Problem</th>
                <th>Result</th>
                <th>ELO Change</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {!isLoaded ? (
                [1,2,3,4,5].map(i => (
                  <tr key={i}>
                    <td><div className="skeleton" style={{ width: "100%", height: 16 }}></div></td>
                    <td><div className="skeleton" style={{ width: "100%", height: 16 }}></div></td>
                    <td><div className="skeleton" style={{ width: "100%", height: 16 }}></div></td>
                    <td><div className="skeleton" style={{ width: "100%", height: 16 }}></div></td>
                    <td><div className="skeleton" style={{ width: "100%", height: 16 }}></div></td>
                  </tr>
                ))
              ) : recentMatches.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--muted2)", padding: "20px" }}>
                    No matches played yet.
                  </td>
                </tr>
              ) : (
                recentMatches.map((m, i) => (
                  <tr key={i}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span>
                          <span className="vs-text">vs.</span>
                        </span>
                        {m.opponentAvatar ? (
                          <img src={m.opponentAvatar} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border)" }} />
                        ) : (
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, border: "1px solid var(--border)", color: "var(--muted2)" }}>
                            {m.opponent?.[0]?.toUpperCase() ?? "?"}
                          </div>
                        )}
                        <span>
                          <span className="opp-name">{m.opponent}</span>
                        </span>
                      </div>
                    </td>
                    <td style={{ color: "var(--muted2)" }}>{m.problem}</td>
                    <td>
                      <span className={m.result === "Win" ? "result-win" : "result-loss"}>{m.result}</span>
                    </td>
                    <td>
                      <span className={m.elo.startsWith("+") ? "elo-pos" : "elo-neg"}>{m.elo} ELO</span>
                    </td>
                    <td className="time-cell">{new Date(m.playedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Recommended Problems */}
        <div className="card">
          <div className="card-hdr">
            <span className="card-title">Recommended Problems</span>
          </div>
          <div className="problems-grid">
            {PROBLEMS.map((p, i) => (
              <div className="prob-card" key={i}>
                <div className="prob-diff" style={{ color: DIFF_COLORS[p.diff] }}>
                  {p.diff}
                </div>
                <div className="prob-name">{p.title}</div>
                <span className="prob-action">Practice →</span>
              </div>
            ))}
          </div>
        </div>

      </main>
    </>
  );
}
