/**
 * Seeds the owner account, demo users, projects, tasks, and project memberships.
 * Idempotent — skips if pm_users already has data.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import bcryptjs from "bcryptjs";

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
  MEMBERS:  process.env.TABLE_MEMBERS  || "pm_project_members",
};

async function main() {
  const { Count = 0 } = await doc.send(new ScanCommand({ TableName: T.USERS, Limit: 1, Select: "COUNT" }));
  if (Count > 0) {
    console.log("Data already present — skipping seed.");
    return;
  }

  const ownerHash = await bcryptjs.hash("Admin@pixelpm1", 12);
  const demoHash  = await bcryptjs.hash("Demo@pixelpm1",  12);

  const USERS = [
    {
      userId: "owner-1", email: "23bit156@sot.pdpu.ac.in", passwordHash: ownerHash,
      name: "Admin User", initials: "AU", color: "#6366f1",
      globalRole: "owner", createdAt: "2025-01-01T00:00:00.000Z",
    },
    {
      userId: "u1", email: "alex@sot.pdpu.ac.in", passwordHash: demoHash,
      name: "Alex Morgan", initials: "AM", color: "#6366f1",
      globalRole: "user", createdAt: "2025-01-01T00:01:00.000Z",
    },
    {
      userId: "u2", email: "blake@sot.pdpu.ac.in", passwordHash: demoHash,
      name: "Blake Chen", initials: "BC", color: "#ec4899",
      globalRole: "user", createdAt: "2025-01-01T00:02:00.000Z",
    },
    {
      userId: "u3", email: "casey@sot.pdpu.ac.in", passwordHash: demoHash,
      name: "Casey Rivera", initials: "CR", color: "#f59e0b",
      globalRole: "user", createdAt: "2025-01-01T00:03:00.000Z",
    },
  ];

  const PROJECTS = [
    { projectId: "p1", name: "Website Redesign", color: "#6366f1", createdBy: "u1", createdAt: "2025-01-02T00:00:00.000Z", updatedAt: "2025-01-02T00:00:00.000Z" },
    { projectId: "p2", name: "Mobile App",       color: "#ec4899", createdBy: "u2", createdAt: "2025-01-02T00:01:00.000Z", updatedAt: "2025-01-02T00:01:00.000Z" },
    { projectId: "p3", name: "API Integration",  color: "#10b981", createdBy: "u3", createdAt: "2025-01-02T00:02:00.000Z", updatedAt: "2025-01-02T00:02:00.000Z" },
  ];

  const MEMBERS = [
    { userId: "u1", projectId: "p1", role: "manager", addedAt: "2025-01-02T00:00:00.000Z", addedBy: "owner-1" },
    { userId: "u2", projectId: "p1", role: "member",  addedAt: "2025-01-02T00:00:00.000Z", addedBy: "owner-1" },
    { userId: "u3", projectId: "p1", role: "viewer",  addedAt: "2025-01-02T00:00:00.000Z", addedBy: "owner-1" },
    { userId: "u1", projectId: "p2", role: "member",  addedAt: "2025-01-02T00:01:00.000Z", addedBy: "owner-1" },
    { userId: "u2", projectId: "p2", role: "manager", addedAt: "2025-01-02T00:01:00.000Z", addedBy: "owner-1" },
    { userId: "u3", projectId: "p2", role: "viewer",  addedAt: "2025-01-02T00:01:00.000Z", addedBy: "owner-1" },
    { userId: "u3", projectId: "p3", role: "manager", addedAt: "2025-01-02T00:02:00.000Z", addedBy: "owner-1" },
    { userId: "u1", projectId: "p3", role: "member",  addedAt: "2025-01-02T00:02:00.000Z", addedBy: "owner-1" },
    { userId: "u2", projectId: "p3", role: "viewer",  addedAt: "2025-01-02T00:02:00.000Z", addedBy: "owner-1" },
  ];

  const TASKS = [
    { taskId: "t1", projectId: "p1", title: "Audit existing pages",        status: "done",        priority: "high",   assignee: "u1", createdAt: "2025-01-03T00:00:00.000Z", updatedAt: "2025-01-03T00:00:00.000Z" },
    { taskId: "t2", projectId: "p1", title: "Design new component system",  status: "in-progress", priority: "high",   assignee: "u2", createdAt: "2025-01-03T00:01:00.000Z", updatedAt: "2025-01-03T00:01:00.000Z" },
    { taskId: "t3", projectId: "p1", title: "Write copy for homepage",      status: "todo",        priority: "medium", assignee: "u3", createdAt: "2025-01-03T00:02:00.000Z", updatedAt: "2025-01-03T00:02:00.000Z" },
    { taskId: "t4", projectId: "p1", title: "Set up CI/CD pipeline",        status: "todo",        priority: "low",    assignee: "u1", createdAt: "2025-01-03T00:03:00.000Z", updatedAt: "2025-01-03T00:03:00.000Z" },
    { taskId: "t5", projectId: "p2", title: "Define navigation structure",  status: "in-progress", priority: "high",   assignee: "u1", createdAt: "2025-01-04T00:00:00.000Z", updatedAt: "2025-01-04T00:00:00.000Z" },
    { taskId: "t6", projectId: "p2", title: "Implement push notifications", status: "todo",        priority: "medium", assignee: "u2", createdAt: "2025-01-04T00:01:00.000Z", updatedAt: "2025-01-04T00:01:00.000Z" },
    { taskId: "t7", projectId: "p3", title: "Map third-party endpoints",    status: "done",        priority: "high",   assignee: "u3", createdAt: "2025-01-05T00:00:00.000Z", updatedAt: "2025-01-05T00:00:00.000Z" },
    { taskId: "t8", projectId: "p3", title: "Write integration tests",      status: "todo",        priority: "medium", assignee: "u1", createdAt: "2025-01-05T00:01:00.000Z", updatedAt: "2025-01-05T00:01:00.000Z" },
  ];

  for (const u of USERS)   await doc.send(new PutCommand({ TableName: T.USERS,    Item: u }));
  for (const p of PROJECTS) await doc.send(new PutCommand({ TableName: T.PROJECTS, Item: p }));
  for (const m of MEMBERS)  await doc.send(new PutCommand({ TableName: T.MEMBERS,  Item: m }));
  for (const t of TASKS)    await doc.send(new PutCommand({ TableName: T.TASKS,    Item: t }));

  console.log(`Seeded ${USERS.length} users, ${PROJECTS.length} projects, ${MEMBERS.length} memberships, ${TASKS.length} tasks.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
