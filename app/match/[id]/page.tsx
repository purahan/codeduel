"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface TestCase {
  input: string;
  expectedOutput: string;
  isHidden: boolean;
}

interface Problem {
  id: string;
  title: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  testCases: TestCase[];
  starterCode: Record<string, string>;
}

interface PlayerSlot {
  userId: string;
  username: string;
  elo: number;
  hintsUsed: number;
  submitted: boolean;
  passed: boolean;
}

interface Match {
  matchId: string;
  status: "active" | "finished";
  startedAt: number;
  finishedAt: number | null;
  winnerId: string | null;
  player1: PlayerSlot;
  player2: PlayerSlot;
}

interface SubmitResult {
  result: string;
  testsPassed: number;
  testsTotal: number;
  matchOver: boolean;
  won: boolean;
  eloChange?: number;
  newElo?: number;
  error?: string;
}

type Language = "python" | "javascript" | "cpp" | "java";

const LANG_LABELS: Record<Language, string> = {
  python: "Python 3",
  javascript: "JavaScript",
  cpp: "C++",
  java: "Java",
};

const MATCH_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Resolve the won/lost/draw state from a finished match.
// Returns true (won), false (lost), or null (timed out / draw).
function resolveWon(
  match: { winnerId: string | null; endedBy?: string | null },
  myId: string | undefined
): boolean | null {
  if (!match.winnerId || match.endedBy === "timeout") return null; // Time's Up
  return match.winnerId === myId;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function diffColor(diff: string) {
  if (diff === "easy") return "#4ade80";
  if (diff === "medium") return "#fbbf24";
  return "#f87171";
}

function highlightCode(code: string): string {
  let html = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Basic Regex highlighting (Dracula Theme)
  const tokenRegex = /(".*?"|'.*?'|`.*?`)|(\/\/.*|#.*|\/\*[\s\S]*?\*\/)|\b(const|let|var|function|return|if|else|for|while|class|import|export|from|def|pass|struct|int|float|double|char|void|public|private|static|true|false|null|undefined|new|this)\b|\b(\d+)\b|([a-zA-Z_$][0-9a-zA-Z_$]*)\s*(?=\()/g;

  html = html.replace(tokenRegex, (match, str, comment, keyword, number, funcCall) => {
    if (str) return `<span style="color: #f1fa8c">${str}</span>`; // Yellow string
    if (comment) return `<span style="color: #6272a4">${comment}</span>`; // Gray/blue comment
    if (keyword) return `<span style="color: #ff79c6; font-weight: 500">${keyword}</span>`; // Pink keyword
    if (number) return `<span style="color: #bd93f9">${number}</span>`; // Purple number
    if (funcCall) return `<span style="color: #50fa7b">${funcCall}</span>`; // Green function
    return match;
  });
  return html;
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function MatchArena() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const params = useParams();
  const matchId = params.id as string;

  const preRef = useRef<HTMLPreElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);

  // Match state
  const [match, setMatch] = useState<Match | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [myRole, setMyRole] = useState<"player1" | "player2" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Editor state
  const [language, setLanguage] = useState<Language>("python");
  const [code, setCode] = useState("");

  // Timer
  const [timeLeft, setTimeLeft] = useState(MATCH_DURATION_MS);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);

  // Forfeit state
  const [exiting, setExiting] = useState(false);

  // Hint state
  const [hintLoading, setHintLoading] = useState(false);
  const [hints, setHints] = useState<{ text: string; tier: number }[]>([]);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintsRemaining, setHintsRemaining] = useState(3);
  const [hintOpen, setHintOpen] = useState(false);

  // Match over modal
  const [matchOver, setMatchOver] = useState(false);
  const [won, setWon] = useState<boolean | null>(null);

  // Opponent poll
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const myId = (session?.user as any)?.id as string | undefined;

  // ── Redirect if not authed ─────────────────────────────────────────────────
  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/");
  }, [authStatus, router]);

  // ── Fetch match (with retry for post-creation race condition) ───────────────
  const fetchMatch = useCallback(async () => {
    try {
      const res = await fetch(`/api/match/${matchId}`);
      if (!res.ok) {
        const d = await res.json();
        setLoadError(d.error ?? "Match not found");
        return;
      }
      const data = await res.json();
      setMatch(data.match);
      setProblem(data.problem);

      if (!myRole && data.myRole) {
        setMyRole(data.myRole);
      }

      // Set starter code on first load
      if (!code && data.problem?.starterCode) {
        setCode(data.problem.starterCode[language] ?? "");
      }

      // Check if match is already over
      if (data.match.status === "finished") {
        setMatchOver(true);
        setWon(resolveWon(data.match, myId));
        stopPolling();
      }
    } catch {
      setLoadError("Failed to load match");
    }
  }, [matchId, myRole, code, language, myId]);

  // Retry loop — only retries on 404 (match not yet committed to DynamoDB).
  // Definitive errors (401, 403, 400) are surfaced immediately — no retrying.
  useEffect(() => {
    if (authStatus !== "authenticated") return;

    let cancelled = false;
    const MAX_ATTEMPTS = 8;
    const DELAY_MS = 700;

    const tryLoad = async (attempt: number) => {
      try {
        const res = await fetch(`/api/match/${matchId}`);

        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setMatch(data.match);
            setProblem(data.problem);
            setRetrying(false);
            if (!myRole && data.myRole) setMyRole(data.myRole);
            if (!code && data.problem?.starterCode)
              setCode(data.problem.starterCode[language] ?? "");
            if (data.match.status === "finished") {
              setMatchOver(true);
              setWon(resolveWon(data.match, myId));
              stopPolling();
            }
          }
          return;
        }

        const errBody = await res.json().catch(() => ({}));
        const errMsg  = errBody.error ?? "Match not found";

        // Definitive errors — do not retry, show immediately
        if (res.status === 401 || res.status === 403 || res.status === 400) {
          if (!cancelled) { setRetrying(false); setLoadError(errMsg); }
          return;
        }

        // 404 / 5xx — retry if attempts remain
        if (attempt < MAX_ATTEMPTS) {
          if (!cancelled) setRetrying(true);
          setTimeout(() => { if (!cancelled) tryLoad(attempt + 1); }, DELAY_MS);
        } else {
          if (!cancelled) { setRetrying(false); setLoadError(errMsg); }
        }
      } catch {
        if (attempt < MAX_ATTEMPTS) {
          if (!cancelled) setRetrying(true);
          setTimeout(() => { if (!cancelled) tryLoad(attempt + 1); }, DELAY_MS);
        } else if (!cancelled) {
          setRetrying(false);
          setLoadError("Failed to load match");
        }
      }
    };

    tryLoad(1);
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, matchId]);

  // ── Poll opponent status every 3s ──────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!match || match.status === "finished") return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/match/${matchId}`);
        if (!res.ok) return;
        const data = await res.json();
        setMatch(data.match);

        if (data.match.status === "finished") {
          setMatchOver(true);
          setWon(resolveWon(data.match, myId));
          stopPolling();
          if (timerRef.current) clearInterval(timerRef.current);
        }
      } catch {
        // keep polling
      }
    }, 3000);

    return () => stopPolling();
  }, [match?.status, matchId, myId, stopPolling]);

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!match || match.status === "finished") return;

    const tick = () => {
      const elapsed = Date.now() - match.startedAt;
      const left = Math.max(0, MATCH_DURATION_MS - elapsed);
      setTimeLeft(left);

      if (left === 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        setMatchOver(true);
        setWon(null); // timeout = time's up (not the same as losing a match)
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [match?.startedAt, match?.status]);

  // ── Language change resets to starter ─────────────────────────────────────
  const handleLangChange = (lang: Language) => {
    setLanguage(lang);
    setCode(problem?.starterCode[lang] ?? "");
    setSubmitResult(null);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (submitting || !code.trim()) return;
    setSubmitting(true);
    setSubmitResult(null);

    try {
      const res = await fetch("/api/match/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, code, language }),
      });
      const data: SubmitResult = await res.json();
      setSubmitResult(data);

      if (data.matchOver) {
        setMatchOver(true);
        setWon(data.won);
        stopPolling();
        if (timerRef.current) clearInterval(timerRef.current);
        // Refresh match for final state
        fetchMatch();
      }
    } catch {
      setSubmitResult({
        result: "error", testsPassed: 0, testsTotal: 0,
        matchOver: false, won: false, error: "Network error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Forfeit Match ──────────────────────────────────────────────────────────
  
  const handleForfeit = async () => {
    if (exiting || matchOver) return;
    
    const confirm = window.confirm("Are you sure you want to forfeit? You will instantly lose this match and your ELO rating will decrease.");
    if (!confirm) return;

    setExiting(true);
    try {
      const res = await fetch("/api/match/forfeit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      
      if (res.ok) {
        // Stop tracking locally
        stopPolling();
        if (timerRef.current) clearInterval(timerRef.current);
        
        // Force a hard browser redirect instead of a Next.js soft route
        // This guarantees the UI instantly unmounts and grabs fresh database info
        window.location.href = "/dashboard";
      } else {
        const data = await res.json();
        alert(`Failed to forfeit: ${data.message || data.error}`);
        setExiting(false);
      }
    } catch (e) {
      alert("Network error occurred.");
      setExiting(false);
    }
  };

  // ── Hint ───────────────────────────────────────────────────────────────────
  const handleHint = async () => {
    if (hintLoading || hintsRemaining <= 0) return;
    setHintLoading(true);
    setHintOpen(true);

    try {
      const res = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          problemTitle: problem?.title,
          problemDescription: problem?.description,
          currentCode: code,
          language,
        }),
      });
      const data = await res.json();

      if (data.hint) {
        setHints((prev) => [...prev, { text: data.hint, tier: data.tier }]);
        setHintsUsed(data.hintsUsed);
        setHintsRemaining(data.hintsRemaining);
      }
    } catch {
      setHints((prev) => [...prev, { text: "Could not reach hint service. Try again.", tier: hintsUsed + 1 }]);
    } finally {
      setHintLoading(false);
    }
  };

  // ─── Loading / error states ─────────────────────────────────────────────────

  if (authStatus === "loading" || (!match && !loadError)) {
    return (
      <div style={s.loadingScreen}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 28, height: 28, margin: "0 auto",
            border: "2px solid rgba(255,255,255,0.06)",
            borderTop: "2px solid #8b8eff",
            borderRadius: "50%", animation: "spin 0.8s linear infinite",
          }} />
          <p style={{ color: "var(--muted2,#8a8898)", fontSize: 12, fontFamily: "JetBrains Mono, monospace", marginTop: 14 }}>
            {retrying ? "Connecting to match..." : "Loading arena..."}
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={s.loadingScreen}>
        <div style={{ textAlign: "center", maxWidth: 400, padding: "0 24px" }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
          <p style={{ color: "#f87171", fontFamily: "JetBrains Mono, monospace", fontSize: 14, marginBottom: 8 }}>
            {loadError}
          </p>
          <p style={{ color: "#555", fontFamily: "JetBrains Mono, monospace", fontSize: 11, marginBottom: 20, lineHeight: 1.6 }}>
            {loadError === "Forbidden"
              ? "You are not a participant in this match. Make sure you are signed in as one of the two players."
              : loadError === "Unauthorized"
              ? "Session expired. Please sign in again."
              : "The match may have expired or the ID is invalid."}
          </p>
          <button onClick={() => router.push("/dashboard")} style={s.backBtn}>← Back to Dashboard</button>
        </div>
      </div>
    );
  }

  if (!match || !problem || !myRole) return null;

  const me = match[myRole];
  const opponent = match[myRole === "player1" ? "player2" : "player1"];
  const timerDanger = timeLeft < 60000;
  const timerWarning = timeLeft < 3 * 60000;

  // ─── Match over modal ───────────────────────────────────────────────────────
  if (matchOver) {
    const eloChange = submitResult?.eloChange;
    const newElo = submitResult?.newElo;

    return (
      <div style={s.modalOverlay}>
        <div style={s.modal}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>
            {won === true ? "🏆" : won === false ? "💀" : "⏰"}
          </div>
          <h2 style={{ ...s.modalTitle, color: won ? "#7cff6b" : "#f87171" }}>
            {won === true ? "You Won!" : won === false ? "You Lost" : "Time's Up"}
          </h2>
          {match.winnerId && (
            <p style={s.modalSub}>
              {won
                ? `You outran ${opponent.username}`
                : `${match[myRole === "player1" ? "player2" : "player1"].username === match.winnerId
                    ? opponent.username
                    : me.username} won this duel`
              }
            </p>
          )}
          {submitResult?.testsPassed !== undefined && (
            <div style={s.modalStats}>
              <div style={s.modalStat}>
                <span style={s.modalStatLabel}>Test Cases</span>
                <span style={s.modalStatValue}>
                  {submitResult.testsPassed}/{submitResult.testsTotal}
                </span>
              </div>
              {eloChange !== undefined && (
                <div style={s.modalStat}>
                  <span style={s.modalStatLabel}>ELO Change</span>
                  <span style={{ ...s.modalStatValue, color: eloChange >= 0 ? "#7cff6b" : "#f87171" }}>
                    {eloChange >= 0 ? "+" : ""}{eloChange}
                  </span>
                </div>
              )}
              {newElo !== undefined && (
                <div style={s.modalStat}>
                  <span style={s.modalStatLabel}>New ELO</span>
                  <span style={s.modalStatValue}>{newElo}</span>
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <button
              onClick={() => router.push("/dashboard")}
              style={s.modalBtnPrimary}
            >
              Back to Dashboard
            </button>
            <button
              onClick={() => {
                setMatchOver(false);
                setSubmitResult(null);
                setWon(null);
                router.push("/dashboard");
              }}
              style={s.modalBtnGhost}
            >
              Find New Match
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main arena layout ──────────────────────────────────────────────────────

  return (
    <div style={s.page}>
      {/* Top bar */}
      <div style={s.topBar}>
        <div style={s.topLeft}>
          <a href="/dashboard" style={s.logoLink}>CodeDuel</a>
          <span style={s.divider}>/</span>
          <span style={{ ...s.diffBadge, color: diffColor(problem.difficulty), borderColor: `${diffColor(problem.difficulty)}33`, background: `${diffColor(problem.difficulty)}10` }}>
            {problem.difficulty}
          </span>
          <span style={s.problemTitle}>{problem.title}</span>
        </div>

        <div style={s.topCenter}>
          <div style={{
            ...s.timerBadge,
            background: timerDanger ? "rgba(248,113,113,0.1)" : timerWarning ? "rgba(251,191,36,0.08)" : "rgba(139,142,255,0.08)",
            borderColor: timerDanger ? "rgba(248,113,113,0.3)" : timerWarning ? "rgba(251,191,36,0.2)" : "rgba(139,142,255,0.2)",
            color: timerDanger ? "#f87171" : timerWarning ? "#fbbf24" : "#8b8eff",
          }}>
            ⏱ {formatTime(timeLeft)}
          </div>
        </div>

        <div style={s.topRight}>
          {/* Opponent status */}
          <div style={s.playerBadge}>
            <div style={s.playerAvatar}>{opponent.username[0]?.toUpperCase()}</div>
            <div>
              <div style={{ color: "#f5f3ec", fontSize: 12, fontWeight: 600 }}>{opponent.username}</div>
              <div style={{ color: opponent.passed ? "#7cff6b" : opponent.submitted ? "#f87171" : "#555", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}>
                {opponent.passed ? "✓ Solved" : opponent.submitted ? "✗ Wrong answer" : "Coding..."}
              </div>
            </div>
          </div>

          {/* Forfeit Button */}
          <button
            onClick={handleForfeit}
            disabled={exiting || submitting}
            style={{
              ...s.exitBtn,
              opacity: exiting ? 0.5 : 1,
              cursor: exiting || submitting ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => { 
              if (!exiting && !submitting) {
                e.currentTarget.style.background = "rgba(248,113,113,0.1)"; 
              }
            }}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            {exiting ? "Leaving..." : "Forfeit"}
          </button>

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !code.trim()}
            style={{
              ...s.submitBtn,
              opacity: submitting || !code.trim() ? 0.5 : 1,
              cursor: submitting || !code.trim() ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Running..." : "Submit"}
          </button>
        </div>
      </div>

      {/* Main layout: problem | editor */}
      <div style={s.body}>
        {/* Left: Problem */}
        <div style={s.leftPanel}>
          {/* Problem statement */}
          <div style={s.problemCard}>
            <div style={s.problemHeader}>
              <h2 style={s.problemH2}>{problem.title}</h2>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {problem.tags.map((tag) => (
                  <span key={tag} style={s.tag}>{tag}</span>
                ))}
              </div>
            </div>
            <p style={s.problemDesc}>{problem.description}</p>

            {/* Visible test cases */}
            <div style={s.testCasesSection}>
              <div style={s.tcHeader}>Examples</div>
              {problem.testCases.filter((tc) => !tc.isHidden).map((tc, i) => (
                <div key={i} style={s.tcCard}>
                  <div style={s.tcRow}>
                    <span style={s.tcLabel}>Input:</span>
                    <code style={s.tcCode}>{tc.input}</code>
                  </div>
                  <div style={s.tcRow}>
                    <span style={s.tcLabel}>Output:</span>
                    <code style={s.tcCode}>{tc.expectedOutput}</code>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hint coach */}
          <div style={s.hintCard}>
            <div style={s.hintHeader}>
              <div>
                <span style={s.hintTitle}>AI Hint Coach</span>
                <span style={s.hintCount}>{hintsRemaining} left</span>
              </div>
              <button
                onClick={handleHint}
                disabled={hintLoading || hintsRemaining <= 0}
                style={{
                  ...s.hintBtn,
                  opacity: hintLoading || hintsRemaining <= 0 ? 0.4 : 1,
                  cursor: hintLoading || hintsRemaining <= 0 ? "not-allowed" : "pointer",
                }}
              >
                {hintLoading ? "Thinking..." : `Get Hint (Tier ${hintsUsed + 1})`}
              </button>
            </div>

            {hintOpen && hints.length > 0 && (
              <div style={s.hintsList}>
                {hints.map((h, i) => (
                  <div key={i} style={s.hintItem}>
                    <div style={s.hintTierLabel}>Tier {h.tier} hint</div>
                    <p style={s.hintText}>{h.text}</p>
                  </div>
                ))}
              </div>
            )}

            {hintsRemaining === 0 && (
              <p style={{ color: "#555", fontSize: 12, fontFamily: "JetBrains Mono, monospace", marginTop: 10 }}>
                No hints remaining. You're on your own! 💪
              </p>
            )}
          </div>
        </div>

        {/* Right: Editor */}
        <div style={s.rightPanel}>
          {/* Editor toolbar */}
          <div style={s.editorBar}>
            <div style={s.editorDots}>
              <span style={{ ...s.dot, background: "#ff5f57" }} />
              <span style={{ ...s.dot, background: "#febc2e" }} />
              <span style={{ ...s.dot, background: "#28c840" }} />
            </div>

            <div style={s.langTabs}>
              {(["python", "javascript", "cpp", "java"] as Language[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => handleLangChange(lang)}
                  style={{
                    ...s.langTab,
                    background: language === lang ? "rgba(139,142,255,0.12)" : "transparent",
                    color: language === lang ? "#8b8eff" : "#555",
                    borderBottom: language === lang ? "2px solid #8b8eff" : "2px solid transparent",
                  }}
                >
                  {LANG_LABELS[lang]}
                </button>
              ))}
            </div>
          </div>

          {/* Code editor */}
          <div style={{ ...s.editorWrapper, position: "relative" }}>
            <div ref={linesRef} style={s.lineNumbers}>
              {code.split("\n").map((_, i) => (
                <div key={i} style={s.lineNum}>{i + 1}</div>
              ))}
            </div>

            <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
              <pre
                ref={preRef}
                aria-hidden="true"
                style={{
                  ...s.textarea,
                  position: "absolute", inset: 0, margin: 0,
                  pointerEvents: "none", whiteSpace: "pre",
                  color: "#f8f8f2", overflow: "hidden",
                }}
                dangerouslySetInnerHTML={{ __html: highlightCode(code) + (code.endsWith("\n") ? " " : "") }}
              />
              <textarea
                style={{
                  ...s.textarea,
                  position: "absolute", inset: 0, margin: 0,
                  color: "transparent", background: "transparent",
                  caretColor: "#f8f8f2", whiteSpace: "pre"
                }}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onScroll={(e) => {
                  if (preRef.current) {
                    preRef.current.scrollTop = e.currentTarget.scrollTop;
                    preRef.current.scrollLeft = e.currentTarget.scrollLeft;
                  }
                  if (linesRef.current) {
                    linesRef.current.scrollTop = e.currentTarget.scrollTop;
                  }
                }}
                onKeyDown={(e) => {
                  // Tab key inserts 4 spaces
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const el    = e.currentTarget;
                    const start = el.selectionStart;
                    const end   = el.selectionEnd;
                    const newCode = code.substring(0, start) + "    " + code.substring(end);
                    setCode(newCode);
                    setTimeout(() => {
                      if (el) {
                        el.selectionStart = start + 4;
                        el.selectionEnd   = start + 4;
                      }
                    }, 0);
                  }
                }}
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="Write your solution here..."
              />
            </div>
          </div>

          {/* Submission result */}
          {submitResult && (
            <div style={{
              ...s.resultBar,
              background: submitResult.result === "accepted"
                ? "rgba(74,222,128,0.05)"
                : "rgba(248,113,113,0.05)",
              borderTop: `1px solid ${submitResult.result === "accepted" ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontWeight: 700,
                  fontSize: 13,
                  color: submitResult.result === "accepted" ? "#4ade80" : "#f87171",
                }}>
                  {submitResult.result === "accepted" ? "✓ Accepted" : `✗ ${submitResult.result.replace(/_/g, " ")}`}
                </span>
                <span style={{ color: "#555", fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>
                  {submitResult.testsPassed}/{submitResult.testsTotal} test cases passed
                </span>
              </div>
              {submitResult.error && (
                <div style={s.errorBox}>{submitResult.error}</div>
              )}
            </div>
          )}

          {/* My status bar */}
          <div style={s.statusBar}>
            <span style={{ color: "#555", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
              {me.username} · ELO {me.elo}
            </span>
            <span style={{ color: "#555", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
              {code.split("\n").length} lines
            </span>
            <span style={{ color: "#555", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
              {LANG_LABELS[language]}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { height: "100vh", display: "flex", flexDirection: "column", background: "#0b0c0e", overflow: "hidden" },
  loadingScreen: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0b0c0e" },
  loadingDot: { width: 8, height: 8, borderRadius: "50%", background: "#7cff6b", margin: "0 auto" },
  backBtn: {
    marginTop: 20, background: "none", border: "1px solid #2a2b35",
    borderRadius: 6, color: "#888", fontSize: 13, padding: "8px 16px",
    cursor: "pointer", fontFamily: "Inter, sans-serif",
  },

  // Top bar
  topBar: {
    height: 52, display: "flex", alignItems: "center",
    justifyContent: "space-between", padding: "0 16px",
    background: "#0b0c0e", borderBottom: "1px solid #1a1b1f",
    flexShrink: 0, gap: 12,
  },
  topLeft: { display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 },
  topCenter: { display: "flex", justifyContent: "center", flexShrink: 0 },
  topRight: { display: "flex", alignItems: "center", gap: 10, flex: 1, justifyContent: "flex-end" },
  logoLink: { color: "#f5f3ec", fontWeight: 800, fontSize: 14, textDecoration: "none", flexShrink: 0 },
  divider: { color: "#2a2b35", fontSize: 16 },
  diffBadge: {
    fontSize: 10, fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
    letterSpacing: "0.06em", textTransform: "uppercase",
    padding: "2px 7px", borderRadius: 4, border: "1px solid",
    flexShrink: 0,
  },
  problemTitle: {
    color: "#f5f3ec", fontSize: 13, fontWeight: 600,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  timerBadge: {
    display: "flex", alignItems: "center", gap: 6,
    padding: "5px 14px", borderRadius: 8, border: "1px solid",
    fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: 15,
    letterSpacing: 1,
  },
  playerBadge: {
    display: "flex", alignItems: "center", gap: 8,
    background: "#0f1014", border: "1px solid #1a1b1f",
    borderRadius: 8, padding: "6px 12px",
  },
  playerAvatar: {
    width: 26, height: 26, borderRadius: 6,
    background: "#1a1b1f", border: "1px solid #2a2b35",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#8b8eff", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 700,
    flexShrink: 0,
  },
  exitBtn: {
    background: "transparent", color: "#f87171",
    border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8,
    padding: "8px 16px", fontSize: 13, fontWeight: 600,
    fontFamily: "Inter, sans-serif", transition: "all 0.15s", 
    flexShrink: 0,
    marginLeft: "4px",
    marginRight: "4px"
  },
  submitBtn: {
    background: "#7cff6b", color: "#0b0c0e",
    border: "none", borderRadius: 8,
    padding: "8px 20px", fontSize: 13, fontWeight: 800,
    fontFamily: "Inter, sans-serif", cursor: "pointer",
    transition: "opacity 0.15s",
    flexShrink: 0,
  },

  // Body
  body: { display: "flex", flex: 1, overflow: "hidden" },

  // Left panel
  leftPanel: {
    width: 400, flexShrink: 0,
    borderRight: "1px solid #1a1b1f",
    overflowY: "auto", display: "flex", flexDirection: "column", gap: 0,
  },
  problemCard: { padding: 20, borderBottom: "1px solid #1a1b1f" },
  problemHeader: { marginBottom: 14 },
  problemH2: { color: "#f5f3ec", fontSize: 16, fontWeight: 700, letterSpacing: -0.3, margin: "0 0 10px" },
  tag: {
    display: "inline-block", fontSize: 10,
    fontFamily: "JetBrains Mono, monospace",
    background: "rgba(139,142,255,0.08)", border: "1px solid rgba(139,142,255,0.15)",
    color: "#8b8eff", padding: "2px 7px", borderRadius: 4,
  },
  problemDesc: {
    color: "#aaa", fontSize: 13, lineHeight: 1.7,
    fontFamily: "Inter, sans-serif", margin: 0,
  },
  testCasesSection: { marginTop: 20 },
  tcHeader: {
    color: "#555", fontSize: 10, fontFamily: "JetBrains Mono, monospace",
    fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
    marginBottom: 10,
  },
  tcCard: {
    background: "#0f1014", border: "1px solid #1a1b1f",
    borderRadius: 8, padding: "10px 14px", marginBottom: 8,
    display: "flex", flexDirection: "column", gap: 4,
  },
  tcRow: { display: "flex", gap: 8, alignItems: "flex-start" },
  tcLabel: { color: "#555", fontSize: 11, fontFamily: "JetBrains Mono, monospace", flexShrink: 0, marginTop: 1 },
  tcCode: { color: "#c3e88d", fontSize: 12, fontFamily: "JetBrains Mono, monospace", wordBreak: "break-all" },

  // Hint card
  hintCard: { padding: 16, borderBottom: "1px solid #1a1b1f" },
  hintHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  hintTitle: { color: "#f5f3ec", fontSize: 13, fontWeight: 600 },
  hintCount: {
    marginLeft: 8, color: "#555", fontSize: 10,
    fontFamily: "JetBrains Mono, monospace",
  },
  hintBtn: {
    background: "rgba(139,142,255,0.1)", border: "1px solid rgba(139,142,255,0.2)",
    color: "#8b8eff", borderRadius: 6, padding: "5px 12px",
    fontSize: 12, fontFamily: "JetBrains Mono, monospace", fontWeight: 600,
    cursor: "pointer", transition: "opacity 0.15s",
    flexShrink: 0,
  },
  hintsList: { marginTop: 14, display: "flex", flexDirection: "column", gap: 10 },
  hintItem: {
    background: "#0f1014", border: "1px solid #1a1b1f",
    borderRadius: 8, padding: "10px 14px",
    borderLeft: "3px solid #8b8eff",
  },
  hintTierLabel: {
    color: "#8b8eff", fontSize: 10,
    fontFamily: "JetBrains Mono, monospace",
    textTransform: "uppercase", letterSpacing: "0.08em",
    marginBottom: 6,
  },
  hintText: { color: "#ccc", fontSize: 13, lineHeight: 1.6, margin: 0, fontFamily: "Inter, sans-serif" },

  // Right panel
  rightPanel: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 },
  editorBar: {
    height: 40, display: "flex", alignItems: "center",
    padding: "0 12px", background: "#0d0e12",
    borderBottom: "1px solid #1a1b1f", gap: 16, flexShrink: 0,
  },
  editorDots: { display: "flex", gap: 6, flexShrink: 0 },
  dot: { width: 10, height: 10, borderRadius: "50%" },
  langTabs: { display: "flex", gap: 0 },
  langTab: {
    background: "none", border: "none", cursor: "pointer",
    padding: "4px 12px", fontSize: 12, fontFamily: "JetBrains Mono, monospace",
    transition: "all 0.15s",
  },
  editorWrapper: { flex: 1, display: "flex", overflow: "hidden", background: "#0d0e12" },
  lineNumbers: {
    width: 44, background: "#0a0b0e", borderRight: "1px solid #1a1b1f",
    padding: "16px 0", overflowY: "hidden", flexShrink: 0,
    userSelect: "none",
  },
  lineNum: {
    height: 21, display: "flex", alignItems: "center",
    justifyContent: "flex-end", paddingRight: 10,
    color: "#333", fontSize: 12, fontFamily: "JetBrains Mono, monospace",
  },
  textarea: {
    flex: 1, background: "transparent", border: "none", outline: "none",
    color: "#e2e8f0", fontFamily: "JetBrains Mono, monospace", fontSize: 13,
    lineHeight: "21px", padding: "16px 20px",
    resize: "none", overflowY: "auto", tabSize: 4,
    caretColor: "#8b8eff",
  },
  resultBar: {
    padding: "10px 16px", flexShrink: 0,
    borderTop: "1px solid #1a1b1f",
  },
  errorBox: {
    marginTop: 8, background: "#1a1014", border: "1px solid rgba(248,113,113,0.2)",
    borderRadius: 6, padding: "8px 12px",
    color: "#f87171", fontSize: 12, fontFamily: "JetBrains Mono, monospace",
    whiteSpace: "pre-wrap", maxHeight: 80, overflowY: "auto",
  },
  statusBar: {
    height: 28, display: "flex", alignItems: "center", gap: 20,
    padding: "0 16px", borderTop: "1px solid #1a1b1f",
    background: "#0a0b0e", flexShrink: 0,
  },

  // Modal
  modalOverlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 999,
  },
  modal: {
    background: "#0f1014", border: "1px solid #2a2b35",
    borderRadius: 16, padding: "40px 48px",
    textAlign: "center", maxWidth: 440, width: "90%",
    boxShadow: "0 40px 80px rgba(0,0,0,0.7)",
  },
  modalTitle: { fontSize: 28, fontWeight: 800, letterSpacing: -0.5, margin: "0 0 8px" },
  modalSub: { color: "#666", fontSize: 14, fontFamily: "Inter, sans-serif", margin: "0 0 20px" },
  modalStats: {
    display: "flex", gap: 24, justifyContent: "center",
    background: "#141520", border: "1px solid #1e2028",
    borderRadius: 10, padding: "16px 24px",
  },
  modalStat: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  modalStatLabel: { color: "#555", fontSize: 10, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.1em" },
  modalStatValue: { color: "#f5f3ec", fontSize: 22, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", letterSpacing: -0.5 },
  modalBtnPrimary: {
    background: "#7cff6b", color: "#0b0c0e",
    border: "none", borderRadius: 8,
    padding: "10px 20px", fontSize: 13, fontWeight: 800,
    fontFamily: "Inter, sans-serif", cursor: "pointer",
  },
  modalBtnGhost: {
    background: "none", color: "#666",
    border: "1px solid #2a2b35", borderRadius: 8,
    padding: "10px 20px", fontSize: 13, fontWeight: 600,
    fontFamily: "Inter, sans-serif", cursor: "pointer",
  },
};
