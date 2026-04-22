import { Router } from "express";
import { QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import bcryptjs from "bcryptjs";
import { docClient, TABLES } from "../db/dynamodb.js";
import { signToken } from "../middleware/auth.js";

const router = Router();
const ALLOWED_DOMAIN = "@sot.pdpu.ac.in";

function safeUser(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

async function findByEmail(email) {
  const { Items = [] } = await docClient.send(new QueryCommand({
    TableName: TABLES.USERS,
    IndexName: "email-index",
    KeyConditionExpression: "email = :e",
    ExpressionAttributeValues: { ":e": email.toLowerCase() },
  }));
  return Items[0] ?? null;
}

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email and password are required" });

    const user = await findByEmail(email.toLowerCase());
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcryptjs.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    const token = signToken({
      userId: user.userId, email: user.email, globalRole: user.globalRole,
      name: user.name, initials: user.initials, color: user.color,
    });

    res.json({ token, user: safeUser(user) });
  } catch (e) { next(e); }
});

// POST /api/auth/register
router.post("/register", async (req, res, next) => {
  try {
    const { email, password, name, color } = req.body;
    if (!email || !password || !name?.trim()) {
      return res.status(400).json({ error: "email, password, and name are required" });
    }
    if (!email.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
      return res.status(403).json({ error: `Only ${ALLOWED_DOMAIN} email addresses are allowed` });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const existing = await findByEmail(email.toLowerCase());
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const words    = name.trim().split(/\s+/);
    const initials = (words[0][0] + (words[1]?.[0] ?? "")).toUpperCase();
    const passwordHash = await bcryptjs.hash(password, 12);

    const COLORS = ["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ef4444","#14b8a6"];
    const user = {
      userId: uuidv4(),
      email:  email.toLowerCase(),
      passwordHash,
      name:   name.trim(),
      initials,
      color:  color || COLORS[Math.floor(Math.random() * COLORS.length)],
      globalRole: "user",
      createdAt: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({ TableName: TABLES.USERS, Item: user }));

    const token = signToken({
      userId: user.userId, email: user.email, globalRole: user.globalRole,
      name: user.name, initials: user.initials, color: user.color,
    });

    res.status(201).json({ token, user: safeUser(user) });
  } catch (e) { next(e); }
});

export default router;
