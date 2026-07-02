import React, { useState } from "react";

// Client-side only — a deterrent against casual link-sharing, not real
// security. Anyone who inspects the network/JS bundle directly can still
// read the data regardless of this gate. See project notes for context.
const PASSWORD_HASH = "e7c1cca99cff0ca77b85e1a185db4ca951c7ceec75dee02af4a43d204b9ec461";
const SESSION_KEY = "rideeazy-dashboard-auth";

const NAVY = "#1C2047";
const TEAL = "#51DFD7";
const BORDER = "#E7E9EF";
const BG = "#F7F8FB";
const RADIUS = 16;
const RADIUS_PILL = 999;

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function PasswordGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  if (unlocked) return children;

  const submit = async (e) => {
    e.preventDefault();
    setChecking(true);
    const hash = await sha256Hex(value);
    setChecking(false);
    if (hash === PASSWORD_HASH) {
      sessionStorage.setItem(SESSION_KEY, "1");
      setUnlocked(true);
    } else {
      setError(true);
    }
  };

  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BG,
        fontFamily: "'Rubik', 'Open Sans Hebrew', 'Open Sans', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          background: "#FFFFFF",
          border: `1px solid ${BORDER}`,
          borderTop: `3px solid ${TEAL}`,
          borderRadius: RADIUS,
          padding: 32,
          width: 320,
          boxShadow: "0 8px 30px rgba(28,32,71,0.10)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 4 }}>גישה מוגבלת</div>
        <div style={{ fontSize: 12.5, color: "#6B7099", marginBottom: 18 }}>נא להזין סיסמה כדי לצפות בדשבורד</div>
        <input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          autoFocus
          style={{
            width: "100%",
            boxSizing: "border-box",
            border: `1px solid ${error ? "#D5504A" : BORDER}`,
            borderRadius: RADIUS,
            padding: "9px 14px",
            fontSize: 14,
            marginBottom: 10,
          }}
        />
        {error && <div style={{ color: "#D5504A", fontSize: 12, marginBottom: 10 }}>סיסמה שגויה</div>}
        <button
          type="submit"
          disabled={checking}
          style={{
            width: "100%",
            background: TEAL,
            color: NAVY,
            border: "none",
            borderRadius: RADIUS_PILL,
            padding: "11px 0",
            fontWeight: 700,
            fontSize: 14,
            cursor: checking ? "wait" : "pointer",
          }}
        >
          {checking ? "בודק…" : "כניסה"}
        </button>
      </form>
    </div>
  );
}
