"use client";

import type { VideoProject } from "@zeroflow/core";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

export function ProjectDashboard() {
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [title, setTitle] = useState("新的占星教学视频");
  const [topic, setTopic] = useState("金星落在第七宫是什么意思？");
  const [status, setStatus] = useState("加载中");

  async function loadProjects() {
    const response = await fetch("/api/projects");
    const payload = (await response.json()) as { projects: VideoProject[] };
    setProjects(payload.projects);
    setStatus("已同步");
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("创建中");
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, topic })
    });

    if (response.ok) {
      await loadProjects();
      setStatus("已创建");
    } else {
      setStatus("创建失败");
    }
  }

  async function deleteProject(project: VideoProject) {
    const shouldDelete = window.confirm(`删除项目“${project.title}”？`);
    if (!shouldDelete) {
      return;
    }

    setStatus("删除中");
    const response = await fetch(`/api/project?projectId=${encodeURIComponent(project.id)}`, {
      method: "DELETE"
    });

    if (response.ok) {
      await loadProjects();
      setStatus("已删除");
    } else {
      setStatus("删除失败");
    }
  }

  return (
    <main className="management-shell">
      <header className="management-header">
        <div>
          <span className="eyeline">Projects</span>
          <h1>视频项目</h1>
        </div>
        <Link className="management-link management-link-secondary" href="/providers">
          Providers
        </Link>
        <Link className="management-link" href={getStudioHref("project-ascendant-intro")}>
          打开默认画布
        </Link>
      </header>

      <section className="management-layout">
        <form className="management-panel" onSubmit={createProject}>
          <h2>新建视频</h2>
          <label>
            标题
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            选题
            <textarea rows={4} value={topic} onChange={(event) => setTopic(event.target.value)} />
          </label>
          <button type="submit">创建项目</button>
          <p>{status}</p>
        </form>

        <section className="management-list" aria-label="项目列表">
          {projects.map((project) => (
            <article className="management-item" key={project.id}>
              <div>
                <span>{project.status}</span>
                <h2>{project.title}</h2>
                <p>{project.topic}</p>
              </div>
              <div className="management-actions">
                <Link href={getStudioHref(project.id)}>打开</Link>
                <button type="button" onClick={() => void deleteProject(project)}>
                  删除
                </button>
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}

function getStudioHref(projectId: string) {
  return `/studio/project-ascendant-intro?projectId=${encodeURIComponent(projectId)}`;
}
