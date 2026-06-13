import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  compileCanvasToAstroVideoSpec,
  jobSchema,
  libraryAssetSchema,
  videoProjectSchema,
  type AssetScope,
  type AssetUsage,
  type CanvasDocument,
  type Job,
  type JobError,
  type JobStatus,
  type JobType,
  type LibraryAsset,
  type LibraryAssetKind,
  type ProjectAssetRef,
  type VideoProject
} from "@zeroflow/core";
import { getLibraryAssetDir, getStorePath } from "./paths";
import { makeDefaultLibraryAssets, makeDefaultProject } from "./seed";

export type ProjectAsset = {
  id: string;
  projectId: string;
  name: string;
  kind: LibraryAssetKind;
  status: LibraryAsset["status"];
  path?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ImagePromptPresetKind = "style" | "type";

export type ImagePromptPreset = {
  id: string;
  kind: ImagePromptPresetKind;
  target: string;
  label: string;
  enabled: boolean;
  promptSuffix: string;
  createdAt: string;
  updatedAt: string;
};

type ProjectAssetRefRecord = ProjectAssetRef & {
  id: string;
  projectId: string;
  createdAt: string;
};

type DbStore = {
  version: 1;
  projects: VideoProject[];
  libraryAssets: LibraryAsset[];
  projectAssets: ProjectAsset[];
  projectAssetRefs: ProjectAssetRefRecord[];
  jobs: Job[];
  imagePromptPresets: ImagePromptPreset[];
};

export function ensureSeedData() {
  const store = readStore();
  let changed = false;
  const defaultProject = makeDefaultProject();

  if (!store.projects.some((project) => project.id === defaultProject.id)) {
    store.projects.push(defaultProject);
    changed = true;
  }

  for (const asset of makeDefaultLibraryAssets()) {
    if (!store.libraryAssets.some((existing) => existing.id === asset.id)) {
      store.libraryAssets.push(asset);
      changed = true;
    }
  }

  if (changed) {
    writeStore(store);
  }
}

export function listVideoProjects() {
  ensureSeedData();
  return sortItems(readStore().projects).map(clone);
}

export function getVideoProject(id: string) {
  ensureSeedData();
  const project = readStore().projects.find((item) => item.id === id);
  return project ? clone(project) : null;
}

export function createVideoProject(input: { title: string; topic: string; canvas?: CanvasDocument }) {
  ensureSeedData();
  const now = new Date().toISOString();
  const id = `project-${slugify(input.topic || input.title)}-${Date.now()}`;
  const baseCanvas = input.canvas ?? makeDefaultProject(now).canvas;
  const canvas: CanvasDocument = {
    ...baseCanvas,
    nodes: baseCanvas.nodes.map((node) =>
      node.kind === "topic"
        ? {
            ...node,
            refId: id,
            data: {
              ...node.data,
              title: "主题",
              topic: input.topic,
              description: input.title
            }
          }
        : node
    )
  };
  const project = videoProjectSchema.parse({
    id,
    title: input.title,
    topic: input.topic,
    status: "draft",
    spec: compileCanvasToAstroVideoSpec(canvas, { title: input.title }),
    canvas,
    assetRefs: [],
    createdAt: now,
    updatedAt: now
  });

  return mutateStore((store) => {
    upsertById(store.projects, project);
    return clone(project);
  });
}

export function updateVideoProject(
  id: string,
  updates: Partial<Pick<VideoProject, "title" | "topic" | "status" | "canvas" | "assetRefs">>
) {
  ensureSeedData();
  return mutateStore((store) => {
    const index = store.projects.findIndex((project) => project.id === id);
    if (index === -1) {
      return null;
    }

    const current = store.projects[index];
    if (!current) {
      return null;
    }
    const now = new Date().toISOString();
    const canvas = updates.canvas ?? current.canvas;
    const title = updates.title ?? current.title;
    const next = videoProjectSchema.parse({
      ...current,
      ...updates,
      title,
      canvas,
      spec: compileCanvasToAstroVideoSpec(canvas, { title }),
      updatedAt: now
    });

    store.projects[index] = next;
    return clone(next);
  });
}

export function deleteVideoProject(id: string) {
  ensureSeedData();
  return mutateStore((store) => {
    const exists = store.projects.some((project) => project.id === id);
    if (!exists) {
      return false;
    }

    store.projects = store.projects.filter((project) => project.id !== id);
    store.projectAssets = store.projectAssets.filter((asset) => asset.projectId !== id);
    store.projectAssetRefs = store.projectAssetRefs.filter((ref) => ref.projectId !== id);
    store.jobs = store.jobs.filter((job) => job.projectId !== id);
    return true;
  });
}

export function listLibraryAssets() {
  ensureSeedData();
  return sortItems(readStore().libraryAssets).map(clone);
}

export function getLibraryAsset(id: string) {
  ensureSeedData();
  const asset = readStore().libraryAssets.find((item) => item.id === id);
  return asset ? clone(asset) : null;
}

export function createLibraryAsset(
  input: Pick<LibraryAsset, "name" | "kind"> &
    Partial<Pick<LibraryAsset, "id" | "status" | "path" | "tags" | "reusable" | "license" | "metadata">>
) {
  ensureSeedData();
  const now = new Date().toISOString();
  const asset = libraryAssetSchema.parse({
    id: input.id ?? `asset-${slugify(input.name)}-${Date.now()}`,
    name: input.name,
    kind: input.kind,
    status: input.status ?? "ready",
    path: input.path,
    tags: input.tags ?? [],
    reusable: input.reusable ?? true,
    license: input.license,
    metadata: input.metadata ?? {},
    usageCount: 0,
    createdAt: now,
    updatedAt: now
  });

  return mutateStore((store) => {
    upsertById(store.libraryAssets, asset);
    return clone(asset);
  });
}

export function promoteProjectAssetToLibrary(input: {
  projectAssetId: string;
  name?: string;
  tags?: string[];
  reusable?: boolean;
}) {
  ensureSeedData();
  const now = new Date().toISOString();

  return mutateStore((store) => {
    const projectAsset = store.projectAssets.find((asset) => asset.id === input.projectAssetId);

    if (!projectAsset) {
      throw new Error(`Project asset not found: ${input.projectAssetId}`);
    }

    const existing = store.libraryAssets.find(
      (asset) => asset.metadata.sourceProjectAssetId === projectAsset.id
    );

    if (existing) {
      return {
        asset: clone(existing),
        promoted: false
      };
    }

    const name = input.name?.trim() || projectAsset.name;
    const id = `asset-${slugify(name)}-${Date.now()}`;
    const path = copyProjectAssetToLibrary(projectAsset.path, id);
    const asset = libraryAssetSchema.parse({
      id,
      name,
      kind: projectAsset.kind,
      status: projectAsset.status,
      path,
      tags: normalizeTags(input.tags, projectAsset.kind),
      reusable: input.reusable ?? true,
      metadata: {
        ...projectAsset.metadata,
        source: "project-asset-promotion",
        sourceProjectAssetId: projectAsset.id,
        sourceProjectId: projectAsset.projectId,
        sourceProjectAssetName: projectAsset.name,
        sourceProjectAssetPath: projectAsset.path,
        promotedAt: now
      },
      usageCount: 0,
      createdAt: now,
      updatedAt: now
    });

    store.libraryAssets.push(asset);
    return {
      asset: clone(asset),
      promoted: true
    };
  });
}

export function listProjectAssets(projectId: string) {
  ensureSeedData();
  return sortItems(readStore().projectAssets.filter((asset) => asset.projectId === projectId)).map(
    clone
  );
}

export function getProjectAsset(assetId: string) {
  ensureSeedData();
  const asset = readStore().projectAssets.find((item) => item.id === assetId);
  return asset ? clone(asset) : null;
}

export function createProjectAsset(input: {
  projectId: string;
  name: string;
  kind: LibraryAssetKind;
  status?: LibraryAsset["status"];
  path?: string;
  metadata?: Record<string, unknown>;
}) {
  ensureSeedData();
  const now = new Date().toISOString();
  const asset: ProjectAsset = {
    id: `project-asset-${slugify(input.name)}-${Date.now()}`,
    projectId: input.projectId,
    name: input.name,
    kind: input.kind,
    status: input.status ?? "ready",
    path: input.path,
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now
  };

  return mutateStore((store) => {
    store.projectAssets.push(asset);
    return clone(asset);
  });
}

export function addProjectAssetRef(
  projectId: string,
  input: {
    assetId: string;
    assetScope: AssetScope;
    usage: AssetUsage;
    sceneId?: string;
    canvasNodeId?: string;
  }
) {
  ensureSeedData();
  const now = new Date().toISOString();
  const refId = `ref-${randomUUID()}`;

  return mutateStore((store) => {
    store.projectAssetRefs.push({
      id: refId,
      projectId,
      assetId: input.assetId,
      assetScope: input.assetScope,
      usage: input.usage,
      sceneId: input.sceneId,
      canvasNodeId: input.canvasNodeId,
      createdAt: now
    });

    if (input.assetScope === "library") {
      const asset = store.libraryAssets.find((item) => item.id === input.assetId);
      if (asset) {
        asset.usageCount += 1;
        asset.updatedAt = now;
      }
    }

    const project = store.projects.find((item) => item.id === projectId);
    if (project) {
      project.assetRefs.push({
        assetId: input.assetId,
        assetScope: input.assetScope,
        usage: input.usage,
        sceneId: input.sceneId,
        canvasNodeId: input.canvasNodeId
      });
      project.spec = compileCanvasToAstroVideoSpec(project.canvas, { title: project.title });
      project.updatedAt = now;
    }

    return { id: refId, createdAt: now };
  });
}

export function listImagePromptPresets() {
  ensureSeedData();
  return sortItems(readStore().imagePromptPresets).map(clone);
}

export function upsertImagePromptPresets(
  input: Array<{
    id: string;
    kind: ImagePromptPresetKind;
    target: string;
    label: string;
    enabled?: boolean;
    promptSuffix?: string;
  }>
) {
  ensureSeedData();
  const now = new Date().toISOString();

  return mutateStore((store) => {
    const nextPresets = input.map((preset) => {
      const existing = store.imagePromptPresets.find((item) => item.id === preset.id);
      return normalizeImagePromptPreset({
        ...existing,
        ...preset,
        enabled: preset.enabled ?? existing?.enabled ?? false,
        promptSuffix: preset.promptSuffix ?? existing?.promptSuffix ?? "",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });
    });

    for (const preset of nextPresets) {
      upsertById(store.imagePromptPresets, preset);
    }

    return nextPresets.map(clone);
  });
}

export function getImagePromptPresetAdditions(input: {
  imageStyle?: string;
}) {
  ensureSeedData();
  const ids = new Set([`style:${input.imageStyle ?? ""}`].filter((id) => !id.endsWith(":")));

  return readStore()
    .imagePromptPresets.filter(
      (preset) => ids.has(preset.id) && preset.enabled && preset.promptSuffix.trim().length > 0
    )
    .map((preset) => ({
      id: preset.id,
      kind: preset.kind,
      target: preset.target,
      label: preset.label,
      promptSuffix: preset.promptSuffix.trim()
    }));
}

export function listJobs(projectId?: string) {
  ensureSeedData();
  const jobs = projectId
    ? readStore().jobs.filter((job) => job.projectId === projectId)
    : readStore().jobs;

  return sortItems(jobs).map(clone);
}

export function getJob(id: string) {
  ensureSeedData();
  const job = readStore().jobs.find((item) => item.id === id);
  return job ? clone(job) : null;
}

export function createJob(input: {
  projectId: string;
  type: JobType;
  canvasNodeId?: string;
  input?: Record<string, unknown>;
  maxAttempts?: number;
}) {
  ensureSeedData();
  const now = new Date().toISOString();
  const job = jobSchema.parse({
    id: `job-${randomUUID()}`,
    projectId: input.projectId,
    canvasNodeId: input.canvasNodeId,
    type: input.type,
    status: "pending",
    input: input.input ?? {},
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 3,
    createdAt: now,
    updatedAt: now
  });

  return mutateStore((store) => {
    store.jobs.push(job);
    setCanvasNodeStatus(store, job.projectId, job.canvasNodeId, "generating", now);
    return clone(job);
  });
}

export function retryJob(id: string) {
  ensureSeedData();

  return mutateStore((store) => {
    const index = store.jobs.findIndex((job) => job.id === id);
    if (index === -1) {
      return null;
    }

    const current = store.jobs[index];
    if (!current) {
      return null;
    }

    if (current.status !== "failed" && current.status !== "cancelled") {
      return clone(current);
    }

    if (current.status === "failed" && current.attempts >= current.maxAttempts) {
      return clone(current);
    }

    const now = new Date().toISOString();
    const next = jobSchema.parse({
      ...current,
      status: "pending",
      output: undefined,
      error: undefined,
      updatedAt: now
    });
    store.jobs[index] = next;
    setCanvasNodeStatus(store, next.projectId, next.canvasNodeId, "generating", now);
    return clone(next);
  });
}

export function cancelJob(id: string) {
  ensureSeedData();

  return mutateStore((store) => {
    const index = store.jobs.findIndex((job) => job.id === id);
    if (index === -1) {
      return null;
    }

    const current = store.jobs[index];
    if (!current) {
      return null;
    }

    if (current.status === "succeeded" || current.status === "cancelled") {
      return clone(current);
    }

    const now = new Date().toISOString();
    const next = jobSchema.parse({
      ...current,
      status: "cancelled",
      error: {
        type: "user-fixable",
        message: "Job cancelled by user",
        retryable: true
      },
      updatedAt: now
    });
    store.jobs[index] = next;
    setCanvasNodeStatus(store, next.projectId, next.canvasNodeId, "idle", now);
    return clone(next);
  });
}

export function updateJob(
  id: string,
  updates: {
    status?: JobStatus;
    output?: Record<string, unknown>;
    error?: JobError;
    incrementAttempts?: boolean;
    input?: Record<string, unknown>;
  }
) {
  ensureSeedData();

  return mutateStore((store) => {
    const index = store.jobs.findIndex((job) => job.id === id);
    if (index === -1) {
      return null;
    }

    const current = store.jobs[index];
    if (!current) {
      return null;
    }
    const now = new Date().toISOString();
    const next = jobSchema.parse({
      ...current,
      status: updates.status ?? current.status,
      output: updates.output ?? current.output,
      input: updates.input ?? current.input,
      error: updates.error,
      attempts: current.attempts + (updates.incrementAttempts ? 1 : 0),
      updatedAt: now
    });
    store.jobs[index] = next;

    if (next.status === "succeeded") {
      setCanvasNodeStatus(store, next.projectId, next.canvasNodeId, "ready", now);
    } else if (next.status === "failed") {
      setCanvasNodeStatus(store, next.projectId, next.canvasNodeId, "failed", now);
    }

    return clone(next);
  });
}

export function updateCanvasNodeStatus(
  projectId: string,
  canvasNodeId: string | undefined,
  status: "idle" | "generating" | "ready" | "failed"
) {
  ensureSeedData();
  return mutateStore((store) => {
    setCanvasNodeStatus(store, projectId, canvasNodeId, status, new Date().toISOString());
  });
}

function readStore(): DbStore {
  const storePath = getStorePath();
  if (!fs.existsSync(storePath)) {
    return emptyStore();
  }

  const raw = fs.readFileSync(storePath, "utf8");
  if (!raw.trim()) {
    return emptyStore();
  }

  const parsed = JSON.parse(raw) as Partial<DbStore>;
  return normalizeStore(parsed);
}

function writeStore(store: DbStore) {
  const storePath = getStorePath();
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, `${JSON.stringify(normalizeStore(store), null, 2)}\n`, "utf8");
}

function mutateStore<T>(mutator: (store: DbStore) => T) {
  const store = readStore();
  const result = mutator(store);
  writeStore(store);
  return result;
}

function emptyStore(): DbStore {
  return {
    version: 1,
    projects: [],
    libraryAssets: [],
    projectAssets: [],
    projectAssetRefs: [],
    jobs: [],
    imagePromptPresets: []
  };
}

function normalizeStore(store: Partial<DbStore>): DbStore {
  return {
    version: 1,
    projects: (store.projects ?? []).map((project) => videoProjectSchema.parse(project)),
    libraryAssets: (store.libraryAssets ?? []).map((asset) => libraryAssetSchema.parse(asset)),
    projectAssets: (store.projectAssets ?? []).map((asset) => ({
      ...asset,
      metadata: asset.metadata ?? {}
    })) as ProjectAsset[],
    projectAssetRefs: (store.projectAssetRefs ?? []) as ProjectAssetRefRecord[],
    jobs: (store.jobs ?? []).map((job) => jobSchema.parse(job)),
    imagePromptPresets: (store.imagePromptPresets ?? []).map(normalizeImagePromptPreset)
  };
}

function normalizeImagePromptPreset(preset: Partial<ImagePromptPreset>): ImagePromptPreset {
  const now = new Date().toISOString();
  const id = typeof preset.id === "string" ? preset.id : "";
  const kind = preset.kind === "type" ? "type" : "style";
  const target = typeof preset.target === "string" ? preset.target : id.split(":")[1] ?? "";
  const label = typeof preset.label === "string" ? preset.label : target;
  const promptSuffix = typeof preset.promptSuffix === "string" ? preset.promptSuffix : "";

  return {
    id,
    kind,
    target,
    label,
    enabled: Boolean(preset.enabled),
    promptSuffix,
    createdAt: typeof preset.createdAt === "string" ? preset.createdAt : now,
    updatedAt: typeof preset.updatedAt === "string" ? preset.updatedAt : now
  };
}

function setCanvasNodeStatus(
  store: DbStore,
  projectId: string,
  canvasNodeId: string | undefined,
  status: "idle" | "generating" | "ready" | "failed",
  now: string
) {
  if (!canvasNodeId) {
    return;
  }

  const project = store.projects.find((item) => item.id === projectId);
  if (!project) {
    return;
  }

  project.canvas = {
    ...project.canvas,
    nodes: project.canvas.nodes.map((node) =>
      node.id === canvasNodeId ? { ...node, status } : node
    )
  };
  project.spec = compileCanvasToAstroVideoSpec(project.canvas, { title: project.title });
  project.updatedAt = now;
}

function upsertById<T extends { id: string }>(items: T[], item: T) {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) {
    items.push(item);
  } else {
    items[index] = item;
  }
}

function sortByUpdatedAt(left: { updatedAt: string }, right: { updatedAt: string }) {
  return right.updatedAt.localeCompare(left.updatedAt);
}

function sortItems<T extends { updatedAt: string }>(items: T[]) {
  return [...items].sort(sortByUpdatedAt);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function copyProjectAssetToLibrary(sourcePath: string | undefined, libraryAssetId: string) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return sourcePath;
  }

  const extension = path.extname(sourcePath);
  const targetDir = path.join(getLibraryAssetDir(), "assets");
  const targetPath = path.join(targetDir, `${libraryAssetId}${extension}`);

  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

function normalizeTags(tags: string[] | undefined, kind: LibraryAssetKind) {
  const unique = new Set<string>([kind]);

  for (const tag of tags ?? []) {
    const normalized = tag.trim();

    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

function slugify(value: string) {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return ascii || "astro-video";
}
