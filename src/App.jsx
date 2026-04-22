import { useState, useEffect, useMemo } from "react";
import * as api from "./services/api.js";
import LoginPage from "./components/LoginPage.jsx";

const STATUSES      = ["todo", "in-progress", "done"];
const STATUS_LABELS = { "todo": "To do", "in-progress": "In progress", "done": "Done" };
const PRIORITIES    = ["low", "medium", "high"];
const PCOLORS       = { low: "#10b981", medium: "#f59e0b", high: "#ef4444" };
const SBGCOLORS     = { todo: "#f1f5f9", "in-progress": "#eff6ff", done: "#f0fdf4" };
const STCOLORS      = { todo: "#64748b", "in-progress": "#3b82f6", done: "#22c55e" };
const PALETTE       = ["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ef4444","#14b8a6"];
const ROLE_LABELS   = { owner: "Owner", admin: "Admin", user: "Member" };
const VIEW_ICONS    = {
  board:    "M3 5h4v5H3V5zm0 8h4v6H3v-6zm6-8h4v3H9V5zm0 6h4v8H9v-8zm6-6h4v8h-4V5zm0 11h4v3h-4v-3z",
  list:     "M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z",
  overview: "M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z",
};

export default function App() {
  const [authUser,     setAuthUser]     = useState(null);
  const [projects,     setProjects]     = useState([]);
  const [users,        setUsers]        = useState([]);
  const [members,      setMembers]      = useState({}); // { [projectId]: [{ userId, role }] }
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [activeId,     setActiveId]     = useState(null);
  const [view,         setView]         = useState("board");
  const [showNewProj,  setShowNewProj]  = useState(false);
  const [showNewTask,  setShowNewTask]  = useState(false);
  const [newProjName,  setNewProjName]  = useState("");
  const [newProjColor, setNewProjColor] = useState("#6366f1");
  const [newTask,      setNewTask]      = useState({ title: "", priority: "medium", assignee: "" });
  const [dragTask,     setDragTask]     = useState(null);
  const [dragOver,     setDragOver]     = useState(null);
  const [showMembers,  setShowMembers]  = useState(false);

  // ── Auth expiry listener ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => handleLogout();
    window.addEventListener("auth:expired", handler);
    return () => window.removeEventListener("auth:expired", handler);
  }, []);

  // ── Load data after login ─────────────────────────────────────────────────
  useEffect(() => {
    if (!authUser) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [fetchedProjects, fetchedUsers, fetchedTasks] = await Promise.all([
          api.getProjects(),
          api.getUsers(),
          api.getAllTasks(),
        ]);
        const projectsWithTasks = fetchedProjects.map(p => ({
          ...p,
          id:    p.id || p.projectId,
          tasks: fetchedTasks.filter(t => t.projectId === (p.id || p.projectId)),
        }));
        const normUsers = fetchedUsers.map(u => ({ ...u, id: u.id || u.userId }));
        setProjects(projectsWithTasks);
        setUsers(normUsers);
        setNewTask(t => ({ ...t, assignee: normUsers[0]?.id || "" }));
        if (projectsWithTasks.length > 0) setActiveId(projectsWithTasks[0].id);

        // Load members for all projects (for role checks)
        const memberMap = {};
        await Promise.all(fetchedProjects.map(async p => {
          const pid = p.id || p.projectId;
          try {
            const ms = await api.getProjectMembers(pid);
            memberMap[pid] = ms;
          } catch { memberMap[pid] = []; }
        }));
        setMembers(memberMap);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [authUser]);

  // ── Derive effective role for the active project ──────────────────────────
  const effectiveRole = useMemo(() => {
    if (!authUser || !activeId) return null;
    if (authUser.globalRole === "owner" || authUser.globalRole === "admin") return "admin";
    const projectMembers = members[activeId] || [];
    return projectMembers.find(m => m.userId === authUser.userId)?.role ?? null;
  }, [authUser, activeId, members]);

  const canManageProject  = effectiveRole === "admin" || effectiveRole === "manager";
  const canWriteTasks     = effectiveRole === "admin" || effectiveRole === "manager" || effectiveRole === "member";
  const canDeleteTasks    = effectiveRole === "admin" || effectiveRole === "manager";
  const isGlobalPriv      = authUser?.globalRole === "owner" || authUser?.globalRole === "admin";

  const project  = projects.find(p => p.id === activeId);
  const allTasks = projects.flatMap(p => p.tasks);

  const statsFor = p => {
    const total = p.tasks.length;
    const done  = p.tasks.filter(t => t.status === "done").length;
    return {
      total, done,
      ip:   p.tasks.filter(t => t.status === "in-progress").length,
      todo: p.tasks.filter(t => t.status === "todo").length,
      pct:  total ? Math.round(done / total * 100) : 0,
    };
  };

  const handleAuth = ({ token, user }) => {
    api.setToken(token);
    setAuthUser(user);
  };

  const handleLogout = () => {
    api.clearToken();
    setAuthUser(null);
    setProjects([]);
    setUsers([]);
    setMembers({});
    setActiveId(null);
  };

  const addProject = async () => {
    if (!newProjName.trim()) return;
    try {
      const p = await api.createProject({ name: newProjName.trim(), color: newProjColor, createdBy: authUser?.userId });
      setProjects(prev => [...prev, { ...p, id: p.id || p.projectId, tasks: [] }]);
      setActiveId(p.id || p.projectId);
      setNewProjName(""); setShowNewProj(false);
    } catch (e) { console.error(e); }
  };

  const addTask = async () => {
    if (!newTask.title.trim()) return;
    try {
      const t = await api.createTask(activeId, { title: newTask.title.trim(), priority: newTask.priority, assignee: newTask.assignee, status: "todo" });
      setProjects(prev => prev.map(p => p.id === activeId ? { ...p, tasks: [...p.tasks, { ...t, id: t.id || t.taskId }] } : p));
      setNewTask({ title: "", priority: "medium", assignee: users[0]?.id || "" });
      setShowNewTask(false);
    } catch (e) { console.error(e); }
  };

  const moveTask = (taskId, newStatus) => {
    setProjects(prev => prev.map(p => ({ ...p, tasks: p.tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t) })));
    api.updateTask(taskId, { status: newStatus }).catch(console.error);
  };

  const deleteTask = (taskId) => {
    setProjects(prev => prev.map(p => ({ ...p, tasks: p.tasks.filter(t => t.id !== taskId) })));
    api.deleteTask(taskId).catch(console.error);
  };

  const deleteProject = (projectId) => {
    if (!window.confirm("Delete this project and all its tasks?")) return;
    setProjects(prev => prev.filter(p => p.id !== projectId));
    if (activeId === projectId) setActiveId(projects.find(p => p.id !== projectId)?.id || null);
    api.deleteProject(projectId).catch(console.error);
  };

  const addMember = async (userId, role) => {
    const m = await api.addProjectMember(activeId, { userId, role });
    setMembers(prev => ({ ...prev, [activeId]: [...(prev[activeId] || []), m] }));
  };

  const updateMemberRole = async (userId, role) => {
    await api.updateProjectMember(activeId, userId, { role });
    setMembers(prev => ({ ...prev, [activeId]: (prev[activeId] || []).map(m => m.userId === userId ? { ...m, role } : m) }));
  };

  const removeMember = async (userId) => {
    await api.removeProjectMember(activeId, userId);
    setMembers(prev => ({ ...prev, [activeId]: (prev[activeId] || []).filter(m => m.userId !== userId) }));
  };

  const onDrop = status => {
    if (dragTask) { moveTask(dragTask, status); setDragTask(null); setDragOver(null); }
  };

  const getUser = id => users.find(u => u.id === id) || { id, initials: "?", color: "#94a3b8", name: "Unknown" };

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (!authUser) return <LoginPage onAuth={handleAuth} />;

  // ── Loading / Error screens ───────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f8fafc", fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div style={{ textAlign: "center", color: "#94a3b8" }}>
        <div style={{ width: 32, height: 32, border: "3px solid #e2e8f0", borderTopColor: "#6366f1", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: 14 }}>Loading…</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f8fafc", fontFamily: "'Inter',system-ui,sans-serif", gap: 12 }}>
      <div style={{ fontSize: 32 }}>⚠️</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Could not connect to the API</div>
      <div style={{ fontSize: 13, color: "#94a3b8", maxWidth: 360, textAlign: "center" }}>{error}</div>
      <div style={{ fontSize: 12, color: "#cbd5e1", fontFamily: "monospace", background: "#f1f5f9", padding: "8px 14px", borderRadius: 8 }}>
        Make sure the backend is running on :3001
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", background: "#f8fafc", minHeight: "100vh", color: "#0f172a" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }
        button { font-family: inherit; }
        input  { font-family: inherit; }
        .proj-btn:hover  { background: #f1f5f9 !important; }
        .task-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important; transform: translateY(-1px); }
        .del-btn:hover   { color: #ef4444 !important; }
        .move-btn:hover  { background: #f1f5f9 !important; }
        .nav-btn:hover   { background: #f1f5f9 !important; }
        .add-btn:hover   { opacity: 0.88; }
      `}</style>

      {/* HEADER */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 56, background: "#fff", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 100 }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, background: "#6366f1", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="7" height="7" rx="1.5" fill="white"/>
              <rect x="3" y="13" width="7" height="8" rx="1.5" fill="white" opacity="0.6"/>
              <rect x="13" y="3" width="8" height="4" rx="1.5" fill="white" opacity="0.6"/>
              <rect x="13" y="10" width="8" height="11" rx="1.5" fill="white"/>
            </svg>
          </div>
          <span style={{ fontWeight: 600, fontSize: 15, color: "#0f172a", letterSpacing: "-0.3px" }}>PixelPM</span>
        </div>

        {/* View toggle */}
        <nav style={{ display: "flex", gap: 2, background: "#f1f5f9", borderRadius: 8, padding: 3 }}>
          {["board","list","overview"].map(v => (
            <button key={v} className="nav-btn" onClick={() => setView(v)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 6, border: "none", background: view === v ? "#fff" : "transparent", color: view === v ? "#0f172a" : "#64748b", cursor: "pointer", fontSize: 13, fontWeight: 500, boxShadow: view === v ? "0 1px 3px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d={VIEW_ICONS[v]}/></svg>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </nav>

        {/* Auth user display + logout */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: authUser.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, flexShrink: 0 }}>{authUser.initials}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#334155", lineHeight: 1.3 }}>{authUser.name}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 500 }}>{ROLE_LABELS[authUser.globalRole] || authUser.globalRole}</div>
            </div>
          </div>
          <button onClick={handleLogout}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer", fontSize: 12, fontWeight: 500, transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.borderColor = "#fecaca"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "#64748b"; e.currentTarget.style.borderColor = "#e2e8f0"; }}>
            Sign out
          </button>
        </div>
      </header>

      <div style={{ display: "flex", height: "calc(100vh - 56px)" }}>

        {/* SIDEBAR */}
        <aside style={{ width: 240, padding: "20px 12px", borderRight: "1px solid #e2e8f0", background: "#fff", overflowY: "auto", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingInline: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase" }}>Projects</span>
            {isGlobalPriv && (
              <button onClick={() => setShowNewProj(v => !v)}
                style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: showNewProj ? "#6366f1" : "#f1f5f9", color: showNewProj ? "#fff" : "#64748b", cursor: "pointer", fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {showNewProj ? "×" : "+"}
              </button>
            )}
          </div>

          {showNewProj && isGlobalPriv && (
            <div style={{ margin: "8px 4px 12px", padding: 12, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
              <input autoFocus value={newProjName} onChange={e => setNewProjName(e.target.value)} onKeyDown={e => e.key === "Enter" && addProject()}
                placeholder="Project name…"
                style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 6, padding: "7px 10px", fontSize: 13, outline: "none", background: "#fff", color: "#0f172a", marginBottom: 10 }} />
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
                {PALETTE.map(c => (
                  <button key={c} onClick={() => setNewProjColor(c)}
                    style={{ width: 20, height: 20, borderRadius: 5, background: c, border: newProjColor === c ? "2px solid #0f172a" : "2px solid transparent", cursor: "pointer", transition: "all 0.1s" }} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={addProject} style={{ flex: 1, padding: "6px 0", background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Create</button>
                <button onClick={() => setShowNewProj(false)} style={{ flex: 1, padding: "6px 0", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}

          {projects.map(p => {
            const st = statsFor(p);
            const active = activeId === p.id;
            const pRole = authUser?.globalRole === "owner" || authUser?.globalRole === "admin"
              ? "admin"
              : (members[p.id] || []).find(m => m.userId === authUser?.userId)?.role ?? null;
            const canDel = pRole === "admin" || pRole === "manager";
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}
                onMouseEnter={e => { if (canDel) e.currentTarget.querySelector(".proj-del")?.style && (e.currentTarget.querySelector(".proj-del").style.opacity = "1"); }}
                onMouseLeave={e => { if (canDel) e.currentTarget.querySelector(".proj-del")?.style && (e.currentTarget.querySelector(".proj-del").style.opacity = "0"); }}>
                <button className="proj-btn" onClick={() => setActiveId(p.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, padding: "8px 10px", background: active ? p.color + "12" : "transparent", borderRadius: 8, border: "none", cursor: "pointer", textAlign: "left", transition: "background 0.15s" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#0f172a" : "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500, flexShrink: 0 }}>{st.done}/{st.total}</span>
                </button>
                {canDel && (
                  <button className="proj-del" onClick={() => deleteProject(p.id)}
                    title="Delete project"
                    style={{ opacity: 0, flexShrink: 0, width: 22, height: 22, borderRadius: 6, border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", transition: "opacity 0.15s, color 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                    onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}>
                    ×
                  </button>
                )}
              </div>
            );
          })}

          {/* Team */}
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #f1f5f9" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase", paddingInline: 8, marginBottom: 10 }}>Team</div>
            {users.map(u => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: u.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, flexShrink: 0 }}>{u.initials}</div>
                <span style={{ fontSize: 13, color: "#475569" }}>{u.name}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* MAIN */}
        <main style={{ flex: 1, padding: "24px 28px", overflowY: "auto", background: "#f8fafc" }}>
          {project && (
            <>
              {/* Project header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: project.color + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ width: 14, height: 14, borderRadius: "50%", background: project.color, display: "inline-block" }} />
                  </div>
                  <div>
                    <h1 style={{ fontSize: 18, fontWeight: 600, color: "#0f172a", letterSpacing: "-0.3px" }}>{project.name}</h1>
                    <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>
                      {statsFor(project).total} tasks · {statsFor(project).pct}% complete
                      {effectiveRole && <span style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 99, background: "#f1f5f9", fontSize: 10, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>{effectiveRole}</span>}
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {canManageProject && (
                    <button onClick={() => setShowMembers(true)}
                      style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", background: "#fff", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "#6366f1"; e.currentTarget.style.color = "#6366f1"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#475569"; }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                      </svg>
                      Members
                    </button>
                  )}
                  {canWriteTasks && (
                    <button className="add-btn" onClick={() => setShowNewTask(true)}
                      style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "opacity 0.15s" }}>
                      <span style={{ fontSize: 18, lineHeight: 1, marginTop: -1 }}>+</span> Add task
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ height: 4, background: "#e2e8f0", borderRadius: 99, marginBottom: 24, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${statsFor(project).pct}%`, background: project.color, borderRadius: 99, transition: "width 0.5s ease" }} />
              </div>

              {/* BOARD */}
              {view === "board" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
                  {STATUSES.map(status => {
                    const tasks = project.tasks.filter(t => t.status === status);
                    const isOver = dragOver === status;
                    return (
                      <div key={status}
                        onDragOver={e => { e.preventDefault(); if (canWriteTasks) setDragOver(status); }}
                        onDragLeave={() => setDragOver(null)}
                        onDrop={() => canWriteTasks && onDrop(status)}
                        style={{ background: isOver ? "#f0f4ff" : "#fff", borderRadius: 12, border: `1px solid ${isOver ? "#c7d2fe" : "#e2e8f0"}`, padding: 14, minHeight: 300, transition: "all 0.15s" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                          <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: SBGCOLORS[status], color: STCOLORS[status], fontSize: 11, fontWeight: 600 }}>{STATUS_LABELS[status]}</span>
                          <span style={{ marginLeft: "auto", width: 20, height: 20, borderRadius: "50%", background: "#f1f5f9", color: "#94a3b8", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>{tasks.length}</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {tasks.map(task => {
                            const canMoveThisTask = canDeleteTasks || (effectiveRole === "member" && task.assignee === authUser?.userId);
                            return (
                              <TaskCard key={task.id} task={task} user={getUser(task.assignee)}
                                onDelete={canDeleteTasks ? () => deleteTask(task.id) : null}
                                onMove={canMoveThisTask ? () => { const o = ["todo","in-progress","done"]; moveTask(task.id, o[(o.indexOf(task.status)+1)%3]); } : null}
                                onDragStart={canWriteTasks ? () => setDragTask(task.id) : null}
                                onDragEnd={() => { setDragTask(null); setDragOver(null); }}
                                projectColor={project.color} />
                            );
                          })}
                          {tasks.length === 0 && (
                            <div style={{ textAlign: "center", padding: "32px 0", color: "#cbd5e1", fontSize: 13 }}>
                              {isOver ? "Release to drop" : "No tasks"}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* LIST */}
              {view === "list" && (
                <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 100px 160px 40px", padding: "10px 16px", borderBottom: "1px solid #f1f5f9", fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    <span>Task</span><span>Status</span><span>Priority</span><span>Assignee</span><span></span>
                  </div>
                  {project.tasks.length === 0 && (
                    <div style={{ textAlign: "center", padding: 48, color: "#94a3b8", fontSize: 14 }}>No tasks yet — add one above</div>
                  )}
                  {project.tasks.map((task, i) => {
                    const u = getUser(task.assignee);
                    const canDelThisTask = canDeleteTasks;
                    return (
                      <div key={task.id} style={{ display: "grid", gridTemplateColumns: "1fr 130px 100px 160px 40px", alignItems: "center", padding: "12px 16px", borderBottom: i < project.tasks.length - 1 ? "1px solid #f8fafc" : "none", fontSize: 13, transition: "background 0.1s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <span style={{ color: "#1e293b", fontWeight: 500 }}>{task.title}</span>
                        <span>
                          <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 99, background: SBGCOLORS[task.status], color: STCOLORS[task.status], fontSize: 11, fontWeight: 600 }}>
                            {STATUS_LABELS[task.status]}
                          </span>
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: PCOLORS[task.priority] }} />
                          <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>{task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}</span>
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 24, height: 24, borderRadius: "50%", background: u.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, flexShrink: 0 }}>{u.initials}</div>
                          <span style={{ fontSize: 12, color: "#475569" }}>{u.name}</span>
                        </span>
                        {canDelThisTask
                          ? <button className="del-btn" onClick={() => deleteTask(task.id)}
                              style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 4, borderRadius: 4, transition: "color 0.15s" }}>×</button>
                          : <span />
                        }
                      </div>
                    );
                  })}
                </div>
              )}

              {/* OVERVIEW */}
              {view === "overview" && <OverviewPanel projects={projects} users={users} allTasks={allTasks} statsFor={statsFor} getUser={getUser} />}
            </>
          )}

          {projects.length === 0 && !loading && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", color: "#94a3b8", gap: 12 }}>
              <div style={{ fontSize: 40 }}>📋</div>
              <div style={{ fontSize: 15, fontWeight: 500 }}>
                {isGlobalPriv ? "No projects yet" : "You haven't been added to any projects"}
              </div>
              <div style={{ fontSize: 13 }}>
                {isGlobalPriv ? "Create one using the + in the sidebar" : "Ask an admin or manager to add you to a project"}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MEMBERS MODAL */}
      {showMembers && project && (
        <MembersModal
          project={project}
          members={members[activeId] || []}
          users={users}
          onAdd={addMember}
          onRoleChange={updateMemberRole}
          onRemove={removeMember}
          onClose={() => setShowMembers(false)}
        />
      )}

      {/* NEW TASK MODAL */}
      {showNewTask && (
        <div onClick={() => setShowNewTask(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(2px)" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, padding: 28, width: 420, maxWidth: "92vw", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>New task</h2>
              <button onClick={() => setShowNewTask(false)} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 2, borderRadius: 4 }}>×</button>
            </div>

            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Task name</label>
            <input autoFocus value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} onKeyDown={e => e.key === "Enter" && addTask()}
              placeholder="What needs to be done?"
              style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none", color: "#0f172a", marginBottom: 20, transition: "border-color 0.15s" }}
              onFocus={e => e.target.style.borderColor = "#6366f1"}
              onBlur={e => e.target.style.borderColor = "#e2e8f0"} />

            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Priority</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {PRIORITIES.map(pr => (
                <button key={pr} onClick={() => setNewTask(p => ({ ...p, priority: pr }))}
                  style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1.5px solid ${newTask.priority === pr ? PCOLORS[pr] : "#e2e8f0"}`, background: newTask.priority === pr ? PCOLORS[pr] + "14" : "#fff", color: newTask.priority === pr ? PCOLORS[pr] : "#64748b", cursor: "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: PCOLORS[pr] }} />
                  {pr.charAt(0).toUpperCase() + pr.slice(1)}
                </button>
              ))}
            </div>

            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Assign to</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
              {users.map(u => (
                <button key={u.id} onClick={() => setNewTask(p => ({ ...p, assignee: u.id }))}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${newTask.assignee === u.id ? u.color : "#e2e8f0"}`, background: newTask.assignee === u.id ? u.color + "0e" : "#fff", cursor: "pointer", transition: "all 0.15s" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: u.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600 }}>{u.initials}</div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: newTask.assignee === u.id ? "#0f172a" : "#475569" }}>{u.name}</span>
                  {newTask.assignee === u.id && (
                    <svg style={{ marginLeft: "auto" }} width="14" height="14" viewBox="0 0 24 24" fill={u.color}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
                  )}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={addTask}
                style={{ flex: 1, padding: "10px 0", background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Create task
              </button>
              <button onClick={() => setShowNewTask(false)}
                style={{ padding: "10px 16px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ROLE_OPTIONS = ["manager", "member", "viewer"];
const ROLE_COLORS  = { manager: "#6366f1", member: "#10b981", viewer: "#94a3b8" };

function MembersModal({ project, members, users, onAdd, onRoleChange, onRemove, onClose }) {
  const [addUserId, setAddUserId] = useState("");
  const [addRole,   setAddRole]   = useState("member");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  const memberIds  = new Set(members.map(m => m.userId));
  const available  = users.filter(u => !memberIds.has(u.id));

  const getUserById = id => users.find(u => u.id === id);

  const handleAdd = async () => {
    if (!addUserId) return;
    setSaving(true); setError("");
    try {
      await onAdd(addUserId, addRole);
      setAddUserId(""); setAddRole("member");
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleRoleChange = async (userId, role) => {
    try { await onRoleChange(userId, role); }
    catch (e) { setError(e.message); }
  };

  const handleRemove = async (userId) => {
    try { await onRemove(userId); }
    catch (e) { setError(e.message); }
  };

  const inp = { padding: "7px 10px", borderRadius: 7, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", background: "#fff", color: "#0f172a", cursor: "pointer" };

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(2px)" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 28, width: 480, maxWidth: "92vw", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>Project members</h2>
            <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{project.name}</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 2, borderRadius: 4 }}>×</button>
        </div>

        {/* Member list */}
        <div style={{ flex: 1, overflowY: "auto", marginBottom: 20 }}>
          {members.length === 0 && (
            <div style={{ textAlign: "center", padding: "24px 0", color: "#94a3b8", fontSize: 13 }}>No members yet</div>
          )}
          {members.map(m => {
            const u = getUserById(m.userId);
            if (!u) return null;
            return (
              <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: u.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{u.initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                </div>
                <select value={m.role} onChange={e => handleRoleChange(m.userId, e.target.value)}
                  style={{ ...inp, color: ROLE_COLORS[m.role], fontWeight: 600, paddingRight: 28 }}>
                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
                <button onClick={() => handleRemove(m.userId)} title="Remove member"
                  style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "2px 4px", borderRadius: 4, flexShrink: 0, transition: "color 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                  onMouseLeave={e => e.currentTarget.style.color = "#cbd5e1"}>×</button>
              </div>
            );
          })}
        </div>

        {/* Add member */}
        <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Add member</div>
          {available.length === 0 ? (
            <div style={{ fontSize: 13, color: "#94a3b8" }}>All users are already members.</div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <select value={addUserId} onChange={e => setAddUserId(e.target.value)}
                style={{ ...inp, flex: 1 }}>
                <option value="">Select a user…</option>
                {available.map(u => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
              </select>
              <select value={addRole} onChange={e => setAddRole(e.target.value)}
                style={{ ...inp, color: ROLE_COLORS[addRole], fontWeight: 600 }}>
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
              <button onClick={handleAdd} disabled={!addUserId || saving}
                style={{ padding: "7px 16px", background: !addUserId || saving ? "#c7d2fe" : "#6366f1", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: !addUserId || saving ? "not-allowed" : "pointer", flexShrink: 0 }}>
                {saving ? "…" : "Add"}
              </button>
            </div>
          )}
          {error && <div style={{ marginTop: 10, fontSize: 12, color: "#ef4444" }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}

function TaskCard({ task, user, onDelete, onMove, onDragStart, onDragEnd }) {
  return (
    <div className="task-card" draggable={!!onDragStart} onDragStart={onDragStart || undefined} onDragEnd={onDragEnd}
      style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: "12px 12px 10px", cursor: onDragStart ? "grab" : "default", transition: "box-shadow 0.15s, transform 0.15s", userSelect: "none" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: PCOLORS[task.priority], flexShrink: 0, marginTop: 5 }} />
        <span style={{ flex: 1, fontSize: 13, color: "#1e293b", fontWeight: 500, lineHeight: 1.5 }}>{task.title}</span>
        {onDelete && (
          <button className="del-btn" onClick={onDelete}
            style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 2, marginTop: -2, borderRadius: 4, flexShrink: 0, transition: "color 0.15s" }}>×</button>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: user.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, flexShrink: 0 }}>{user.initials}</div>
        <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{user.name}</span>
        {onMove && (
          <button className="move-btn" onClick={onMove} title="Advance status"
            style={{ marginLeft: "auto", background: "none", border: "1px solid #e2e8f0", color: "#94a3b8", cursor: "pointer", fontSize: 12, padding: "2px 8px", borderRadius: 6, transition: "background 0.15s", fontWeight: 600 }}>
            {task.status === "done" ? "↩" : "→"}
          </button>
        )}
      </div>
    </div>
  );
}

function OverviewPanel({ projects, users, allTasks, statsFor, getUser }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 16, marginBottom: 32 }}>
        {projects.map(p => {
          const st = statsFor(p);
          return (
            <div key={p.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.color }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{p.name}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                {[["Total", st.total, "#64748b"],["To do", st.todo, "#f59e0b"],["WIP", st.ip, "#3b82f6"],["Done", st.done, "#22c55e"]].map(([l,v,c]) => (
                  <div key={l} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: c, lineHeight: 1 }}>{v}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ height: 6, background: "#f1f5f9", borderRadius: 99, overflow: "hidden", display: "flex" }}>
                {st.total > 0 && <>
                  <div style={{ width: `${st.done/st.total*100}%`, background: "#22c55e" }} />
                  <div style={{ width: `${st.ip/st.total*100}%`, background: "#3b82f6" }} />
                  <div style={{ width: `${st.todo/st.total*100}%`, background: "#fde68a" }} />
                </>}
              </div>
            </div>
          );
        })}
      </div>

      <h3 style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Team workload</h3>
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "8px 20px" }}>
        {users.map((u, i) => {
          const tasks = allTasks.filter(t => t.assignee === u.id);
          const done  = tasks.filter(t => t.status === "done").length;
          return (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: i < users.length - 1 ? "1px solid #f8fafc" : "none" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: u.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{u.initials}</div>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#334155", width: 110, flexShrink: 0 }}>{u.name}</span>
              <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ width: `${tasks.length ? done/tasks.length*100 : 0}%`, height: "100%", background: u.color, borderRadius: 99, transition: "width 0.5s ease" }} />
              </div>
              <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500, flexShrink: 0, minWidth: 60, textAlign: "right" }}>{done}/{tasks.length} done</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
