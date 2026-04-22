const BASE = import.meta.env.VITE_API_URL || "/api";

let accessToken = null;

export function setToken(t)  { accessToken = t; }
export function clearToken() { accessToken = null; }

async function req(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event("auth:expired"));
    throw new Error("Session expired");
  }
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Auth
export const login    = (body) => req("/auth/login",    { method: "POST", body });
export const register = (body) => req("/auth/register", { method: "POST", body });

// Users
export const getUsers       = ()           => req("/users");
export const updateUserRole = (id, body)   => req(`/users/${id}/role`, { method: "PATCH", body });
export const deleteUser     = (id)         => req(`/users/${id}`,      { method: "DELETE" });

// Projects
export const getProjects   = ()         => req("/projects");
export const createProject = (body)     => req("/projects",        { method: "POST", body });
export const updateProject = (id, body) => req(`/projects/${id}`,  { method: "PUT",  body });
export const deleteProject = (id)       => req(`/projects/${id}`,  { method: "DELETE" });

// Project Members
export const getProjectMembers    = (pid)          => req(`/projects/${pid}/members`);
export const addProjectMember     = (pid, body)    => req(`/projects/${pid}/members`,             { method: "POST",   body });
export const updateProjectMember  = (pid, uid, body) => req(`/projects/${pid}/members/${uid}`,    { method: "PATCH",  body });
export const removeProjectMember  = (pid, uid)     => req(`/projects/${pid}/members/${uid}`,      { method: "DELETE" });

// Tasks
export const getAllTasks = ()                  => req("/tasks");
export const createTask = (projectId, body)   => req(`/projects/${projectId}/tasks`, { method: "POST", body });
export const updateTask = (id, body)          => req(`/tasks/${id}`,                 { method: "PUT",  body });
export const deleteTask = (id)                => req(`/tasks/${id}`,                 { method: "DELETE" });
