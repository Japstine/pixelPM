import { useState } from "react";
import * as api from "../services/api.js";

const ALLOWED_DOMAIN = "@sot.pdpu.ac.in";
const COLORS = ["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ef4444","#14b8a6"];

export default function LoginPage({ onAuth }) {
  const [mode,     setMode]     = useState("login");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [name,     setName]     = useState("");
  const [color,    setColor]    = useState(COLORS[0]);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const emailValid = email.toLowerCase().endsWith(ALLOWED_DOMAIN);

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!emailValid) {
      setError(`Only ${ALLOWED_DOMAIN} email addresses are allowed`);
      return;
    }
    if (mode === "register" && password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const data = mode === "login"
        ? await api.login({ email: email.toLowerCase(), password })
        : await api.register({ email: email.toLowerCase(), password, name: name.trim(), color });
      onAuth(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inp = {
    padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0",
    fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box",
    color: "#0f172a", background: "#fff", transition: "border-color 0.15s",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
              </svg>
            </div>
            <span style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.5px" }}>PixelPM</span>
          </div>
          <p style={{ fontSize: 13, color: "#94a3b8" }}>Project management for your team</p>
        </div>

        {/* Card */}
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", border: "1px solid #e2e8f0", padding: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#0f172a", marginBottom: 6 }}>
            {mode === "login" ? "Sign in to your account" : "Create an account"}
          </h2>
          <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 24 }}>
            {mode === "login" ? "Welcome back" : `Only ${ALLOWED_DOMAIN} emails are allowed`}
          </p>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {mode === "register" && (
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 6 }}>Full name</label>
                <input style={inp} type="text" placeholder="Alex Morgan" value={name}
                  onChange={e => setName(e.target.value)} required
                  onFocus={e => e.target.style.borderColor = "#6366f1"}
                  onBlur={e => e.target.style.borderColor = "#e2e8f0"} />
              </div>
            )}

            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 6 }}>Email address</label>
              <input style={{ ...inp, borderColor: email && !emailValid ? "#ef4444" : "#e2e8f0" }}
                type="email" placeholder={`you${ALLOWED_DOMAIN}`} value={email}
                onChange={e => setEmail(e.target.value)} required
                onFocus={e => { if (emailValid || !email) e.target.style.borderColor = "#6366f1"; }}
                onBlur={e => e.target.style.borderColor = email && !emailValid ? "#ef4444" : "#e2e8f0"} />
              {email && !emailValid && (
                <p style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>Must be a {ALLOWED_DOMAIN} address</p>
              )}
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 6 }}>Password</label>
              <input style={inp} type="password" placeholder={mode === "register" ? "Min. 8 characters" : "••••••••"}
                value={password} onChange={e => setPassword(e.target.value)} required
                onFocus={e => e.target.style.borderColor = "#6366f1"}
                onBlur={e => e.target.style.borderColor = "#e2e8f0"} />
            </div>

            {mode === "register" && (
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 8 }}>Avatar colour</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setColor(c)}
                      style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: color === c ? "3px solid #0f172a" : "3px solid transparent", cursor: "pointer", transition: "border 0.1s" }} />
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div style={{ padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ padding: "11px 0", borderRadius: 8, border: "none", background: loading ? "#c7d2fe" : "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", transition: "opacity 0.15s" }}>
              {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "#64748b" }}>
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
              style={{ background: "none", border: "none", color: "#6366f1", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              {mode === "login" ? "Register" : "Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
