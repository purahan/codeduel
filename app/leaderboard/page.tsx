"use client";

import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatar: string | null;
  elo: number;
}

export default function LeaderboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);



  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((data) => {
        if (data.entries) setEntries(data.entries);
        else setError("Failed to load leaderboard");
      })
      .catch(() => setError("Failed to load leaderboard"))
      .finally(() => setLoading(false));
  }, []);

  const myId = (session?.user as any)?.id;

  const rankLabel = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  };

  const eloTier = (elo: number) => {
    if (elo >= 2000) return { label: "Grandmaster", color: "#f43f5e" };
    if (elo >= 1800) return { label: "Master",      color: "#a855f7" };
    if (elo >= 1600) return { label: "Diamond",     color: "#38bdf8" };
    if (elo >= 1400) return { label: "Gold",        color: "#fbbf24" };
    if (elo >= 1200) return { label: "Silver",      color: "#94a3b8" };
    return             { label: "Bronze",            color: "#cd7f32" };
  };

  // Podium display order: 2nd (left) — 1st (centre) — 3rd (right)
  const podium = [
    { slot: entries[1] ?? null, pos: 2 },
    { slot: entries[0] ?? null, pos: 1 },
    { slot: entries[2] ?? null, pos: 3 },
  ];

  const podiumMeta = {
    1: { color: "#fbbf24", glow: "rgba(251,191,36,0.18)",  height: 80, label: "1st",  crown: "👑" },
    2: { color: "#94a3b8", glow: "rgba(148,163,184,0.14)", height: 56, label: "2nd",  crown: "🥈" },
    3: { color: "#cd7f32", glow: "rgba(205,127,50,0.14)",  height: 40, label: "3rd",  crown: "🥉" },
  } as const;

  if (status === "loading" || loading) {
    return (
      <>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          body { margin: 0; background: #000; }
        `}</style>
        <div style={{ minHeight: "100vh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 28, height: 28, border: "2px solid rgba(255,255,255,0.08)", borderTop: "2px solid #8b8eff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');

        :root {
          --bg:      #000;
          --bg2:     #060608;
          --bg3:     #0d0d14;
          --border:  rgba(255,255,255,0.06);
          --border2: rgba(255,255,255,0.10);
          --indigo:  #8b8eff;
          --text:    #e8e6f0;
          --muted:   #4a4860;
          --muted2:  #8a8898;
          --green:   #4ade80;
          --red:     #f87171;
          --gold:    #fbbf24;
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }

        body {
          background: var(--bg);
          color: var(--text);
          font-family: system-ui, -apple-system, sans-serif;
          -webkit-font-smoothing: antialiased;
          background-image: radial-gradient(rgba(255,255,255,0.018) 1px, transparent 1px);
          background-size: 26px 26px;
        }
        a { text-decoration: none; color: inherit; }

        /* ── NAV ── */
        .lb-nav {
          position: sticky; top: 0; z-index: 50;
          height: 52px; display: flex; align-items: center; justify-content: space-between;
          padding: 0 28px;
          background: rgba(0,0,0,0.80); backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--border);
        }
        .lb-brand { font-size: 14px; font-weight: 700; letter-spacing: -0.02em; color: var(--text); }
        .lb-nav-links { display: flex; gap: 4px; }
        .lb-nav-link {
          font-size: 13px; color: var(--muted2); padding: 6px 12px; border-radius: 6px;
          text-decoration: none; transition: color .15s, background .15s;
        }
        .lb-nav-link:hover { color: var(--text); background: rgba(255,255,255,0.04); }
        .lb-nav-link.active { color: var(--text); font-weight: 600; }

        /* ── LAYOUT ── */
        .lb-main { max-width: 860px; margin: 0 auto; padding: 40px 24px 80px; }

        /* ── HEADER ── */
        .lb-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          margin-bottom: 40px; flex-wrap: wrap; gap: 12px;
        }
        .lb-title { font-size: clamp(22px, 3vw, 28px); font-weight: 700; letter-spacing: -0.03em; margin-bottom: 4px; }
        .lb-subtitle { font-size: 13px; color: var(--muted2); }

        .live-badge {
          display: flex; align-items: center; gap: 6px;
          background: var(--bg3); border: 1px solid rgba(74,222,128,0.2);
          border-radius: 8px; padding: 6px 12px;
          font-size: 12px; font-family: 'JetBrains Mono', monospace; font-weight: 700;
          color: var(--green);
        }
        .live-dot {
          width: 6px; height: 6px; border-radius: 50%; background: var(--green);
          animation: live-pulse 2s ease-in-out infinite;
        }
        @keyframes live-pulse {
          0%,100% { opacity: 1; box-shadow: 0 0 0 0 rgba(74,222,128,0.4); }
          50%      { opacity: 0.7; box-shadow: 0 0 0 4px rgba(74,222,128,0); }
        }

        /* ── PODIUM SECTION ── */
        .podium-section {
          margin-bottom: 36px;
          padding: 36px 24px 0;
          position: relative;
          overflow: hidden;
        }
        /* subtle radial glow in the podium zone */
        .podium-section::before {
          content: '';
          position: absolute; top: 0; left: 50%; transform: translateX(-50%);
          width: 600px; height: 320px;
          background: radial-gradient(ellipse at 50% 20%,
            rgba(139,142,255,0.07) 0%, transparent 70%);
          pointer-events: none;
        }

        .podium-row {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 16px;
          position: relative; z-index: 1;
        }

        /* Each podium column = card on top + platform block below */
        .podium-col { display: flex; flex-direction: column; align-items: center; flex: 1; max-width: 240px; }

        /* The player card */
        .podium-card {
          width: 100%; border-radius: 12px;
          border: 1px solid transparent;
          padding: 20px 16px 16px;
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          text-align: center;
          position: relative; overflow: hidden;
          transition: transform .2s;
        }
        .podium-card:hover { transform: translateY(-3px); }

        /* glow sweep pseudo-element */
        .podium-card::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 1px;
        }

        .podium-crown {
          font-size: 22px;
          position: absolute; top: -13px; left: 50%; transform: translateX(-50%);
          filter: drop-shadow(0 0 8px rgba(251,191,36,0.5));
        }
        .p1 .podium-crown { font-size: 26px; top: -16px; }

        .podium-avatar {
          width: 60px; height: 60px; border-radius: 50%;
          overflow: hidden; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 20px; font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
          border: 2px solid transparent;
        }
        .p1 .podium-avatar { width: 72px; height: 72px; font-size: 24px; }

        .podium-rank-label {
          font-size: 9.5px; font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.12em; text-transform: uppercase;
          font-weight: 700; padding: 2px 8px; border-radius: 4px;
        }

        .podium-username {
          font-size: 13px; font-weight: 700; letter-spacing: -0.01em;
          color: var(--text); max-width: 100%; overflow: hidden;
          text-overflow: ellipsis; white-space: nowrap;
        }
        .p1 .podium-username { font-size: 15px; }

        .podium-elo {
          font-family: 'JetBrains Mono', monospace;
          font-size: 20px; font-weight: 800; letter-spacing: -0.04em;
        }
        .p1 .podium-elo { font-size: 24px; }

        .podium-tier {
          font-size: 9.5px; font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.08em; text-transform: uppercase;
          font-weight: 700; padding: 2px 8px; border-radius: 4px;
        }

        /* The platform block below the card */
        .podium-platform {
          width: 100%; border-radius: 0 0 8px 8px;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-family: 'JetBrains Mono', monospace;
          font-weight: 700; letter-spacing: 0.08em;
          margin-top: 12px;
        }

        /* Platform divider line between podium and table */
        .podium-floor {
          margin-top: 0; height: 1px;
          background: linear-gradient(90deg, transparent 0%, var(--border2) 20%, var(--border2) 80%, transparent 100%);
        }

        /* ── TIER LEGEND ── */
        .tier-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; margin-top: 28px; }
        .tier-chip {
          display: flex; align-items: center; gap: 6px;
          background: var(--bg3); border: 1px solid var(--border2);
          border-radius: 6px; padding: 4px 10px;
        }
        .tier-dot  { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .tier-name { font-size: 11px; font-family: 'JetBrains Mono', monospace; color: var(--muted2); }
        .tier-elo  { font-size: 10px; font-family: 'JetBrains Mono', monospace; color: var(--muted); margin-left: 2px; }

        /* ── CARD ── */
        .lb-card {
          background: var(--bg3); border: 1px solid var(--border2);
          border-radius: 10px; overflow: hidden;
        }

        /* ── TABLE ── */
        .lb-table { width: 100%; border-collapse: collapse; }
        .lb-table th {
          text-align: left; padding: 12px 20px;
          font-size: 10px; font-family: 'JetBrains Mono', monospace;
          font-weight: 700; letter-spacing: 0.10em; text-transform: uppercase;
          color: var(--muted); border-bottom: 1px solid var(--border);
          background: rgba(0,0,0,0.15);
        }
        .lb-table td { padding: 14px 20px; border-bottom: 1px solid var(--border); vertical-align: middle; }
        .lb-table tbody tr:last-child td { border-bottom: none; }
        .lb-table tbody tr { transition: background 0.12s; }
        .lb-table tbody tr:hover td { background: rgba(255,255,255,0.015); }

        /* ── AVATAR (table) ── */
        .lb-avatar {
          width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
          background: rgba(139,142,255,0.08); border: 1px solid rgba(139,142,255,0.15);
          overflow: hidden; display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700; color: var(--indigo);
          font-family: 'JetBrains Mono', monospace;
        }
        .player-cell { display: flex; align-items: center; gap: 12px; }
        .player-name { font-size: 14px; font-weight: 600; }
        .you-badge {
          font-size: 9.5px; font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.06em; text-transform: uppercase;
          background: rgba(139,142,255,0.08); border: 1px solid rgba(139,142,255,0.2);
          color: var(--indigo); padding: 1px 6px; border-radius: 4px; margin-left: 8px;
        }

        .tier-badge {
          font-size: 10px; font-family: 'JetBrains Mono', monospace;
          font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
          padding: 2px 8px; border-radius: 4px;
        }
        .elo-num {
          font-family: 'JetBrains Mono', monospace;
          font-size: 15px; font-weight: 800; letter-spacing: -0.03em;
        }
        .my-row td { background: rgba(139,142,255,0.03); }
        .my-row td:first-child { box-shadow: inset 2px 0 0 var(--indigo); }

        .lb-empty { text-align: center; padding: 60px 24px; color: var(--muted2); font-size: 14px; }
        .lb-empty .icon { font-size: 36px; margin-bottom: 14px; }

        @keyframes spin { to { transform: rotate(360deg); } }

        /* responsive */
        @media (max-width: 600px) {
          .podium-elo  { font-size: 16px; }
          .p1 .podium-elo { font-size: 20px; }
          .podium-card { padding: 16px 10px 12px; }
          .podium-avatar { width: 48px; height: 48px; font-size: 16px; }
          .p1 .podium-avatar { width: 58px; height: 58px; }
        }
      `}</style>

      {/* NAV */}
      <nav className="lb-nav">
        <Link href="/" className="lb-brand">CodeDuel</Link>
        <div className="lb-nav-links">
          {status === "authenticated" ? (
            <>
              <Link href="/dashboard" className="lb-nav-link">Dashboard</Link>
              <Link href="/leaderboard" className="lb-nav-link active">Leaderboard</Link>
              <Link href="/friends" className="lb-nav-link">Friends</Link>
              <Link href="/profile" className="lb-nav-link">Profile</Link>
            </>
          ) : (
            <>
              <Link href="/#elo" className="lb-nav-link">Rank System</Link>
              <Link href="/#live" className="lb-nav-link">Live Feed</Link>
              <Link href="/#social" className="lb-nav-link">Social Play</Link>
              <Link href="/#community" className="lb-nav-link">Community</Link>
              <Link href="/leaderboard" className="lb-nav-link active">Leaderboard</Link>
            </>
          )}
        </div>
        <div style={{ width: 140, display: "flex", justifyContent: "flex-end" }}>
          {status === "unauthenticated" && (
            <button 
              onClick={() => signIn("github")}
              className="lb-nav-link" 
              style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--border2)", fontWeight: 600, background: "var(--text)", color: "#000", cursor: "pointer" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Sign In
            </button>
          )}
        </div>
      </nav>

      <main className="lb-main">

        {/* Header */}
        <div className="lb-header">
          <div>
            <h1 className="lb-title">Global Leaderboard</h1>
            <p className="lb-subtitle">Top developers ranked by ELO rating</p>
          </div>
          <div className="live-badge">
            <span className="live-dot" />
            Live
          </div>
        </div>

        {/* ── TOP 3 PODIUM ── */}
        {entries.length >= 3 && (
          <div className="podium-section">
            <div className="podium-row">
              {podium.map(({ slot, pos }) => {
                if (!slot) return <div key={pos} className="podium-col" />;
                const meta = podiumMeta[pos as 1 | 2 | 3];
                const tier = eloTier(slot.elo);
                const isMe = slot.userId === myId;

                return (
                  <div key={pos} className={`podium-col p${pos}`}>
                    {/* Card */}
                    <div
                      className={`podium-card p${pos}`}
                      style={{
                        background: `linear-gradient(160deg, ${meta.color}0d 0%, var(--bg3) 50%)`,
                        border: `1px solid ${meta.color}30`,
                        boxShadow: `0 0 40px ${meta.glow}, 0 20px 60px rgba(0,0,0,0.5)`,
                      }}
                    >
                      {/* Crown / medal above card */}
                      <span className="podium-crown">{meta.crown}</span>

                      {/* Avatar */}
                      <div
                        className="podium-avatar"
                        style={{
                          background: `${meta.color}15`,
                          border: `2px solid ${meta.color}50`,
                          color: meta.color,
                        }}
                      >
                        {slot.avatar
                          ? <img src={slot.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : slot.username[0]?.toUpperCase()
                        }
                      </div>

                      {/* Rank pill */}
                      <span
                        className="podium-rank-label"
                        style={{
                          background: `${meta.color}15`,
                          border: `1px solid ${meta.color}30`,
                          color: meta.color,
                        }}
                      >
                        {meta.label}
                      </span>

                      {/* Username */}
                      <span className="podium-username" title={slot.username}>
                        {slot.username}
                        {isMe && (
                          <span className="you-badge" style={{ marginLeft: 6 }}>you</span>
                        )}
                      </span>

                      {/* ELO */}
                      <span className="podium-elo" style={{ color: meta.color }}>
                        {slot.elo}
                        <span style={{ fontSize: "0.45em", opacity: 0.6, marginLeft: 4, letterSpacing: "0.12em" }}>ELO</span>
                      </span>

                      {/* Tier */}
                      <span
                        className="podium-tier"
                        style={{
                          background: `${tier.color}15`,
                          border: `1px solid ${tier.color}30`,
                          color: tier.color,
                        }}
                      >
                        {tier.label}
                      </span>
                    </div>

                    {/* Platform block */}
                    <div
                      className="podium-platform"
                      style={{
                        height: meta.height,
                        background: `linear-gradient(to bottom, ${meta.color}12, ${meta.color}06)`,
                        border: `1px solid ${meta.color}20`,
                        borderTop: "none",
                        color: meta.color,
                        opacity: 0.9,
                      }}
                    >
                      #{pos}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="podium-floor" style={{ marginTop: 0 }} />
          </div>
        )}

        {/* Tier legend */}
        <div className="tier-row">
          {[
            { label: "Grandmaster", color: "#f43f5e", min: "2000+" },
            { label: "Master",      color: "#a855f7", min: "1800"  },
            { label: "Diamond",     color: "#38bdf8", min: "1600"  },
            { label: "Gold",        color: "#fbbf24", min: "1400"  },
            { label: "Silver",      color: "#94a3b8", min: "1200"  },
            { label: "Bronze",      color: "#cd7f32", min: "<1200" },
          ].map((t) => (
            <div key={t.label} className="tier-chip">
              <span className="tier-dot" style={{ background: t.color }} />
              <span className="tier-name">{t.label}</span>
              <span className="tier-elo">{t.min}</span>
            </div>
          ))}
        </div>

        {/* Full Rankings Table */}
        <div className="lb-card">
          {error ? (
            <div className="lb-empty">
              <div className="icon">⚠️</div>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--red)" }}>{error}</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="lb-empty">
              <div className="icon">🏆</div>
              <p>No rankings yet. Be the first to play a match!</p>
            </div>
          ) : (
            <table className="lb-table">
              <thead>
                <tr>
                  <th style={{ width: 64 }}>Rank</th>
                  <th>Player</th>
                  <th>Tier</th>
                  <th style={{ textAlign: "right" }}>ELO</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const tier  = eloTier(entry.elo);
                  const isMe  = entry.userId === myId;
                  const top3  = ["#fbbf24", "#94a3b8", "#cd7f32"];

                  return (
                    <tr key={entry.userId} className={isMe ? "my-row" : ""}>
                      <td>
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 13, fontWeight: 700,
                            color: entry.rank <= 3 ? top3[entry.rank - 1] : "var(--muted2)",
                          }}
                        >
                          {rankLabel(entry.rank)}
                        </span>
                      </td>
                      <td>
                        <div className="player-cell">
                          <div className="lb-avatar">
                            {entry.avatar
                              ? <img src={entry.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : entry.username[0]?.toUpperCase()
                            }
                          </div>
                          <div>
                            <span
                              className="player-name"
                              style={{ color: isMe ? "var(--indigo)" : "var(--text)" }}
                            >
                              {entry.username}
                            </span>
                            {isMe && <span className="you-badge">you</span>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className="tier-badge"
                          style={{
                            background: `${tier.color}18`,
                            border: `1px solid ${tier.color}35`,
                            color: tier.color,
                          }}
                        >
                          {tier.label}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className="elo-num" style={{ color: tier.color }}>
                          {entry.elo}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

      </main>
    </>
  );
}
