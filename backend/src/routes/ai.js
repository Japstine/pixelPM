import { Router } from "express";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "../db/dynamodb.js";

const router   = Router();
const OLLAMA   = process.env.OLLAMA_URL   || "http://localhost:11434";
const MODEL    = process.env.OLLAMA_MODEL || "llama3.2:3b";

// ── Build a plain-text snapshot of the entire workspace ──────────────────────
async function buildContext() {
  const [{ Items: users = [] }, { Items: projects = [] }, { Items: tasks = [] }] =
    await Promise.all([
      docClient.send(new ScanCommand({ TableName: TABLES.USERS })),
      docClient.send(new ScanCommand({ TableName: TABLES.PROJECTS })),
      docClient.send(new ScanCommand({ TableName: TABLES.TASKS })),
    ]);

  const userMap = Object.fromEntries(users.map(u => [u.userId, u.name]));

  const lines = [];
  for (const p of projects) {
    const ptasks = tasks.filter(t => t.projectId === p.projectId);
    const done   = ptasks.filter(t => t.status === "done").length;
    const wip    = ptasks.filter(t => t.status === "in-progress").length;
    lines.push(`\nProject: "${p.name}"  (${done}/${ptasks.length} done, ${wip} in progress)`);
    for (const t of ptasks) {
      const who = userMap[t.assignee] || "Unassigned";
      lines.push(`  • [${t.status}] ${t.title} | ${t.priority} priority | ${who}`);
    }
    if (ptasks.length === 0) lines.push("  (no tasks yet)");
  }
  if (projects.length === 0) lines.push("No projects exist yet.");

  const teamLines = users.map(u => {
    const mine = tasks.filter(t => t.assignee === u.userId);
    const done = mine.filter(t => t.status === "done").length;
    return `  • ${u.name}: ${mine.length} tasks total, ${done} done`;
  });

  return [
    `Date: ${new Date().toDateString()}`,
    `Team (${users.length} members):`,
    ...teamLines,
    "",
    `Projects (${projects.length}):`,
    ...lines,
  ].join("\n");
}

// ── GET /api/ai/status ────────────────────────────────────────────────────────
router.get("/status", async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const { models = [] } = await r.json();
    const available = models.map(m => m.name);
    const ready     = available.some(n => n.startsWith(MODEL.split(":")[0]));
    res.json({ ready, model: MODEL, available });
  } catch {
    res.json({ ready: false, model: MODEL, available: [] });
  }
});

// ── POST /api/ai/chat ─────────────────────────────────────────────────────────
// Body: { messages: [{ role: "user"|"assistant", content: string }] }
router.post("/chat", async (req, res, next) => {
  try {
    const { messages = [] } = req.body;
    if (!messages.length) return res.status(400).json({ error: "messages array required" });

    const context = await buildContext();

    const systemPrompt = `You are a helpful project management assistant for PixelPM.
    Use ONLY the workspace snapshot below to answer questions. Be concise and direct.
    If asked something outside the workspace data, say you don't have that information.

=== WORKSPACE SNAPSHOT ===
${context}
=========================`;

    const body = {
      model:    MODEL,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream:   false,
      options:  { temperature: 0.3 },   // lower temp = more factual
    };

    const ollamaRes = await fetch(`${OLLAMA}/api/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(120_000),   // 2 min max
    });

    if (!ollamaRes.ok) {
      const txt = await ollamaRes.text();
      return res.status(502).json({ error: `Ollama: ${txt}` });
    }

    const data = await ollamaRes.json();
    res.json({ message: data.message, model: data.model });
  } catch (e) {
    next(e);
  }
});

export default router;
