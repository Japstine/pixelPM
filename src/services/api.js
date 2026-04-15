const BASE = import.meta.env.VITE_API_URL || "/api";

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Users
export const getUsers    = ()     => req("/users");

// Projects
export const getProjects = ()     => req("/projects");
export const createProject = (body) => req("/projects",        { method: "POST", body });
export const updateProject = (id, body) => req(`/projects/${id}`, { method: "PUT",  body });
export const deleteProject = (id) => req(`/projects/${id}`,   { method: "DELETE" });

// Tasks
export const getAllTasks  = ()     => req("/tasks");
export const createTask  = (projectId, body) => req(`/projects/${projectId}/tasks`, { method: "POST", body });
export const updateTask  = (id, body)        => req(`/tasks/${id}`,                 { method: "PUT",  body });
export const deleteTask  = (id)              => req(`/tasks/${id}`,                 { method: "DELETE" });
