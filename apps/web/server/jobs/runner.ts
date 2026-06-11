import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  defaultScriptPromptProfileId,
  type AstroVideoSpec,
  type CanvasDocument,
  type CanvasNode,
  type Job,
  type SceneSpec
} from "@zeroflow/core";
import {
  addProjectAssetRef,
  createProjectAsset,
  getJob,
  getProjectAssetDir,
  getWorkspaceRoot,
  getVideoProject,
  listJobs,
  listLibraryAssets,
  promoteProjectAssetToLibrary,
  updateJob,
  updateVideoProject
} from "@zeroflow/db";
import { getProviders } from "@zeroflow/providers";
import type { BirthChartInput } from "@zeroflow/providers";

const defaultTargetDurationSec = 60;

export async function runJob(jobId: string) {
  const job = getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  if (job.status === "cancelled" || job.status === "succeeded") {
    return job;
  }

  if (job.status === "failed" && job.attempts >= job.maxAttempts) {
    return job;
  }

  updateJob(job.id, { status: "running", incrementAttempts: true });

  try {
    const output = await runJobByType(job);
    return updateJob(job.id, { status: "succeeded", output });
  } catch (error) {
    return updateJob(job.id, {
      status: "failed",
      error: {
        type: "retryable",
        message: error instanceof Error ? error.message : "Unknown job error",
        retryable: true
      }
    });
  }
}

export async function runPendingJobs(input: { projectId?: string; limit?: number } = {}) {
  const limit = Math.max(1, Math.min(input.limit ?? 5, 20));
  const pendingJobs = listJobs(input.projectId)
    .filter((job) => job.status === "pending")
    .slice(0, limit);
  const results = [];

  for (const job of pendingJobs) {
    results.push(await runJob(job.id));
  }

  return {
    processed: results.length,
    jobs: results
  };
}

async function runJobByType(job: Job): Promise<Record<string, unknown>> {
  switch (job.type) {
    case "generate-script":
      return generateScript(job);
    case "create-manual-script":
      return createManualScript(job);
    case "create-structure-node":
      return createStructureNode(job);
    case "generate-chapters":
      return generateChapters(job);
    case "expand-chapter-scenes":
      return expandChapterScenes(job);
    case "generate-storyboard":
      return generateStoryboard(job);
    case "resolve-assets":
      return resolveAssets(job);
    case "generate-image":
      return generateImage(job);
    case "generate-tts":
      return generateTts(job);
    case "generate-chart":
      return generateChart(job);
    case "align-captions":
      return alignCaptions(job);
    case "create-d3-node":
      return createSceneVisualNode(job, "d3");
    case "create-three-node":
      return createSceneVisualNode(job, "three");
    case "create-composition-node":
      return createCompositionNode(job);
    case "create-preview-node":
      return createPreviewNode(job);
    case "create-export-node":
      return createExportNode(job);
    case "export-visual-asset":
      return exportVisualAsset(job);
    case "render-preview":
    case "render-video":
      return renderProjectMedia(job);
    case "promote-asset-to-library":
      return promoteAssetToLibrary(job);
  }
}

async function generateScript(job: Job) {
  const project = requireProject(job.projectId);
  const topicNode = findNode(project.canvas, "topic");
  const sourceNode = job.canvasNodeId
    ? project.canvas.nodes.find((node) => node.id === job.canvasNodeId)
    : undefined;
  const scriptNode = findNode(project.canvas, "script");
  const topic =
    stringInput(job.input.topic) ??
    stringData(sourceNode, "topic") ??
    stringData(topicNode, "topic") ??
    project.topic;
  const model =
    stringInput(job.input.model) ??
    stringData(sourceNode, "aiModel") ??
    stringData(topicNode, "aiModel") ??
    stringData(scriptNode, "aiModel");
  const scriptProfileId =
    stringInput(job.input.scriptProfileId) ??
    stringData(sourceNode, "scriptProfileId") ??
    stringData(topicNode, "scriptProfileId") ??
    stringData(scriptNode, "scriptProfileId") ??
    defaultScriptPromptProfileId;
  const result = await getProviders().llm.generateScript({
    topic,
    model,
    scriptProfileId,
    targetDurationSec:
      numberInput(job.input.targetDurationSec) ??
      numberData(sourceNode, "targetDurationSec") ??
      numberData(scriptNode, "targetDurationSec") ??
      defaultTargetDurationSec,
    tone:
      stringInput(job.input.tone) ??
      stringData(sourceNode, "tone") ??
      stringData(scriptNode, "tone"),
    audience: stringInput(job.input.audience)
  });
  const canvas = upsertScriptNode(project.canvas, sourceNode ?? topicNode, scriptNode, {
    title: "文案",
    description: result.data.hook,
    scriptText: result.data.scriptText,
    tone: result.data.tone,
    targetDurationSec:
      numberInput(job.input.targetDurationSec) ??
      numberData(sourceNode, "targetDurationSec") ??
      result.data.targetDurationSec,
    sceneCount: numberData(scriptNode, "sceneCount") ?? 5,
    aiModel: model,
    scriptProfileId,
    provider: result.provider,
    usedMock: result.usedMock
  });

  updateVideoProject(project.id, {
    title: result.data.title,
    topic,
    canvas
  });

  return {
    provider: result.provider,
    usedMock: result.usedMock,
    scriptNodeId: scriptNode?.id ?? "node-script",
    script: result.data
  };
}

async function createManualScript(job: Job) {
  const project = requireProject(job.projectId);
  const topicNode = findNode(project.canvas, "topic");
  const sourceNode = job.canvasNodeId
    ? project.canvas.nodes.find((node) => node.id === job.canvasNodeId)
    : undefined;
  const scriptNode = findNode(project.canvas, "script");
  const topic =
    stringInput(job.input.topic) ??
    stringData(sourceNode, "topic") ??
    stringData(topicNode, "topic") ??
    project.topic;
  const scriptText =
    stringInput(job.input.scriptText) ??
    stringData(scriptNode, "scriptText") ??
    "";
  const targetDurationSec =
    numberInput(job.input.targetDurationSec) ??
    numberData(sourceNode, "targetDurationSec") ??
    numberData(scriptNode, "targetDurationSec") ??
    defaultTargetDurationSec;
  const canvas = upsertScriptNode(project.canvas, sourceNode ?? topicNode, scriptNode, {
    title: "文案",
    description: scriptText ? "手写口播文案" : "",
    scriptText,
    targetDurationSec,
    sceneCount: numberData(scriptNode, "sceneCount") ?? 5,
    aiModel: stringData(sourceNode, "aiModel") ?? stringData(scriptNode, "aiModel"),
    scriptProfileId:
      stringData(sourceNode, "scriptProfileId") ??
      stringData(topicNode, "scriptProfileId") ??
      stringData(scriptNode, "scriptProfileId") ??
      defaultScriptPromptProfileId,
    provider: "manual",
    usedMock: false
  });

  updateVideoProject(project.id, {
    topic,
    canvas
  });

  return {
    provider: "manual",
    usedMock: false,
    scriptNodeId: scriptNode?.id ?? "node-script",
    script: {
      title: "文案",
      hook: "",
      scriptText,
      tone: "手写",
      targetDurationSec
    }
  };
}

async function generateStoryboard(job: Job) {
  const project = requireProject(job.projectId);
  const sourceNode = job.canvasNodeId
    ? project.canvas.nodes.find((node) => node.id === job.canvasNodeId)
    : undefined;
  const scriptNode = findNode(project.canvas, "script");
  const storyboardNode = findNode(project.canvas, "storyboard");
  const scriptText =
    stringInput(job.input.scriptText) ??
    stringData(sourceNode, "scriptText") ??
    stringData(scriptNode, "scriptText") ??
    project.spec.scenes.map((scene) => scene.narration).join("\n");
  const sceneCount =
    numberInput(job.input.sceneCount) ??
    numberData(sourceNode, "sceneCount") ??
    numberData(storyboardNode, "sceneCount") ??
    5;
  const model =
    stringInput(job.input.model) ??
    stringData(sourceNode, "aiModel") ??
    stringData(scriptNode, "aiModel") ??
    stringData(storyboardNode, "aiModel");
  const result = await getProviders().llm.generateStoryboard({
    scriptText,
    sceneCount,
    model,
    targetDurationSec:
      numberInput(job.input.targetDurationSec) ??
      numberData(sourceNode, "targetDurationSec") ??
      numberData(scriptNode, "targetDurationSec") ??
      numberData(storyboardNode, "targetDurationSec") ??
      defaultTargetDurationSec
  });
  const canvas = applyStoryboard(project.canvas, sourceNode ?? scriptNode ?? storyboardNode, result.data.scenes, {
    aiModel: model
  });

  updateVideoProject(project.id, { canvas });

  return {
    provider: result.provider,
    usedMock: result.usedMock,
    sceneCount: result.data.scenes.length,
    sceneNodeIds: result.data.scenes.map((_, index) => `node-scene-generated-${index + 1}`),
    scenes: result.data.scenes
  };
}

async function createStructureNode(job: Job) {
  const project = requireProject(job.projectId);
  const sourceNode = job.canvasNodeId
    ? project.canvas.nodes.find((node) => node.id === job.canvasNodeId)
    : undefined;
  const scriptNode = sourceNode?.kind === "script" ? sourceNode : findNode(project.canvas, "script");
  const structureNode = findNode(project.canvas, "structure");
  const targetDurationSec =
    numberInput(job.input.targetDurationSec) ??
    numberData(sourceNode, "targetDurationSec") ??
    numberData(scriptNode, "targetDurationSec") ??
    defaultTargetDurationSec;
  const chapterCount =
    numberInput(job.input.chapterCount) ??
    numberData(structureNode, "chapterCount") ??
    getDefaultChapterCount(targetDurationSec);
  const scriptText =
    stringInput(job.input.scriptText) ??
    stringData(scriptNode, "scriptText") ??
    project.spec.scenes.map((scene) => scene.narration).join("\n");
  const canvas = upsertStructureNode(project.canvas, scriptNode ?? sourceNode, structureNode, {
    title: "结构",
    description:
      targetDurationSec <= 60
        ? "短视频可以直接生成分镜"
        : `长视频先拆成 ${chapterCount} 个章节，再逐章展开分镜`,
    scriptText,
    targetDurationSec,
    chapterCount,
    sceneCount: numberData(structureNode, "sceneCount") ?? getDefaultSceneCount(targetDurationSec),
    sourceScriptNodeId: scriptNode?.id,
    aiModel: stringData(sourceNode, "aiModel") ?? stringData(scriptNode, "aiModel")
  });

  updateVideoProject(project.id, { canvas });

  return {
    structureNodeId: structureNode?.id ?? "node-structure",
    chapterCount,
    targetDurationSec
  };
}

async function generateChapters(job: Job) {
  const project = requireProject(job.projectId);
  const sourceNode = job.canvasNodeId
    ? project.canvas.nodes.find((node) => node.id === job.canvasNodeId)
    : undefined;
  const structureNode = sourceNode?.kind === "structure" ? sourceNode : findNode(project.canvas, "structure");
  const scriptNode = findNode(project.canvas, "script");
  const targetDurationSec =
    numberInput(job.input.targetDurationSec) ??
    numberData(sourceNode, "targetDurationSec") ??
    numberData(structureNode, "targetDurationSec") ??
    numberData(scriptNode, "targetDurationSec") ??
    defaultTargetDurationSec;
  const chapterCount =
    numberInput(job.input.chapterCount) ??
    numberData(sourceNode, "chapterCount") ??
    numberData(structureNode, "chapterCount") ??
    getDefaultChapterCount(targetDurationSec);
  const scriptText =
    stringInput(job.input.scriptText) ??
    stringData(structureNode, "scriptText") ??
    stringData(scriptNode, "scriptText") ??
    project.spec.scenes.map((scene) => scene.narration).join("\n");
  const chapters = createChapterPlan(scriptText, chapterCount, targetDurationSec);
  const canvas = applyChapters(project.canvas, structureNode ?? scriptNode, chapters, {
    targetDurationSec,
    aiModel: stringData(sourceNode, "aiModel") ?? stringData(scriptNode, "aiModel")
  });

  updateVideoProject(project.id, { canvas });

  return {
    chapterCount: chapters.length,
    chapterNodeIds: chapters.map((_, index) => `node-chapter-${index + 1}`),
    chapters
  };
}

async function expandChapterScenes(job: Job) {
  const project = requireProject(job.projectId);
  const sourceNode = job.canvasNodeId
    ? project.canvas.nodes.find((node) => node.id === job.canvasNodeId)
    : undefined;

  if (!sourceNode || sourceNode.kind !== "chapter") {
    throw new Error("Chapter node is required to expand chapter scenes.");
  }

  const chapterScriptText =
    stringInput(job.input.scriptText) ??
    stringData(sourceNode, "chapterScriptText") ??
    stringData(sourceNode, "summary") ??
    stringData(sourceNode, "description") ??
    "";
  const targetDurationSec =
    numberInput(job.input.targetDurationSec) ??
    numberData(sourceNode, "durationSec") ??
    numberData(sourceNode, "targetDurationSec") ??
    defaultTargetDurationSec;
  const sceneCount =
    numberInput(job.input.sceneCount) ??
    numberData(sourceNode, "sceneCount") ??
    getDefaultSceneCount(targetDurationSec);
  const model = stringInput(job.input.model) ?? stringData(sourceNode, "aiModel");
  const result = await getProviders().llm.generateStoryboard({
    scriptText: chapterScriptText,
    sceneCount,
    model,
    targetDurationSec
  });
  const groupId = `chapter-${safeId(sourceNode.id)}`;
  const canvas = applyStoryboard(project.canvas, sourceNode, result.data.scenes, {
    aiModel: model,
    groupId,
    sourceChapterNodeId: sourceNode.id,
    baseX: sourceNode.position.x + 360,
    baseY: sourceNode.position.y
  });

  updateVideoProject(project.id, { canvas });

  return {
    provider: result.provider,
    usedMock: result.usedMock,
    chapterNodeId: sourceNode.id,
    sceneCount: result.data.scenes.length,
    sceneNodeIds: result.data.scenes.map((_, index) => `node-${groupId}-scene-${index + 1}`),
    scenes: result.data.scenes
  };
}

async function resolveAssets(job: Job) {
  const project = requireProject(job.projectId);
  const libraryAssets = listLibraryAssets();
  const reusable = libraryAssets.filter((asset) => asset.reusable && asset.status === "ready");

  return {
    projectId: project.id,
    reusableAssets: reusable.map((asset) => ({
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      tags: asset.tags
    }))
  };
}

async function generateImage(job: Job) {
  const project = requireProject(job.projectId);
  const sourceNode = job.canvasNodeId
    ? project.canvas.nodes.find((node) => node.id === job.canvasNodeId)
    : undefined;
  const sceneNode = sourceNode?.kind === "scene" ? sourceNode : undefined;
  let workingCanvas = project.canvas;
  let imageNode = sourceNode?.kind === "image" ? sourceNode : undefined;
  const inputModel =
    stringInput(job.input.model) ??
    stringData(sourceNode, "imageModel") ??
    stringData(sourceNode, "aiModel");

  if (!imageNode && sceneNode) {
    const upserted = upsertSceneResourceNode(workingCanvas, sceneNode, "image", {
      generatedBy: "generate-image",
      title: `插画 ${sceneResourceTitle(sceneNode)}`,
      description: sceneResourceDescription(sceneNode),
      durationSec: numberData(sceneNode, "durationSec") ?? 6,
      prompt:
        stringInput(job.input.prompt) ??
        stringData(sceneNode, "visualPrompt") ??
        stringData(sceneNode, "description") ??
        "simple educational astrology line drawing",
      aiModel: inputModel
    });
    workingCanvas = upserted.canvas;
    imageNode = upserted.node;
  }

  imageNode ??= findNode(workingCanvas, "image");
  const prompt =
    stringInput(job.input.prompt) ??
    stringData(imageNode, "prompt") ??
    stringData(sceneNode, "visualPrompt") ??
    "simple educational astrology line drawing";
  const model = inputModel ?? stringData(imageNode, "aiModel");
  const outputPath = path.join(getProjectAssetDir(project.id), `${job.id}.png`);
  const result = await getProviders().image.generateImage({
    prompt,
    model,
    outputPath,
    size: "1024x1536"
  });
  const assetPath = result.usedMock
    ? path.join(getProjectAssetDir(project.id), `${job.id}.svg`)
    : (result.data.assetPath ?? outputPath);

  if (result.usedMock) {
    await writeMockSvg(assetPath, prompt);
  }

  const asset = createProjectAsset({
    projectId: project.id,
    name: `插画 ${new Date().toLocaleString("zh-CN")}`,
    kind: "image",
    path: assetPath,
    metadata: {
      prompt,
      model,
      provider: result.provider,
      usedMock: result.usedMock,
      url: result.data.url
    }
  });
  addProjectAssetRef(project.id, {
    assetId: asset.id,
    assetScope: "project",
    usage: "scene",
    canvasNodeId: imageNode?.id
  });

  const assetUrl = `/api/project-asset?assetId=${encodeURIComponent(asset.id)}`;

  if (imageNode) {
    updateVideoProject(project.id, {
      canvas: updateNodeData(workingCanvas, imageNode.id, {
        refId: asset.id,
        assetPath,
        assetId: asset.id,
        assetUrl,
        provider: result.provider,
        usedMock: result.usedMock,
        prompt,
        aiModel: model
      })
    });
  }

  return {
    provider: result.provider,
    usedMock: result.usedMock,
    assetId: asset.id,
    assetPath,
    assetUrl,
    imageNodeId: imageNode?.id,
    model,
    asset
  };
}

async function generateTts(job: Job) {
  const project = requireProject(job.projectId);
  const sourceNode = job.canvasNodeId
    ? project.canvas.nodes.find((node) => node.id === job.canvasNodeId)
    : undefined;
  const sceneNode = sourceNode?.kind === "scene" ? sourceNode : undefined;
  let workingCanvas = project.canvas;
  let voiceNode = sourceNode?.kind === "voice" ? sourceNode : undefined;
  const narrationText =
    stringInput(job.input.text) ??
    stringData(sceneNode, "narration") ??
    stringData(sceneNode, "description") ??
    project.spec.scenes.map((scene) => scene.narration).join("\n");

  if (!voiceNode && sceneNode) {
    const upserted = upsertSceneResourceNode(workingCanvas, sceneNode, "voice", {
      generatedBy: "generate-tts",
      title: `配音 ${sceneResourceTitle(sceneNode)}`,
      description: narrationText,
      narration: narrationText,
      text: narrationText,
      durationSec: numberData(sceneNode, "durationSec") ?? 6,
      speed: 1,
      volume: 1
    });
    workingCanvas = upserted.canvas;
    voiceNode = upserted.node;
  }

  voiceNode ??= findNode(workingCanvas, "voice");
  const outputPath = path.join(getProjectAssetDir(project.id), `${job.id}.mp3`);
  const text =
    stringInput(job.input.text) ??
    stringData(voiceNode, "text") ??
    stringData(voiceNode, "narration") ??
    narrationText;
  const result = await getProviders().tts.generateVoiceover({
    text,
    outputPath,
    referenceAudioPath: stringInput(job.input.referenceAudioPath),
    referenceAudioName: stringInput(job.input.referenceAudioName),
    chunkMax: numberInput(job.input.chunkMax) ?? 220,
    pauseMs: numberInput(job.input.pauseMs) ?? 180,
    dryRun: Boolean(job.input.dryRun)
  });
  const audioPath = result.usedMock
    ? path.join(getProjectAssetDir(project.id), `${job.id}.wav`)
    : result.data.audioPath;

  if (result.usedMock) {
    const mockDurationSec = Math.max(2, Math.min(12, Math.ceil(text.length / 28)));
    await writeMockWav(audioPath, mockDurationSec);
    if (result.data.manifestPath) {
      await writeMockTtsManifest(result.data.manifestPath, text, audioPath, mockDurationSec);
    }
  }

  const asset = createProjectAsset({
    projectId: project.id,
    name: `配音 ${new Date().toLocaleString("zh-CN")}`,
    kind: "audio",
    status: "ready",
    path: audioPath,
    metadata: {
      provider: result.provider,
      usedMock: result.usedMock,
      manifestPath: result.data.manifestPath
    }
  });
  addProjectAssetRef(project.id, {
    assetId: asset.id,
    assetScope: "project",
    usage: "narration",
    canvasNodeId: voiceNode?.id
  });
  const assetUrl = `/api/project-asset?assetId=${encodeURIComponent(asset.id)}`;

  if (voiceNode) {
    updateVideoProject(project.id, {
      canvas: updateNodeData(workingCanvas, voiceNode.id, {
        refId: asset.id,
        assetId: asset.id,
        assetPath: audioPath,
        assetUrl,
        provider: result.provider,
        usedMock: result.usedMock,
        manifestPath: result.data.manifestPath
      })
    });
  }

  return {
    provider: result.provider,
    usedMock: result.usedMock,
    assetId: asset.id,
    assetPath: audioPath,
    assetUrl,
    audioPath,
    voiceNodeId: voiceNode?.id,
    asset,
    manifestPath: result.data.manifestPath
  };
}

async function generateChart(job: Job) {
  const project = requireProject(job.projectId);
  const sourceNode = job.canvasNodeId
    ? project.canvas.nodes.find((node) => node.id === job.canvasNodeId)
    : undefined;
  const sceneNode = sourceNode?.kind === "scene" ? sourceNode : undefined;
  let workingCanvas = project.canvas;
  let chartNode = sourceNode?.kind === "chart" ? sourceNode : undefined;

  if (!chartNode && sceneNode) {
    const upserted = upsertSceneResourceNode(workingCanvas, sceneNode, "chart", {
      generatedBy: "generate-chart",
      title: `星盘 ${sceneResourceTitle(sceneNode)}`,
      description: sceneResourceDescription(sceneNode),
      narration: stringData(sceneNode, "narration") ?? sceneResourceDescription(sceneNode),
      durationSec: numberData(sceneNode, "durationSec") ?? 6,
      birthDate: stringInput(job.input.birthDate) ?? "1990-01-01",
      birthTime: stringInput(job.input.birthTime) ?? "12:00",
      timezoneOffsetMinutes: numberInput(job.input.timezoneOffsetMinutes) ?? 480,
      latitude: numberInput(job.input.latitude) ?? 39.9042,
      longitude: numberInput(job.input.longitude) ?? 116.4074,
      placeName: stringInput(job.input.placeName) ?? "Beijing",
      houseSystem: stringInput(job.input.houseSystem) ?? "equal",
      chartType: stringInput(job.input.chartType) ?? "natal",
      highlight: stringInput(job.input.highlight) ?? "ascendant"
    });
    workingCanvas = upserted.canvas;
    chartNode = upserted.node;
  }

  chartNode ??= findNode(workingCanvas, "chart");
  const outputPath = path.join(getProjectAssetDir(project.id), `${job.id}.svg`);
  const birth = birthInputFromJob(job, chartNode);
  const result = await getProviders().chart.renderNatalChart({
    outputPath,
    birth,
    highlight: stringData(chartNode, "highlight") ?? "ascendant"
  });
  const asset = createProjectAsset({
    projectId: project.id,
    name: "星盘 SVG",
    kind: "svg",
    path: result.data.assetPath,
    metadata: {
      provider: result.provider,
      chartType: stringData(chartNode, "chartType") ?? "natal",
      highlight: stringData(chartNode, "highlight") ?? "ascendant",
      usedSampleData: result.data.usedSampleData,
      source: result.data.source,
      birth: result.data.birth,
      positions: result.data.positions,
      houses: result.data.houses,
      calculation: result.data.calculation
    }
  });
  addProjectAssetRef(project.id, {
    assetId: asset.id,
    assetScope: "project",
    usage: "chart",
    canvasNodeId: chartNode?.id
  });

  const assetUrl = `/api/project-asset?assetId=${encodeURIComponent(asset.id)}`;

  if (chartNode) {
    updateVideoProject(project.id, {
      canvas: updateNodeData(workingCanvas, chartNode.id, {
        refId: asset.id,
        assetPath: result.data.assetPath,
        assetId: asset.id,
        assetUrl,
        provider: result.provider,
        chartType: stringData(chartNode, "chartType") ?? "natal",
        highlight: stringData(chartNode, "highlight") ?? "ascendant",
        usedSampleData: result.data.usedSampleData,
        source: result.data.source,
        birth: result.data.birth,
        positions: result.data.positions,
        houses: result.data.houses,
        calculation: result.data.calculation
      })
    });
  }

  return {
    provider: result.provider,
    usedMock: result.usedMock,
    assetId: asset.id,
    assetPath: result.data.assetPath,
    usedSampleData: result.data.usedSampleData,
    assetUrl,
    chartNodeId: chartNode?.id,
    source: result.data.source,
    birth: result.data.birth,
    positions: result.data.positions,
    houses: result.data.houses,
    calculation: result.data.calculation,
    asset
  };
}

async function createSceneVisualNode(job: Job, kind: "d3" | "three") {
  const project = requireProject(job.projectId);
  const sceneNode = job.canvasNodeId
    ? project.canvas.nodes.find((node) => node.id === job.canvasNodeId)
    : undefined;

  if (!sceneNode || sceneNode.kind !== "scene") {
    throw new Error("A scene node is required to create a visual resource node");
  }

  const upserted = upsertSceneResourceNode(
    project.canvas,
    sceneNode,
    kind,
    kind === "d3"
      ? sceneD3ResourceData(job, sceneNode)
      : sceneThreeResourceData(job, sceneNode)
  );

  updateVideoProject(project.id, { canvas: upserted.canvas });

  return {
    provider: "local-canvas-node-factory",
    usedMock: false,
    visualKind: kind,
    nodeId: upserted.node.id,
    d3NodeId: kind === "d3" ? upserted.node.id : undefined,
    threeNodeId: kind === "three" ? upserted.node.id : undefined
  };
}

async function createCompositionNode(job: Job) {
  const project = requireProject(job.projectId);
  const sourceNode = job.canvasNodeId
    ? project.canvas.nodes.find((node) => node.id === job.canvasNodeId)
    : undefined;
  const anchor = resolveCompositionAnchor(project.canvas, sourceNode);

  if (!anchor.sceneNode) {
    throw new Error("A scene or scene resource node is required to create a composition node");
  }

  const upserted = upsertCompositionNode(project.canvas, anchor.sceneNode, sourceNode);
  updateVideoProject(project.id, { canvas: upserted.canvas });

  return {
    provider: "local-canvas-node-factory",
    usedMock: false,
    compositionNodeId: upserted.node.id,
    nodeId: upserted.node.id,
    sceneNodeId: anchor.sceneNode.id
  };
}

async function createPreviewNode(job: Job) {
  const project = requireProject(job.projectId);
  const sourceNode = job.canvasNodeId
    ? project.canvas.nodes.find((node) => node.id === job.canvasNodeId)
    : undefined;
  const compositionNode =
    sourceNode?.kind === "composition" ? sourceNode : findNode(project.canvas, "composition");

  if (!compositionNode) {
    throw new Error("A composition node is required to create a preview node");
  }

  const upserted = upsertPreviewNode(project.canvas, compositionNode);
  updateVideoProject(project.id, { canvas: upserted.canvas });

  return {
    provider: "local-canvas-node-factory",
    usedMock: false,
    previewNodeId: upserted.node.id,
    nodeId: upserted.node.id,
    compositionNodeId: compositionNode.id
  };
}

async function createExportNode(job: Job) {
  const project = requireProject(job.projectId);
  const sourceNode = job.canvasNodeId
    ? project.canvas.nodes.find((node) => node.id === job.canvasNodeId)
    : undefined;
  const previewNode = sourceNode?.kind === "preview" ? sourceNode : findNode(project.canvas, "preview");

  if (!previewNode) {
    throw new Error("A preview node is required to create an export node");
  }

  const upserted = upsertExportNode(project.canvas, previewNode);
  updateVideoProject(project.id, { canvas: upserted.canvas });

  return {
    provider: "local-canvas-node-factory",
    usedMock: false,
    exportNodeId: upserted.node.id,
    nodeId: upserted.node.id,
    previewNodeId: previewNode.id
  };
}

async function exportVisualAsset(job: Job) {
  const project = requireProject(job.projectId);
  const visualNode = job.canvasNodeId
    ? project.canvas.nodes.find((node) => node.id === job.canvasNodeId)
    : (findNode(project.canvas, "d3") ?? findNode(project.canvas, "three"));

  if (!visualNode || (visualNode.kind !== "d3" && visualNode.kind !== "three")) {
    throw new Error("A D3 or Three visual node is required");
  }

  const assetPath = path.join(getProjectAssetDir(project.id), `${job.id}.svg`);
  const title = stringData(visualNode, "title") ?? (visualNode.kind === "d3" ? "D3 Diagram" : "Three Scene");
  const svg =
    visualNode.kind === "d3" ? renderD3VisualAssetSvg(visualNode, title) : renderThreeVisualAssetSvg(visualNode, title);

  await fs.mkdir(path.dirname(assetPath), { recursive: true });
  await fs.writeFile(assetPath, svg, "utf8");

  const asset = createProjectAsset({
    projectId: project.id,
    name: `${visualNode.kind === "d3" ? "D3" : "Three"} 视觉素材 ${new Date().toLocaleString("zh-CN")}`,
    kind: "svg",
    path: assetPath,
    metadata: {
      provider: "local-visual-renderer",
      visualKind: visualNode.kind,
      visualPreset: stringData(visualNode, "visualPreset"),
      diagram: stringData(visualNode, "diagram"),
      threeScene: stringData(visualNode, "threeScene"),
      title,
      dataJson: stringData(visualNode, "dataJson")
    }
  });
  addProjectAssetRef(project.id, {
    assetId: asset.id,
    assetScope: "project",
    usage: "scene",
    canvasNodeId: visualNode.id
  });

  const assetUrl = `/api/project-asset?assetId=${encodeURIComponent(asset.id)}`;
  updateVideoProject(project.id, {
    canvas: updateNodeData(project.canvas, visualNode.id, {
      refId: asset.id,
      assetId: asset.id,
      assetPath,
      assetUrl,
      provider: "local-visual-renderer",
      renderMode: "asset",
      exportedAt: new Date().toISOString()
    })
  });

  return {
    provider: "local-visual-renderer",
    usedMock: false,
    visualKind: visualNode.kind,
    assetId: asset.id,
    assetPath,
    assetUrl,
    asset
  };
}

async function renderProjectMedia(job: Job) {
  const project = requireProject(job.projectId);
  const renderStill = job.type === "render-preview";
  const extension = renderStill ? "png" : "mp4";
  const assetDir = getProjectAssetDir(project.id);
  const outputPath = path.join(assetDir, `${job.id}.${extension}`);
  const specPath = path.join(assetDir, `${job.id}.spec.json`);
  const assetOrigin =
    stringInput(job.input.assetOrigin) ?? process.env.ZEROFLOW_ASSET_ORIGIN ?? "http://localhost:3000";
  const frame = numberInput(job.input.frame);
  const frameRange = stringInput(job.input.frameRange);
  const targetNode = resolveRenderJobTargetNode(project.canvas, renderStill, job.canvasNodeId);
  const renderTarget = resolveRenderMediaTarget(project.canvas, targetNode, renderStill);
  const renderSpec = specForRenderTarget(project.spec, renderTarget);

  await fs.mkdir(assetDir, { recursive: true });
  await fs.writeFile(specPath, JSON.stringify(renderSpec, null, 2), "utf8");
  await runRemotionRender({
    assetOrigin,
    frame,
    frameRange,
    outputPath,
    renderStill,
    specPath
  });

  const renderedAt = new Date().toISOString();
  const asset = createProjectAsset({
    projectId: project.id,
    name: `${renderStill ? "Remotion 预览帧" : "Remotion 视频"} ${new Date().toLocaleString("zh-CN")}`,
    kind: renderStill ? "image" : "video",
    path: outputPath,
    metadata: {
      provider: "remotion-renderer",
      renderKind: renderStill ? "preview-still" : "video",
      specPath,
      assetOrigin,
      frame: frame ?? null,
      frameRange: frameRange ?? null,
      renderScope: renderTarget.renderScope,
      sourceSceneId: renderTarget.sceneNode?.refId ?? renderTarget.sceneNode?.id ?? null,
      sourceCompositionNodeId: renderTarget.compositionNode?.id ?? null,
      sourcePreviewNodeId: renderTarget.previewNode?.id ?? null,
      sourceExportNodeId: renderTarget.exportNode?.id ?? null,
      specSceneCount: renderSpec.scenes.length,
      renderedAt
    }
  });
  addProjectAssetRef(project.id, {
    assetId: asset.id,
    assetScope: "project",
    usage: "export",
    canvasNodeId: targetNode?.id
  });

  const assetUrl = `/api/project-asset?assetId=${encodeURIComponent(asset.id)}`;
  const canvas = targetNode
    ? updateNodeData(project.canvas, targetNode.id, {
        refId: asset.id,
        assetId: asset.id,
        assetPath: outputPath,
        assetUrl,
        provider: "remotion-renderer",
        renderedAt
      })
    : project.canvas;

  updateVideoProject(project.id, {
    canvas,
    status: renderStill ? project.status : "exported"
  });

  return {
    provider: "remotion-renderer",
    usedMock: false,
    renderKind: renderStill ? "preview-still" : "video",
    assetId: asset.id,
    assetPath: outputPath,
    assetUrl,
    specPath,
    assetOrigin,
    frame: frame ?? null,
    frameRange: frameRange ?? null,
    renderScope: renderTarget.renderScope,
    sourceSceneId: renderTarget.sceneNode?.refId ?? renderTarget.sceneNode?.id ?? null,
    sourceCompositionNodeId: renderTarget.compositionNode?.id ?? null,
    previewNodeId: renderStill ? targetNode?.id : undefined,
    exportNodeId: renderStill ? undefined : targetNode?.id,
    nodeId: targetNode?.id,
    asset
  };
}

type RenderMediaTarget = {
  compositionNode?: CanvasNode;
  exportNode?: CanvasNode;
  previewNode?: CanvasNode;
  renderScope: "composition" | "project";
  sceneNode?: CanvasNode;
  targetNode?: CanvasNode;
};

function resolveRenderJobTargetNode(
  canvas: CanvasDocument,
  renderStill: boolean,
  canvasNodeId: string | undefined
) {
  return canvasNodeId
    ? canvas.nodes.find((node) => node.id === canvasNodeId)
    : findNode(canvas, renderStill ? "preview" : "export");
}

function resolveRenderMediaTarget(
  canvas: CanvasDocument,
  targetNode: CanvasNode | undefined,
  renderStill: boolean
): RenderMediaTarget {
  const exportNode = targetNode?.kind === "export" ? targetNode : undefined;
  const previewNode =
    targetNode?.kind === "preview"
      ? targetNode
      : exportNode
        ? findNodeById(canvas, stringData(exportNode, "sourcePreviewNodeId")) ?? findNode(canvas, "preview")
        : undefined;
  const directCompositionNode = targetNode?.kind === "composition" ? targetNode : undefined;
  const compositionNode =
    directCompositionNode ??
    (previewNode
      ? findNodeById(canvas, stringData(previewNode, "sourceCompositionNodeId")) ??
        findNode(canvas, "composition")
      : undefined);
  const directSceneNode = targetNode?.kind === "scene" ? targetNode : undefined;
  const sceneNode = directSceneNode ?? resolveSceneNodeForComposition(canvas, compositionNode);
  const exportScope = stringData(exportNode, "exportScope");
  const canScopeToComposition =
    Boolean(sceneNode) && (renderStill || targetNode?.kind !== "export" || exportScope !== "full");

  return {
    compositionNode,
    exportNode,
    previewNode,
    renderScope: canScopeToComposition ? "composition" : "project",
    sceneNode,
    targetNode
  };
}

function resolveSceneNodeForComposition(
  canvas: CanvasDocument,
  compositionNode: CanvasNode | undefined
) {
  if (!compositionNode) {
    return undefined;
  }

  const sourceSceneNodeId = stringData(compositionNode, "sourceSceneNodeId");
  const sceneId = stringData(compositionNode, "sceneId");

  return (
    findNodeById(canvas, sourceSceneNodeId) ??
    canvas.nodes.find((node) => node.kind === "scene" && node.refId === sceneId)
  );
}

function specForRenderTarget(spec: AstroVideoSpec, target: RenderMediaTarget): AstroVideoSpec {
  const sceneId = target.sceneNode?.refId ?? target.sceneNode?.id;

  if (target.renderScope !== "composition" || !sceneId) {
    return spec;
  }

  const scoped = specForScene(spec, sceneId);
  return scoped ?? spec;
}

function specForScene(spec: AstroVideoSpec, sceneId: string): AstroVideoSpec | undefined {
  let cursor = 0;
  let sceneStartSec: number | undefined;
  const scene = spec.scenes.find((item) => {
    const matched = item.id === sceneId;

    if (matched) {
      sceneStartSec = cursor;
    }

    cursor += item.durationSec;
    return matched;
  });

  if (!scene || sceneStartSec === undefined) {
    return undefined;
  }

  const startSec = sceneStartSec;
  const sceneEndSec = startSec + scene.durationSec;
  const audioTracks = (spec.audio?.tracks ?? [])
    .filter((track) => {
      const trackStartSec = track.startSec ?? 0;
      return trackStartSec >= startSec && trackStartSec < sceneEndSec;
    })
    .map((track) => ({
      ...track,
      startSec: Math.max(0, (track.startSec ?? 0) - startSec)
    }));

  return {
    ...spec,
    title: `${spec.title} / ${scene.title}`,
    scenes: [scene],
    audio: {
      ...(spec.audio ?? { tracks: [] }),
      tracks: audioTracks
    }
  };
}

function findNodeById(canvas: CanvasDocument, nodeId: string | undefined) {
  return nodeId ? canvas.nodes.find((node) => node.id === nodeId) : undefined;
}

async function runRemotionRender(input: {
  assetOrigin: string;
  frame: number | undefined;
  frameRange: string | undefined;
  outputPath: string;
  renderStill: boolean;
  specPath: string;
}) {
  const workspaceRoot = getWorkspaceRoot();
  const command = process.platform === "win32" ? "cmd.exe" : "pnpm";
  const scriptName = input.renderStill ? "still" : "render";
  const pnpmArgs = [
    "--filter",
    "@zeroflow/remotion-video",
    scriptName,
    "--",
    "--spec",
    input.specPath,
    "--output",
    input.outputPath,
    "--asset-origin",
    input.assetOrigin
  ];

  if (input.renderStill && input.frame !== undefined) {
    pnpmArgs.push("--frame", String(input.frame));
  }
  if (!input.renderStill && input.frameRange) {
    pnpmArgs.push("--frame-range", input.frameRange);
  }
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "pnpm", ...pnpmArgs] : pnpmArgs;

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      env: process.env,
      windowsHide: true
    });
    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Remotion render failed with exit code ${code}: ${stderr.slice(-1600)}`));
    });
  });
}

async function alignCaptions(job: Job) {
  const project = requireProject(job.projectId);
  const sourceNode = job.canvasNodeId
    ? project.canvas.nodes.find((node) => node.id === job.canvasNodeId)
    : undefined;

  if (sourceNode?.kind === "scene") {
    return alignSceneCaption(job, project, sourceNode);
  }

  const ttsManifest = await readTtsManifestCues(findTtsManifestPath(project.canvas, job));
  const captions = buildCaptionAlignment(project.spec.scenes, ttsManifest?.cues);
  const subtitlePath = path.join(getProjectAssetDir(project.id), `${job.id}.captions.json`);

  await fs.mkdir(path.dirname(subtitlePath), { recursive: true });
  await fs.writeFile(
    subtitlePath,
    `${JSON.stringify({ version: "1", projectId: project.id, captions }, null, 2)}\n`,
    "utf8"
  );

  const asset = createProjectAsset({
    projectId: project.id,
    name: `字幕 ${new Date().toLocaleString("zh-CN")}`,
    kind: "subtitle",
    status: "ready",
    path: subtitlePath,
    metadata: {
      provider: "local-caption-aligner",
      alignmentSource: ttsManifest ? ttsManifest.source : "estimated-scene-duration",
      manifestPath: ttsManifest?.manifestPath,
      sceneCount: captions.length,
      cueCount: captions.reduce((total, caption) => total + caption.cues.length, 0)
    }
  });
  const assetUrl = `/api/project-asset?assetId=${encodeURIComponent(asset.id)}`;

  addProjectAssetRef(project.id, {
    assetId: asset.id,
    assetScope: "project",
    usage: "subtitle",
    canvasNodeId: job.canvasNodeId
  });

  const canvas = applyCaptionAlignment(project.canvas, captions, asset.id, assetUrl);
  updateVideoProject(project.id, { canvas });

  return {
    provider: "local-caption-aligner",
    usedMock: false,
    alignmentSource: ttsManifest ? ttsManifest.source : "estimated-scene-duration",
    manifestPath: ttsManifest?.manifestPath,
    assetId: asset.id,
    assetPath: subtitlePath,
    assetUrl,
    captionNodeIds: captions.map((caption) => `node-caption-align-${safeId(caption.sceneId)}`),
    captions
  };
}

async function alignSceneCaption(job: Job, project: ReturnType<typeof requireProject>, sceneNode: CanvasNode) {
  const sceneId = sceneNode.refId ?? sceneNode.id;
  const text =
    stringInput(job.input.text) ??
    stringData(sceneNode, "caption") ??
    stringData(sceneNode, "narration") ??
    stringData(sceneNode, "description") ??
    " ";
  const durationSec = numberInput(job.input.durationSec) ?? numberData(sceneNode, "durationSec") ?? 6;
  const sceneIndex = project.canvas.nodes
    .filter((node) => node.kind === "scene")
    .sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x)
    .findIndex((node) => node.id === sceneNode.id);
  const cues = distributeCaptionCues(sceneId, text, durationSec);
  const caption: AlignedCaption = {
    sceneId,
    index: Math.max(0, sceneIndex),
    text,
    startSec: 0,
    durationSec,
    cues,
    audioEnergy: {
      source: "cue-derived",
      bars: captionEnergyBarsFromCues(cues, "cue-derived")
    }
  };
  const subtitlePath = path.join(getProjectAssetDir(project.id), `${job.id}.captions.json`);

  await fs.mkdir(path.dirname(subtitlePath), { recursive: true });
  await fs.writeFile(
    subtitlePath,
    `${JSON.stringify({ version: "1", projectId: project.id, captions: [caption] }, null, 2)}\n`,
    "utf8"
  );

  const asset = createProjectAsset({
    projectId: project.id,
    name: `字幕 ${new Date().toLocaleString("zh-CN")}`,
    kind: "subtitle",
    status: "ready",
    path: subtitlePath,
    metadata: {
      provider: "local-caption-aligner",
      alignmentSource: "single-scene-estimate",
      sceneId,
      cueCount: caption.cues.length
    }
  });
  const assetUrl = `/api/project-asset?assetId=${encodeURIComponent(asset.id)}`;
  const captionNodeId =
    findSceneResourceNode(project.canvas, sceneNode, "caption")?.id ??
    `node-caption-align-${safeId(sceneId)}`;

  addProjectAssetRef(project.id, {
    assetId: asset.id,
    assetScope: "project",
    usage: "subtitle",
    canvasNodeId: captionNodeId
  });

  const canvas = applyCaptionAlignment(project.canvas, [caption], asset.id, assetUrl, {
    pruneMissing: false
  });
  updateVideoProject(project.id, { canvas });

  return {
    provider: "local-caption-aligner",
    usedMock: false,
    alignmentSource: "single-scene-estimate",
    assetId: asset.id,
    assetPath: subtitlePath,
    assetUrl,
    captionNodeId,
    captions: [caption]
  };
}

async function promoteAssetToLibrary(job: Job) {
  requireProject(job.projectId);
  const projectAssetId = stringInput(job.input.assetId) ?? stringInput(job.input.projectAssetId);

  if (!projectAssetId) {
    throw new Error("assetId is required to promote a project asset");
  }

  const result = promoteProjectAssetToLibrary({
    projectAssetId,
    name: stringInput(job.input.name),
    tags: stringArrayInput(job.input.tags),
    reusable: booleanInput(job.input.reusable) ?? true
  });

  return {
    provider: "local-asset-library",
    usedMock: false,
    promoted: result.promoted,
    assetId: result.asset.id,
    asset: result.asset
  };
}

type AlignedCaption = {
  sceneId: string;
  index: number;
  text: string;
  startSec: number;
  durationSec: number;
  cues: Array<{
    id: string;
    text: string;
    startSec: number;
    durationSec: number;
  }>;
  audioEnergy: {
    source: "tts-manifest" | "cue-derived";
    bars: AudioEnergyBar[];
  };
};

type AudioEnergyBar = {
  startSec: number;
  durationSec: number;
  amplitude: number;
};

type TtsManifestCue = {
  text: string;
  startSec?: number;
  durationSec: number;
};

type TtsManifestCues = {
  manifestPath: string;
  source: "tts-manifest";
  cues: TtsManifestCue[];
};

function buildCaptionAlignment(scenes: SceneSpec[], ttsCues: TtsManifestCue[] = []): AlignedCaption[] {
  let cursor = 0;
  let ttsCursor = 0;

  return scenes.map((scene, index) => {
    const text = scene.caption?.text ?? scene.narration;
    const manifestSlice = takeManifestCuesForScene(
      ttsCues,
      ttsCursor,
      scene,
      index,
      scenes.length
    );
    const cues =
      manifestSlice.cues.length > 0
        ? normalizeManifestCuesToScene(scene.id, manifestSlice.cues, scene.durationSec)
        : distributeCaptionCues(scene.id, text, scene.durationSec);
    const energySource = manifestSlice.cues.length > 0 ? "tts-manifest" : "cue-derived";
    const caption: AlignedCaption = {
      sceneId: scene.id,
      index,
      text,
      startSec: roundSec(cursor),
      durationSec: scene.durationSec,
      cues,
      audioEnergy: {
        source: energySource,
        bars: captionEnergyBarsFromCues(cues, energySource)
      }
    };

    cursor += scene.durationSec;
    ttsCursor = manifestSlice.nextIndex;
    return caption;
  });
}

function captionEnergyBarsFromCues(
  cues: AlignedCaption["cues"],
  source: "tts-manifest" | "cue-derived"
): AudioEnergyBar[] {
  const longestCue = cues.reduce((max, cue) => Math.max(max, cue.text.trim().length), 1);

  return cues.map((cue, index) => {
    const textWeight = cue.text.trim().length / longestCue;
    const sourceBoost = source === "tts-manifest" ? 0.12 : 0;
    const cadence = ((index * 5) % 7) / 20;

    return {
      startSec: roundSec(cue.startSec),
      durationSec: roundSec(cue.durationSec),
      amplitude: roundSec(Math.min(1, Math.max(0.08, 0.28 + textWeight * 0.48 + cadence + sourceBoost)))
    };
  });
}

function takeManifestCuesForScene(
  ttsCues: TtsManifestCue[],
  startIndex: number,
  scene: SceneSpec,
  sceneIndex: number,
  sceneCount: number
) {
  if (startIndex >= ttsCues.length) {
    return { cues: [], nextIndex: startIndex };
  }

  const remainingScenes = sceneCount - sceneIndex;
  const maxEndIndex = Math.max(startIndex + 1, ttsCues.length - (remainingScenes - 1));
  const targetLength = Math.max(1, normalizeCaptionText(scene.narration).length);
  const selected: TtsManifestCue[] = [];
  let cursor = startIndex;
  let accumulatedLength = 0;

  while (cursor < maxEndIndex && (selected.length === 0 || accumulatedLength < targetLength * 0.78)) {
    const cue = ttsCues[cursor];
    if (!cue) {
      break;
    }

    selected.push(cue);
    accumulatedLength += Math.max(1, normalizeCaptionText(cue.text).length);
    cursor += 1;
  }

  return {
    cues: selected,
    nextIndex: cursor
  };
}

function normalizeManifestCuesToScene(
  sceneId: string,
  cues: TtsManifestCue[],
  durationSec: number
) {
  const totalDuration = cues.reduce((sum, cue) => sum + cue.durationSec, 0);

  if (totalDuration <= 0) {
    return distributeCaptionCues(
      sceneId,
      cues.map((cue) => cue.text).join(""),
      durationSec
    );
  }

  let cursor = 0;

  return cues.map((cue, index) => {
    const isLast = index === cues.length - 1;
    const duration = isLast
      ? Math.max(0.1, durationSec - cursor)
      : Math.max(0.1, (cue.durationSec / totalDuration) * durationSec);
    const normalizedCue = {
      id: `${sceneId}-tts-cue-${index + 1}`,
      text: cue.text,
      startSec: roundSec(Math.min(cursor, Math.max(0, durationSec - 0.1))),
      durationSec: roundSec(Math.min(duration, Math.max(0.1, durationSec - cursor)))
    };

    cursor += normalizedCue.durationSec;
    return normalizedCue;
  });
}

function distributeCaptionCues(sceneId: string, text: string, durationSec: number) {
  const chunks = splitCaptionText(text);
  const totalWeight = chunks.reduce((sum, chunk) => sum + Math.max(1, chunk.length), 0);
  let cursor = 0;

  return chunks.map((chunk, index) => {
    const isLast = index === chunks.length - 1;
    const rawDuration = isLast
      ? Math.max(0.1, durationSec - cursor)
      : (durationSec * Math.max(1, chunk.length)) / totalWeight;
    const duration = isLast ? rawDuration : Math.max(0.8, rawDuration);
    const cue = {
      id: `${sceneId}-cue-${index + 1}`,
      text: chunk,
      startSec: roundSec(Math.min(cursor, Math.max(0, durationSec - 0.1))),
      durationSec: roundSec(Math.min(duration, Math.max(0.1, durationSec - cursor)))
    };

    cursor += cue.durationSec;
    return cue;
  });
}

function splitCaptionText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return [" "];
  }

  const roughChunks = normalized
    .split(/(?<=[。！？…—])\\s*/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const chunks = roughChunks.length > 0 ? roughChunks : [normalized];

  return chunks.flatMap((chunk) => splitLongCaptionChunk(chunk, 28));
}

function normalizeCaptionText(text: string) {
  return text.replace(/\s+/g, "").replace(/[，。！？…—]/g, "");
}

function splitLongCaptionChunk(chunk: string, maxLength: number) {
  if (chunk.length <= maxLength) {
    return [chunk];
  }

  const parts: string[] = [];

  for (let index = 0; index < chunk.length; index += maxLength) {
    parts.push(chunk.slice(index, index + maxLength));
  }

  return parts;
}

function findTtsManifestPath(canvas: CanvasDocument, job: Job) {
  const inputPath = stringInput(job.input.manifestPath);
  if (inputPath) {
    return inputPath;
  }

  const voiceNode = findNode(canvas, "voice");
  return stringData(voiceNode, "manifestPath");
}

async function readTtsManifestCues(manifestPath: string | undefined): Promise<TtsManifestCues | undefined> {
  if (!manifestPath) {
    return undefined;
  }

  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw) as Record<string, unknown>;
    const chunks = Array.isArray(manifest.chunks)
      ? manifest.chunks
      : Array.isArray(manifest.segments)
        ? manifest.segments
        : [];
    const parsed = await Promise.all(chunks.map((chunk) => readTtsManifestCue(chunk)));
    const cues = parsed.filter((cue): cue is TtsManifestCue => Boolean(cue));

    if (cues.length === 0) {
      return undefined;
    }

    let cursor = 0;
    const normalized = cues.map((cue) => {
      const startSec =
        typeof cue.startSec === "number" && Number.isFinite(cue.startSec)
          ? cue.startSec
          : cursor;
      const next = {
        ...cue,
        startSec: roundSec(startSec),
        durationSec: roundSec(cue.durationSec)
      };

      cursor = startSec + cue.durationSec;
      return next;
    });

    return {
      manifestPath,
      source: "tts-manifest",
      cues: normalized
    };
  } catch {
    return undefined;
  }
}

async function readTtsManifestCue(value: unknown): Promise<TtsManifestCue | undefined> {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const text = stringFromRecord(record, "text") ?? stringFromRecord(record, "caption");
  const audioPath = stringFromRecord(record, "audioPath") ?? stringFromRecord(record, "path");

  if (!text?.trim()) {
    return undefined;
  }

  const durationSec =
    numberFromRecord(record, "durationSec") ??
    numberFromRecord(record, "duration") ??
    numberFromRecord(record, "audioDurationSec") ??
    (audioPath ? await probeAudioDurationSec(audioPath) : undefined);

  if (!durationSec || durationSec <= 0) {
    return undefined;
  }

  return {
    text: text.trim(),
    startSec:
      numberFromRecord(record, "startSec") ??
      numberFromRecord(record, "start") ??
      numberFromRecord(record, "startTime"),
    durationSec
  };
}

function probeAudioDurationSec(audioPath: string) {
  return new Promise<number | undefined>((resolve) => {
    const child = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        audioPath
      ],
      { shell: false }
    );
    let stdout = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += String(chunk);
    });
    child.on("error", () => resolve(undefined));
    child.on("close", () => {
      const duration = Number(stdout.trim());
      resolve(Number.isFinite(duration) && duration > 0 ? duration : undefined);
    });
  });
}

function applyCaptionAlignment(
  canvas: CanvasDocument,
  captions: AlignedCaption[],
  assetId: string,
  assetUrl: string,
  options: { pruneMissing?: boolean } = {}
): CanvasDocument {
  const pruneMissing = options.pruneMissing ?? true;
  let nodes = pruneMissing
    ? canvas.nodes.filter(
        (node) =>
          !(
            node.kind === "caption" &&
            node.data.generatedBy === "align-captions" &&
            !captions.some((caption) => caption.sceneId === node.refId)
          )
      )
    : canvas.nodes;
  let edges = pruneMissing
    ? canvas.edges.filter(
        (edge) =>
          !(
            edge.id.startsWith("edge-align-caption-") &&
            !captions.some((caption) => edge.id === `edge-align-caption-${safeId(caption.sceneId)}`)
          )
      )
    : canvas.edges;

  for (const caption of captions) {
    const existingIndex = nodes.findIndex(
      (node) =>
        node.kind === "caption" &&
        (node.refId === caption.sceneId || node.data.sceneId === caption.sceneId)
    );
    const anchor = findCaptionAnchor(nodes, caption.sceneId);
    const nodeId =
      existingIndex === -1
        ? `node-caption-align-${safeId(caption.sceneId)}`
        : nodes[existingIndex]?.id ?? `node-caption-align-${safeId(caption.sceneId)}`;
    const baseNode = existingIndex === -1 ? undefined : nodes[existingIndex];
    const nextNode: CanvasNode = {
      id: nodeId,
      kind: "caption",
      refId: caption.sceneId,
      position: baseNode?.position ?? {
        x: (anchor?.position.x ?? 700) + 330,
        y: anchor?.position.y ?? 260 + caption.index * 190
      },
      size: baseNode?.size ?? { width: 280, height: 165 },
      status: "ready",
      data: {
        ...baseNode?.data,
        generatedBy: baseNode?.data.generatedBy ?? "align-captions",
        title: baseNode?.data.title ?? `字幕 ${caption.index + 1}`,
        description: caption.text,
        sceneId: caption.sceneId,
        sourceSceneNodeId: anchor?.id,
        startSec: caption.startSec,
        durationSec: caption.durationSec,
        cues: caption.cues,
        audioEnergy: caption.audioEnergy,
        assetId,
        assetScope: "project",
        assetUrl,
        provider: "local-caption-aligner",
        yPercent: numberData(baseNode, "yPercent") ?? 78,
        fontSize: numberData(baseNode, "fontSize") ?? 48,
        color: stringData(baseNode, "color") ?? "#ffffff"
      }
    };

    if (existingIndex === -1) {
      nodes = [...nodes, nextNode];
    } else {
      nodes = nodes.map((node, index) => (index === existingIndex ? nextNode : node));
    }

    if (anchor && !edges.some((edge) => edge.toNodeId === nodeId && edge.fromNodeId === anchor.id)) {
      edges = [
        ...edges,
        {
          id: `edge-align-caption-${safeId(caption.sceneId)}`,
          fromNodeId: anchor.id,
          toNodeId: nodeId,
          relation: "uses"
        }
      ];
    }
  }

  return {
    ...canvas,
    nodes,
    edges
  };
}

function findCaptionAnchor(nodes: CanvasNode[], sceneId: string) {
  return (
    nodes.find((node) => node.kind === "scene" && node.refId === sceneId) ??
    nodes.find((node) => node.kind === "chart" && sceneId.startsWith("scene-chart")) ??
    nodes.find((node) => node.kind === "image" && sceneId.startsWith("scene-sketch"))
  );
}

function roundSec(value: number) {
  return Math.round(value * 100) / 100;
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function requireProject(projectId: string) {
  const project = getVideoProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  return project;
}

function findNode(canvas: CanvasDocument, kind: CanvasNode["kind"]) {
  return canvas.nodes.find((node) => node.kind === kind);
}

type SceneResourceKind = Extract<CanvasNode["kind"], "caption" | "voice" | "chart" | "image" | "d3" | "three">;

function findSceneResourceNode(
  canvas: CanvasDocument,
  sceneNode: CanvasNode,
  kind: SceneResourceKind
) {
  const sceneId = sceneNode.refId ?? sceneNode.id;

  return canvas.nodes.find(
    (node) =>
      node.kind === kind &&
      (node.data.sourceSceneNodeId === sceneNode.id ||
        node.data.sceneNodeId === sceneNode.id ||
        node.data.sceneId === sceneId ||
        node.refId === `${kind}-${safeId(sceneId)}` ||
        (kind === "caption" && node.refId === sceneId))
  );
}

function upsertSceneResourceNode(
  canvas: CanvasDocument,
  sceneNode: CanvasNode,
  kind: Exclude<SceneResourceKind, "caption">,
  data: Record<string, unknown>
) {
  const existingNode = findSceneResourceNode(canvas, sceneNode, kind);
  const sceneId = sceneNode.refId ?? sceneNode.id;
  const nodeId = existingNode?.id ?? `node-${kind}-${safeId(sceneId)}`;
  const offset = sceneResourceOffset(kind);
  const nextNode: CanvasNode = {
    id: nodeId,
    kind,
    refId: existingNode?.refId ?? `${kind}-${safeId(sceneId)}`,
    position: existingNode?.position ?? {
      x: sceneNode.position.x + offset.x,
      y: sceneNode.position.y + offset.y
    },
    size: existingNode?.size ?? sceneResourceSize(kind),
    status: "ready",
    data: {
      ...existingNode?.data,
      ...data,
      sceneId,
      sourceSceneNodeId: sceneNode.id
    }
  };
  const nodes = existingNode
    ? canvas.nodes.map((node) => (node.id === existingNode.id ? nextNode : node))
    : canvas.nodes.concat(nextNode);
  const edges = ensureCanvasEdge(canvas.edges, {
    id: `edge-scene-resource-${safeId(sceneNode.id)}-${kind}`,
    fromNodeId: sceneNode.id,
    toNodeId: nodeId,
    relation: kind === "voice" ? "uses" : "produces"
  });

  return {
    node: nextNode,
    canvas: {
      ...canvas,
      nodes,
      edges
    }
  };
}

function sceneResourceOffset(kind: Exclude<SceneResourceKind, "caption">) {
  switch (kind) {
    case "voice":
      return { x: 330, y: 0 };
    case "chart":
      return { x: 660, y: 0 };
    case "image":
      return { x: 990, y: 0 };
    case "d3":
      return { x: 330, y: 210 };
    case "three":
      return { x: 660, y: 210 };
  }
}

function sceneResourceSize(kind: Exclude<SceneResourceKind, "caption">): CanvasNode["size"] {
  switch (kind) {
    case "voice":
      return { width: 280, height: 160 };
    case "chart":
      return { width: 280, height: 170 };
    case "image":
      return { width: 300, height: 190 };
    case "d3":
    case "three":
      return { width: 300, height: 210 };
  }
}

function sceneResourceTitle(sceneNode: CanvasNode) {
  return stringData(sceneNode, "title") ?? sceneNode.refId ?? sceneNode.id;
}

function sceneResourceDescription(sceneNode: CanvasNode) {
  return (
    stringData(sceneNode, "description") ??
    stringData(sceneNode, "narration") ??
    sceneResourceTitle(sceneNode)
  );
}

function sceneD3ResourceData(job: Job, sceneNode: CanvasNode) {
  const title = stringInput(job.input.title) ?? `D3 ${sceneResourceTitle(sceneNode)}`;
  const narration = stringInput(job.input.narration) ?? stringData(sceneNode, "narration") ?? sceneResourceDescription(sceneNode);

  return {
    generatedBy: "create-d3-node",
    title,
    description: stringInput(job.input.description) ?? sceneResourceDescription(sceneNode),
    narration,
    durationSec: numberInput(job.input.durationSec) ?? numberData(sceneNode, "durationSec") ?? 6,
    visualPreset: stringInput(job.input.visualPreset) ?? "timeline",
    diagram: stringInput(job.input.diagram) ?? "timeline",
    renderMode: "contract",
    dataJson:
      stringInput(job.input.dataJson) ??
      JSON.stringify(
        {
          points: [
            { label: "Concept", value: 1 },
            { label: sceneResourceTitle(sceneNode), value: 2 },
            { label: "Practice", value: 3 }
          ]
        },
        null,
        2
      )
  };
}

function sceneThreeResourceData(job: Job, sceneNode: CanvasNode) {
  const title = stringInput(job.input.title) ?? `Three ${sceneResourceTitle(sceneNode)}`;
  const narration = stringInput(job.input.narration) ?? stringData(sceneNode, "narration") ?? sceneResourceDescription(sceneNode);

  return {
    generatedBy: "create-three-node",
    title,
    description: stringInput(job.input.description) ?? sceneResourceDescription(sceneNode),
    narration,
    durationSec: numberInput(job.input.durationSec) ?? numberData(sceneNode, "durationSec") ?? 6,
    visualPreset: stringInput(job.input.visualPreset) ?? "orbit",
    threeScene: stringInput(job.input.threeScene) ?? "orbit",
    renderMode: "contract",
    speed: numberInput(job.input.speed) ?? 0.72,
    accentColor: stringInput(job.input.accentColor) ?? "#e8c164",
    dataJson:
      stringInput(job.input.dataJson) ??
      JSON.stringify(
        {
          focus: sceneResourceTitle(sceneNode),
          orbitCount: 3,
          labels: ["Ascendant", "Planet", "House"]
        },
        null,
        2
      )
  };
}

function resolveCompositionAnchor(canvas: CanvasDocument, sourceNode: CanvasNode | undefined) {
  if (!sourceNode) {
    return { sceneNode: findNode(canvas, "scene") };
  }

  if (sourceNode.kind === "scene") {
    return { sceneNode: sourceNode };
  }

  const sceneNodeId = stringData(sourceNode, "sourceSceneNodeId") ?? stringData(sourceNode, "sceneNodeId");
  const sceneId = stringData(sourceNode, "sceneId");
  const sceneNode =
    (sceneNodeId ? canvas.nodes.find((node) => node.id === sceneNodeId && node.kind === "scene") : undefined) ??
    (sceneId ? canvas.nodes.find((node) => node.kind === "scene" && node.refId === sceneId) : undefined);

  return { sceneNode };
}

function upsertCompositionNode(
  canvas: CanvasDocument,
  sceneNode: CanvasNode,
  sourceNode: CanvasNode | undefined
) {
  const sceneId = sceneNode.refId ?? sceneNode.id;
  const existingNode = canvas.nodes.find(
    (node) =>
      node.kind === "composition" &&
      (node.data.sourceSceneNodeId === sceneNode.id || node.data.sceneId === sceneId)
  );
  const nodeId = existingNode?.id ?? `node-composition-${safeId(sceneId)}`;
  const resourceNodeIds = canvas.nodes
    .filter(
      (node) =>
        ["caption", "voice", "chart", "image", "d3", "three"].includes(node.kind) &&
        (node.data.sourceSceneNodeId === sceneNode.id || node.data.sceneId === sceneId)
    )
    .map((node) => node.id);
  const nextNode: CanvasNode = {
    id: nodeId,
    kind: "composition",
    refId: existingNode?.refId ?? `composition-${safeId(sceneId)}`,
    position: existingNode?.position ?? {
      x: sceneNode.position.x + 1030,
      y: sceneNode.position.y + 430
    },
    size: existingNode?.size ?? { width: 320, height: 180 },
    status: "ready",
    data: {
      ...existingNode?.data,
      generatedBy: "create-composition-node",
      title: existingNode?.data.title ?? `画面合成 ${sceneResourceTitle(sceneNode)}`,
      description: sceneResourceDescription(sceneNode),
      sceneId,
      sourceSceneNodeId: sceneNode.id,
      sourceNodeId: sourceNode?.id,
      resourceNodeIds,
      durationSec: numberData(sceneNode, "durationSec") ?? 6,
      primaryVisualKind: existingNode?.data.primaryVisualKind ?? "auto",
      layoutPreset: existingNode?.data.layoutPreset ?? "single",
      includeCaption: existingNode?.data.includeCaption ?? true,
      includeVoice: existingNode?.data.includeVoice ?? true,
      renderMode: "contract"
    }
  };
  const nodes = existingNode
    ? canvas.nodes.map((node) => (node.id === existingNode.id ? nextNode : node))
    : canvas.nodes.concat(nextNode);
  const edges = ensureCanvasEdge(canvas.edges, {
    id: `edge-composition-${safeId(sceneNode.id)}`,
    fromNodeId: sceneNode.id,
    toNodeId: nodeId,
    relation: "renders"
  });

  return {
    node: nextNode,
    canvas: {
      ...canvas,
      nodes,
      edges
    }
  };
}

function upsertPreviewNode(canvas: CanvasDocument, compositionNode: CanvasNode) {
  const existingNode = canvas.nodes.find((node) => node.kind === "preview");
  const nodeId = existingNode?.id ?? "node-preview";
  const nextNode: CanvasNode = {
    id: nodeId,
    kind: "preview",
    refId: existingNode?.refId ?? "preview-remotion",
    position: existingNode?.position ?? {
      x: compositionNode.position.x + 360,
      y: compositionNode.position.y
    },
    size: existingNode?.size ?? { width: 320, height: 180 },
    status: "ready",
    data: {
      ...existingNode?.data,
      generatedBy: "create-preview-node",
      title: existingNode?.data.title ?? "预览",
      description: "生成 Remotion 预览帧",
      sourceCompositionNodeId: compositionNode.id,
      previewFrame: numberData(existingNode, "previewFrame") ?? 30
    }
  };
  const nodes = existingNode
    ? canvas.nodes.map((node) => (node.id === existingNode.id ? nextNode : node))
    : canvas.nodes.concat(nextNode);
  const edges = ensureCanvasEdge(canvas.edges, {
    id: `edge-preview-${safeId(compositionNode.id)}`,
    fromNodeId: compositionNode.id,
    toNodeId: nodeId,
    relation: "renders"
  });

  return {
    node: nextNode,
    canvas: {
      ...canvas,
      nodes,
      edges
    }
  };
}

function upsertExportNode(canvas: CanvasDocument, previewNode: CanvasNode) {
  const existingNode = canvas.nodes.find((node) => node.kind === "export");
  const nodeId = existingNode?.id ?? "node-export";
  const nextNode: CanvasNode = {
    id: nodeId,
    kind: "export",
    refId: existingNode?.refId ?? "export-mp4",
    position: existingNode?.position ?? {
      x: previewNode.position.x + 360,
      y: previewNode.position.y
    },
    size: existingNode?.size ?? { width: 300, height: 170 },
    status: "ready",
    data: {
      ...existingNode?.data,
      generatedBy: "create-export-node",
      title: existingNode?.data.title ?? "导出",
      description: "1080x1920 MP4",
      sourcePreviewNodeId: previewNode.id,
      exportScope: stringData(existingNode, "exportScope") ?? "clip",
      frameRange: stringData(existingNode, "frameRange") ?? "0:60"
    }
  };
  const nodes = existingNode
    ? canvas.nodes.map((node) => (node.id === existingNode.id ? nextNode : node))
    : canvas.nodes.concat(nextNode);
  const edges = ensureCanvasEdge(canvas.edges, {
    id: `edge-export-${safeId(previewNode.id)}`,
    fromNodeId: previewNode.id,
    toNodeId: nodeId,
    relation: "renders"
  });

  return {
    node: nextNode,
    canvas: {
      ...canvas,
      nodes,
      edges
    }
  };
}

function calculateNodeContentHeight(text: string | undefined): number {
  if (!text) return 200;
  const chars = String(text).length;
  const lines = Math.max(3, Math.min(Math.ceil(chars / 36), 6));
  return Math.max(200, Math.min(100 + lines * 22, 240));
}

function upsertScriptNode(
  canvas: CanvasDocument,
  sourceNode: CanvasNode | undefined,
  existingScriptNode: CanvasNode | undefined,
  data: Record<string, unknown>
): CanvasDocument {
  if (existingScriptNode) {
    const updated = updateNodeData(canvas, existingScriptNode.id, data);
    const existingNode = updated.nodes.find((n) => n.id === existingScriptNode.id);
    if (existingNode) {
      const contentHeight = calculateNodeContentHeight(
        stringData(existingNode, "scriptText")
      );
      if (contentHeight !== existingNode.size.height) {
        return {
          ...updated,
          nodes: updated.nodes.map((n) =>
            n.id === existingScriptNode.id ? { ...n, size: { ...n.size, height: contentHeight } } : n
          )
        };
      }
    }
    return updated;
  }

  const nodeId = "node-script";
  const scriptNode: CanvasNode = {
    id: nodeId,
    kind: "script",
    refId: `script-draft-${safeId(sourceNode?.refId ?? nodeId)}`,
    position: {
      x: (sourceNode?.position.x ?? 0) + 360,
      y: sourceNode?.position.y ?? 0
    },
    size: {
      width: 360,
      height: calculateNodeContentHeight(String(data.scriptText))
    },
    status: "ready",
    data: {
      generatedBy: "generate-script",
      ...data
    }
  };
  const nextEdges = sourceNode
    ? ensureCanvasEdge(canvas.edges, {
        id: `edge-${sourceNode.id}-${nodeId}`,
        fromNodeId: sourceNode.id,
        toNodeId: nodeId,
        relation: "produces"
      })
    : canvas.edges;

  return {
    ...canvas,
    nodes: canvas.nodes.concat(scriptNode),
    edges: nextEdges
  };
}

function upsertStructureNode(
  canvas: CanvasDocument,
  sourceNode: CanvasNode | undefined,
  existingStructureNode: CanvasNode | undefined,
  data: Record<string, unknown>
): CanvasDocument {
  if (existingStructureNode) {
    return updateNodeData(canvas, existingStructureNode.id, data);
  }

  const nodeId = "node-structure";
  const structureNode: CanvasNode = {
    id: nodeId,
    kind: "structure",
    refId: `structure-${safeId(sourceNode?.refId ?? nodeId)}`,
    position: {
      x: (sourceNode?.position.x ?? 360) + 380,
      y: sourceNode?.position.y ?? 0
    },
    size: { width: 320, height: 180 },
    status: "ready",
    data: {
      generatedBy: "create-structure-node",
      ...data
    }
  };
  const nextEdges = sourceNode
    ? ensureCanvasEdge(canvas.edges, {
        id: `edge-${sourceNode.id}-${nodeId}`,
        fromNodeId: sourceNode.id,
        toNodeId: nodeId,
        relation: "produces"
      })
    : canvas.edges;

  return {
    ...canvas,
    nodes: canvas.nodes.concat(structureNode),
    edges: nextEdges
  };
}

type ChapterPlan = {
  title: string;
  summary: string;
  chapterScriptText: string;
  durationSec: number;
  sceneCount: number;
};

function applyChapters(
  canvas: CanvasDocument,
  sourceNode: CanvasNode | undefined,
  chapters: ChapterPlan[],
  options: { targetDurationSec: number; aiModel?: string }
): CanvasDocument {
  const sourceId = sourceNode?.id ?? "node-structure";
  const baseX = sourceNode ? sourceNode.position.x + 380 : 1080;
  const baseY = sourceNode ? sourceNode.position.y + 240 : 240;
  const existingChapterIds = new Set(
    canvas.nodes
      .filter((node) => node.kind === "chapter" && node.data.sourceStructureNodeId === sourceId)
      .map((node) => node.id)
  );
  const staleSceneNodes = canvas.nodes.filter(
    (node) => typeof node.data.sourceChapterNodeId === "string" && existingChapterIds.has(node.data.sourceChapterNodeId)
  );
  const staleSceneNodeIds = new Set(staleSceneNodes.map((node) => node.id));
  const staleSceneRefIds = new Set(
    staleSceneNodes
      .map((node) => node.refId)
      .filter((refId): refId is string => typeof refId === "string" && refId.length > 0)
  );
  const shouldRemoveChapterOutput = (node: CanvasNode) => {
    if (node.kind === "chapter" && node.data.sourceStructureNodeId === sourceId) {
      return true;
    }

    if (staleSceneNodeIds.has(node.id)) {
      return true;
    }

    const sourceSceneNodeId =
      typeof node.data.sourceSceneNodeId === "string" ? node.data.sourceSceneNodeId : undefined;
    const sceneId = typeof node.data.sceneId === "string" ? node.data.sceneId : undefined;

    return Boolean(
      (sourceSceneNodeId && staleSceneNodeIds.has(sourceSceneNodeId)) ||
        (sceneId && (staleSceneNodeIds.has(sceneId) || staleSceneRefIds.has(sceneId))) ||
        (typeof node.refId === "string" && staleSceneRefIds.has(node.refId))
    );
  };
  const nodes = canvas.nodes.filter((node) => !shouldRemoveChapterOutput(node));
  const removedNodeIds = new Set(
    canvas.nodes.filter((node) => shouldRemoveChapterOutput(node)).map((node) => node.id)
  );
  const edges = canvas.edges.filter(
    (edge) =>
      !edge.id.startsWith(`edge-chapter-${safeId(sourceId)}-`) &&
      !removedNodeIds.has(edge.fromNodeId) &&
      !removedNodeIds.has(edge.toNodeId)
  );
  const chapterNodes: CanvasNode[] = chapters.map((chapter, index) => {
    const chapterNumber = index + 1;
    return {
      id: `node-chapter-${chapterNumber}`,
      kind: "chapter",
      refId: `chapter-${chapterNumber}`,
      position: {
        x: baseX,
        y: baseY + index * 230
      },
      size: { width: 320, height: 180 },
      status: "ready",
      data: {
        generatedBy: "generate-chapters",
        sourceStructureNodeId: sourceId,
        title: `章节 ${chapterNumber}`,
        description: chapter.title,
        chapterTitle: chapter.title,
        summary: chapter.summary,
        chapterScriptText: chapter.chapterScriptText,
        chapterIndex: chapterNumber,
        chapterCount: chapters.length,
        durationSec: chapter.durationSec,
        targetDurationSec: chapter.durationSec,
        sceneCount: chapter.sceneCount,
        aiModel: options.aiModel
      }
    };
  });
  const chapterEdges: CanvasDocument["edges"] = sourceNode
    ? chapterNodes.map((node, index) => ({
        id: `edge-chapter-${safeId(sourceId)}-${index + 1}`,
        fromNodeId: sourceNode.id,
        toNodeId: node.id,
        relation: "produces"
      }))
    : [];

  return {
    ...canvas,
    nodes: nodes
      .map((node) =>
        sourceNode && node.id === sourceNode.id
          ? {
              ...node,
              status: "ready" as const,
              data: {
                ...node.data,
                generatedChapterCount: chapters.length,
                targetDurationSec: options.targetDurationSec,
                chapterCount: chapters.length
              }
            }
          : node
      )
      .concat(chapterNodes),
    edges: edges.concat(chapterEdges)
  };
}

function applyStoryboard(
  canvas: CanvasDocument,
  sourceNode: CanvasNode | undefined,
  scenes: Array<{
    title: string;
    description: string;
    narration: string;
    sceneType: string;
    durationSec: number;
    visualPrompt?: string;
    caption?: string;
  }>,
  options: {
    aiModel?: string;
    groupId?: string;
    sourceChapterNodeId?: string;
    baseX?: number;
    baseY?: number;
  } = {}
): CanvasDocument {
  const baseX = options.baseX ?? (sourceNode ? sourceNode.position.x + 360 : 700);
  const baseY = options.baseY ?? (sourceNode ? sourceNode.position.y + 230 : 260);
  const groupId = options.groupId ?? "generated-storyboard";
  const edgePrefix = options.groupId
    ? `edge-generated-storyboard-${safeId(groupId)}-`
    : "edge-generated-storyboard-";
  const nodes = canvas.nodes.filter((node) =>
    options.groupId
      ? node.data.generatedGroupId !== groupId
      : node.data.generatedBy !== "generate-storyboard"
  );
  const edges = canvas.edges.filter((edge) => !edge.id.startsWith(edgePrefix));
  const generatedNodes: CanvasNode[] = [];
  const generatedEdges: CanvasDocument["edges"] = [];

  scenes.forEach((scene, index) => {
    const sceneId = options.groupId
      ? `${safeId(groupId)}-scene-${index + 1}`
      : `scene-generated-${index + 1}`;
    const sceneNodeId = `node-${sceneId}`;
    const y = baseY + index * 210;
    generatedNodes.push({
      id: sceneNodeId,
      kind: "scene",
      refId: sceneId,
      position: { x: baseX, y },
      size: { width: 280, height: 170 },
      status: "ready",
      data: {
        generatedBy: "generate-storyboard",
        generatedGroupId: groupId,
        sourceChapterNodeId: options.sourceChapterNodeId,
        title: scene.title,
        description: scene.description,
        narration: scene.narration,
        sceneType: scene.sceneType,
        durationSec: scene.durationSec,
        visualPrompt: scene.visualPrompt,
        caption: scene.caption
      }
    });

    if (sourceNode) {
      generatedEdges.push({
        id: `${edgePrefix}${index + 1}`,
        fromNodeId: sourceNode.id,
        toNodeId: sceneNodeId,
        relation: "produces"
      });
    }
  });

  return {
    ...canvas,
    nodes: nodes
      .map((node) =>
        sourceNode && node.id === sourceNode.id
          ? {
              ...node,
              status: "ready" as const,
              data: {
                ...node.data,
                generatedSceneCount: scenes.length,
                aiModel: options.aiModel,
                expandedGroupId: groupId
              }
            }
          : node
      )
      .concat(generatedNodes),
    edges: edges.concat(generatedEdges)
  };
}

function createChapterPlan(
  scriptText: string,
  chapterCountInput: number,
  targetDurationSec: number
): ChapterPlan[] {
  const chapterCount = Math.max(1, Math.min(Math.round(chapterCountInput), 24));
  const paragraphs = splitScriptParagraphs(scriptText);
  const durationPerChapter = Math.max(30, Math.round(targetDurationSec / chapterCount));

  return Array.from({ length: chapterCount }, (_, index) => {
    const chunk = paragraphChunk(paragraphs, index, chapterCount);
    const fallbackTitle = `第 ${index + 1} 章`;
    const firstLine = chunk[0] ?? fallbackTitle;
    const title = makeChapterTitle(firstLine, index + 1);
    const chapterScriptText = chunk.join("\n\n") || firstLine;

    return {
      title,
      summary: summarizeText(chapterScriptText, 80),
      chapterScriptText,
      durationSec: durationPerChapter,
      sceneCount: getDefaultSceneCount(durationPerChapter)
    };
  });
}

function getDefaultChapterCount(targetDurationSec: number) {
  if (targetDurationSec <= 60) return 1;
  if (targetDurationSec <= 300) return 5;
  if (targetDurationSec <= 900) return 8;
  return 12;
}

function getDefaultSceneCount(targetDurationSec: number) {
  if (targetDurationSec <= 30) return 5;
  if (targetDurationSec <= 60) return 8;
  if (targetDurationSec <= 180) return 4;
  if (targetDurationSec <= 300) return 6;
  return 8;
}

function splitScriptParagraphs(scriptText: string) {
  const paragraphs = scriptText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (paragraphs.length > 0) {
    return paragraphs;
  }

  const compact = scriptText.trim();
  return compact ? compact.match(/.{1,120}/g) ?? [compact] : ["先写入本章文案，再展开分镜。"];
}

function paragraphChunk(paragraphs: string[], index: number, total: number) {
  const start = Math.floor((paragraphs.length * index) / total);
  const end = Math.max(start + 1, Math.floor((paragraphs.length * (index + 1)) / total));
  return paragraphs.slice(start, end);
}

function makeChapterTitle(text: string, index: number) {
  const cleaned = text
    .replace(/[，。！？、,.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const title = cleaned.slice(0, 18);
  return title ? `${index}. ${title}` : `第 ${index} 章`;
}

function summarizeText(text: string, maxLength: number) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function ensureCanvasEdge(
  edges: CanvasDocument["edges"],
  edge: CanvasDocument["edges"][number]
) {
  return edges.some(
    (existing) => existing.fromNodeId === edge.fromNodeId && existing.toNodeId === edge.toNodeId
  )
    ? edges
    : edges.concat(edge);
}

function updateNodeData(canvas: CanvasDocument, nodeId: string, data: Record<string, unknown>) {
  return {
    ...canvas,
    nodes: canvas.nodes.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            status: "ready" as const,
            refId: stringInput(data.refId) ?? node.refId,
            data: {
              ...node.data,
              ...data
            }
          }
        : node
    )
  };
}

function stringInput(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberInput(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanInput(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function stringArrayInput(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function stringData(node: CanvasNode | undefined, key: string) {
  const value = node?.data[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberData(node: CanvasNode | undefined, key: string) {
  const value = node?.data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function birthInputFromJob(job: Job, chartNode: CanvasNode | undefined): BirthChartInput | undefined {
  const date = stringInput(job.input.birthDate) ?? stringData(chartNode, "birthDate");
  const time = stringInput(job.input.birthTime) ?? stringData(chartNode, "birthTime");
  const timezoneOffsetMinutes =
    numberInput(job.input.timezoneOffsetMinutes) ?? numberData(chartNode, "timezoneOffsetMinutes");
  const latitude = numberInput(job.input.latitude) ?? numberData(chartNode, "latitude");
  const longitude = numberInput(job.input.longitude) ?? numberData(chartNode, "longitude");

  if (
    !date ||
    !time ||
    timezoneOffsetMinutes === undefined ||
    latitude === undefined ||
    longitude === undefined
  ) {
    return undefined;
  }

  return {
    date,
    time,
    timezoneOffsetMinutes,
    latitude,
    longitude,
    placeName: stringInput(job.input.placeName) ?? stringData(chartNode, "placeName"),
    label: stringInput(job.input.label) ?? stringData(chartNode, "label"),
    houseSystem: "equal"
  };
}

function renderD3VisualAssetSvg(node: CanvasNode, title: string) {
  const diagram = normalizeD3Diagram(stringData(node, "diagram"));
  const data = jsonRecordData(node, "dataJson");
  const body =
    diagram === "distribution"
      ? renderDistributionSvg(data)
      : diagram === "relationship"
        ? renderRelationshipSvg(data)
        : diagram === "tree"
          ? renderTreeSvg(data)
          : renderTimelineSvg(data);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <rect width="1080" height="1080" rx="0" fill="#f7f1df"/>
  <text x="72" y="120" fill="#9b6828" font-size="34" font-family="sans-serif" font-weight="900">D3 ${escapeXml(diagram)}</text>
  <text x="72" y="188" fill="#18352f" font-size="62" font-family="sans-serif" font-weight="900">${escapeXml(title)}</text>
  ${body}
</svg>`;
}

function renderTimelineSvg(data: Record<string, unknown> | undefined) {
  const points = timelineVisualPoints(data);
  const count = Math.max(points.length - 1, 1);
  const circles = points
    .map((point, index) => {
      const x = 126 + (index / count) * 828;
      const y = index % 2 === 0 ? 540 : 430;
      return `<g>
    <line x1="${x}" y1="540" x2="${x}" y2="${y}" stroke="#c89437" stroke-width="8"/>
    <circle cx="${x}" cy="${y}" r="34" fill="#c89437"/>
    <text x="${x}" y="${y + 86}" text-anchor="middle" fill="#18352f" font-size="30" font-family="sans-serif" font-weight="900">${escapeXml(point.label)}</text>
  </g>`;
    })
    .join("\n");

  return `<g>
  <line x1="126" y1="540" x2="954" y2="540" stroke="#26443d" stroke-width="10"/>
  ${circles}
</g>`;
}

function renderDistributionSvg(data: Record<string, unknown> | undefined) {
  const points = distributionVisualPoints(data);
  const maxValue = Math.max(1, ...points.map((point) => point.value));

  return `<g transform="translate(120 360)">
  ${points
    .slice(0, 5)
    .map((point, index) => {
      const y = index * 112;
      const width = Math.max(80, (point.value / maxValue) * 760);
      const fill = index % 2 === 0 ? "#26443d" : "#c89437";
      return `<g transform="translate(0 ${y})">
    <text x="0" y="0" fill="#18352f" font-size="34" font-family="sans-serif" font-weight="900">${escapeXml(point.label)}</text>
    <rect x="0" y="24" width="780" height="54" rx="10" fill="#e8dcc4"/>
    <rect x="0" y="24" width="${width}" height="54" rx="10" fill="${fill}"/>
  </g>`;
    })
    .join("\n")}
</g>`;
}

function renderRelationshipSvg(data: Record<string, unknown> | undefined) {
  const fallbackNodes = ["Birth moment", "Eastern horizon", "Rising sign", "Visible style"];
  const nodes = Array.isArray(data?.nodes)
    ? data.nodes.flatMap((item) => (typeof item === "string" ? [item] : []))
    : fallbackNodes;
  const fallbackLinks: Array<[string, string]> = [
    ["Birth moment", "Eastern horizon"],
    ["Eastern horizon", "Rising sign"],
    ["Rising sign", "Visible style"]
  ];
  const links: Array<[string, string]> = Array.isArray(data?.links)
    ? data.links.flatMap((item) => {
        if (!Array.isArray(item) || item.length < 2) {
          return [];
        }

        const source = typeof item[0] === "string" ? item[0] : undefined;
        const target = typeof item[1] === "string" ? item[1] : undefined;
        return source && target ? [[source, target] as [string, string]] : [];
      })
    : fallbackLinks;
  const centerX = 540;
  const centerY = 560;
  const radius = 260;
  const positions = new Map(
    nodes.slice(0, 8).map((node, index) => {
      const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
      return [node, { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius }];
    })
  );
  const linkSvg = links
    .map(([source, target]) => {
      const start = positions.get(source);
      const end = positions.get(target);
      return start && end
        ? `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="#9fb3a2" stroke-width="8" stroke-linecap="round"/>`
        : "";
    })
    .join("\n");
  const nodeSvg = [...positions.entries()]
    .map(
      ([node, position], index) => `<g>
    <circle cx="${position.x}" cy="${position.y}" r="44" fill="${index === 0 ? "#26443d" : "#c89437"}"/>
    <text x="${position.x}" y="${position.y + 78}" text-anchor="middle" fill="#18352f" font-size="30" font-family="sans-serif" font-weight="900">${escapeXml(node)}</text>
  </g>`
    )
    .join("\n");

  return `<g>${linkSvg}${nodeSvg}</g>`;
}

function renderTreeSvg(data: Record<string, unknown> | undefined) {
  const root = stringFromRecord(data ?? {}, "root") ?? "Rising sign";
  const children = Array.isArray(data?.children)
    ? data.children.flatMap((item) => (typeof item === "string" ? [item] : []))
    : ["First impression", "Body language", "Fast reaction", "Style entry point"];
  const visibleChildren = children.slice(0, 5);
  const step = visibleChildren.length > 1 ? 720 / (visibleChildren.length - 1) : 1;

  return `<g>
  <circle cx="540" cy="380" r="58" fill="#26443d"/>
  <text x="540" y="480" text-anchor="middle" fill="#18352f" font-size="38" font-family="sans-serif" font-weight="900">${escapeXml(root)}</text>
  ${visibleChildren
    .map((child, index) => {
      const x = 180 + index * step;
      const y = 700;
      return `<g>
    <path d="M 540 440 C 540 565, ${x} 565, ${x} ${y - 58}" fill="none" stroke="#c89437" stroke-width="8"/>
    <circle cx="${x}" cy="${y}" r="44" fill="#fefbf2" stroke="#26443d" stroke-width="8"/>
    <text x="${x}" y="${y + 86}" text-anchor="middle" fill="#18352f" font-size="30" font-family="sans-serif" font-weight="900">${escapeXml(child)}</text>
  </g>`;
    })
    .join("\n")}
</g>`;
}

function renderThreeVisualAssetSvg(node: CanvasNode, title: string) {
  const data = jsonRecordData(node, "dataJson");
  const scene = normalizeThreeScene(stringData(node, "threeScene"));
  const accentColor =
    stringFromRecord(data ?? {}, "accentColor") ?? stringData(node, "accentColor") ?? "#e8c164";
  const focus = stringFromRecord(data ?? {}, "focus") ?? (scene === "planet-focus" ? "Sun" : "Ascendant");
  const stars = Array.from({ length: scene === "zodiac-space" ? 70 : 42 }, (_, index) => {
    const x = 80 + ((index * 137) % 920);
    const y = 240 + ((index * 211) % 670);
    const r = index % 6 === 0 ? 4 : 2;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fbfaf4" opacity="${index % 4 === 0 ? "0.9" : "0.55"}"/>`;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <radialGradient id="glow" cx="50%" cy="48%" r="55%">
      <stop offset="0%" stop-color="${escapeXml(accentColor)}" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="#1b3f39" stop-opacity="0.88"/>
      <stop offset="100%" stop-color="#102c2a" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#glow)"/>
  ${stars}
  <text x="74" y="122" fill="${escapeXml(accentColor)}" font-size="34" font-family="sans-serif" font-weight="900">Three.js ${escapeXml(scene)}</text>
  <text x="74" y="190" fill="#fbfaf4" font-size="62" font-family="sans-serif" font-weight="900">${escapeXml(title)}</text>
  <g transform="translate(540 590)">
    <ellipse cx="0" cy="0" rx="350" ry="118" fill="none" stroke="${escapeXml(accentColor)}" stroke-opacity="0.76" stroke-width="10"/>
    <ellipse cx="0" cy="0" rx="235" ry="78" fill="none" stroke="#fbfaf4" stroke-opacity="0.34" stroke-width="7"/>
    <circle cx="350" cy="0" r="34" fill="${escapeXml(accentColor)}"/>
    <circle cx="-235" cy="0" r="22" fill="#fbfaf4" opacity="0.72"/>
    <circle cx="0" cy="0" r="${scene === "planet-focus" ? 112 : 94}" fill="#fbfaf4" opacity="0.92"/>
    <circle cx="0" cy="0" r="${scene === "planet-focus" ? 84 : 70}" fill="#26443d"/>
    <text x="0" y="11" text-anchor="middle" fill="#fbfaf4" font-size="${focus.length > 8 ? 30 : 40}" font-family="sans-serif" font-weight="900">${escapeXml(focus)}</text>
  </g>
</svg>`;
}

function timelineVisualPoints(data: Record<string, unknown> | undefined) {
  const events = Array.isArray(data?.events) ? data.events : [];
  const points = events.flatMap((event, index) => {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      return [];
    }

    const record = event as Record<string, unknown>;
    const label = stringFromRecord(record, "label");
    const value = numberFromRecord(record, "value") ?? index;
    return label ? [{ label, value }] : [];
  });

  return points.length > 0
    ? points.slice(0, 6)
    : [
        { label: "Birth moment", value: 0 },
        { label: "Eastern horizon", value: 1 },
        { label: "Rising sign", value: 2 },
        { label: "First impression", value: 3 }
      ];
}

function distributionVisualPoints(data: Record<string, unknown> | undefined) {
  const values = Array.isArray(data?.values) ? data.values : [];
  const points = values.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const label = stringFromRecord(record, "label");
    const value = numberFromRecord(record, "value");
    return label && value !== undefined ? [{ label, value }] : [];
  });

  return points.length > 0
    ? points.slice(0, 5)
    : [
        { label: "Outer response", value: 42 },
        { label: "Expression style", value: 34 },
        { label: "First impression", value: 24 }
      ];
}

function jsonRecordData(node: CanvasNode | undefined, key: string) {
  const raw = stringData(node, key);

  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeD3Diagram(value: string | undefined) {
  return value === "relationship" || value === "tree" || value === "distribution" ? value : "timeline";
}

function normalizeThreeScene(value: string | undefined) {
  return value === "zodiac-space" || value === "planet-focus" ? value : "orbit";
}

async function writeMockSvg(outputPath: string, prompt: string) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536">
      <rect width="1024" height="1536" fill="#fbfaf4"/>
      <path d="M258 1120 258 430 720 330 720 1000 258 1120Z" fill="none" stroke="#17352f" stroke-width="18"/>
      <path d="M390 1086 390 520 720 330" fill="none" stroke="#17352f" stroke-width="14"/>
      <circle cx="690" cy="320" r="18" fill="#c89437"/>
      <text x="96" y="1320" fill="#17352f" font-size="38" font-family="sans-serif">${escapeXml(prompt.slice(0, 80))}</text>
    </svg>`,
    "utf8"
  );
}

async function writeMockWav(outputPath: string, durationSec: number) {
  const sampleRate = 16000;
  const channels = 1;
  const bitsPerSample = 16;
  const totalSamples = Math.max(sampleRate, Math.round(durationSec * sampleRate));
  const dataSize = totalSamples * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < totalSamples; index += 1) {
    const fade = Math.min(1, index / 1200, (totalSamples - index) / 1200);
    const tone = Math.sin((2 * Math.PI * 220 * index) / sampleRate);
    const sample = Math.round(tone * 1600 * fade);
    buffer.writeInt16LE(sample, 44 + index * 2);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buffer);
}

async function writeMockTtsManifest(
  manifestPath: string,
  text: string,
  audioPath: string,
  durationSec: number
) {
  const chunks = splitCaptionText(text);
  const totalWeight = chunks.reduce((sum, chunk) => sum + Math.max(1, chunk.length), 0);
  let cursor = 0;
  const manifestChunks = chunks.map((chunk, index) => {
    const isLast = index === chunks.length - 1;
    const chunkDuration = isLast
      ? Math.max(0.1, durationSec - cursor)
      : (durationSec * Math.max(1, chunk.length)) / totalWeight;
    const item = {
      index: index + 1,
      text: chunk,
      chars: chunk.length,
      status: "done",
      audioPath,
      startSec: roundSec(cursor),
      durationSec: roundSec(chunkDuration),
      error: null
    };

    cursor += item.durationSec;
    return item;
  });

  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        version: 1,
        provider: "mock-tts",
        audioPath,
        durationSec,
        chunks: manifestChunks
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function escapeXml(value: string) {

  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stringFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
