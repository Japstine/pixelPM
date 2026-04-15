import { Router } from "express";
import { QueryCommand, PutCommand, DeleteCommand, UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { docClient, TABLES } from "../db/dynamodb.js";

const router = Router();

// Normalise DynamoDB item: expose `id` alongside the native PK
const norm = (item) => item ? { ...item, id: item.taskId } : null;

// GET /api/tasks  — all tasks (used by frontend on initial load)
router.get("/", async (req, res, next) => {
  try {
    const { Items = [] } = await docClient.send(new ScanCommand({ TableName: TABLES.TASKS }));
    res.json(Items.map(norm).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")));
  } catch (e) { next(e); }
});

// GET /api/projects/:projectId/tasks
router.get("/projects/:projectId/tasks", async (req, res, next) => {
  try {
    const { Items = [] } = await docClient.send(new QueryCommand({
      TableName: TABLES.TASKS,
      IndexName: "projectId-index",
      KeyConditionExpression: "projectId = :pid",
      ExpressionAttributeValues: { ":pid": req.params.projectId },
    }));
    res.json(Items.map(norm).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")));
  } catch (e) { next(e); }
});

// POST /api/projects/:projectId/tasks
router.post("/projects/:projectId/tasks", async (req, res, next) => {
  try {
    const { title, priority = "medium", assignee, status = "todo" } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "title is required" });

    const task = {
      taskId:    uuidv4(),
      projectId: req.params.projectId,
      title:     title.trim(),
      priority,
      assignee:  assignee || null,
      status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({ TableName: TABLES.TASKS, Item: task }));
    res.status(201).json(norm(task));
  } catch (e) { next(e); }
});

// PUT /api/tasks/:id  — update status, priority, assignee, or title
router.put("/:id", async (req, res, next) => {
  try {
    const allowed = { status: "#st", priority: "#pr", assignee: "#as", title: "#ti" };
    const parts   = [];
    const names   = {};
    const values  = {};

    for (const [field, alias] of Object.entries(allowed)) {
      if (req.body[field] !== undefined) {
        parts.push(`${alias} = :${field}`);
        names[alias]         = field;
        values[`:${field}`]  = req.body[field];
      }
    }
    if (!parts.length) return res.status(400).json({ error: "No updatable fields provided" });

    parts.push("#ua = :ua");
    names["#ua"]   = "updatedAt";
    values[":ua"]  = new Date().toISOString();

    const { Attributes } = await docClient.send(new UpdateCommand({
      TableName:                 TABLES.TASKS,
      Key:                       { taskId: req.params.id },
      UpdateExpression:          "SET " + parts.join(", "),
      ExpressionAttributeNames:  names,
      ExpressionAttributeValues: values,
      ReturnValues:              "ALL_NEW",
    }));

    res.json(norm(Attributes));
  } catch (e) { next(e); }
});

// DELETE /api/tasks/:id
router.delete("/:id", async (req, res, next) => {
  try {
    await docClient.send(new DeleteCommand({
      TableName: TABLES.TASKS,
      Key: { taskId: req.params.id },
    }));
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
