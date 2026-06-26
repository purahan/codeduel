import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0b0c0e", color: "#fff", fontFamily: "JetBrains Mono, monospace" }}>
      <h1>404 - Not Found</h1>
      <p style={{ marginTop: "8px", color: "#aaa" }}>The page you are looking for does not exist.</p>
      <Link 
        href="/dashboard" 
        style={{ 
          marginTop: "24px", 
          color: "#8b8eff", 
          textDecoration: "none",
          padding: "8px 16px",
          border: "1px solid #8b8eff",
          borderRadius: "4px"
        }}
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
