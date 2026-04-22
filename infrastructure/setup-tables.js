/**
 * Creates the three DynamoDB tables required by PixelPM.
 * Safe to run multiple times — skips tables that already exist.
 *
 * Usage:
 *   node setup-tables.js                        # local DynamoDB (DYNAMODB_ENDPOINT set)
 *   AWS_REGION=us-east-1 node setup-tables.js   # AWS DynamoDB
 */
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";

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

const client = new DynamoDBClient(cfg);

const TABLES = [
  // ── Users (with email-index GSI for login lookup) ──────────────────────────
  {
    TableName:   process.env.TABLE_USERS || "pm_users",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "userId", AttributeType: "S" },
      { AttributeName: "email",  AttributeType: "S" },
    ],
    KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
    GlobalSecondaryIndexes: [
      {
        IndexName: "email-index",
        KeySchema: [{ AttributeName: "email", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  },

  // ── Projects ───────────────────────────────────────────────────────────────
  {
    TableName:            process.env.TABLE_PROJECTS || "pm_projects",
    BillingMode:          "PAY_PER_REQUEST",
    AttributeDefinitions: [{ AttributeName: "projectId", AttributeType: "S" }],
    KeySchema:            [{ AttributeName: "projectId", KeyType: "HASH" }],
  },

  // ── Tasks (with GSI on projectId for efficient project-scoped queries) ──────
  {
    TableName:   process.env.TABLE_TASKS || "pm_tasks",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "taskId",    AttributeType: "S" },
      { AttributeName: "projectId", AttributeType: "S" },
      { AttributeName: "createdAt", AttributeType: "S" },
    ],
    KeySchema: [{ AttributeName: "taskId", KeyType: "HASH" }],
    GlobalSecondaryIndexes: [
      {
        IndexName: "projectId-index",
        KeySchema: [
          { AttributeName: "projectId", KeyType: "HASH"  },
          { AttributeName: "createdAt", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  },

  // ── Project Members (per-project role assignments) ─────────────────────────
  {
    TableName:   process.env.TABLE_MEMBERS || "pm_project_members",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "userId",    AttributeType: "S" },
      { AttributeName: "projectId", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "userId",    KeyType: "HASH"  },
      { AttributeName: "projectId", KeyType: "RANGE" },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "projectId-index",
        KeySchema: [
          { AttributeName: "projectId", KeyType: "HASH"  },
          { AttributeName: "userId",    KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  },
];

async function tableExists(name) {
  try {
    await client.send(new DescribeTableCommand({ TableName: name }));
    return true;
  } catch (e) {
    if (e.name === "ResourceNotFoundException") return false;
    throw e;
  }
}

async function main() {
  for (const def of TABLES) {
    if (await tableExists(def.TableName)) {
      console.log(`  ✓ ${def.TableName} already exists`);
      continue;
    }
    await client.send(new CreateTableCommand(def));
    console.log(`  ✦ ${def.TableName} created`);
  }
  console.log("Tables ready.");
}

main().catch((e) => { console.error(e); process.exit(1); });
