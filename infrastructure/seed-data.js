/**
 * Seeds four demo users and three sample projects with tasks.
 * Idempotent — uses PutCommand which overwrites on re-run.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const cfg = {
  region: process.env.AWS_REGION || "us-east-1",
};
if (process.env.DYNAMODB_ENDPOINT) {
  cfg.endpoint = process.env.DYNAMODB_ENDPOINT;
  cfg.credentials = {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID     || "local",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "local",
  };
}

const doc = DynamoDBDocumentClient.from(new DynamoDBClient(cfg), {
  marshallOptions: { removeUndefinedValues: true },
});

const T = {
  USERS:    process.env.TABLE_USERS    || "pm_users",
  PROJECTS: process.env.TABLE_PROJECTS || "pm_projects",
  TASKS:    process.env.TABLE_TASKS    || "pm_tasks",
};

const USERS = [
  { userId: "u1", name: "Alex Morgan",  initials: "AM", color: "#6366f1", createdAt: "2025-01-01T00:00:00.000Z" },
  { userId: "u2", name: "Blake Chen",   initials: "BC", color: "#ec4899", createdAt: "2025-01-01T00:01:00.000Z" },
  { userId: "u3", name: "Casey Rivera", initials: "CR", color: "#f59e0b", createdAt: "2025-01-01T00:02:00.000Z" },
  { userId: "u4", name: "Dana Wu",      initials: "DW", color: "#10b981", createdAt: "2025-01-01T00:03:00.000Z" },
];

const PROJECTS = [
  { projectId: "p1", name: "Website Redesign", color: "#6366f1", createdBy: "u1", createdAt: "2025-01-02T00:00:00.000Z", updatedAt: "2025-01-02T00:00:00.000Z" },
  { projectId: "p2", name: "Mobile App",       color: "#ec4899", createdBy: "u2", createdAt: "2025-01-02T00:01:00.000Z", updatedAt: "2025-01-02T00:01:00.000Z" },
  { projectId: "p3", name: "API Integration",  color: "#10b981", createdBy: "u3", createdAt: "2025-01-02T00:02:00.000Z", updatedAt: "2025-01-02T00:02:00.000Z" },
];

const TASKS = [
  { taskId: "t1", projectId: "p1", title: "Audit existing pages",        status: "done",        priority: "high",   assignee: "u1", createdAt: "2025-01-03T00:00:00.000Z", updatedAt: "2025-01-03T00:00:00.000Z" },
  { taskId: "t2", projectId: "p1", title: "Design new component system",  status: "in-progress", priority: "high",   assignee: "u2", createdAt: "2025-01-03T00:01:00.000Z", updatedAt: "2025-01-03T00:01:00.000Z" },
  { taskId: "t3", projectId: "p1", title: "Write copy for homepage",      status: "todo",        priority: "medium", assignee: "u3", createdAt: "2025-01-03T00:02:00.000Z", updatedAt: "2025-01-03T00:02:00.000Z" },
  { taskId: "t4", projectId: "p1", title: "Set up CI/CD pipeline",        status: "todo",        priority: "low",    assignee: "u4", createdAt: "2025-01-03T00:03:00.000Z", updatedAt: "2025-01-03T00:03:00.000Z" },
  { taskId: "t5", projectId: "p2", title: "Define navigation structure",  status: "in-progress", priority: "high",   assignee: "u1", createdAt: "2025-01-04T00:00:00.000Z", updatedAt: "2025-01-04T00:00:00.000Z" },
  { taskId: "t6", projectId: "p2", title: "Implement push notifications", status: "todo",        priority: "medium", assignee: "u2", createdAt: "2025-01-04T00:01:00.000Z", updatedAt: "2025-01-04T00:01:00.000Z" },
  { taskId: "t7", projectId: "p3", title: "Map third-party endpoints",    status: "done",        priority: "high",   assignee: "u3", createdAt: "2025-01-05T00:00:00.000Z", updatedAt: "2025-01-05T00:00:00.000Z" },
  { taskId: "t8", projectId: "p3", title: "Write integration tests",      status: "todo",        priority: "medium", assignee: "u4", createdAt: "2025-01-05T00:01:00.000Z", updatedAt: "2025-01-05T00:01:00.000Z" },
];

async function isEmpty(table) {
  const { Count = 0 } = await doc.send(new ScanCommand({ TableName: table, Limit: 1, Select: "COUNT" }));
  return Count === 0;
}

async function main() {
  if (!(await isEmpty(T.USERS))) {
    console.log("Data already present — skipping seed.");
    return;
  }
  // In-memory mode: always empty on startup, so this runs every time

  for (const u of USERS)    await doc.send(new PutCommand({ TableName: T.USERS,    Item: u }));
  for (const p of PROJECTS) await doc.send(new PutCommand({ TableName: T.PROJECTS, Item: p }));
  for (const t of TASKS)    await doc.send(new PutCommand({ TableName: T.TASKS,    Item: t }));

  console.log(`Seeded ${USERS.length} users, ${PROJECTS.length} projects, ${TASKS.length} tasks.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
