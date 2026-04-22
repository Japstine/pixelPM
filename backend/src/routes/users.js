import { Router } from "express";
import { ScanCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "../db/dynamodb.js";
import { isGlobalPrivileged } from "../middleware/roles.js";

const router = Router();

function safeUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return { ...rest, id: rest.userId };
}

// GET /api/users — any authenticated user can list users (needed for task assignee picker)
router.get("/", async (req, res, next) => {
  try {
    const { Items = [] } = await docClient.send(new ScanCommand({ TableName: TABLES.USERS }));
    res.json(Items.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")).map(safeUser));
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
    res.json(safeUser(Item));
  } catch (e) { next(e); }
});

// PATCH /api/users/:id/role — owner/admin only
router.patch("/:id/role", async (req, res, next) => {
  try {
    if (!isGlobalPrivileged(req.user)) return res.status(403).json({ error: "Forbidden" });

    const { globalRole } = req.body;
    if (!["admin", "user"].includes(globalRole)) {
      return res.status(400).json({ error: "globalRole must be 'admin' or 'user'" });
    }
    const { Item } = await docClient.send(new GetCommand({ TableName: TABLES.USERS, Key: { userId: req.params.id } }));
    if (!Item) return res.status(404).json({ error: "User not found" });
    if (Item.globalRole === "owner") return res.status(403).json({ error: "Cannot change the owner role" });

    const { Attributes } = await docClient.send(new UpdateCommand({
      TableName: TABLES.USERS,
      Key: { userId: req.params.id },
      UpdateExpression: "SET globalRole = :r",
      ExpressionAttributeValues: { ":r": globalRole },
      ReturnValues: "ALL_NEW",
    }));
    res.json(safeUser(Attributes));
  } catch (e) { next(e); }
});

// DELETE /api/users/:id — owner/admin only
router.delete("/:id", async (req, res, next) => {
  try {
    if (!isGlobalPrivileged(req.user)) return res.status(403).json({ error: "Forbidden" });

    const { Item } = await docClient.send(new GetCommand({ TableName: TABLES.USERS, Key: { userId: req.params.id } }));
    if (!Item) return res.status(404).json({ error: "User not found" });
    if (Item.globalRole === "owner") return res.status(403).json({ error: "Cannot delete the owner account" });

    // Clean up all project memberships for this user
    const { Items: memberships = [] } = await docClient.send(new QueryCommand({
      TableName: TABLES.MEMBERS,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": req.params.id },
    }));
    for (const m of memberships) {
      await docClient.send(new DeleteCommand({ TableName: TABLES.MEMBERS, Key: { userId: m.userId, projectId: m.projectId } }));
    }

    await docClient.send(new DeleteCommand({ TableName: TABLES.USERS, Key: { userId: req.params.id } }));
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
