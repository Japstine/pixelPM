import { Router } from "express";
import { ScanCommand, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { docClient, TABLES } from "../db/dynamodb.js";

const router = Router();

// GET /api/users
router.get("/", async (req, res, next) => {
  try {
    const { Items = [] } = await docClient.send(new ScanCommand({ TableName: TABLES.USERS }));
    res.json(Items.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")));
  } catch (e) { next(e); }
});

// GET /api/users/:id
router.get("/:id", async (req, res, next) => {
  try {
    const { Item } = await docClient.send(new GetCommand({
      TableName: TABLES.USERS,
      Key: { userId: req.params.id },
    }));
    if (!Item) return res.status(404).json({ error: "User not found" });
    res.json(Item);
  } catch (e) { next(e); }
});

// POST /api/users
router.post("/", async (req, res, next) => {
  try {
    const { name, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "name is required" });

    const words = name.trim().split(" ");
    const initials = (words[0][0] + (words[1]?.[0] || "")).toUpperCase();

    const user = {
      userId: uuidv4(),
      name: name.trim(),
      initials,
      color: color || "#6366f1",
      createdAt: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({ TableName: TABLES.USERS, Item: user }));
    res.status(201).json({ ...user, id: user.userId });
  } catch (e) { next(e); }
});

export default router;
