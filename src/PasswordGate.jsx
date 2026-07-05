import React, { useEffect, useState } from "react";
import { supabase, SHARED_EMAIL } from "./lib/supabaseClient.js";

// Real access control: the password signs into a shared Supabase account,
// and all dashboard data lives behind RLS that only authenticated sessions
// can read. Nothing is baked into the public bundle anymore.

const NAVY = "#1C2047";
const TEAL = "#51DFD7";
const BORDER = "#E7E9EF";
const BG = "#F7F8FB";
const RADIUS = 16;
const RADIUS_PILL = 999;

export default function PasswordGate({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  if (session) return children;

  const submit = async (e) => {
    e.preventDefault();
    setChecking(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: SHARED_EMAIL,
      password: value,
    });
    setChecking(false);
    if (signInError) setError(true);
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
