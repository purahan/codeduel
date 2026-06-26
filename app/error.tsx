"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0b0c0e", color: "#fff" }}>
      <h1>Something went wrong</h1>
      <p>{error.message}</p>
      <button 
        onClick={reset}
        style={{ 
          padding: "8px 16px", 
          marginTop: "16px", 
          background: "#8b8eff", 
          border: "none", 
          borderRadius: "4px", 
          color: "white", 
          cursor: "pointer",
          fontFamily: "JetBrains Mono, monospace"
        }}
      >
        Try Again
      </button>
      <a 
        href="/dashboard" 
        style={{ 
          marginTop: "16px", 
          color: "#8b8eff", 
          textDecoration: "none",
          fontFamily: "JetBrains Mono, monospace"
        }}
      >
        Go to Dashboard
      </a>
    </div>
  );
}
