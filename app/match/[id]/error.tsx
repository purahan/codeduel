"use client";

import Link from "next/link";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0b0c0e", color: "#fff" }}>
      <div style={{ textAlign: "center", maxWidth: 400, padding: "0 24px" }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
        <p style={{ color: "#f87171", fontFamily: "JetBrains Mono, monospace", fontSize: 14, marginBottom: 8 }}>
          Failed to load match
        </p>
        <p style={{ color: "#555", fontFamily: "JetBrains Mono, monospace", fontSize: 11, marginBottom: 20, lineHeight: 1.6 }}>
          {error.message || "The match may have expired or the ID is invalid."}
        </p>
        <Link 
          href="/dashboard" 
          style={{ 
            padding: "8px 16px", 
            background: "#222", 
            border: "1px solid #333", 
            borderRadius: "4px", 
            color: "white", 
            textDecoration: "none",
            fontFamily: "JetBrains Mono, monospace"
          }}
        >
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
