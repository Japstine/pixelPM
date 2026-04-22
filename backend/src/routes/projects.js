import { Router } from "express";
import { ScanCommand, PutCommand, GetCommand, DeleteCommand, UpdateCommand, QueryCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { docClient, TABLES } from "../db/dynamodb.js";
import { isGlobalPrivileged, assertProjectRole, getUserProjectIds } from "../middleware/roles.js";

const router = Router();

// GET /api/projects
// owner/admin: all projects | regular user: only their member projects
router.get("/", async (req, res, next) => {
  try {
    if (isGlobalPrivileged(req.user)) {
      const { Items = [] } = await docClient.send(new ScanCommand({ TableName: TABLES.PROJECTS }));
      return res.json(Items.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")).map(p => ({ ...p, id: p.projectId })));
    }
    // Regular user: fetch only their projects
    const projectIds = await getUserProjectIds(req.user.userId);
    if (projectIds.length === 0) return res.json([]);

    const results = await Promise.all(projectIds.map(pid =>
      docClient.send(new GetCommand({ TableName: TABLES.PROJECTS, Key: { projectId: pid } }))
    ));
    const projects = results.map(r => r.Item).filter(Boolean).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    res.json(projects.map(p => ({ ...p, id: p.projectId })));
  } catch (e) { next(e); }
});

// GET /api/projects/:id
router.get("/:id", async (req, res, next) => {
  try {
    const role = await assertProjectRole(req, res, req.params.id, ["admin","manager","member","viewer"]);
    if (!role) return;
    const { Item } = await docClient.send(new GetCommand({ TableName: TABLES.PROJECTS, Key: { projectId: req.params.id } }));
    if (!Item) return res.status(404).json({ error: "Project not found" });
    res.json({ ...Item, id: Item.projectId });
  } catch (e) { next(e); }
});

// POST /api/projects — owner/admin only
router.post("/", async (req, res, next) => {
  try {
    if (!isGlobalPrivileged(req.user)) return res.status(403).json({ error: "Forbidden" });

    const { name, color, createdBy } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "name is required" });

    const project = {
      projectId: uuidv4(),
      name: name.trim(),
      color: color || "#6366f1",
      createdBy: createdBy || req.user.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await docClient.send(new PutCommand({ TableName: TABLES.PROJECTS, Item: project }));
    res.status(201).json({ ...project, id: project.projectId });
  } catch (e) { next(e); }
});

// PUT /api/projects/:id — manager or above
router.put("/:id", async (req, res, next) => {
  try {
    const role = await assertProjectRole(req, res, req.params.id, ["admin","manager"]);
    if (!role) return;

    const { name, color } = req.body;
    const updates = [];
    const names   = {};
    const values  = {};

    if (name  !== undefined) { updates.push("#n = :n"); names["#n"] = "name"; values[":n"] = name; }
    if (color !== undefined) { updates.push("color = :c"); values[":c"] = color; }
    updates.push("updatedAt = :u"); values[":u"] = new Date().toISOString();

    const { Attributes } = await docClient.send(new UpdateCommand({
      TableName: TABLES.PROJECTS,
      Key: { projectId: req.params.id },
      UpdateExpression: "SET " + updates.join(", "),
      ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }));
    res.json({ ...Attributes, id: Attributes.projectId });
  } catch (e) { next(e); }
});

// DELETE /api/projects/:id — manager or above
router.delete("/:id", async (req, res, next) => {
  try {
    const role = await assertProjectRole(req, res, req.params.id, ["admin","manager"]);
    if (!role) return;

    // Clean up all memberships for this project
    const { Items: members = [] } = await docClient.send(new QueryCommand({
      TableName: TABLES.MEMBERS,
      IndexName: "projectId-index",
      KeyConditionExpression: "projectId = :pid",
      ExpressionAttributeValues: { ":pid": req.params.id },
    }));
    for (const m of members) {
      await docClient.send(new DeleteCommand({ TableName: TABLES.MEMBERS, Key: { userId: m.userId, projectId: m.projectId } }));
    }

    await docClient.send(new DeleteCommand({ TableName: TABLES.PROJECTS, Key: { projectId: req.params.id } }));
    res.status(204).send();
  } catch (e) { next(e); }
});

// ── Project Members ───────────────────────────────────────────────────────────

// GET /api/projects/:id/members
router.get("/:id/members", async (req, res, next) => {
  try {
    const role = await assertProjectRole(req, res, req.params.id, ["admin","manager","member","viewer"]);
    if (!role) return;

    const { Items = [] } = await docClient.send(new QueryCommand({
      TableName: TABLES.MEMBERS,
      IndexName: "projectId-index",
      KeyConditionExpression: "projectId = :pid",
      ExpressionAttributeValues: { ":pid": req.params.id },
    }));
    res.json(Items);
  } catch (e) { next(e); }
});

// POST /api/projects/:id/members — manager or above
router.post("/:id/members", async (req, res, next) => {
  try {
    const role = await assertProjectRole(req, res, req.params.id, ["admin","manager"]);
    if (!role) return;

    const { userId, role: memberRole } = req.body;
    if (!userId || !["manager","member","viewer"].includes(memberRole)) {
      return res.status(400).json({ error: "userId and role (manager|member|viewer) are required" });
    }

    const membership = {
      userId, projectId: req.params.id,
      role: memberRole,
      addedAt: new Date().toISOString(),
      addedBy: req.user.userId,
    };
    await docClient.send(new PutCommand({ TableName: TABLES.MEMBERS, Item: membership }));
    res.status(201).json(membership);
  } catch (e) { next(e); }
});

// PATCH /api/projects/:id/members/:userId — manager or above
router.patch("/:id/members/:userId", async (req, res, next) => {
  try {
    const role = await assertProjectRole(req, res, req.params.id, ["admin","manager"]);
    if (!role) return;

    const { role: memberRole } = req.body;
    if (!["manager","member","viewer"].includes(memberRole)) {
      return res.status(400).json({ error: "role must be manager|member|viewer" });
    }

    const { Attributes } = await docClient.send(new UpdateCommand({
      TableName: TABLES.MEMBERS,
      Key: { userId: req.params.userId, projectId: req.params.id },
      UpdateExpression: "SET #r = :r",
      ExpressionAttributeNames: { "#r": "role" },
      ExpressionAttributeValues: { ":r": memberRole },
      ReturnValues: "ALL_NEW",
    }));
    res.json(Attributes);
  } catch (e) { next(e); }
});

// DELETE /api/projects/:id/members/:userId — manager or above
router.delete("/:id/members/:userId", async (req, res, next) => {
  try {
    const role = await assertProjectRole(req, res, req.params.id, ["admin","manager"]);
    if (!role) return;

    await docClient.send(new DeleteCommand({
      TableName: TABLES.MEMBERS,
      Key: { userId: req.params.userId, projectId: req.params.id },
    }));
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
