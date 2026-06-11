"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ClientProviderHealth } from "../jobs/providerGuard";

type ProviderStatus = {
  deepseek: boolean;
  yunwu: boolean;
  runninghub: boolean;
  astrochart: boolean;
};

type ProviderCheck = Record<string, unknown>;

type VerifyResult = {
  mode: "local" | "live";
  checks: ProviderCheck[];
};

type ProviderResponse = {
  providers: ProviderStatus;
  health: ClientProviderHealth[];
};

const providerGuides: Record<
  ClientProviderHealth["id"],
  {
    role: string;
    jobTypes: string;
    env: string[];
    liveCost: "external" | "local";
  }
> = {
  deepseek: {
    role: "Script and storyboard LLM",
    jobTypes: "generate-script, generate-storyboard",
    env: ["DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL"],
    liveCost: "external"
  },
  yunwu: {
    role: "Sketch and image generation",
    jobTypes: "generate-image",
    env: ["YUNWU_API_KEY", "YUNWU_BASE_URL", "YUNWU_IMAGE_MODEL"],
    liveCost: "external"
  },
  runninghub: {
    role: "IndexTTS voiceover generation",
    jobTypes: "generate-tts",
    env: [
      "RUNNINGHUB_API_KEY",
      "INDEXTTS_CLI_DIR",
      "INDEXTTS_REFERENCE_AUDIO_PATH",
      "INDEXTTS_REFERENCE_AUDIO_NAME"
    ],
    liveCost: "external"
  },
  astrochart: {
    role: "Natal chart SVG renderer",
    jobTypes: "generate-chart",
    env: [],
    liveCost: "local"
  }
};

const providerOrder: ClientProviderHealth["id"][] = [
  "deepseek",
  "yunwu",
  "runninghub",
  "astrochart"
];

export function ProviderSettingsDashboard() {
  const [health, setHealth] = useState<ClientProviderHealth[]>([]);
  const [providers, setProviders] = useState<ProviderStatus | null>(null);
  const [statusText, setStatusText] = useState("Loading provider status");
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [ttsDryRun, setTtsDryRun] = useState(true);
  const [runningMode, setRunningMode] = useState<VerifyResult["mode"] | null>(null);

  const healthById = useMemo(
    () => new Map(health.map((provider) => [provider.id, provider])),
    [health]
  );

  async function loadProviderStatus() {
    setStatusText("Refreshing provider status");
    const response = await fetch("/api/providers/check");

    if (!response.ok) {
      setStatusText("Provider status unavailable");
      return;
    }

    const payload = (await response.json()) as ProviderResponse;
    setProviders(payload.providers);
    setHealth(payload.health);
    setStatusText("Provider status synced");
  }

  useEffect(() => {
    void loadProviderStatus();
  }, []);

  async function verifyProviders(mode: VerifyResult["mode"]) {
    setRunningMode(mode);
    setStatusText(mode === "live" ? "Running live checks" : "Running local checks");
    const response = await fetch("/api/providers/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, ttsDryRun })
    });

    if (!response.ok) {
      setRunningMode(null);
      setStatusText("Provider check failed");
      return;
    }

    const payload = (await response.json()) as VerifyResult & {
      health: ClientProviderHealth[];
    };
    setHealth(payload.health);
    setVerifyResult({ mode: payload.mode, checks: payload.checks });
    setRunningMode(null);
    setStatusText("Provider check complete");
  }

  return (
    <main className="management-shell provider-settings-shell">
      <header className="management-header">
        <div>
          <span className="eyeline">Providers</span>
          <h1>Provider Settings</h1>
        </div>
        <div className="management-actions">
          <Link className="management-link management-link-secondary" href="/projects">
            Projects
          </Link>
          <Link className="management-link" href="/studio/project-ascendant-intro">
            Studio
          </Link>
        </div>
      </header>

      <section className="provider-settings-summary" aria-label="Provider summary">
        <div>
          <span>Status</span>
          <strong>{statusText}</strong>
        </div>
        <div>
          <span>Ready</span>
          <strong>{readyCount(health)} / {health.length || providerOrder.length}</strong>
        </div>
        <div>
          <span>External</span>
          <strong>{externalReadyCount(health)} ready</strong>
        </div>
        <button type="button" onClick={() => void loadProviderStatus()}>
          Refresh
        </button>
      </section>

      <section className="provider-settings-grid" aria-label="Provider readiness">
        {providerOrder.map((providerId) => {
          const provider = healthById.get(providerId);
          const guide = providerGuides[providerId];
          const enabled = providers?.[providerId] ?? provider?.ready ?? false;

          return (
            <article className="provider-settings-card" data-status={provider?.status} key={providerId}>
              <header>
                <div>
                  <span>{guide.role}</span>
                  <h2>{fallbackProviderLabel(providerId)}</h2>
                </div>
                <strong data-ready={Boolean(enabled)}>{providerStatusLabel(provider)}</strong>
              </header>
              <dl>
                <div>
                  <dt>Jobs</dt>
                  <dd>{guide.jobTypes}</dd>
                </div>
                <div>
                  <dt>Cost</dt>
                  <dd>{guide.liveCost === "external" ? "External API" : "Local"}</dd>
                </div>
                <div>
                  <dt>Config</dt>
                  <dd>{guide.env.length > 0 ? guide.env.join(", ") : "No secret required"}</dd>
                </div>
              </dl>
              {provider?.details ? <p>{provider.details}</p> : null}
            </article>
          );
        })}
      </section>

      <section className="provider-settings-console" aria-label="Provider checks">
        <header>
          <div>
            <span className="eyeline">Checks</span>
            <strong>{runningMode ? `${runningMode} check running` : "Provider checks"}</strong>
          </div>
          <label>
            <input
              checked={ttsDryRun}
              onChange={(event) => setTtsDryRun(event.currentTarget.checked)}
              type="checkbox"
            />
            IndexTTS dry run
          </label>
        </header>
        <div className="provider-settings-actions">
          <button
            disabled={Boolean(runningMode)}
            type="button"
            onClick={() => void verifyProviders("local")}
          >
            Local check
          </button>
          <button
            className="provider-live-check"
            disabled={Boolean(runningMode)}
            type="button"
            onClick={() => void verifyProviders("live")}
          >
            Live check
          </button>
        </div>
        {verifyResult ? (
          <ProviderCheckList checks={verifyResult.checks} mode={verifyResult.mode} />
        ) : (
          <div className="provider-settings-empty">
            <span>No checks yet</span>
          </div>
        )}
      </section>
    </main>
  );
}

function ProviderCheckList({ checks, mode }: { checks: ProviderCheck[]; mode: VerifyResult["mode"] }) {
  return (
    <div className="provider-check-list">
      <span>{mode} results</span>
      {checks.length === 0 ? (
        <p>No provider checks were run for this mode.</p>
      ) : (
        <ol>
          {checks.map((check, index) => (
            <li key={`${String(check.id ?? "check")}-${index}`}>
              <strong>{String(check.id ?? "provider")}</strong>
              <pre>{JSON.stringify(check, null, 2)}</pre>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function readyCount(health: ClientProviderHealth[]) {
  return health.filter((provider) => provider.ready).length;
}

function externalReadyCount(health: ClientProviderHealth[]) {
  return health.filter((provider) => provider.id !== "astrochart" && provider.ready).length;
}

function providerStatusLabel(provider: ClientProviderHealth | undefined) {
  if (!provider) {
    return "Unknown";
  }

  if (provider.status === "ready") {
    return "Ready";
  }
  if (provider.status === "needs-input") {
    return "Needs input";
  }
  if (provider.status === "unavailable") {
    return "Unavailable";
  }
  return "Not configured";
}

function fallbackProviderLabel(providerId: ClientProviderHealth["id"]) {
  if (providerId === "deepseek") {
    return "DeepSeek";
  }
  if (providerId === "yunwu") {
    return "Yunwu Image";
  }
  if (providerId === "runninghub") {
    return "RunningHub IndexTTS";
  }
  return "AstroChart SVG";
}
