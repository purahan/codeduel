"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

export default function GlobalToaster() {
  const { status } = useSession();
  const pathname = usePathname();
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const isFirstLoad = useRef(true);
  const prevFriends = useRef<any[]>([]);
  const prevReqs = useRef<any[]>([]);

  // Stop polling if we are inside a match
  const isInMatch = pathname?.startsWith("/match/");

  const addToast = (text: string) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg: text }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  useEffect(() => {
    if (status !== "authenticated" || isInMatch) {
      isFirstLoad.current = true; // reset so we don't spam when we leave the match
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch("/api/friends");
        const d = await res.json();
        if (!d.error) {
          const currentFriends = d.friends || [];
          const currentReqs = d.pendingReceived || [];

          if (!isFirstLoad.current) {
            const newFriends = currentFriends.filter((nf: any) => !prevFriends.current.find(pf => pf.friend_id === nf.friend_id));
            newFriends.forEach((nf: any) => addToast(`🎉 ${nf.friend_username} added you as a friend!`));

            const newReqs = currentReqs.filter((nr: any) => !prevReqs.current.find(pr => pr.friendship_id === nr.friendship_id));
            newReqs.forEach((nr: any) => addToast(`👋 ${nr.friend_username} sent you a friend request!`));
          }

          prevFriends.current = currentFriends;
          prevReqs.current = currentReqs;
          isFirstLoad.current = false;
        }
      } catch (err) {
        // ignore network errors
      }
    };

    poll();
    const interval = setInterval(poll, 4000); // Polling every 4s for global notifications
    return () => clearInterval(interval);
  }, [status, isInMatch]);

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes slideInTopRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
      <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 12 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: "linear-gradient(135deg, #6366f1, #8b8eff)", padding: "14px 20px",
            borderRadius: 8, boxShadow: "0 8px 25px rgba(139,142,255,0.4)", color: "#fff",
            fontSize: 14, fontWeight: 600, fontFamily: "system-ui, -apple-system, sans-serif",
            animation: "slideInTopRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            display: "flex", alignItems: "center", gap: 10
          }}>
            {t.msg}
          </div>
        ))}
      </div>
    </>
  );
}
