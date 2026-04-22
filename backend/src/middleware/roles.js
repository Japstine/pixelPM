import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "../db/dynamodb.js";

export function isGlobalPrivileged(user) {
  return user.globalRole === "owner" || user.globalRole === "admin";
}

export async function getProjectRole(userId, projectId) {
  const { Item } = await docClient.send(new GetCommand({
    TableName: TABLES.MEMBERS,
    Key: { userId, projectId },
  }));
  return Item?.role ?? null;
}

// Returns "admin" for owner/admin, otherwise the user's project-level role (or null)
export async function resolveRole(user, projectId) {
  if (isGlobalPrivileged(user)) return "admin";
  return await getProjectRole(user.userId, projectId);
}

// Returns false and sends 403 if the caller's role is not in allowedRoles
// Returns the resolved role string if allowed
export async function assertProjectRole(req, res, projectId, allowedRoles) {
  const role = await resolveRole(req.user, projectId);
  if (!role || !allowedRoles.includes(role)) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return role;
}

// Returns all project IDs a user is a member of
export async function getUserProjectIds(userId) {
  const { Items = [] } = await docClient.send(new QueryCommand({
    TableName: TABLES.MEMBERS,
    KeyConditionExpression: "userId = :uid",
    ExpressionAttributeValues: { ":uid": userId },
  }));
  return Items.map(m => m.projectId);
}
