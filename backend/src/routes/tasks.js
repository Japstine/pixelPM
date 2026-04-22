import { Router } from "express";
import { QueryCommand, PutCommand, DeleteCommand, UpdateCommand, ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { docClient, TABLES } from "../db/dynamodb.js";
import { isGlobalPrivileged, assertProjectRole, resolveRole, getUserProjectIds } from "../middleware/roles.js";

const router = Router();

const norm = (item) => item ? { ...item, id: item.taskId } : null;

// GET /api/tasks — owner/admin: all tasks | regular user: tasks from their projects only
router.get("/", async (req, res, next) => {
  try {
    if (isGlobalPrivileged(req.user)) {
      const { Items = [] } = await docClient.send(new ScanCommand({ TableName: TABLES.TASKS }));
      return res.json(Items.map(norm).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")));
    }
    const projectIds = await getUserProjectIds(req.user.userId);
    if (projectIds.length === 0) return res.json([]);

    const results = await Promise.all(projectIds.map(pid =>
      docClient.send(new QueryCommand({
        TableName: TABLES.TASKS,
        IndexName: "projectId-index",
        KeyConditionExpression: "projectId = :pid",
        ExpressionAttributeValues: { ":pid": pid },
      }))
    ));
    const tasks = results.flatMap(r => r.Items || []).map(norm).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    res.json(tasks);
  } catch (e) { next(e); }
});

// GET /api/projects/:projectId/tasks
router.get("/projects/:projectId/tasks", async (req, res, next) => {
  try {
    const role = await assertProjectRole(req, res, req.params.projectId, ["admin","manager","member","viewer"]);
    if (!role) return;

    const { Items = [] } = await docClient.send(new QueryCommand({
      TableName: TABLES.TASKS,
      IndexName: "projectId-index",
      KeyConditionExpression: "projectId = :pid",
      ExpressionAttributeValues: { ":pid": req.params.projectId },
    }));
    res.json(Items.map(norm).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")));
  } catch (e) { next(e); }
});

// POST /api/projects/:projectId/tasks — manager or member
router.post("/projects/:projectId/tasks", async (req, res, next) => {
  try {
    const role = await assertProjectRole(req, res, req.params.projectId, ["admin","manager","member"]);
    if (!role) return;

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

// PUT /api/tasks/:id
// manager/admin: all fields | member: status only on own assigned tasks
router.put("/:id", async (req, res, next) => {
  try {
    // Fetch the task first to get projectId and current assignee
    const { Item: task } = await docClient.send(new GetCommand({ TableName: TABLES.TASKS, Key: { taskId: req.params.id } }));
    if (!task) return res.status(404).json({ error: "Task not found" });

    const role = await resolveRole(req.user, task.projectId);
    if (!role) return res.status(403).json({ error: "Forbidden" });

    let fieldsToUpdate;
    if (role === "member") {
      if (task.assignee !== req.user.userId) {
        return res.status(403).json({ error: "Members can only update their own assigned tasks" });
      }
      // Members may only change the status field
      if (req.body.status === undefined) return res.status(400).json({ error: "No updatable fields provided" });
      fieldsToUpdate = { status: req.body.status };
    } else {
      // manager/admin: all fields
      fieldsToUpdate = req.body;
    }

    const allowed = { status: "#st", priority: "#pr", assignee: "#as", title: "#ti" };
    const parts   = [];
    const names   = {};
    const values  = {};

    for (const [field, alias] of Object.entries(allowed)) {
      if (fieldsToUpdate[field] !== undefined) {
        parts.push(`${alias} = :${field}`);
        names[alias]        = field;
        values[`:${field}`] = fieldsToUpdate[field];
      }
    }
    if (!parts.length) return res.status(400).json({ error: "No updatable fields provided" });

    parts.push("#ua = :ua");
    names["#ua"]  = "updatedAt";
    values[":ua"] = new Date().toISOString();

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

// DELETE /api/tasks/:id — manager or above only
router.delete("/:id", async (req, res, next) => {
  try {
    const { Item: task } = await docClient.send(new GetCommand({ TableName: TABLES.TASKS, Key: { taskId: req.params.id } }));
    if (!task) return res.status(404).json({ error: "Task not found" });

    const role = await assertProjectRole(req, res, task.projectId, ["admin","manager"]);
    if (!role) return;

    await docClient.send(new DeleteCommand({ TableName: TABLES.TASKS, Key: { taskId: req.params.id } }));
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
