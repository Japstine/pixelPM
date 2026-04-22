import express from "express";
import cors from "cors";
import usersRouter from "./routes/users.js";
import projectsRouter from "./routes/projects.js";
import tasksRouter from "./routes/tasks.js";
import authRouter from "./routes/auth.js";
import { requireAuth } from "./middleware/auth.js";

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

// Health check — no auth required
app.get("/health", (_, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

// Auth routes — no token required
app.use("/api/auth", authRouter);

// All other API routes require a valid JWT
app.use("/api/users",    requireAuth, usersRouter);
app.use("/api/projects", requireAuth, projectsRouter);
app.use("/api/tasks",    requireAuth, tasksRouter);
app.use("/api",          requireAuth, tasksRouter);

// Error handler
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => console.log(`PixelPM API running on :${PORT}`));
