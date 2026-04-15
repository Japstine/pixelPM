import { useState, useEffect, useRef } from "react";

const BASE = import.meta.env.VITE_API_URL || "/api";

const SUGGESTIONS = [
  "Which tasks are still in progress?",
  "Who has the most tasks assigned?",
  "Summarise all project progress",
  "Which project is closest to completion?",
  "Are there any high priority tasks not started?",
];

export default function AiChat() {
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [status,   setStatus]   = useState({ ready: false, model: "", checking: true });
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // ── Check Ollama status on mount + every 10 s until ready ──────────────────
  useEffect(() => {
    let timer;
    const check = async () => {
      try {
        const r = await fetch(`${BASE}/ai/status`);
        const s = await r.json();
        setStatus({ ...s, checking: false });
        if (!s.ready) timer = setTimeout(check, 10_000);
      } catch {
        setStatus({ ready: false, model: "", checking: false });
        timer = setTimeout(check, 10_000);
      }
    };
    check();
    return () => clearTimeout(timer);
  }, []);

  // ── Scroll to bottom when messages change ──────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Focus input when panel opens ───────────────────────────────────────────
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const send = async (text) => {
    const content = (text || input).trim();
    if (!content || loading || !status.ready) return;

    const userMsg = { role: "user", content };
    const next    = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const r = await fetch(`${BASE}/ai/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ messages: next }),
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setMessages(prev => [...prev, data.message]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  // ── Floating button ────────────────────────────────────────────────────────
  const FAB = (
    <button
      onClick={() => setOpen(true)}
      title="AI Assistant"
      style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 200,
        width: 52, height: 52, borderRadius: "50%",
        background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
        border: "none", cursor: "pointer", color: "#fff",
        boxShadow: "0 4px 20px rgba(99,102,241,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "transform 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.08)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      {/* chat-sparkle icon */}
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        <path d="M9 9h.01M12 9h.01M15 9h.01" strokeWidth="2.5"/>
      </svg>
      {/* pulse if not ready */}
      {!status.ready && !status.checking && (
        <span style={{ position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", border: "2px solid #fff" }} />
      )}
    </button>
  );

  if (!open) return FAB;

  // ── Panel ──────────────────────────────────────────────────────────────────
  return (
    <>
      {FAB}
      <div style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 300,
        width: 380, height: 580, maxHeight: "80vh",
        background: "#fff", borderRadius: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        border: "1px solid #e2e8f0",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px", borderBottom: "1px solid #f1f5f9",
          background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.93V15a1 1 0 0 0-2 0v1.93A8 8 0 0 1 4.07 9H6a1 1 0 0 0 0-2H4.07A8 8 0 0 1 11 3.07V5a1 1 0 0 0 2 0V3.07A8 8 0 0 1 19.93 9H18a1 1 0 0 0 0 2h1.93A8 8 0 0 1 13 16.93z"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>AI Assistant</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>
                {status.checking
                  ? "Checking model…"
                  : status.ready
                    ? `${status.model} · ready`
                    : "Model loading…"}
              </div>
            </div>
          </div>
          <button onClick={() => setOpen(false)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", cursor: "pointer", borderRadius: 8, padding: "4px 8px", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        {/* Model loading banner */}
        {!status.ready && !status.checking && (
          <div style={{ padding: "10px 16px", background: "#fffbeb", borderBottom: "1px solid #fde68a", fontSize: 12, color: "#92400e", display: "flex", alignItems: "center", gap: 8 }}>
            <span>⏳</span>
            <span>Ollama is pulling <strong>llama3.2:3b</strong> (~2 GB). This takes a few minutes on first run. Chat will unlock when ready.</span>
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Welcome / suggestions */}
          {messages.length === 0 && (
            <div>
              <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, marginBottom: 16 }}>
                Ask anything about your projects, tasks, or team.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)} disabled={!status.ready}
                    style={{
                      textAlign: "left", padding: "8px 12px", borderRadius: 8,
                      border: "1px solid #e2e8f0", background: status.ready ? "#f8fafc" : "#f1f5f9",
                      color: status.ready ? "#475569" : "#94a3b8",
                      cursor: status.ready ? "pointer" : "not-allowed",
                      fontSize: 13, transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { if (status.ready) e.currentTarget.style.background = "#f1f5f9"; }}
                    onMouseLeave={e => { if (status.ready) e.currentTarget.style.background = "#f8fafc"; }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat bubbles */}
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "82%", padding: "10px 13px", borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                background: m.role === "user" ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "#f1f5f9",
                color: m.role === "user" ? "#fff" : "#1e293b",
                fontSize: 13, lineHeight: 1.55,
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {m.content}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ padding: "10px 14px", borderRadius: "14px 14px 14px 4px", background: "#f1f5f9", display: "flex", gap: 4, alignItems: "center" }}>
                {[0,1,2].map(i => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: "50%", background: "#94a3b8",
                    animation: "bounce 1.2s infinite", animationDelay: `${i * 0.2}s`,
                  }} />
                ))}
                <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }`}</style>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "12px 14px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 8 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
            disabled={!status.ready || loading}
            placeholder={status.ready ? "Ask about your projects…" : "Waiting for model…"}
            style={{
              flex: 1, padding: "9px 12px", borderRadius: 10,
              border: "1.5px solid #e2e8f0", fontSize: 13,
              outline: "none", color: "#0f172a",
              background: status.ready ? "#fff" : "#f8fafc",
              transition: "border-color 0.15s",
            }}
            onFocus={e => e.target.style.borderColor = "#6366f1"}
            onBlur={e => e.target.style.borderColor = "#e2e8f0"}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || !status.ready || loading}
            style={{
              width: 38, height: 38, borderRadius: 10, border: "none",
              background: input.trim() && status.ready && !loading ? "#6366f1" : "#e2e8f0",
              color: input.trim() && status.ready && !loading ? "#fff" : "#94a3b8",
              cursor: input.trim() && status.ready && !loading ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.15s, color 0.15s", flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>

        {/* Clear button */}
        {messages.length > 0 && (
          <div style={{ padding: "0 14px 10px", textAlign: "center" }}>
            <button onClick={() => setMessages([])} style={{ background: "none", border: "none", fontSize: 11, color: "#94a3b8", cursor: "pointer", textDecoration: "underline" }}>
              Clear conversation
            </button>
          </div>
        )}
      </div>
    </>
  );
}
