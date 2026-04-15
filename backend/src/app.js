import express from "express";
import cors from "cors";
import usersRouter from "./routes/users.js";
import projectsRouter from "./routes/projects.js";
import tasksRouter from "./routes/tasks.js";
import aiRouter from "./routes/ai.js";

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

// Health check
app.get("/health", (_, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

// Routes
app.use("/api/users",    usersRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/tasks",    tasksRouter);
app.use("/api/ai",       aiRouter);

// Tasks nested under projects (shares same router, routes declared with prefix)
app.use("/api",          tasksRouter);

// Error handler
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => console.log(`PixelPM API running on :${PORT}`));
