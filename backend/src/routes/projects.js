import { Router } from "express";
import { ScanCommand, PutCommand, GetCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { docClient, TABLES } from "../db/dynamodb.js";

const router = Router();

// GET /api/projects
router.get("/", async (req, res, next) => {
  try {
    const { Items = [] } = await docClient.send(new ScanCommand({ TableName: TABLES.PROJECTS }));
    res.json(Items.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")));
  } catch (e) { next(e); }
});

// GET /api/projects/:id
router.get("/:id", async (req, res, next) => {
  try {
    const { Item } = await docClient.send(new GetCommand({
      TableName: TABLES.PROJECTS,
      Key: { projectId: req.params.id },
    }));
    if (!Item) return res.status(404).json({ error: "Project not found" });
    res.json({ ...Item, id: Item.projectId });
  } catch (e) { next(e); }
});

// POST /api/projects
router.post("/", async (req, res, next) => {
  try {
    const { name, color, createdBy } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "name is required" });

    const project = {
      projectId: uuidv4(),
      name: name.trim(),
      color: color || "#6366f1",
      createdBy: createdBy || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({ TableName: TABLES.PROJECTS, Item: project }));
    res.status(201).json({ ...project, id: project.projectId });
  } catch (e) { next(e); }
});

// PUT /api/projects/:id
router.put("/:id", async (req, res, next) => {
  try {
    const { name, color } = req.body;
    const updates = [];
    const names = {};
    const values = {};

    if (name !== undefined) { updates.push("#n = :n"); names["#n"] = "name"; values[":n"] = name; }
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

// DELETE /api/projects/:id
router.delete("/:id", async (req, res, next) => {
  try {
    await docClient.send(new DeleteCommand({
      TableName: TABLES.PROJECTS,
      Key: { projectId: req.params.id },
    }));
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
