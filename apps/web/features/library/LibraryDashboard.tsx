"use client";

import type { LibraryAsset } from "@zeroflow/core";
import Link from "next/link";
import { useEffect, useState } from "react";

type ProviderStatus = {
  deepseek: boolean;
  yunwu: boolean;
  runninghub: boolean;
  astrochart: boolean;
};

type ProviderHealth = {
  id: string;
  label: string;
  configured: boolean;
  ready: boolean;
  status: "ready" | "not-configured" | "needs-input" | "unavailable";
  details?: string;
};

type VerifyResult = {
  mode: "local" | "live";
  checks: Array<Record<string, unknown>>;
};

type ProjectSummary = {
  id: string;
  title: string;
  topic: string;
};

export function LibraryDashboard() {
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [providers, setProviders] = useState<ProviderStatus | null>(null);
  const [health, setHealth] = useState<ProviderHealth[]>([]);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifyStatus, setVerifyStatus] = useState("未检查");
  const [reuseStatus, setReuseStatus] = useState("选择项目后可复用库资产");

  async function loadDashboard() {
    const [libraryResponse, providerResponse, projectsResponse] = await Promise.all([
      fetch("/api/library"),
      fetch("/api/providers/check"),
      fetch("/api/projects")
    ]);
    const libraryPayload = (await libraryResponse.json()) as { assets: LibraryAsset[] };
    const providerPayload = (await providerResponse.json()) as {
      providers: ProviderStatus;
      health: ProviderHealth[];
    };
    const projectsPayload = (await projectsResponse.json()) as { projects: ProjectSummary[] };

    setAssets(libraryPayload.assets);
    setProviders(providerPayload.providers);
    setHealth(providerPayload.health);
    setProjects(projectsPayload.projects);
    setSelectedProjectId((current) => current || projectsPayload.projects[0]?.id || "");
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  async function verifyProviders(mode: "local" | "live") {
    setVerifyStatus(mode === "live" ? "真实接口检查中" : "本地检查中");
    const response = await fetch("/api/providers/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode })
    });

    if (!response.ok) {
      setVerifyStatus("检查失败");
      return;
    }

    const payload = (await response.json()) as VerifyResult & { health: ProviderHealth[] };
    setHealth(payload.health);
    setVerifyResult({ mode: payload.mode, checks: payload.checks });
    setVerifyStatus("检查完成");
  }

  async function reuseAsset(asset: LibraryAsset) {
    if (!selectedProjectId) {
      setReuseStatus("请先选择目标项目");
      return;
    }

    setReuseStatus("复用中");
    const response = await fetch("/api/project-assets/reuse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: selectedProjectId,
        libraryAssetId: asset.id
      })
    });

    if (!response.ok) {
      setReuseStatus("复用失败");
      return;
    }

    await loadDashboard();
    setReuseStatus("已绑定到项目");
  }

  return (
    <main className="management-shell">
      <header className="management-header">
        <div>
          <span className="eyeline">Library</span>
          <h1>资源库</h1>
        </div>
        <div className="management-actions">
          <select
            aria-label="选择复用目标项目"
            className="management-select"
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
          <Link className="management-link management-link-secondary" href="/providers">
            Providers
          </Link>
          <Link className="management-link" href="/projects">
            项目列表
          </Link>
        </div>
      </header>

      <section className="provider-strip" aria-label="Provider 状态">
        <ProviderBadge
          details={health.find((item) => item.id === "deepseek")?.details}
          label="DeepSeek"
          enabled={providers?.deepseek}
          status={health.find((item) => item.id === "deepseek")?.status}
        />
        <ProviderBadge
          details={health.find((item) => item.id === "yunwu")?.details}
          label="云雾图像"
          enabled={providers?.yunwu}
          status={health.find((item) => item.id === "yunwu")?.status}
        />
        <ProviderBadge
          details={health.find((item) => item.id === "runninghub")?.details}
          label="RunningHub TTS"
          enabled={providers?.runninghub}
          status={health.find((item) => item.id === "runninghub")?.status}
        />
        <ProviderBadge
          details={health.find((item) => item.id === "astrochart")?.details}
          label="AstroChart SVG"
          enabled={providers?.astrochart}
          status={health.find((item) => item.id === "astrochart")?.status}
        />
      </section>

      <section className="provider-console" aria-label="Provider 检查">
        <header>
          <strong>接口检查</strong>
          <span>{verifyStatus}</span>
        </header>
        <div>
          <button type="button" onClick={() => void verifyProviders("local")}>
            本地检查
          </button>
          <button type="button" onClick={() => void verifyProviders("live")}>
            真实接口检查
          </button>
        </div>
        {verifyResult ? (
          <pre>{JSON.stringify(verifyResult.checks, null, 2)}</pre>
        ) : (
          <p>
            本地检查会生成 AstroChart SVG。真实接口检查只在环境变量存在时尝试外部 provider。
          </p>
        )}
      </section>

      <section className="management-list" aria-label="资源列表">
        <p className="management-status">{reuseStatus}</p>
        {assets.map((asset) => (
          <article className="management-item" key={asset.id}>
            <div>
              <span>{asset.kind}</span>
              <h2>{asset.name}</h2>
              <p>{asset.tags.join(" / ") || "未设置标签"}</p>
            </div>
            <div className="management-actions">
              <button
                type="button"
                data-action="reuse"
                onClick={() => void reuseAsset(asset)}
                disabled={!asset.reusable || !selectedProjectId}
              >
                用于项目
              </button>
              <strong>{asset.reusable ? "可复用" : "项目资源"}</strong>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function ProviderBadge({
  label,
  enabled,
  status,
  details
}: {
  label: string;
  enabled?: boolean;
  status?: ProviderHealth["status"];
  details?: string;
}) {
  return (
    <div className="provider-badge" data-enabled={Boolean(enabled)} data-status={status}>
      <strong>{label}</strong>
      <span>{statusLabel(status, enabled)}</span>
      {details ? <p>{details}</p> : null}
    </div>
  );
}

function statusLabel(status: ProviderHealth["status"] | undefined, enabled?: boolean) {
  if (status === "ready") {
    return "已就绪";
  }
  if (status === "needs-input") {
    return "需补配置";
  }
  if (status === "unavailable") {
    return "不可用";
  }
  return enabled ? "已配置" : "未配置";
}
