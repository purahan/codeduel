import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export type MatchState = "idle" | "queued";

export function useMatchmaking() {
  const router = useRouter();
  const [matchState, setMatchState] = useState<MatchState>("idle");
  const [showMatchModal, setShowMatchModal] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const handleFindMatch = useCallback(async (problemId?: string) => {
    if (matchState !== "idle") return;
    setMatchState("queued");
    const body = problemId ? JSON.stringify({ problemId }) : undefined;
    
    try {
      const res = await fetch("/api/match/create", { 
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body
      });
      const data = await res.json();

      if (res.status === 403 && data.error === "Queue Banned") {
        alert(data.message);
        setMatchState("idle");
        return;
      }

      if (data.matchId && res.ok) {
        router.push(`/match/${data.matchId}`);
        return;
      }

      if (res.status === 409 && data.matchId) {
        router.push(`/match/${data.matchId}`);
        return;
      }
    } catch (e) {
      console.error(e);
      setMatchState("idle");
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/match/create", { 
          method: "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body
        });
        const data = await res.json();
        
        if (res.status === 403 && data.error === "Queue Banned") {
          stopPolling();
          alert(data.message);
          setMatchState("idle");
          return;
        }

        if (data.matchId) {
          stopPolling();
          router.push(`/match/${data.matchId}`);
          return;
        }
      } catch {}

      try {
        const res = await fetch("/api/match/find");
        const data = await res.json();
        if (data.matchId) {
          stopPolling();
          router.push(`/match/${data.matchId}`);
        }
      } catch {}
    }, 2000);
  }, [matchState, router, stopPolling]);

  const handleCancel = useCallback(() => {
    stopPolling();
    setMatchState("idle");
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return {
    matchState,
    showMatchModal,
    setShowMatchModal,
    handleFindMatch,
    handleCancel
  };
}
