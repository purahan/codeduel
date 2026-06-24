"use client";

import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.push("/dashboard");
  }, [status, router]);

  // Scroll reveal observer
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in-view");
            // feed table gets special class
            if (e.target.classList.contains("feed-table")) {
              e.target.classList.add("rows-in");
            }
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    document
      .querySelectorAll(".reveal, .reveal-stagger, .feed-table")
      .forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,500;0,600&display=swap');

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
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }

        body {
          background: var(--bg);
          color: var(--text);
          font-family: 'Geist', system-ui, -apple-system, sans-serif;
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
          /* subtle dot grid throughout */
          background-image: radial-gradient(rgba(255,255,255,0.022) 1px, transparent 1px);
          background-size: 26px 26px;
        }
        a { text-decoration: none; color: inherit; }

        /* ── NAV ─────────────────────────────────────────── */
        .nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          height: 52px;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 28px;
          border-bottom: 1px solid var(--border);
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(24px) saturate(1.5);
        }
        .nav-brand { font-size: 14px; font-weight: 700; letter-spacing: -0.02em; }
        .nav-center { display: flex; gap: 24px; list-style: none; }
        .nav-center a { font-size: 13px; color: var(--muted2); transition: color .15s; }
        .nav-center a:hover { color: var(--text); }
        .nav-right { display: flex; align-items: center; gap: 8px; }

        .btn-ghost {
          font-size: 13px; color: var(--muted2);
          background: none; border: none; cursor: pointer;
          padding: 6px 12px; border-radius: 6px;
          transition: color .15s, background .15s;
        }
        .btn-ghost:hover { color: var(--text); background: rgba(255,255,255,0.05); }

        .btn-primary {
          font-size: 13px; font-weight: 600;
          background: var(--text); color: #000;
          border: none; border-radius: 6px;
          padding: 7px 14px; cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px;
          transition: opacity .15s, transform .1s;
        }
        .btn-primary:hover { opacity: 0.88; }
        .btn-primary:active { transform: scale(0.97); }

        /* ── HERO ────────────────────────────────────────── */
        .hero {
          padding: 138px 24px 80px;
          display: flex; flex-direction: column; align-items: center;
          text-align: center; position: relative; overflow: hidden;
        }

        /* stronger radial glow — actually visible */
        .hero::before {
          content: '';
          position: absolute; top: -60px; left: 50%; transform: translateX(-50%);
          width: 900px; height: 500px;
          background: radial-gradient(ellipse at 50% 0%,
            rgba(139,142,255,0.13) 0%,
            rgba(139,142,255,0.04) 40%,
            transparent 70%);
          pointer-events: none;
        }

        /* second glow layer for depth */
        .hero::after {
          content: '';
          position: absolute; bottom: 0; left: 50%; transform: translateX(-50%);
          width: 600px; height: 200px;
          background: radial-gradient(ellipse at 50% 100%,
            rgba(139,142,255,0.06) 0%, transparent 70%);
          pointer-events: none;
        }

        .hero-eyebrow {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 5px 13px; border-radius: 100px;
          border: 1px solid rgba(139,142,255,0.2);
          background: rgba(139,142,255,0.05);
          font-size: 10.5px; font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--indigo); margin-bottom: 32px;
          position: relative; z-index: 1;
        }
        .eyebrow-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: var(--indigo);
          animation: pulse-dot 2.4s ease-in-out infinite;
        }
        @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.35;transform:scale(0.8)} }

        .hero-h1 {
          font-size: clamp(54px, 9.5vw, 96px);
          font-weight: 700; letter-spacing: -0.048em; line-height: 0.94;
          margin-bottom: 24px; max-width: 740px;
          position: relative; z-index: 1;
          /* text rendered against the glow */
          text-shadow: 0 2px 40px rgba(0,0,0,0.4);
        }
        .hero-h1 .accent {
          /* gradient text */
          background: linear-gradient(135deg, #a5a8ff 0%, #7b7fff 50%, #c4b5fd 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .hero-sub {
          font-size: 15px; line-height: 1.65; color: var(--muted2);
          max-width: 400px; margin: 0 auto 36px;
          position: relative; z-index: 1;
        }

        .hero-actions {
          display: flex; gap: 10px; justify-content: center;
          flex-wrap: wrap; margin-bottom: 72px;
          position: relative; z-index: 1;
        }

        .btn-cta {
          display: inline-flex; align-items: center; gap: 8px;
          background: var(--text); color: #000;
          font-size: 13.5px; font-weight: 700;
          padding: 10px 20px; border-radius: 7px;
          border: none; cursor: pointer;
          transition: opacity .15s, transform .1s;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.4);
        }
        .btn-cta:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-cta:active { transform: scale(0.97) translateY(0); }

        .btn-cta-ghost {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(255,255,255,0.03); color: var(--muted2);
          font-size: 13.5px; font-weight: 500;
          padding: 10px 20px; border-radius: 7px;
          border: 1px solid var(--border2); cursor: pointer;
          transition: color .15s, border-color .15s, background .15s;
        }
        .btn-cta-ghost:hover {
          color: var(--text); border-color: rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.05);
        }

        /* ── ARENA CARD ──────────────────────────────────── */
        .arena-wrap {
          width: 100%; max-width: 880px;
          position: relative; z-index: 1;
        }

        /* purple halo behind the card — the character */
        .arena-wrap::before {
          content: '';
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          width: 110%; height: 110%;
          background: radial-gradient(ellipse at 50% 50%,
            rgba(120, 100, 255, 0.18) 0%,
            rgba(100, 80, 220, 0.10) 35%,
            transparent 70%);
          border-radius: 50%;
          pointer-events: none;
          z-index: -1;
          filter: blur(24px);
        }

        /* bottom fade so card bleeds into next section */
        .arena-wrap::after {
          content: '';
          position: absolute; bottom: 0; left: 0; right: 0; height: 80px;
          background: linear-gradient(to bottom, transparent, var(--bg));
          border-radius: 0 0 12px 12px;
          pointer-events: none; z-index: 2;
        }

        .arena-card {
          background: var(--bg3);
          border: 1px solid rgba(139,142,255,0.2);
          border-radius: 12px; overflow: hidden;
          box-shadow:
            0 0 0 1px rgba(139,142,255,0.06),
            0 0 60px rgba(120,100,255,0.12),
            0 0 120px rgba(100,80,220,0.08),
            0 40px 100px rgba(0,0,0,0.7);
        }

        .arena-chrome {
          height: 38px; padding: 0 14px;
          border-bottom: 1px solid var(--border);
          display: flex; align-items: center; gap: 7px;
          background: rgba(0,0,0,0.35);
        }
        .chrome-dot { width: 10px; height: 10px; border-radius: 50%; }
        .cd-r { background: #ff5f57; } .cd-y { background: #febc2e; } .cd-g { background: #28c840; }

        .chrome-tabs { margin-left: 14px; display: flex; gap: 2px; }
        .chrome-tab {
          font-size: 11px; font-family: 'JetBrains Mono', monospace;
          padding: 3px 11px; border-radius: 5px;
          color: var(--muted2); cursor: default;
        }
        .chrome-tab.active { background: rgba(139,142,255,0.1); color: var(--indigo); }

        .chrome-pill {
          margin-left: auto; display: flex; align-items: center; gap: 6px;
          font-size: 11px; font-family: 'JetBrains Mono', monospace; color: var(--muted);
        }
        .timer-badge {
          display: flex; align-items: center; gap: 5px;
          background: rgba(139,142,255,0.08); border: 1px solid rgba(139,142,255,0.18);
          border-radius: 5px; padding: 2px 8px;
          font-size: 11.5px; font-weight: 600;
          font-family: 'JetBrains Mono', monospace; color: var(--indigo);
        }
        .elo-badge {
          background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.2);
          border-radius: 5px; padding: 2px 8px;
          font-size: 11.5px; font-weight: 600;
          font-family: 'JetBrains Mono', monospace; color: var(--green);
        }

        .editor-body {
          display: flex; height: 220px;
        }
        .line-nums {
          width: 44px; padding: 16px 8px 16px 0;
          text-align: right; font-size: 12px;
          font-family: 'JetBrains Mono', monospace;
          color: rgba(255,255,255,0.12); user-select: none;
          border-right: 1px solid var(--border); background: rgba(0,0,0,0.15);
          display: flex; flex-direction: column; gap: 0;
          line-height: 21px;
        }
        .code-area {
          flex: 1; padding: 16px 20px;
          font-size: 13px; font-family: 'JetBrains Mono', monospace;
          line-height: 21px; overflow: hidden;
        }
        .k  { color: #c792ea; }  /* keyword  */
        .fn { color: #82aaff; }  /* function */
        .st { color: #c3e88d; }  /* string   */
        .cm { color: #546e7a; }  /* comment  */
        .nm { color: #f78c6c; }  /* number   */
        .pn { color: #89ddff; }  /* punctuation */

        .cursor { display: inline-block; width: 2px; height: 14px;
          background: var(--indigo); vertical-align: text-bottom;
          animation: cur 1.1s step-end infinite; margin-left: 1px; }
        @keyframes cur { 0%,100%{opacity:1} 50%{opacity:0} }

        .editor-footer {
          height: 36px; border-top: 1px solid var(--border);
          display: flex; align-items: center; padding: 0 16px; gap: 16px;
          background: rgba(0,0,0,0.3);
        }
        .ed-foot-item {
          font-size: 11px; font-family: 'JetBrains Mono', monospace;
          color: var(--muted2); display: flex; align-items: center; gap: 5px;
        }
        .ed-foot-dot { width: 6px; height: 6px; border-radius: 50%; }

        /* ── DIVIDER ─────────────────────────────────────── */
        .fade-divider {
          height: 1px; border: none; margin: 0;
          background: linear-gradient(
            90deg, transparent 0%, var(--border2) 20%,
            var(--border2) 80%, transparent 100%
          );
        }

        /* ── STATS ───────────────────────────────────────── */
        .stats-strip {
          display: flex; gap: 0; max-width: 860px;
          margin: 0 auto; padding: 0 24px;
        }
        .stat {
          flex: 1; padding: 36px 24px;
          border-right: 1px solid var(--border);
          position: relative;
        }
        .stat:last-child { border-right: none; }

        /* subtle top accent line */
        .stat::before {
          content: '';
          position: absolute; top: 0; left: 24px; right: 24px; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(139,142,255,0.3), transparent);
        }

        .stat-label {
          display: block; font-size: 10.5px; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--muted2);
          font-family: 'JetBrains Mono', monospace; margin-bottom: 10px;
        }
        .stat-val {
          display: block; font-size: 30px; font-weight: 700;
          letter-spacing: -0.04em; color: var(--text);
          line-height: 1;
        }

        /* ── HOW IT WORKS ────────────────────────────────── */
        .hiw { padding: 80px 24px; max-width: 960px; margin: 0 auto; }
        .eyebrow-sm {
          display: block; font-size: 10.5px; letter-spacing: 0.12em;
          text-transform: uppercase; color: var(--indigo);
          font-family: 'JetBrains Mono', monospace; margin-bottom: 16px;
        }
        .hiw-title {
          font-size: clamp(28px, 4vw, 40px); font-weight: 700;
          letter-spacing: -0.03em; margin-bottom: 48px;
        }

        .steps-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
        }
        @media(max-width:640px) { .steps-grid { grid-template-columns: 1fr; } }

        .step-card {
          padding: 28px 24px; border-radius: 10px;
          /* gradient border trick */
          background:
            linear-gradient(var(--bg3), var(--bg3)) padding-box,
            linear-gradient(135deg, rgba(139,142,255,0.18) 0%, rgba(255,255,255,0.04) 100%) border-box;
          border: 1px solid transparent;
          position: relative; overflow: hidden;
          transition: transform .2s, box-shadow .2s;
        }
        .step-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(139,142,255,0.12);
        }

        /* left accent bar */
        .step-card::before {
          content: '';
          position: absolute; left: 0; top: 0; bottom: 0; width: 2px;
          background: linear-gradient(to bottom, var(--indigo), transparent);
          opacity: 0.5;
        }

        .step-num-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
        .step-num {
          font-size: 11px; font-family: 'JetBrains Mono', monospace;
          color: var(--indigo); letter-spacing: 0.06em;
        }
        .step-icon-wrap {
          width: 36px; height: 36px; border-radius: 8px;
          background: rgba(139,142,255,0.06); border: 1px solid rgba(139,142,255,0.14);
          display: flex; align-items: center; justify-content: center;
        }
        .step-name { font-size: 17px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 10px; }
        .step-desc { font-size: 13.5px; color: var(--muted2); line-height: 1.6; }

        /* ── LIVE FEED ───────────────────────────────────── */
        .feed-section { padding: 0 24px 80px; }
        .feed-inner {
          max-width: 860px; margin: 0 auto;
          background: var(--bg3);
          border: 1px solid var(--border2); border-radius: 10px;
          overflow: hidden;
        }
        .feed-hdr {
          padding: 16px 20px; border-bottom: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between;
          background: rgba(0,0,0,0.25);
        }
        .feed-title { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; }
        .feed-meta {
          font-size: 11.5px; font-family: 'JetBrains Mono', monospace;
          color: var(--muted2); display: flex; align-items: center; gap: 6px;
        }
        .live-dot {
          display: inline-block; width: 6px; height: 6px; border-radius: 50%;
          background: var(--green); animation: live-pulse 2s ease-in-out infinite;
        }
        @keyframes live-pulse { 0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(74,222,128,0.4)} 50%{opacity:0.7;box-shadow:0 0 0 4px rgba(74,222,128,0)} }

        .feed-table { width: 100%; border-collapse: collapse; }
        .feed-table th {
          font-size: 10.5px; font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--muted); padding: 10px 20px;
          border-bottom: 1px solid var(--border); text-align: left;
          background: rgba(0,0,0,0.1);
        }
        .feed-table td { padding: 14px 20px; vertical-align: middle; }
        .feed-table tr { border-bottom: 1px solid var(--border); transition: background .12s; }
        .feed-table tr:last-child { border-bottom: none; }
        .feed-table tr:hover { background: rgba(255,255,255,0.02); }

        .av-pair { display: flex; gap: -4px; }
        .av {
          width: 26px; height: 26px; border-radius: 50%;
          background: rgba(139,142,255,0.12); border: 1px solid rgba(139,142,255,0.2);
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 600; color: var(--indigo);
          font-family: 'JetBrains Mono', monospace;
          margin-right: -6px;
        }
        .av:last-child { margin-right: 0; }
        .players-cell { display: flex; align-items: center; gap: 12px; }
        .players-names { font-size: 13px; font-weight: 500; }

        .problem-cell { font-size: 13px; color: var(--muted2); }
        .diff-badge {
          font-size: 10.5px; font-family: 'JetBrains Mono', monospace;
          padding: 2px 8px; border-radius: 4px; font-weight: 600;
          letter-spacing: 0.04em;
        }
        .diff-easy   { background: rgba(74,222,128,0.08); color: #4ade80; border: 1px solid rgba(74,222,128,0.15); }
        .diff-medium { background: rgba(251,191,36,0.08); color: #fbbf24; border: 1px solid rgba(251,191,36,0.15); }
        .diff-hard   { background: rgba(248,113,113,0.08); color: #f87171; border: 1px solid rgba(248,113,113,0.15); }

        .result-cell { font-size: 12.5px; font-family: 'JetBrains Mono', monospace; font-weight: 600; }
        .result-win  { color: var(--green); }
        .result-loss { color: var(--red); }

        /* ── AI TIEBREAKER ───────────────────────────────── */
        .ai-section { padding: 80px 24px; }
        .ai-inner {
          max-width: 960px; margin: 0 auto;
          display: grid; grid-template-columns: 1fr 1fr; gap: 56px;
          align-items: center;
        }
        @media(max-width:720px){ .ai-inner { grid-template-columns: 1fr; gap: 32px; } }

        .ai-label {
          font-size: 10.5px; font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--indigo); margin-bottom: 16px;
        }
        .ai-title {
          font-size: clamp(22px, 3.5vw, 32px); font-weight: 700;
          letter-spacing: -0.03em; line-height: 1.2; margin-bottom: 16px;
        }
        .ai-desc { font-size: 14px; color: var(--muted2); line-height: 1.65; margin-bottom: 24px; }
        .ai-points { list-style: none; display: flex; flex-direction: column; gap: 10px; }
        .ai-points li {
          font-size: 13.5px; color: var(--muted2);
          display: flex; gap: 10px; align-items: flex-start;
        }
        .ai-check { color: var(--green); flex-shrink: 0; margin-top: 1px; }

        .verdict-card {
          background: var(--bg3);
          border: 1px solid rgba(139,142,255,0.14);
          border-radius: 10px; overflow: hidden;
          box-shadow: 0 0 40px rgba(139,142,255,0.05), 0 20px 60px rgba(0,0,0,0.5);
        }
        .verdict-hdr {
          padding: 12px 16px; border-bottom: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between;
          background: rgba(0,0,0,0.25);
        }
        .verdict-label { font-size: 11.5px; font-weight: 600; letter-spacing: -0.01em; }
        .verdict-badge {
          font-size: 10px; font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.08em; text-transform: uppercase;
          background: rgba(139,142,255,0.08); border: 1px solid rgba(139,142,255,0.18);
          color: var(--indigo); padding: 2px 7px; border-radius: 4px;
        }
        .verdict-body {
          padding: 18px 16px; font-size: 13px; color: var(--muted2);
          line-height: 1.65; font-family: 'JetBrains Mono', monospace;
          border-bottom: 1px solid var(--border);
        }
        .verdict-hl { color: var(--text); font-weight: 600; }
        .verdict-winner {
          padding: 14px 16px; display: flex; align-items: center; gap: 10px;
        }
        .winner-chip {
          font-size: 10px; font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.08em; text-transform: uppercase;
          background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.2);
          color: var(--green); padding: 2px 7px; border-radius: 4px;
        }
        .winner-name { font-size: 14px; font-weight: 700; }
        .winner-elo {
          margin-left: auto; font-size: 13px; font-weight: 700;
          font-family: 'JetBrains Mono', monospace; color: var(--green);
        }

        /* ── CTA ─────────────────────────────────────────── */
        .cta-section {
          padding: 80px 24px 100px;
          display: flex; flex-direction: column; align-items: center; text-align: center;
          position: relative; overflow: hidden;
        }
        /* glow behind CTA */
        .cta-section::before {
          content: '';
          position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
          width: 600px; height: 300px;
          background: radial-gradient(ellipse, rgba(139,142,255,0.07) 0%, transparent 70%);
          pointer-events: none;
        }
        .cta-inner {
          position: relative; z-index: 1;
          background: linear-gradient(var(--bg3), var(--bg3)) padding-box,
                      linear-gradient(135deg, rgba(139,142,255,0.25) 0%, rgba(255,255,255,0.04) 50%, rgba(139,142,255,0.1) 100%) border-box;
          border: 1px solid transparent;
          border-radius: 14px; padding: 52px 48px;
          max-width: 560px; width: 100%;
          box-shadow: 0 0 60px rgba(139,142,255,0.06), 0 40px 80px rgba(0,0,0,0.5);
        }

        .cta-kicker {
          font-size: 10.5px; font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--indigo); margin-bottom: 14px;
        }
        .cta-h2 {
          font-size: clamp(24px, 4vw, 34px); font-weight: 700;
          letter-spacing: -0.035em; margin-bottom: 12px; line-height: 1.15;
        }
        .cta-sub { font-size: 14px; color: var(--muted2); margin-bottom: 28px; line-height: 1.6; }

        /* ── FOOTER ──────────────────────────────────────── */
        .footer {
          border-top: 1px solid var(--border);
          padding: 24px;
          background: rgba(0,0,0,0.3);
        }
        .footer-inner {
          max-width: 960px; margin: 0 auto;
          display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;
        }
        .footer-brand { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
        .footer-copy { font-size: 12px; color: var(--muted2); }
        .footer-links { display: flex; gap: 20px; list-style: none; }
        .footer-links a { font-size: 12.5px; color: var(--muted2); transition: color .15s; }
        .footer-links a:hover { color: var(--text); }
        /* ── SCROLL ANIMATIONS ───────────────────────────── */
        .reveal {
          opacity: 0;
          transform: translateY(22px);
          transition: opacity 0.65s cubic-bezier(0.16,1,0.3,1),
                      transform 0.65s cubic-bezier(0.16,1,0.3,1);
        }
        .reveal.in-view {
          opacity: 1;
          transform: translateY(0);
        }
        /* stagger delays for grid children */
        .reveal-stagger > *:nth-child(1) { transition-delay: 0ms; }
        .reveal-stagger > *:nth-child(2) { transition-delay: 80ms; }
        .reveal-stagger > *:nth-child(3) { transition-delay: 160ms; }
        .reveal-stagger > *:nth-child(4) { transition-delay: 240ms; }
        .reveal-stagger > * {
          opacity: 0;
          transform: translateY(18px);
          transition: opacity 0.6s cubic-bezier(0.16,1,0.3,1),
                      transform 0.6s cubic-bezier(0.16,1,0.3,1);
        }
        .reveal-stagger.in-view > * {
          opacity: 1;
          transform: translateY(0);
        }

        /* table row fade-in stagger */
        .feed-table tbody tr {
          opacity: 0;
          transform: translateX(-8px);
          transition: opacity 0.5s ease, transform 0.5s ease;
        }
        .feed-table.rows-in tbody tr:nth-child(1) { opacity:1; transform:none; transition-delay:0ms; }
        .feed-table.rows-in tbody tr:nth-child(2) { opacity:1; transform:none; transition-delay:60ms; }
        .feed-table.rows-in tbody tr:nth-child(3) { opacity:1; transform:none; transition-delay:120ms; }
        .feed-table.rows-in tbody tr:nth-child(4) { opacity:1; transform:none; transition-delay:180ms; }
        .feed-table.rows-in tbody tr:nth-child(5) { opacity:1; transform:none; transition-delay:240ms; }
      `}</style>

      {/* NAV */}
      <nav className="nav">
        <span className="nav-brand">CodeDuel</span>
        <ul className="nav-center">
          <li><Link href="#elo">Rank System</Link></li>
          <li><Link href="#live">Live Feed</Link></li>
          <li><Link href="#social">Social Play</Link></li>
          <li><Link href="#community">Community</Link></li>
          <li><Link href="/leaderboard">Leaderboard</Link></li>
        </ul>
        <div className="nav-right">
          <button className="btn-primary" onClick={() => signIn("github")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            Sign in with GitHub
          </button>
        </div>
      </nav>

      <main>
        {/* HERO */}
        <section className="hero">
          <div className="hero-eyebrow">
            <span className="eyebrow-dot" />
            Private Alpha · Season 1
          </div>
          <h1 className="hero-h1">
            Whoever ships<br />
            <span className="accent">first</span> wins.
          </h1>
          <p className="hero-sub">
            Real-time 1v1 coding battles. Get matched by ELO, solve under a
            15-minute clock, climb the global ladder.
          </p>
          <div className="hero-actions">
            <button className="btn-cta" onClick={() => signIn("github")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Sign in with GitHub
            </button>
            <Link href="/leaderboard" className="btn-cta-ghost">
              View Leaderboard →
            </Link>
          </div>

          {/* arena preview card */}
          <div className="arena-wrap">
            <div className="arena-card">
              <div className="arena-chrome">
                <div className="chrome-dot cd-r" />
                <div className="chrome-dot cd-y" />
                <div className="chrome-dot cd-g" />
                <div className="chrome-tabs">
                  <span className="chrome-tab active">solution.py</span>
                  <span className="chrome-tab">opponent</span>
                </div>
                <div className="chrome-pill">
                  <span className="timer-badge">⏱ 09:42</span>
                  <span className="elo-badge">+140</span>
                </div>
              </div>
              <div className="editor-body">
                <div className="line-nums">
                  {[1,2,3,4,5,6,7,8,9,10].map(n => <div key={n}>{n}</div>)}
                </div>
                <div className="code-area">
                  <div><span className="cm"># Two Sum — solve before your opponent does</span></div>
                  <div>&nbsp;</div>
                  <div>
                    <span className="k">def </span>
                    <span className="fn">twoSum</span>
                    <span className="pn">(</span>
                    <span>nums</span><span className="pn">: </span>
                    <span className="fn">list</span><span className="pn">[</span><span className="fn">int</span><span className="pn">],</span>
                    <span> target</span><span className="pn">: </span>
                    <span className="fn">int</span>
                    <span className="pn">) → </span>
                    <span className="fn">list</span><span className="pn">[</span><span className="fn">int</span><span className="pn">]:</span>
                  </div>
                  <div>&nbsp;&nbsp;&nbsp;&nbsp;seen <span className="pn">= </span><span className="pn">{"{}"}</span></div>
                  <div>
                    &nbsp;&nbsp;&nbsp;&nbsp;<span className="k">for </span>
                    i<span className="pn">, </span>n
                    <span className="k"> in </span>
                    <span className="fn">enumerate</span>
                    <span className="pn">(</span>nums<span className="pn">):</span>
                  </div>
                  <div>
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="k">if </span>
                    target <span className="pn">- </span>n
                    <span className="k"> in </span>seen<span className="pn">:</span>
                  </div>
                  <div>
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="k">return </span>
                    <span className="pn">[</span>seen<span className="pn">[</span>target <span className="pn">- </span>n<span className="pn">],</span> i<span className="pn">]</span>
                  </div>
                  <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;seen<span className="pn">[</span>n<span className="pn">] = </span>i<span className="cursor" /></div>
                </div>
              </div>
              <div className="editor-footer">
                <span className="ed-foot-item">
                  <span className="ed-foot-dot" style={{background:'#4ade80'}} />
                  Python 3
                </span>
                <span className="ed-foot-item" style={{marginLeft:'auto',color:'var(--green)'}}>
                  Accepted · 42ms
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* STATS */}
        <hr className="fade-divider" />
        <div className="stats-strip reveal-stagger">
          {[
            {label:"Matches Played", val:"1,452,030"},
            {label:"Active Duels",   val:"1,205"},
            {label:"Developers",     val:"50,000+"},
            {label:"Avg Latency",    val:"24ms"},
          ].map(s => (
            <div className="stat" key={s.label}>
              <span className="stat-label">{s.label}</span>
              <span className="stat-val">{s.val}</span>
            </div>
          ))}
        </div>

        {/* HOW IT WORKS */}
        <hr className="fade-divider" />
        <section className="hiw">
          <span className="eyebrow-sm reveal">How it works</span>
          <h2 className="hiw-title reveal">Three steps to dominance.</h2>
          <div className="steps-grid reveal-stagger">
            {[
              {n:"01",
               icon: (
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--indigo)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                   <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                 </svg>
               ),
               name:"Match",
               desc:"Get paired with a developer at your exact ELO. The system matches you in seconds — no lobby, no waiting."},
              {n:"02",
               icon: (
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--indigo)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                   <polyline points="16 18 22 12 16 6"/>
                   <polyline points="8 6 2 12 8 18"/>
                 </svg>
               ),
               name:"Solve",
               desc:"Race on the same problem under a shared 15-minute clock. Write clean code — not just fast code."},
              {n:"03",
               icon: (
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--indigo)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                   <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                 </svg>
               ),
               name:"Climb",
               desc:"First correct submission wins the ELO delta. Ties go to the AI tiebreaker judging on complexity and code quality."},
            ].map(s => (
              <div className="step-card" key={s.n}>
                <div className="step-num-row">
                  <span className="step-num">{s.n}</span>
                  <span className="step-icon-wrap">{s.icon}</span>
                </div>
                <div className="step-name">{s.name}</div>
                <p className="step-desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ELO TIERS */}
        <hr className="fade-divider" />
        <section id="elo" style={{padding:"72px 24px", maxWidth:960, margin:"0 auto", scrollMarginTop: 80}}>
          <div className="reveal" style={{marginBottom:40}}>
            <span className="eyebrow-sm" style={{display:"block", marginBottom:12}}>Rank System</span>
            <h2 style={{fontSize:"clamp(24px,3.5vw,36px)", fontWeight:700, letterSpacing:"-0.03em"}}>
              Where do you stand?
            </h2>
          </div>
          <div className="reveal-stagger" style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10}}>
            {[
              {tier:"Bronze",  range:"800–1199",  color:"#cd7f32", bg:"rgba(205,127,50,0.06)",  border:"rgba(205,127,50,0.18)"},
              {tier:"Silver",  range:"1200–1499", color:"#a8a8b3", bg:"rgba(168,168,179,0.06)", border:"rgba(168,168,179,0.18)"},
              {tier:"Gold",    range:"1500–1799", color:"#f5c518", bg:"rgba(245,197,24,0.06)",  border:"rgba(245,197,24,0.18)"},
              {tier:"Diamond", range:"1800–2099", color:"#7dd3fc", bg:"rgba(125,211,252,0.06)", border:"rgba(125,211,252,0.18)"},
              {tier:"Master",  range:"2100+",     color:"#c084fc", bg:"rgba(192,132,252,0.06)", border:"rgba(192,132,252,0.2)"},
            ].map(t => (
              <div key={t.tier} style={{
                padding:"20px 18px", borderRadius:8,
                background: t.bg, border:`1px solid ${t.border}`,
                transition:"transform .2s, box-shadow .2s",
              }}
              onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.transform="translateY(-2px)";(e.currentTarget as HTMLDivElement).style.boxShadow=`0 8px 30px rgba(0,0,0,0.3)`}}
              onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.transform="";(e.currentTarget as HTMLDivElement).style.boxShadow=""}}
              >
                <div style={{
                  width:28, height:28, borderRadius:6, marginBottom:14,
                  background: t.bg, border:`1px solid ${t.border}`,
                  display:"flex", alignItems:"center", justifyContent:"center"
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </div>
                <div style={{fontSize:14, fontWeight:700, color:t.color, marginBottom:4}}>{t.tier}</div>
                <div style={{fontSize:11, fontFamily:"JetBrains Mono,monospace", color:"var(--muted2)"}}>{t.range} ELO</div>
              </div>
            ))}
          </div>
        </section>

        {/* ELO EXPLAINER */}
        <hr className="fade-divider" />
        <section style={{padding:"72px 24px"}}>
          <div style={{maxWidth:960, margin:"0 auto", display:"grid", gridTemplateColumns:"1fr 1fr", gap:56, alignItems:"center"}} className="reveal">
            <div>
              <span className="eyebrow-sm" style={{display:"block", marginBottom:12}}>ELO Rating</span>
              <h2 style={{fontSize:"clamp(22px,3.5vw,32px)", fontWeight:700, letterSpacing:"-0.03em", lineHeight:1.2, marginBottom:16}}>
                A fair fight, every time.
              </h2>
              <p style={{fontSize:14, color:"var(--muted2)", lineHeight:1.7, marginBottom:20}}>
                CodeDuel uses chess-style ELO ratings. Win against a higher-rated opponent and you gain more. Lose to a lower-rated one and you lose more. The system self-balances — your rank reflects reality.
              </p>
              <div style={{display:"flex", flexDirection:"column", gap:12}}>
                {[
                  {label:"Expected win vs equal opponent", val:"50%"},
                  {label:"Rating points per win (K=32)", val:"~+16"},
                  {label:"Max swing per match", val:"±32"},
                ].map(row => (
                  <div key={row.label} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", background:"rgba(255,255,255,0.02)", border:"1px solid var(--border)", borderRadius:6}}>
                    <span style={{fontSize:13, color:"var(--muted2)"}}>{row.label}</span>
                    <span style={{fontSize:13, fontWeight:700, fontFamily:"JetBrains Mono,monospace", color:"var(--text)"}}>{row.val}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{display:"flex", flexDirection:"column", gap:12}}>
              {[
                {player:"purahan",     elo:1842, change:+18, won:true},
                {player:"ghost_coder", elo:1819, change:-18, won:false},
              ].map(p => (
                <div key={p.player} style={{
                  padding:"18px 20px", borderRadius:10,
                  background:"var(--bg3)",
                  border:`1px solid ${p.won ? "rgba(74,222,128,0.18)" : "rgba(248,113,113,0.12)"}`,
                  boxShadow: p.won ? "0 0 30px rgba(74,222,128,0.05)" : "none",
                  display:"flex", alignItems:"center", justifyContent:"space-between"
                }}>
                  <div style={{display:"flex", alignItems:"center", gap:12}}>
                    <div style={{
                      width:36, height:36, borderRadius:8,
                      background: p.won ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.08)",
                      border: `1px solid ${p.won ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.15)"}`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:11, fontWeight:700, fontFamily:"JetBrains Mono,monospace",
                      color: p.won ? "var(--green)" : "var(--red)"
                    }}>
                      {p.player.slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{fontSize:14, fontWeight:600}}>{p.player}</div>
                      <div style={{fontSize:11, fontFamily:"JetBrains Mono,monospace", color:"var(--muted2)"}}>
                        {p.elo} → {p.elo + p.change} ELO
                      </div>
                    </div>
                  </div>
                  <div style={{
                    fontSize:16, fontWeight:800, fontFamily:"JetBrains Mono,monospace",
                    color: p.won ? "var(--green)" : "var(--red)"
                  }}>
                    {p.change > 0 ? "+" : ""}{p.change}
                  </div>
                </div>
              ))}
              <div style={{padding:"12px 14px", borderRadius:8, background:"rgba(139,142,255,0.04)", border:"1px solid rgba(139,142,255,0.1)", fontSize:12, fontFamily:"JetBrains Mono,monospace", color:"var(--muted2)", lineHeight:1.6}}>
                Two Sum · purahan submitted O(n) hash map solution in 4:21. ghost_coder's O(n²) approach ran 230× slower on the hidden test case.
              </div>
            </div>
          </div>
        </section>

        {/* LIVE FEED */}
        <hr className="fade-divider" />
        <section id="live" className="feed-section" style={{paddingTop:'60px', scrollMarginTop: 80}}>
          <div className="feed-inner reveal">
            <div className="feed-hdr">
              <span className="feed-title">Live Activity</span>
              <span className="feed-meta">
                <span className="live-dot" /> updated 2m ago
              </span>
            </div>
            <table className="feed-table">
              <thead>
                <tr>
                  <th>Players</th>
                  <th>Problem</th>
                  <th>Difficulty</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {p1:"ND",p2:"CN",names:"NeoDev vs CodeNinja",   prob:"Two Sum Optimization",     diff:"easy",   win:true,  elo:"+15 ELO"},
                  {p1:"NP",p2:"BN",names:"NullPointer vs ByteNinja",prob:"LRU Cache Implementation",diff:"hard",   win:false, elo:"−12 ELO"},
                  {p1:"RK",p2:"AD",names:"RecursionKing vs AlexDev",prob:"Word Search II",           diff:"hard",   win:true,  elo:"+24 ELO"},
                  {p1:"AK",p2:"SX",names:"AlgoKing vs SyntaxError",  prob:"Trapping Rain Water",     diff:"medium", win:true,  elo:"+18 ELO"},
                  {p1:"PU",p2:"BH",names:"purahan vs ByteHunter",   prob:"Course Schedule",          diff:"medium", win:true,  elo:"+21 ELO"},
                ].map((r,i) => (
                  <tr key={i}>
                    <td>
                      <div className="players-cell">
                        <div className="av-pair">
                          <div className="av">{r.p1}</div>
                          <div className="av">{r.p2}</div>
                        </div>
                        <span className="players-names">{r.names}</span>
                      </div>
                    </td>
                    <td><span className="problem-cell">{r.prob}</span></td>
                    <td><span className={`diff-badge diff-${r.diff}`}>{r.diff}</span></td>
                    <td><span className={`result-cell result-${r.win?"win":"loss"}`}>{r.win?"Win":"Loss"} &nbsp;{r.elo}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* AI TIEBREAKER */}
        <hr className="fade-divider" style={{margin:'0 0 80px'}} />
        <section className="ai-section">
          <div className="ai-inner reveal">
            <div>
              <div className="ai-label">AI Tiebreaker</div>
              <h2 className="ai-title">First to submit isn't always the winner.</h2>
              <p className="ai-desc">
                When two players submit within the same window, a deterministic
                layer measures real runtime and complexity — then an AI narrates
                exactly why one solution won.
              </p>
              <ul className="ai-points">
                {[
                  "Runtime and memory measured from actual execution, not self-reported",
                  "Complexity class inferred from benchmark curves — O(n) vs O(n²)",
                  "AI explains the verdict in plain English, can't override the score",
                ].map((p,i) => (
                  <li key={i}>
                    <span className="ai-check">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="verdict-card">
              <div className="verdict-hdr">
                <span className="verdict-label">Tiebreaker Verdict</span>
                <span className="verdict-badge">AI Judge</span>
              </div>
              <div className="verdict-body">
                Both players submitted a correct solution within{" "}
                <span className="verdict-hl">1.2 seconds</span> of each other.{" "}
                <span className="verdict-hl">purahan</span>'s solution runs in{" "}
                <span className="verdict-hl">O(n)</span> using a hash map, while
                ghost_coder's nested loop approach is{" "}
                <span className="verdict-hl">O(n²)</span>. On the largest hidden
                test case (n=10⁵), the difference is{" "}
                <span className="verdict-hl">42ms vs 9,800ms</span>.
              </div>
              <div className="verdict-winner">
                <span className="winner-chip">Winner</span>
                <span className="winner-name">purahan</span>
                <span className="winner-elo">+22 ELO</span>
              </div>
            </div>
          </div>
        </section>

        {/* SOCIAL & FRIENDS */}
        <hr className="fade-divider" />
        <section id="social" style={{padding:"72px 24px", maxWidth:960, margin:"0 auto", scrollMarginTop: 80}}>
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))", gap:56, alignItems:"center"}} className="reveal">
            <div style={{order: 2}}>
              <span className="eyebrow-sm" style={{display:"block", marginBottom:12}}>Social Play</span>
              <h2 style={{fontSize:"clamp(22px,3.5vw,32px)", fontWeight:700, letterSpacing:"-0.03em", lineHeight:1.2, margin:"0 0 16px"}}>
                Settle the debate.
              </h2>
              <p style={{fontSize:14, color:"var(--muted2)", lineHeight:1.7, marginBottom:20}}>
                Add your coworkers, classmates, or rivals. Challenge them to private duels to definitively prove who the better developer is. Track your head-to-head records and climb your private leaderboards.
              </p>
              <ul className="ai-points" style={{display:"flex", flexDirection:"column", gap:12}}>
                {[
                  "Global friend search via GitHub handle",
                  "Direct challenge notifications",
                  "Private match arenas without ELO stakes",
                ].map((p,i) => (
                  <li key={i}>
                    <span className="ai-check">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--indigo)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div style={{order: 1, position:"relative"}}>
              <div style={{
                background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:12, padding:24,
                boxShadow:"0 0 40px rgba(139,142,255,0.05)"
              }}>
                <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20}}>
                  <div style={{display:"flex", alignItems:"center", gap:12}}>
                    <img src="https://github.com/identicons/2.png" style={{width:40,height:40,borderRadius:"50%"}}/>
                    <div>
                      <div style={{fontSize:14, fontWeight:700, color:"var(--text)"}}>ghost_coder</div>
                      <div style={{fontSize:12, color:"var(--muted2)"}}>Online</div>
                    </div>
                  </div>
                  <div style={{background:"var(--indigo)", color:"#fff", fontSize:11, fontWeight:700, padding:"6px 12px", borderRadius:6, cursor:"pointer"}}>
                    CHALLENGE
                  </div>
                </div>
                <div style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
                  <div style={{display:"flex", alignItems:"center", gap:12}}>
                    <img src="https://github.com/identicons/3.png" style={{width:40,height:40,borderRadius:"50%"}}/>
                    <div>
                      <div style={{fontSize:14, fontWeight:700, color:"var(--text)"}}>alex_dev</div>
                      <div style={{fontSize:12, color:"var(--muted2)"}}>In a match</div>
                    </div>
                  </div>
                  <div style={{background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", color:"var(--muted2)", fontSize:11, fontWeight:700, padding:"6px 12px", borderRadius:6, cursor:"not-allowed"}}>
                    SPECTATE
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* COMMUNITY / CONTACT */}
        <hr className="fade-divider" />
        <section id="community" style={{padding:"72px 24px", maxWidth:960, margin:"0 auto", textAlign:"center", scrollMarginTop: 80}} className="reveal">
          <span className="eyebrow-sm" style={{display:"inline-block", marginBottom:12}}>Community</span>
          <h2 style={{fontSize:"clamp(22px,3.5vw,32px)", fontWeight:700, letterSpacing:"-0.03em", lineHeight:1.2, margin:"0 auto 16px", maxWidth:500}}>
            Built by developers, for developers.
          </h2>
          <p style={{fontSize:14, color:"var(--muted2)", lineHeight:1.7, margin:"0 auto 32px", maxWidth:600}}>
            CodeDuel is open source and entirely community driven. Have a feature request, found a bug, or want to contribute new algorithmic challenges?
          </p>
          <div style={{display:"flex", justifyContent:"center", gap:16, flexWrap:"wrap"}}>
            <a href="https://github.com/purahan/codeduel" target="_blank" className="btn-cta-ghost" style={{background:"var(--bg3)"}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              GitHub Repository
            </a>
            <a href="mailto:contact@codeduel.com" className="btn-cta-ghost" style={{background:"var(--bg3)"}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              Contact Us
            </a>
          </div>
        </section>
        <hr className="fade-divider" />
        <section className="cta-section">
          <div className="cta-inner reveal">
            <p className="cta-kicker">Ready to compete?</p>
            <h2 className="cta-h2">Prove your worth in real time.</h2>
            <p className="cta-sub">Join 50,000+ developers. Your first match is one click away.</p>
            <button className="btn-cta" onClick={() => signIn("github")}
              style={{display:"inline-flex", margin:"0 auto"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Start Dueling Now
            </button>
          </div>
        </section>
      </main>

      {/* TECH STACK STRIP */}
      <div style={{borderTop:"1px solid var(--border)", borderBottom:"1px solid var(--border)", padding:"20px 24px", background:"rgba(255,255,255,0.01)"}}>
        <div style={{maxWidth:960, margin:"0 auto", display:"flex", alignItems:"center", gap:32, flexWrap:"wrap", justifyContent:"center"}}>
          <span style={{fontSize:11, fontFamily:"JetBrains Mono,monospace", color:"var(--muted)", letterSpacing:"0.1em", textTransform:"uppercase", flexShrink:0}}>Built with</span>
          {[
            {name:"AWS DynamoDB",  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4.03 3-9 3S3 13.66 3 12"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/></svg>},
            {name:"Vercel",        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 22.525H0l12-21.05 12 21.05z"/></svg>},
            {name:"Next.js",       icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.572 0c-.176 0-.31.001-.358.007a19.76 19.76 0 0 1-.364.033C7.443.346 4.25 2.185 2.228 5.012a11.875 11.875 0 0 0-2.119 5.243c-.096.659-.108.854-.108 1.747s.012 1.089.108 1.748c.652 4.506 3.86 8.292 8.209 9.695.779.25 1.6.422 2.534.525.363.04 1.935.04 2.299 0 1.611-.178 2.977-.577 4.323-1.264.207-.106.247-.134.219-.158-.02-.013-.9-1.193-1.955-2.62l-1.919-2.592-2.404-3.558a338.739 338.739 0 0 0-2.422-3.556c-.009-.002-.018 1.579-.023 3.51-.007 3.38-.01 3.515-.052 3.595a.426.426 0 0 1-.206.214c-.075.037-.14.044-.495.044H7.81l-.108-.068a.438.438 0 0 1-.157-.171l-.05-.106.006-4.703.007-4.705.072-.092a.645.645 0 0 1 .174-.143c.096-.047.134-.051.54-.051.478 0 .558.018.682.154.035.038 1.337 1.999 2.895 4.361a10760.433 10760.433 0 0 0 4.735 7.17l1.9 2.879.096-.063a12.317 12.317 0 0 0 2.466-2.163 11.944 11.944 0 0 0 2.824-6.134c.096-.66.108-.854.108-1.748 0-.893-.012-1.088-.108-1.747-.652-4.506-3.859-8.292-8.208-9.695a12.597 12.597 0 0 0-2.499-.523A33.119 33.119 0 0 0 11.573 0z"/></svg>},
            {name:"Piston API",    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>},
            {name:"Gemini AI",     icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 12V2"/><path d="m12 12 7.5-7.5"/></svg>},
            {name:"Aurora PostgreSQL", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4.03 3-9 3S3 13.66 3 12"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/></svg>},
          ].map(t => (
            <div key={t.name} style={{display:"flex", alignItems:"center", gap:7, color:"var(--muted2)", fontSize:13, transition:"color .15s", cursor:"default"}}
              onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.color="var(--text)"}
              onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.color="var(--muted2)"}
            >
              {t.icon}
              <span>{t.name}</span>
            </div>
          ))}
        </div>
      </div>

      <footer className="footer">
        <div className="footer-inner">
          <div>
            <div className="footer-brand">CodeDuel</div>
            <div className="footer-copy">© 2026 CodeDuel. All rights reserved.</div>
          </div>
          <ul className="footer-links">
            <li><a href="#">Changelog</a></li>
            <li><a href="#">Docs</a></li>
            <li><a href="#">API</a></li>
            <li><a href="#">Privacy</a></li>
          </ul>
        </div>
      </footer>
    </>
  );
}
