import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { deflateSync } from "node:zlib";
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
  getImagePromptPresetAdditions,
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
import type { BirthChartInput, D3DiagramKind, GeneratedStoryboard } from "@zeroflow/providers";

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
  const concurrency = Math.max(1, Math.min(limit, 4));
  const results = [];

  for (let index = 0; index < pendingJobs.length; index += concurrency) {
    const batch = pendingJobs.slice(index, index + concurrency);
    results.push(...(await Promise.all(batch.map((job) => runJob(job.id)))));
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
    case "generate-d3":
      return generateD3(job);
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
    case "create-preview-flow":
      return createPreviewFlow(job);
    case "create-preview-node":
      return createPreviewNode(job);
    case "create-export-node":
      return createExportNode(job);
    case "create-project-export-node":
      return createProjectExportNode(job);
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
  const targetDurationSec =
    numberInput(job.input.targetDurationSec) ??
    numberData(sourceNode, "targetDurationSec") ??
    numberData(scriptNode, "targetDurationSec") ??
    defaultTargetDurationSec;
  const result = await getProviders().llm.generateScript({
    topic,
    model,
    scriptProfileId,
    targetDurationSec,
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
    targetDurationSec: result.data.targetDurationSec ?? targetDurationSec,
    sceneCount: numberData(scriptNode, "sceneCount") ?? getDefaultSceneCount(targetDurationSec),
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
    stringInput(job.input.scriptText) ?? stringData(scriptNode, "scriptText") ?? "";
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
    sceneCount: numberData(scriptNode, "sceneCount") ?? getDefaultSceneCount(targetDurationSec),
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
  const targetDurationSec =
    numberInput(job.input.targetDurationSec) ??
    numberData(sourceNode, "targetDurationSec") ??
    numberData(scriptNode, "targetDurationSec") ??
    numberData(storyboardNode, "targetDurationSec") ??
    defaultTargetDurationSec;
  const scenes = normalizeGeneratedStoryboardScenes(result.data.scenes, {
    requestedSceneCount: sceneCount,
    targetDurationSec,
    scriptText
  });
  const canvas = applyStoryboard(
    project.canvas,
    sourceNode ?? scriptNode ?? storyboardNode,
    scenes,
    {
      aiModel: model
    }
  );

  updateVideoProject(project.id, { canvas });

  return {
    provider: result.provider,
    usedMock: result.usedMock,
    requestedSceneCount: sceneCount,
    rawSceneCount: result.data.scenes.length,
    sceneCount: scenes.length,
    sceneNodeIds: scenes.map((_, index) => `node-scene-generated-${index + 1}`),
    scenes
  };
}

async function createStructureNode(job: Job) {
  const project = requireProject(job.projectId);
  const sourceNode = job.canvasNodeId
    ? project.canvas.nodes.find((node) => node.id === job.canvasNodeId)
    : undefined;
  const scriptNode =
    sourceNode?.kind === "script" ? sourceNode : findNode(project.canvas, "script");
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
  const structureNode =
    sourceNode?.kind === "structure" ? sourceNode : findNode(project.canvas, "structure");
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
    getDefaultChapterSceneCount(targetDurationSec);
  const model = stringInput(job.input.model) ?? stringData(sourceNode, "aiModel");
  const result = await getProviders().llm.generateStoryboard({
    scriptText: chapterScriptText,
    sceneCount,
    model,
    targetDurationSec
  });
  const scenes = normalizeGeneratedStoryboardScenes(result.data.scenes, {
    requestedSceneCount: sceneCount,
    targetDurationSec,
    scriptText: chapterScriptText
  });
  const groupId = `chapter-${safeId(sourceNode.id)}`;
  const canvas = applyStoryboard(project.canvas, sourceNode, scenes, {
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
    requestedSceneCount: sceneCount,
    rawSceneCount: result.data.scenes.length,
    sceneCount: scenes.length,
    sceneNodeIds: scenes.map((_, index) => `node-${groupId}-scene-${index + 1}`),
    scenes
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
  const imageStyle = normalizeImageStyle(
    stringInput(job.input.imageStyle) ??
      stringData(sourceNode, "imageStyle") ??
      stringData(sourceNode, "visualStyle")
  );

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
        "简洁的占星教学插画，清晰表达核心概念，适合短视频画面",
      aiModel: inputModel,
      imageOutputFormat: "raster",
      imageStyle
    });
    workingCanvas = upserted.canvas;
    imageNode = upserted.node;
  }

  imageNode ??= findNode(workingCanvas, "image");
  const model = normalizeImageModel(inputModel ?? stringData(imageNode, "aiModel"));
  const rawPrompt =
    stringInput(job.input.prompt) ??
    stringData(imageNode, "prompt") ??
    stringData(sceneNode, "visualPrompt") ??
    "简洁的占星教学插画，清晰表达核心概念，适合短视频画面";
  const prompt = normalizeImagePrompt(rawPrompt, {
    title: stringData(imageNode, "title") ?? stringData(sceneNode, "title"),
    description: stringData(imageNode, "description") ?? stringData(sceneNode, "description"),
    narration: stringData(imageNode, "narration") ?? stringData(sceneNode, "narration"),
    imageStyle
  });
  const promptPresetAdditions = getImagePromptPresetAdditions({
    imageStyle
  });
  const providerPrompt = appendImagePromptPresetAdditions(prompt, promptPresetAdditions);
  const requestedAssetPath = path.join(getProjectAssetDir(project.id), `${job.id}.png`);
  const result = await getProviders().image.generateImage({
    prompt: providerPrompt,
    model,
    outputPath: requestedAssetPath,
    size: "1536x1024"
  });
  const finalAssetPath = result.data.assetPath ?? requestedAssetPath;
  const finalOutputFormat = "raster";
  const finalAssetKind = "image";
  const effectiveModel = result.data.model ?? model;
  const imageSize = "size" in result.data ? result.data.size : undefined;

  if (result.usedMock) {
    await writeMockPng(finalAssetPath);
  }

  const promptMetadata =
    providerPrompt === prompt
      ? { prompt, sourcePrompt: rawPrompt === prompt ? undefined : rawPrompt }
      : {
          prompt,
          sourcePrompt: rawPrompt === prompt ? undefined : rawPrompt,
          providerPrompt,
          promptPresetAdditions
        };

  const asset = createProjectAsset({
    projectId: project.id,
    name: `插画 ${new Date().toLocaleString("zh-CN")}`,
    kind: finalAssetKind,
    path: finalAssetPath,
    metadata: {
      ...promptMetadata,
      model,
      requestedModel: model,
      effectiveModel,
      imageStyle,
      imageSize,
      provider: result.provider,
      usedMock: result.usedMock,
      outputFormat: finalOutputFormat,
      url: "url" in result.data ? result.data.url : undefined
    }
  });
  const assetUrl = `/api/project-asset?assetId=${encodeURIComponent(asset.id)}`;
  let finalImageNodeId = imageNode?.id;

  if (imageNode) {
    let targetImageNodeId = imageNode.id;
    const latestProject = getVideoProject(project.id);
    let nextCanvas = latestProject?.canvas ?? workingCanvas;

    if (sceneNode) {
      const latestSceneNode =
        nextCanvas.nodes.find((node) => node.id === sceneNode.id) ?? sceneNode;
      const upserted = upsertSceneResourceNode(nextCanvas, latestSceneNode, "image", {
        generatedBy: "generate-image",
        title: `插画 ${sceneResourceTitle(latestSceneNode)}`,
        description: sceneResourceDescription(latestSceneNode),
        durationSec: numberData(latestSceneNode, "durationSec") ?? 6,
        prompt,
        aiModel: model,
        imageOutputFormat: finalOutputFormat,
        imageStyle
      });
      nextCanvas = upserted.canvas;
      targetImageNodeId = upserted.node.id;
    } else if (!nextCanvas.nodes.some((node) => node.id === imageNode.id)) {
      nextCanvas = {
        ...nextCanvas,
        nodes: nextCanvas.nodes.concat(imageNode)
      };
    }

    finalImageNodeId = targetImageNodeId;
    updateVideoProject(project.id, {
      canvas: updateNodeData(nextCanvas, targetImageNodeId, {
        refId: asset.id,
        assetPath: finalAssetPath,
        assetId: asset.id,
        assetUrl,
        provider: result.provider,
        usedMock: result.usedMock,
        imageOutputFormat: finalOutputFormat,
        imageStyle,
        prompt,
        aiModel: model
      })
    });
  }

  addProjectAssetRef(project.id, {
    assetId: asset.id,
    assetScope: "project",
    usage: "scene",
    canvasNodeId: finalImageNodeId
  });

  return {
    provider: result.provider,
    usedMock: result.usedMock,
    assetId: asset.id,
    assetPath: finalAssetPath,
    assetUrl,
    imageNodeId: finalImageNodeId,
    model,
    requestedModel: model,
    effectiveModel,
    imageStyle,
    imageSize,
    prompt,
    providerPrompt,
    promptPresetAdditions,
    asset
  };
}

async function generateD3(job: Job) {
  const project = requireProject(job.projectId);
  const sourceNode = job.canvasNodeId
    ? project.canvas.nodes.find((node) => node.id === job.canvasNodeId)
    : undefined;
  const sceneNode = sourceNode?.kind === "scene" ? sourceNode : undefined;
  let workingCanvas = project.canvas;
  let d3Node = sourceNode?.kind === "d3" ? sourceNode : undefined;
  const preferredDiagram = normalizeD3Diagram(
    stringInput(job.input.diagram) ?? stringData(sourceNode, "diagram")
  );
  const sceneTitle = sceneNode ? sceneResourceTitle(sceneNode) : undefined;

  if (!d3Node && sceneNode) {
    const upserted = upsertSceneResourceNode(workingCanvas, sceneNode, "d3", {
      generatedBy: "generate-d3",
      title: stringInput(job.input.title) ?? `D3 ${sceneTitle}`,
      description: stringInput(job.input.description) ?? sceneResourceDescription(sceneNode),
      narration:
        stringInput(job.input.narration) ??
        stringData(sceneNode, "narration") ??
        sceneResourceDescription(sceneNode),
      durationSec: numberInput(job.input.durationSec) ?? numberData(sceneNode, "durationSec") ?? 6,
      prompt:
        stringInput(job.input.prompt) ??
        stringData(sceneNode, "visualPrompt") ??
        stringData(sceneNode, "description") ??
        sceneResourceDescription(sceneNode),
      visualPreset: preferredDiagram,
      diagram: preferredDiagram,
      renderMode: "contract",
      dataJson: stableJson(defaultD3ResourceData(preferredDiagram, sceneTitle ?? "D3"))
    });
    workingCanvas = upserted.canvas;
    d3Node = upserted.node;
  }

  d3Node ??= findNode(workingCanvas, "d3");

  if (!d3Node) {
    throw new Error("A D3 node or scene node is required to generate a D3 chart");
  }

  const title = stringInput(job.input.title) ?? stringData(d3Node, "title") ?? "D3 Diagram";
  const description =
    stringInput(job.input.description) ??
    stringData(d3Node, "description") ??
    stringData(sceneNode, "description") ??
    title;
  const narration =
    stringInput(job.input.narration) ??
    stringData(d3Node, "narration") ??
    stringData(sceneNode, "narration") ??
    description;
  const prompt =
    stringInput(job.input.prompt) ??
    stringData(d3Node, "prompt") ??
    stringData(sceneNode, "visualPrompt") ??
    description;
  const model = normalizeLlmModel(stringInput(job.input.model) ?? stringData(d3Node, "aiModel"));
  const durationSec =
    numberInput(job.input.durationSec) ?? numberData(d3Node, "durationSec") ?? 8;
  const result = await getProviders().llm.generateD3Contract({
    prompt,
    title,
    description,
    narration,
    diagram: preferredDiagram,
    durationSec,
    model
  });
  const contract = normalizeGeneratedD3Contract(result.data, {
    title,
    description,
    narration,
    diagram: preferredDiagram,
    durationSec
  });
  const canvas = updateNodeData(workingCanvas, d3Node.id, {
    generatedBy: "generate-d3",
    prompt,
    title: contract.title,
    description: contract.description,
    narration: contract.narration,
    durationSec: contract.durationSec,
    visualPreset: contract.diagram,
    diagram: contract.diagram,
    renderMode: "contract",
    dataJson: contract.dataJson,
    provider: result.provider,
    usedMock: result.usedMock,
    aiModel: model
  });

  updateVideoProject(project.id, { canvas });

  return {
    provider: result.provider,
    usedMock: result.usedMock,
    d3NodeId: d3Node.id,
    model,
    diagram: contract.diagram,
    title: contract.title,
    dataJson: contract.dataJson
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
    chunkMax: numberInput(job.input.chunkMax) ?? 80,
    pauseMs: numberInput(job.input.pauseMs) ?? 260,
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

  const ttsManifest = await readTtsManifestCues(result.data.manifestPath);
  const manifestDurationSec = totalTtsCuesDuration(ttsManifest?.cues);
  const probedAudioDurationSec = await probeAudioDurationSec(audioPath);
  const audioDurationSec = maxDurationSec(manifestDurationSec, probedAudioDurationSec);

  const asset = createProjectAsset({
    projectId: project.id,
    name: `配音 ${new Date().toLocaleString("zh-CN")}`,
    kind: "audio",
    status: "ready",
    path: audioPath,
    metadata: {
      provider: result.provider,
      usedMock: result.usedMock,
      manifestPath: result.data.manifestPath,
      manifestDurationSec,
      probedAudioDurationSec,
      audioDurationSec
    }
  });
  const assetUrl = `/api/project-asset?assetId=${encodeURIComponent(asset.id)}`;
  let finalVoiceNodeId = voiceNode?.id;

  if (voiceNode) {
    let targetVoiceNodeId = voiceNode.id;
    const latestProject = getVideoProject(project.id);
    let nextCanvas = latestProject?.canvas ?? workingCanvas;

    if (sceneNode) {
      const latestSceneNode =
        nextCanvas.nodes.find((node) => node.id === sceneNode.id) ?? sceneNode;
      const upserted = upsertSceneResourceNode(nextCanvas, latestSceneNode, "voice", {
        generatedBy: "generate-tts",
        title: `配音 ${sceneResourceTitle(latestSceneNode)}`,
        description: text,
        narration: text,
        text,
        durationSec: audioDurationSec ?? numberData(latestSceneNode, "durationSec") ?? 6,
        speed: numberData(voiceNode, "speed") ?? 1,
        volume: numberData(voiceNode, "volume") ?? 1
      });
      nextCanvas = upserted.canvas;
      targetVoiceNodeId = upserted.node.id;
    } else if (!nextCanvas.nodes.some((node) => node.id === voiceNode.id)) {
      nextCanvas = {
        ...nextCanvas,
        nodes: nextCanvas.nodes.concat(voiceNode)
      };
    }

    finalVoiceNodeId = targetVoiceNodeId;
    updateVideoProject(project.id, {
      canvas: updateNodeData(nextCanvas, targetVoiceNodeId, {
        refId: asset.id,
        assetId: asset.id,
        assetPath: audioPath,
        assetUrl,
        provider: result.provider,
        usedMock: result.usedMock,
        manifestPath: result.data.manifestPath,
        manifestDurationSec,
        probedAudioDurationSec,
        audioDurationSec
      })
    });
  }

  addProjectAssetRef(project.id, {
    assetId: asset.id,
    assetScope: "project",
    usage: "narration",
    canvasNodeId: finalVoiceNodeId
  });

  return {
    provider: result.provider,
    usedMock: result.usedMock,
    assetId: asset.id,
    assetPath: audioPath,
    assetUrl,
    audioPath,
    audioDurationSec,
    manifestDurationSec,
    probedAudioDurationSec,
    voiceNodeId: finalVoiceNodeId,
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
      timezone: stringInput(job.input.timezone) ?? "Asia/Shanghai",
      latitude: numberInput(job.input.latitude) ?? 39.9042,
      longitude: numberInput(job.input.longitude) ?? 116.4074,
      placeName: stringInput(job.input.placeName) ?? "Beijing",
      houseSystem: stringInput(job.input.houseSystem) ?? "equal",
      zodiacMode: stringInput(job.input.zodiacMode) ?? "tropical",
      siderealAyanamsa: stringInput(job.input.siderealAyanamsa) ?? "lahiri",
      planetSet: stringInput(job.input.planetSet) ?? "modern",
      nodeType: stringInput(job.input.nodeType) ?? "mean",
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
  const chartRenderer = "AstroChart SVG";
  const chartCalculator = result.data.calculation?.engine ?? "Swiss Ephemeris";
  const asset = createProjectAsset({
    projectId: project.id,
    name: "星盘 SVG",
    kind: "svg",
    path: result.data.assetPath,
    metadata: {
      provider: result.provider,
      renderer: chartRenderer,
      calculator: chartCalculator,
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
        chartSvg: result.data.svg,
        provider: result.provider,
        renderer: chartRenderer,
        calculator: chartCalculator,
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
    renderer: chartRenderer,
    calculator: chartCalculator,
    chartNodeId: chartNode?.id,
    chartSvg: result.data.svg,
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
    kind === "d3" ? sceneD3ResourceData(job, sceneNode) : sceneThreeResourceData(job, sceneNode)
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

async function createPreviewFlow(job: Job) {
  const project = requireProject(job.projectId);
  const sourceNode = job.canvasNodeId
    ? project.canvas.nodes.find((node) => node.id === job.canvasNodeId)
    : undefined;
  const anchor = resolveCompositionAnchor(project.canvas, sourceNode);

  if (!anchor.sceneNode) {
    throw new Error("A scene or scene resource node is required to create a preview flow");
  }

  const composition = upsertCompositionNode(project.canvas, anchor.sceneNode, sourceNode);
  const preview = upsertPreviewNode(composition.canvas, composition.node);

  updateVideoProject(project.id, { canvas: preview.canvas });

  return {
    provider: "local-canvas-node-factory",
    usedMock: false,
    sceneNodeId: anchor.sceneNode.id,
    compositionNodeId: composition.node.id,
    previewNodeId: preview.node.id,
    nodeId: preview.node.id
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
  const previewNode =
    sourceNode?.kind === "preview" ? sourceNode : findNode(project.canvas, "preview");

  if (!previewNode) {
    throw new Error("A preview node is required to create an export node");
  }

  const defaultFrameRange = sceneFrameRangeForPreviewNode(project.canvas, project.spec, previewNode);
  const upserted = upsertExportNode(project.canvas, previewNode, defaultFrameRange);
  updateVideoProject(project.id, { canvas: upserted.canvas });

  return {
    provider: "local-canvas-node-factory",
    usedMock: false,
    exportNodeId: upserted.node.id,
    nodeId: upserted.node.id,
    previewNodeId: previewNode.id
  };
}

async function createProjectExportNode(job: Job) {
  const project = requireProject(job.projectId);
  const upserted = upsertProjectExportNode(project.canvas);

  updateVideoProject(project.id, { canvas: upserted.canvas });

  return {
    provider: "local-canvas-node-factory",
    usedMock: false,
    exportNodeId: upserted.node.id,
    nodeId: upserted.node.id
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
  const title =
    stringData(visualNode, "title") ?? (visualNode.kind === "d3" ? "D3 Diagram" : "Three Scene");
  const svg =
    visualNode.kind === "d3"
      ? renderD3VisualAssetSvg(visualNode, title)
      : renderThreeVisualAssetSvg(visualNode, title);

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
  let project = requireProject(job.projectId);
  const refreshedCanvas = await refreshAudioDurationsForRender(project.canvas);

  if (refreshedCanvas !== project.canvas) {
    project = updateVideoProject(project.id, { canvas: refreshedCanvas }) ?? project;
  }

  const renderStill = job.type === "render-preview";
  const extension = renderStill ? "png" : "mp4";
  const assetDir = getProjectAssetDir(project.id);
  const outputPath = path.join(assetDir, `${job.id}.${extension}`);
  const specPath = path.join(assetDir, `${job.id}.spec.json`);
  const assetOrigin =
    stringInput(job.input.assetOrigin) ??
    process.env.ZEROFLOW_ASSET_ORIGIN ??
    "http://localhost:3000";
  const frame = numberInput(job.input.frame);
  const frameRange = stringInput(job.input.frameRange);
  const targetNode = resolveRenderJobTargetNode(project.canvas, renderStill, job.canvasNodeId);
  const renderTarget = resolveRenderMediaTarget(project.canvas, targetNode, renderStill);
  const renderSpec = specForRenderTarget(project.spec, renderTarget);

  await fs.mkdir(assetDir, { recursive: true });
  await fs.writeFile(specPath, JSON.stringify(renderSpec, null, 2), "utf8");

  const fastConcat = !renderStill
    ? await tryRenderProjectVideoFromSceneExports({
        assetDir,
        canvas: project.canvas,
        jobId: job.id,
        outputPath,
        renderTarget,
        spec: renderSpec
      })
    : undefined;
  const renderMethod = fastConcat?.rendered ? "ffmpeg-concat" : "remotion-render";

  if (!fastConcat?.rendered) {
    await runRemotionRender({
      assetOrigin,
      frame,
      frameRange,
      outputPath,
      renderStill,
      specPath
    });
  }

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
      renderMethod,
      concatFallbackReason: fastConcat?.fallbackReason ?? null,
      concatSegments: fastConcat?.segments ?? [],
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
    renderMethod,
    concatFallbackReason: fastConcat?.fallbackReason ?? null,
    concatSegments: fastConcat?.segments ?? [],
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
        ? findNodeById(canvas, stringData(exportNode, "sourcePreviewNodeId"))
        : undefined;
  const directCompositionNode = targetNode?.kind === "composition" ? targetNode : undefined;
  const compositionNode =
    directCompositionNode ??
    (previewNode
      ? (findNodeById(canvas, stringData(previewNode, "sourceCompositionNodeId")) ??
        findNode(canvas, "composition"))
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

type SceneExportSegment = {
  assetPath: string;
  durationSec: number;
  exportNodeId: string;
  sceneDurationSec: number;
  sceneId: string;
};

type FastConcatResult = {
  fallbackReason?: string;
  rendered: boolean;
  segments: SceneExportSegment[];
};

async function tryRenderProjectVideoFromSceneExports(input: {
  assetDir: string;
  canvas: CanvasDocument;
  jobId: string;
  outputPath: string;
  renderTarget: RenderMediaTarget;
  spec: AstroVideoSpec;
}): Promise<FastConcatResult | undefined> {
  if (!isFullProjectExportTarget(input.renderTarget)) {
    return undefined;
  }

  const segments = await resolveSceneExportSegments(input.canvas, input.spec);

  if (!segments.ok) {
    return {
      rendered: false,
      fallbackReason: segments.reason,
      segments: segments.segments
    };
  }

  const [singleSegment] = segments.segments;

  if (segments.segments.length === 1 && singleSegment) {
    await fs.copyFile(singleSegment.assetPath, input.outputPath);
    return {
      rendered: true,
      segments: segments.segments
    };
  }

  const concatListPath = path.join(input.assetDir, `${input.jobId}.concat.txt`);
  const concatList = segments.segments
    .map((segment) => `file '${toFfmpegConcatPath(segment.assetPath)}'`)
    .join("\n");

  await fs.writeFile(concatListPath, `${concatList}\n`, "utf8");

  try {
    await runFfmpegConcat(concatListPath, input.outputPath, false);
  } catch {
    try {
      await runFfmpegConcat(concatListPath, input.outputPath, true);
    } catch (error) {
      return {
        rendered: false,
        fallbackReason:
          error instanceof Error
            ? `ffmpeg concat failed: ${error.message}`
            : "ffmpeg concat failed",
        segments: segments.segments
      };
    }
  }

  return {
    rendered: true,
    segments: segments.segments
  };
}

function isFullProjectExportTarget(target: RenderMediaTarget) {
  return (
    target.targetNode?.kind === "export" &&
    target.exportNode?.kind === "export" &&
    stringData(target.exportNode, "exportScope") === "full" &&
    !stringData(target.exportNode, "sourcePreviewNodeId") &&
    target.renderScope === "project"
  );
}

async function resolveSceneExportSegments(
  canvas: CanvasDocument,
  spec: AstroVideoSpec
): Promise<
  | { ok: true; segments: SceneExportSegment[] }
  | { ok: false; reason: string; segments: SceneExportSegment[] }
> {
  if (spec.scenes.length === 0) {
    return { ok: false, reason: "project spec has no scenes", segments: [] };
  }

  if (spec.audio?.tracks.some((track) => track.kind !== "narration")) {
    return {
      ok: false,
      reason: "project has global non-narration audio tracks",
      segments: []
    };
  }

  const segments: SceneExportSegment[] = [];

  for (const scene of spec.scenes) {
    const segment = await resolveSceneExportSegment(canvas, spec, scene);

    if (!segment.ok) {
      return {
        ok: false,
        reason: segment.reason,
        segments
      };
    }

    segments.push(segment.segment);
  }

  return { ok: true, segments };
}

async function resolveSceneExportSegment(
  canvas: CanvasDocument,
  spec: AstroVideoSpec,
  scene: SceneSpec
): Promise<{ ok: true; segment: SceneExportSegment } | { ok: false; reason: string }> {
  const sceneNode = findSceneNodeForSceneSpec(canvas, scene);

  if (!sceneNode) {
    return { ok: false, reason: `missing scene node for ${scene.id}` };
  }

  const compositionNode = findCompositionNodeForSceneNode(canvas, sceneNode, scene.id);

  if (!compositionNode) {
    return { ok: false, reason: `missing composition node for ${scene.id}` };
  }

  const previewNode = canvas.nodes.find(
    (node) => node.kind === "preview" && node.data.sourceCompositionNodeId === compositionNode.id
  );

  if (!previewNode) {
    return { ok: false, reason: `missing preview node for ${scene.id}` };
  }

  const exportNode = canvas.nodes.find(
    (node) => node.kind === "export" && node.data.sourcePreviewNodeId === previewNode.id
  );
  const assetPath = stringData(exportNode, "assetPath");

  if (!exportNode || !assetPath) {
    return { ok: false, reason: `missing rendered scene export for ${scene.id}` };
  }

  if (!(await pathExists(assetPath))) {
    return { ok: false, reason: `scene export file is missing for ${scene.id}` };
  }

  const videoMetadata = await probeVideoMetadata(assetPath);
  const durationSec = videoMetadata?.durationSec;

  if (!durationSec) {
    return { ok: false, reason: `could not probe scene export duration for ${scene.id}` };
  }

  const expectedSize = getExpectedVideoSize(spec.format);

  if (
    videoMetadata.width < expectedSize.width ||
    videoMetadata.height < expectedSize.height
  ) {
    return {
      ok: false,
      reason: `scene export resolution is too low for ${scene.id}`
    };
  }

  if (durationSec + 0.35 < scene.durationSec) {
    return {
      ok: false,
      reason: `scene export is shorter than scene duration for ${scene.id}`,
    };
  }

  return {
    ok: true,
    segment: {
      assetPath,
      durationSec: roundSec(durationSec),
      exportNodeId: exportNode.id,
      sceneDurationSec: roundSec(scene.durationSec),
      sceneId: scene.id
    }
  };
}

function findSceneNodeForSceneSpec(canvas: CanvasDocument, scene: SceneSpec) {
  return (
    canvas.nodes.find((node) => node.kind === "scene" && node.refId === scene.id) ??
    canvas.nodes.find((node) => node.kind === "scene" && node.data.sceneId === scene.id)
  );
}

function findCompositionNodeForSceneNode(
  canvas: CanvasDocument,
  sceneNode: CanvasNode,
  sceneId: string
) {
  return canvas.nodes.find(
    (node) =>
      node.kind === "composition" &&
      (node.data.sourceSceneNodeId === sceneNode.id || node.data.sceneId === sceneId)
  );
}

function sceneFrameRangeForPreviewNode(
  canvas: CanvasDocument,
  spec: AstroVideoSpec,
  previewNode: CanvasNode
) {
  const compositionNode = findNodeById(canvas, stringData(previewNode, "sourceCompositionNodeId"));
  const sceneNode = resolveSceneNodeForComposition(canvas, compositionNode);
  const sceneId = sceneNode?.refId ?? sceneNode?.id ?? stringData(compositionNode, "sceneId");
  const scene = sceneId ? spec.scenes.find((item) => item.id === sceneId) : undefined;
  const durationSec =
    scene?.durationSec ??
    numberData(compositionNode, "durationSec") ??
    numberData(sceneNode, "durationSec") ??
    2;
  const fps = spec.fps || 30;

  return `0:${Math.max(1, Math.ceil(durationSec * fps))}`;
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

  const globalTtsManifest = await readTtsManifestCues(stringInput(job.input.manifestPath));
  const captionSources = await resolveCaptionSceneSources(project.canvas, project.spec.scenes, job);
  const captions = buildCaptionAlignment(
    project.spec.scenes,
    captionSources,
    globalTtsManifest?.cues
  );
  const alignmentSource = summarizeCaptionAlignmentSource(captionSources, globalTtsManifest);
  const manifestPaths = captionSourceManifestPaths(captionSources, globalTtsManifest);
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
      alignmentSource,
      manifestPath: manifestPaths[0],
      manifestPaths,
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

  const latestProject = getVideoProject(project.id);
  const canvas = applyCaptionAlignment(
    latestProject?.canvas ?? project.canvas,
    captions,
    asset.id,
    assetUrl
  );
  updateVideoProject(project.id, { canvas });

  return {
    provider: "local-caption-aligner",
    usedMock: false,
    alignmentSource,
    manifestPath: manifestPaths[0],
    manifestPaths,
    assetId: asset.id,
    assetPath: subtitlePath,
    assetUrl,
    captionNodeIds: captions.map((caption) => caption.captionNodeId),
    captions
  };
}

async function alignSceneCaption(
  job: Job,
  project: ReturnType<typeof requireProject>,
  sceneNode: CanvasNode
) {
  const sceneId = sceneNode.refId ?? sceneNode.id;
  const sceneIndex = project.canvas.nodes
    .filter((node) => node.kind === "scene")
    .sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x)
    .findIndex((node) => node.id === sceneNode.id);
  const sceneSpec = project.spec.scenes.find((scene) => scene.id === sceneId);
  const captionSource = await resolveCaptionSourceForScene(
    project.canvas,
    sceneNode,
    sceneSpec,
    job
  );
  const durationSec =
    numberInput(job.input.durationSec) ?? captionSource.durationSec;
  const cues =
    captionSource.manifest?.cues.length
      ? normalizeManifestCuesToScene(sceneId, captionSource.manifest.cues, durationSec)
      : distributeCaptionCues(sceneId, captionSource.text, durationSec);
  const energySource = captionSource.manifest?.cues.length ? "tts-manifest" : "cue-derived";
  const caption: AlignedCaption = {
    sceneId,
    captionNodeId: `node-caption-align-${safeId(sceneId)}`,
    index: Math.max(0, sceneIndex),
    text: captionSource.text,
    startSec: 0,
    durationSec,
    cues,
    textSource: captionSource.source,
    voiceNodeId: captionSource.voiceNodeId,
    manifestPath: captionSource.manifestPath,
    audioPath: captionSource.audioPath,
    audioEnergy: {
      source: energySource,
      bars: captionEnergyBarsFromCues(cues, energySource)
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
      alignmentSource: captionAlignmentSourceLabel(captionSource),
      manifestPath: captionSource.manifestPath,
      voiceNodeId: captionSource.voiceNodeId,
      sceneId,
      cueCount: caption.cues.length
    }
  });
  const assetUrl = `/api/project-asset?assetId=${encodeURIComponent(asset.id)}`;
  const latestProject = getVideoProject(project.id);
  const latestCanvas = latestProject?.canvas ?? project.canvas;
  const latestSceneNode =
    latestCanvas.nodes.find((node) => node.id === sceneNode.id) ?? sceneNode;
  const captionNodeId =
    findSceneResourceNode(latestCanvas, latestSceneNode, "caption")?.id ??
    `node-caption-align-${safeId(sceneId)}`;

  addProjectAssetRef(project.id, {
    assetId: asset.id,
    assetScope: "project",
    usage: "subtitle",
    canvasNodeId: captionNodeId
  });

  const canvas = applyCaptionAlignment(latestCanvas, [caption], asset.id, assetUrl, {
    pruneMissing: false
  });
  updateVideoProject(project.id, { canvas });

  return {
    provider: "local-caption-aligner",
    usedMock: false,
    alignmentSource: captionAlignmentSourceLabel(captionSource),
    manifestPath: captionSource.manifestPath,
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
  captionNodeId: string;
  index: number;
  text: string;
  startSec: number;
  durationSec: number;
  textSource: CaptionTextSource;
  voiceNodeId?: string;
  manifestPath?: string;
  audioPath?: string;
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

type CaptionTextSource =
  | "job-input"
  | "voice-manifest"
  | "voice-text"
  | "scene-caption"
  | "scene-narration"
  | "scene-description";

type CaptionSceneSource = {
  sceneId: string;
  text: string;
  durationSec: number;
  source: CaptionTextSource;
  manifest?: TtsManifestCues;
  manifestPath?: string;
  audioPath?: string;
  voiceNodeId?: string;
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

async function resolveCaptionSceneSources(
  canvas: CanvasDocument,
  scenes: SceneSpec[],
  job: Job
) {
  return Promise.all(
    scenes.map((scene) => {
      const sceneNode = findSceneNodeForSpec(canvas, scene);

      return sceneNode
        ? resolveCaptionSourceForScene(canvas, sceneNode, scene, job)
        : resolveCaptionSourceForSpec(scene);
    })
  );
}

async function resolveCaptionSourceForScene(
  canvas: CanvasDocument,
  sceneNode: CanvasNode,
  scene: SceneSpec | undefined,
  job?: Job
): Promise<CaptionSceneSource> {
  const sceneId = sceneNode.refId ?? sceneNode.id;
  const voiceNode = findSceneResourceNode(canvas, sceneNode, "voice");
  const manifestPath = stringData(voiceNode, "manifestPath");
  const manifest = await readTtsManifestCues(manifestPath);
  const manifestText = manifest ? joinTtsCueText(manifest.cues) : undefined;
  const voiceText =
    stringData(voiceNode, "text") ??
    stringData(voiceNode, "narration") ??
    stringData(voiceNode, "description");
  const sceneNarration = stringData(sceneNode, "narration") ?? scene?.narration;
  const sceneCaption = stringData(sceneNode, "caption") ?? scene?.caption?.text;
  const sceneDescription = stringData(sceneNode, "description") ?? scene?.title ?? " ";
  const explicitText = job ? stringInput(job.input.text) : undefined;
  const audioPath = stringData(voiceNode, "assetPath");
  const text = manifestText ?? voiceText ?? explicitText ?? sceneNarration ?? sceneCaption ?? sceneDescription;
  const source: CaptionTextSource = manifestText
    ? "voice-manifest"
    : voiceText
      ? "voice-text"
      : explicitText
        ? "job-input"
        : sceneNarration
          ? "scene-narration"
          : sceneCaption
            ? "scene-caption"
            : "scene-description";
  const manifestDurationSec = totalTtsCuesDuration(manifest?.cues);
  const probedAudioDurationSec = audioPath ? await probeAudioDurationSec(audioPath) : undefined;
  const durationSec =
    maxDurationSec(
      manifestDurationSec,
      numberData(voiceNode, "audioDurationSec"),
      probedAudioDurationSec,
      numberData(voiceNode, "durationSec"),
      numberInput(job?.input.durationSec),
      scene?.durationSec,
      numberData(sceneNode, "durationSec")
    ) ?? 6;

  return {
    sceneId,
    text,
    durationSec,
    source,
    manifest,
    manifestPath,
    audioPath,
    voiceNodeId: voiceNode?.id
  };
}

function resolveCaptionSourceForSpec(scene: SceneSpec): CaptionSceneSource {
  return {
    sceneId: scene.id,
    text: scene.narration || scene.caption?.text || scene.title || " ",
    durationSec: scene.durationSec,
    source: scene.narration ? "scene-narration" : "scene-caption"
  };
}

function findSceneNodeForSpec(canvas: CanvasDocument, scene: SceneSpec) {
  return (
    canvas.nodes.find((node) => node.kind === "scene" && node.refId === scene.id) ??
    canvas.nodes.find((node) => node.kind === "scene" && node.data.sceneId === scene.id)
  );
}

function summarizeCaptionAlignmentSource(
  sources: CaptionSceneSource[],
  globalManifest: TtsManifestCues | undefined
) {
  if (sources.some((source) => source.manifest?.cues.length)) {
    return "voice-tts-manifest";
  }

  if (globalManifest) {
    return "global-tts-manifest";
  }

  if (sources.some((source) => source.source === "voice-text")) {
    return "voice-text-estimate";
  }

  if (sources.some((source) => source.source === "scene-narration")) {
    return "scene-narration-estimate";
  }

  return "estimated-scene-duration";
}

function captionAlignmentSourceLabel(source: CaptionSceneSource) {
  if (source.manifest?.cues.length) {
    return "voice-tts-manifest";
  }

  if (source.source === "voice-text") {
    return "voice-text-estimate";
  }

  if (source.source === "job-input") {
    return "job-input";
  }

  if (source.source === "scene-narration") {
    return "scene-narration-estimate";
  }

  return "estimated-scene-duration";
}

function captionSourceManifestPaths(
  sources: CaptionSceneSource[],
  globalManifest: TtsManifestCues | undefined
) {
  return Array.from(
    new Set(
      sources
        .map((source) => source.manifestPath)
        .concat(globalManifest?.manifestPath)
        .filter((manifestPath): manifestPath is string => Boolean(manifestPath))
    )
  );
}

function buildCaptionAlignment(
  scenes: SceneSpec[],
  captionSources: CaptionSceneSource[] = [],
  globalTtsCues: TtsManifestCue[] = []
): AlignedCaption[] {
  let cursor = 0;
  let ttsCursor = 0;
  const sourceBySceneId = new Map(captionSources.map((source) => [source.sceneId, source]));

  return scenes.map((scene, index) => {
    const source = sourceBySceneId.get(scene.id);
    const text = source?.text ?? scene.caption?.text ?? scene.narration;
    const durationSec = source?.durationSec ?? scene.durationSec;
    const sourceManifestCues = source?.manifest?.cues ?? [];
    const manifestSlice =
      sourceManifestCues.length > 0
        ? { cues: sourceManifestCues, nextIndex: ttsCursor }
        : takeManifestCuesForScene(globalTtsCues, ttsCursor, scene, index, scenes.length, text);
    const cues =
      manifestSlice.cues.length > 0
        ? normalizeManifestCuesToScene(scene.id, manifestSlice.cues, durationSec)
        : distributeCaptionCues(scene.id, text, durationSec);
    const energySource = manifestSlice.cues.length > 0 ? "tts-manifest" : "cue-derived";
    const caption: AlignedCaption = {
      sceneId: scene.id,
      captionNodeId: `node-caption-align-${safeId(scene.id)}`,
      index,
      text,
      startSec: roundSec(cursor),
      durationSec,
      textSource: source?.source ?? (scene.caption?.text ? "scene-caption" : "scene-narration"),
      voiceNodeId: source?.voiceNodeId,
      manifestPath: source?.manifestPath,
      audioPath: source?.audioPath,
      cues,
      audioEnergy: {
        source: energySource,
        bars: captionEnergyBarsFromCues(cues, energySource)
      }
    };

    cursor += durationSec;
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
      amplitude: roundSec(
        Math.min(1, Math.max(0.08, 0.28 + textWeight * 0.48 + cadence + sourceBoost))
      )
    };
  });
}

function takeManifestCuesForScene(
  ttsCues: TtsManifestCue[],
  startIndex: number,
  scene: SceneSpec,
  sceneIndex: number,
  sceneCount: number,
  targetText = scene.narration
) {
  if (startIndex >= ttsCues.length) {
    return { cues: [], nextIndex: startIndex };
  }

  const remainingScenes = sceneCount - sceneIndex;
  const maxEndIndex = Math.max(startIndex + 1, ttsCues.length - (remainingScenes - 1));
  const targetLength = Math.max(1, normalizeCaptionText(targetText).length);
  const selected: TtsManifestCue[] = [];
  let cursor = startIndex;
  let accumulatedLength = 0;

  while (
    cursor < maxEndIndex &&
    (selected.length === 0 || accumulatedLength < targetLength * 0.78)
  ) {
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
    return distributeCaptionCues(sceneId, cues.map((cue) => cue.text).join(""), durationSec);
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

function joinTtsCueText(cues: TtsManifestCue[]) {
  const text = cues
    .map((cue) => cue.text.trim())
    .filter(Boolean)
    .join("");

  return text.replace(/\s+/g, " ").trim() || undefined;
}

function totalTtsCuesDuration(cues: TtsManifestCue[] | undefined) {
  if (!cues || cues.length === 0) {
    return undefined;
  }

  const durationSec = cues.reduce(
    (total, cue) => Math.max(total, (cue.startSec ?? 0) + cue.durationSec),
    0
  );
  return durationSec > 0 ? roundSec(durationSec) : undefined;
}

async function readTtsManifestCues(
  manifestPath: string | undefined
): Promise<TtsManifestCues | undefined> {
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
    const cues = parsed
      .filter((cue): cue is TtsManifestCue => Boolean(cue))
      .flatMap((cue) => expandTtsCueBySentences(cue));

    if (cues.length === 0) {
      return undefined;
    }

    let cursor = 0;
    const normalized = cues.map((cue) => {
      const startSec =
        typeof cue.startSec === "number" && Number.isFinite(cue.startSec) ? cue.startSec : cursor;
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

function expandTtsCueBySentences(cue: TtsManifestCue): TtsManifestCue[] {
  const chunks = splitCaptionText(cue.text);

  if (chunks.length <= 1) {
    return [cue];
  }

  const totalWeight = chunks.reduce((sum, chunk) => sum + Math.max(1, chunk.length), 0);
  let cursor = 0;

  return chunks.map((chunk, index) => {
    const isLast = index === chunks.length - 1;
    const remaining = Math.max(0.05, cue.durationSec - cursor);
    const duration = isLast
      ? remaining
      : Math.min(remaining, Math.max(0.05, (cue.durationSec * Math.max(1, chunk.length)) / totalWeight));
    const startSec = cue.startSec === undefined ? undefined : cue.startSec + cursor;

    cursor += duration;

    return {
      text: chunk,
      startSec,
      durationSec: duration
    };
  });
}

async function refreshAudioDurationsForRender(canvas: CanvasDocument) {
  let changed = false;
  const nodes = await Promise.all(
    canvas.nodes.map(async (node) => {
      if (node.kind !== "voice") {
        return node;
      }

      const assetPath = stringData(node, "assetPath");
      const actualDurationSec = assetPath ? await probeAudioDurationSec(assetPath) : undefined;
      const currentAudioDurationSec = numberData(node, "audioDurationSec") ?? 0;
      const currentDurationSec = numberData(node, "durationSec") ?? 0;

      if (!actualDurationSec || actualDurationSec <= currentAudioDurationSec + 0.05) {
        return node;
      }

      changed = true;
      const durationSec = roundSec(actualDurationSec);

      return {
        ...node,
        data: {
          ...node.data,
          audioDurationSec: durationSec,
          durationSec: Math.max(currentDurationSec, durationSec)
        }
      };
    })
  );

  return changed ? { ...canvas, nodes } : canvas;
}

function probeAudioDurationSec(audioPath: string) {
  return probeMediaDurationSec(audioPath);
}

function probeVideoMetadata(videoPath: string) {
  return new Promise<{ durationSec: number; height: number; width: number } | undefined>(
    (resolve) => {
      const child = spawn(
        "ffprobe",
        [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=width,height:format=duration",
          "-of",
          "json",
          videoPath
        ],
        { shell: false }
      );
      let stdout = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += String(chunk);
      });
      child.on("error", () => resolve(undefined));
      child.on("close", () => {
        try {
          const metadata = JSON.parse(stdout) as {
            format?: { duration?: unknown };
            streams?: Array<{ height?: unknown; width?: unknown }>;
          };
          const stream = metadata.streams?.[0];
          const durationSec = Number(metadata.format?.duration);
          const width = Number(stream?.width);
          const height = Number(stream?.height);

          if (
            Number.isFinite(durationSec) &&
            durationSec > 0 &&
            Number.isFinite(width) &&
            width > 0 &&
            Number.isFinite(height) &&
            height > 0
          ) {
            resolve({ durationSec, height, width });
            return;
          }
        } catch {
          // Fall through to undefined.
        }

        resolve(undefined);
      });
    }
  );
}

function getExpectedVideoSize(format: AstroVideoSpec["format"]) {
  if (format === "landscape") {
    return { height: 1080, width: 1920 };
  }

  if (format === "square") {
    return { height: 1080, width: 1080 };
  }

  return { height: 1920, width: 1080 };
}

function probeMediaDurationSec(mediaPath: string) {
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
        mediaPath
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

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runFfmpegConcat(listPath: string, outputPath: string, reencode: boolean) {
  const args = [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    ...(reencode
      ? ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart"]
      : ["-c", "copy"]),
    outputPath
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
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

      reject(new Error(stderr.slice(-1600) || `ffmpeg exited with code ${code}`));
    });
  });
}

function toFfmpegConcatPath(filePath: string) {
  return path.resolve(filePath).replaceAll("\\", "/").replaceAll("'", "'\\''");
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
        : (nodes[existingIndex]?.id ?? `node-caption-align-${safeId(caption.sceneId)}`);
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
        textSource: caption.textSource,
        voiceNodeId: caption.voiceNodeId,
        manifestPath: caption.manifestPath,
        audioPath: caption.audioPath,
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

    if (
      anchor &&
      !edges.some((edge) => edge.toNodeId === nodeId && edge.fromNodeId === anchor.id)
    ) {
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

    nodes = nodes.map((node) => {
      if (
        node.kind !== "composition" ||
        !(
          node.data.sceneId === caption.sceneId ||
          (anchor && node.data.sourceSceneNodeId === anchor.id)
        )
      ) {
        return node;
      }

      const currentDurationSec = numberData(node, "durationSec") ?? 0;

      if (currentDurationSec >= caption.durationSec) {
        return node;
      }

      return {
        ...node,
        data: {
          ...node.data,
          durationSec: caption.durationSec
        }
      };
    });
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

function maxDurationSec(...values: Array<number | undefined>) {
  const finiteValues = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0
  );

  if (finiteValues.length === 0) {
    return undefined;
  }

  return roundSec(Math.max(...finiteValues));
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

type SceneResourceKind = Extract<
  CanvasNode["kind"],
  "caption" | "voice" | "chart" | "image" | "d3" | "three"
>;

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
  const narration =
    stringInput(job.input.narration) ??
    stringData(sceneNode, "narration") ??
    sceneResourceDescription(sceneNode);
  const diagram = normalizeD3Diagram(stringInput(job.input.diagram));
  const visualPreset = stringInput(job.input.visualPreset) ?? diagram;

  return {
    generatedBy: "create-d3-node",
    title,
    description: stringInput(job.input.description) ?? sceneResourceDescription(sceneNode),
    narration,
    durationSec: numberInput(job.input.durationSec) ?? numberData(sceneNode, "durationSec") ?? 6,
    visualPreset,
    diagram,
    renderMode: "contract",
    dataJson:
      stringInput(job.input.dataJson) ??
      JSON.stringify(defaultD3ResourceData(diagram, sceneResourceTitle(sceneNode)), null, 2)
  };
}

function defaultD3ResourceData(diagram: ReturnType<typeof normalizeD3Diagram>, title: string) {
  if (diagram === "relationship") {
    return {
      nodes: ["Concept", title, "Evidence", "Practice"],
      links: [
        ["Concept", title],
        [title, "Evidence"],
        [title, "Practice"]
      ]
    };
  }

  if (diagram === "tree") {
    return {
      root: title,
      children: ["Concept", "Evidence", "Practice", "Takeaway"]
    };
  }

  if (diagram === "distribution") {
    return {
      values: [
        { label: "Concept", value: 34 },
        { label: title, value: 42 },
        { label: "Practice", value: 24 }
      ]
    };
  }

  return {
    events: [
      { label: "Concept", value: 0 },
      { label: title, value: 1 },
      { label: "Evidence", value: 2 },
      { label: "Practice", value: 3 }
    ]
  };
}

function normalizeGeneratedD3Contract(
  input: {
    title?: string;
    description?: string;
    narration?: string;
    diagram?: D3DiagramKind;
    durationSec?: number;
    data?: unknown;
    dataJson?: string;
  },
  fallback: {
    title: string;
    description: string;
    narration: string;
    diagram: D3DiagramKind;
    durationSec: number;
  }
) {
  const diagram = normalizeD3Diagram(input.diagram ?? fallback.diagram);
  const data =
    normalizeD3Data(
      diagram,
      input.data ??
        (typeof input.dataJson === "string" ? parseJsonValue(input.dataJson) : undefined)
    ) ?? defaultD3ResourceData(diagram, fallback.title);

  return {
    title: compactUiText(input.title, fallback.title, 54),
    description: compactUiText(input.description, fallback.description, 140),
    narration: compactUiText(input.narration, fallback.narration, 260),
    diagram,
    durationSec: clampNumber(input.durationSec ?? fallback.durationSec, 1, 30),
    dataJson: stableJson(data)
  };
}

function normalizeD3Data(diagram: D3DiagramKind, value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

  if (!record) {
    return null;
  }

  if (diagram === "relationship") {
    const nodes = Array.isArray(record.nodes)
      ? record.nodes.flatMap((node) => (typeof node === "string" && node.trim() ? [node.trim()] : []))
      : [];
    const nodeSet = new Set(nodes);
    const links = Array.isArray(record.links)
      ? record.links.flatMap((link) => {
          if (!Array.isArray(link) || link.length < 2) {
            return [];
          }

          const source = typeof link[0] === "string" ? link[0].trim() : "";
          const target = typeof link[1] === "string" ? link[1].trim() : "";

          return source && target && nodeSet.has(source) && nodeSet.has(target)
            ? [[source, target]]
            : [];
        })
      : [];

    return nodes.length >= 2 && links.length > 0
      ? { nodes: nodes.slice(0, 8), links: links.slice(0, 10) }
      : null;
  }

  if (diagram === "tree") {
    const root = typeof record.root === "string" && record.root.trim() ? record.root.trim() : "";
    const children = Array.isArray(record.children)
      ? record.children.flatMap((child) =>
          typeof child === "string" && child.trim() ? [child.trim()] : []
        )
      : [];

    return root && children.length > 0 ? { root, children: children.slice(0, 6) } : null;
  }

  if (diagram === "distribution") {
    const values = Array.isArray(record.values)
      ? record.values.flatMap((item) => normalizeD3Point(item))
      : [];

    return values.length > 0 ? { values: values.slice(0, 6) } : null;
  }

  const events = Array.isArray(record.events)
    ? record.events.flatMap((item, index) => normalizeD3Point(item, index))
    : [];

  return events.length > 0 ? { events: events.slice(0, 7) } : null;
}

function normalizeD3Point(value: unknown, fallbackValue = 1) {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
  const label = typeof record?.label === "string" ? record.label.trim() : "";
  const rawValue = record?.value;
  const pointValue = typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : fallbackValue;

  return label ? [{ label, value: pointValue }] : [];
}

function parseJsonValue(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function stableJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function compactUiText(value: unknown, fallback: string, limit: number) {
  const text = typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;

  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function sceneThreeResourceData(job: Job, sceneNode: CanvasNode) {
  const title = stringInput(job.input.title) ?? `Three ${sceneResourceTitle(sceneNode)}`;
  const narration =
    stringInput(job.input.narration) ??
    stringData(sceneNode, "narration") ??
    sceneResourceDescription(sceneNode);

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

  const sceneNodeId =
    stringData(sourceNode, "sourceSceneNodeId") ?? stringData(sourceNode, "sceneNodeId");
  const sceneId = stringData(sourceNode, "sceneId");
  const sceneNode =
    (sceneNodeId
      ? canvas.nodes.find((node) => node.id === sceneNodeId && node.kind === "scene")
      : undefined) ??
    (sceneId
      ? canvas.nodes.find((node) => node.kind === "scene" && node.refId === sceneId)
      : undefined);

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
  const captionNode = findSceneResourceNode(canvas, sceneNode, "caption");
  const voiceNode = findSceneResourceNode(canvas, sceneNode, "voice");
  const durationSec = Math.max(
    numberData(existingNode, "durationSec") ?? 0,
    numberData(captionNode, "durationSec") ?? 0,
    numberData(voiceNode, "audioDurationSec") ?? 0,
    numberData(voiceNode, "durationSec") ?? 0,
    numberData(sceneNode, "durationSec") ?? 6
  );
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
      durationSec,
      primaryVisualKind: existingNode?.data.primaryVisualKind ?? "auto",
      secondaryVisualKind: existingNode?.data.secondaryVisualKind ?? "none",
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
  const existingNode =
    canvas.nodes.find(
      (node) =>
        node.kind === "preview" && node.data.sourceCompositionNodeId === compositionNode.id
    ) ??
    canvas.nodes.find(
      (node) =>
        node.kind === "preview" &&
        node.id === "node-preview" &&
        !stringData(node, "sourceCompositionNodeId")
    );
  const nodeId = existingNode?.id ?? `node-preview-${safeId(compositionNode.id)}`;
  const sceneId = stringData(compositionNode, "sceneId");
  const sourceSceneNodeId = stringData(compositionNode, "sourceSceneNodeId");
  const nextNode: CanvasNode = {
    id: nodeId,
    kind: "preview",
    refId: existingNode?.refId ?? `preview-${safeId(compositionNode.refId ?? compositionNode.id)}`,
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
      sceneId,
      sourceSceneNodeId,
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

function upsertExportNode(
  canvas: CanvasDocument,
  previewNode: CanvasNode,
  defaultFrameRange = "0:60"
) {
  const existingNode =
    canvas.nodes.find(
      (node) => node.kind === "export" && node.data.sourcePreviewNodeId === previewNode.id
    ) ??
    canvas.nodes.find(
      (node) =>
        node.kind === "export" &&
        node.id === "node-export" &&
        !stringData(node, "sourcePreviewNodeId")
    );
  const nodeId = existingNode?.id ?? `node-export-${safeId(previewNode.id)}`;
  const existingFrameRange = stringData(existingNode, "frameRange");
  const frameRange =
    existingFrameRange && existingFrameRange !== "0:60" ? existingFrameRange : defaultFrameRange;
  const nextNode: CanvasNode = {
    id: nodeId,
    kind: "export",
    refId: existingNode?.refId ?? `export-${safeId(previewNode.refId ?? previewNode.id)}`,
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
      frameRange
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

function upsertProjectExportNode(canvas: CanvasDocument) {
  const anchor =
    findNode(canvas, "topic") ?? findNode(canvas, "storyboard") ?? findNode(canvas, "script");
  const existingNode = canvas.nodes.find(
    (node) => node.kind === "export" && !stringData(node, "sourcePreviewNodeId")
  );
  const nodeId = existingNode?.id ?? "node-project-export";
  const nextNode: CanvasNode = {
    id: nodeId,
    kind: "export",
    refId: existingNode?.refId ?? "export-project-mp4",
    position: existingNode?.position ?? {
      x: (anchor?.position.x ?? 700) + 720,
      y: (anchor?.position.y ?? 180) + 20
    },
    size: existingNode?.size ?? { width: 300, height: 170 },
    status: "ready",
    data: {
      ...existingNode?.data,
      generatedBy: "create-project-export-node",
      title: existingNode?.data.title ?? "全片导出",
      description: "导出当前项目的完整视频",
      sourceProjectNodeId: anchor?.id,
      exportScope: "full",
      frameRange: stringData(existingNode, "frameRange") ?? "0:60"
    }
  };
  const nodes = existingNode
    ? canvas.nodes.map((node) => (node.id === existingNode.id ? nextNode : node))
    : canvas.nodes.concat(nextNode);
  const edges = anchor
    ? ensureCanvasEdge(canvas.edges, {
        id: `edge-project-export-${safeId(anchor.id)}`,
        fromNodeId: anchor.id,
        toNodeId: nodeId,
        relation: "renders"
      })
    : canvas.edges;

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
      const contentHeight = calculateNodeContentHeight(stringData(existingNode, "scriptText"));
      if (contentHeight !== existingNode.size.height) {
        return {
          ...updated,
          nodes: updated.nodes.map((n) =>
            n.id === existingScriptNode.id
              ? { ...n, size: { ...n.size, height: contentHeight } }
              : n
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
    (node) =>
      typeof node.data.sourceChapterNodeId === "string" &&
      existingChapterIds.has(node.data.sourceChapterNodeId)
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

type StoryboardScene = GeneratedStoryboard["scenes"][number];

function normalizeGeneratedStoryboardScenes(
  scenes: StoryboardScene[],
  {
    requestedSceneCount,
    scriptText,
    targetDurationSec
  }: {
    requestedSceneCount: number;
    scriptText: string;
    targetDurationSec: number;
  }
): StoryboardScene[] {
  const sceneCount = Math.max(1, Math.min(Math.round(requestedSceneCount), 24));
  const selectedScenes = selectStoryboardScenes(scenes, sceneCount);
  const paragraphs = splitScriptParagraphs(scriptText);
  const durations = distributeSceneDurations(targetDurationSec, sceneCount);

  return Array.from({ length: sceneCount }, (_, index) => {
    const scene = selectedScenes[index] ?? fallbackStoryboardScene(paragraphs, index, sceneCount);
    const fallback = fallbackStoryboardScene(paragraphs, index, sceneCount);

    return {
      title: stringInput(scene.title) ?? fallback.title,
      description: stringInput(scene.description) ?? fallback.description,
      narration: stringInput(scene.narration) ?? fallback.narration,
      sceneType: normalizeStoryboardSceneType(scene.sceneType),
      durationSec: durations[index] ?? fallback.durationSec,
      visualPrompt: stringInput(scene.visualPrompt) ?? fallback.visualPrompt,
      caption: stringInput(scene.caption) ?? fallback.caption
    };
  });
}

function selectStoryboardScenes(scenes: StoryboardScene[], sceneCount: number) {
  const validScenes = Array.isArray(scenes) ? scenes.filter((scene) => scene && typeof scene === "object") : [];

  if (validScenes.length <= sceneCount) {
    return validScenes;
  }

  if (sceneCount === 1) {
    return [validScenes[0]!];
  }

  const lastIndex = validScenes.length - 1;
  const selected = new Map<number, StoryboardScene>();

  for (let index = 0; index < sceneCount; index += 1) {
    const sourceIndex = Math.round((index * lastIndex) / (sceneCount - 1));
    selected.set(index, validScenes[sourceIndex]!);
  }

  return Array.from({ length: sceneCount }, (_, index) => selected.get(index) ?? validScenes[index]!);
}

function distributeSceneDurations(targetDurationSec: number, sceneCount: number) {
  const total = Math.max(sceneCount, Math.round(targetDurationSec));
  const base = Math.floor(total / sceneCount);
  const remainder = total - base * sceneCount;

  return Array.from({ length: sceneCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

function fallbackStoryboardScene(
  paragraphs: string[],
  index: number,
  sceneCount: number
): StoryboardScene {
  const chunk = paragraphChunk(paragraphs, index, sceneCount);
  const narration = chunk.join("\n\n") || paragraphs[index] || "继续讲解这个占星概念。";
  const isLast = index === sceneCount - 1;

  return {
    title: index === 0 ? "开场引入" : isLast ? "总结收尾" : `讲解 ${index + 1}`,
    description: summarizeText(narration, 80),
    narration,
    sceneType: index === 1 ? "astro-chart" : index === 2 ? "sketch" : "text",
    durationSec: 1,
    visualPrompt: "温暖简洁的占星教学短视频画面，突出本段核心概念",
    caption: summarizeText(narration, 28)
  };
}

function normalizeStoryboardSceneType(value: unknown): StoryboardScene["sceneType"] {
  return value === "astro-chart" ||
    value === "sketch" ||
    value === "d3-diagram" ||
    value === "three-scene"
    ? value
    : "text";
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
  const sceneCounts = distributeSceneDurations(getDefaultSceneCount(targetDurationSec), chapterCount);

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
      sceneCount: sceneCounts[index] ?? getDefaultChapterSceneCount(durationPerChapter)
    };
  });
}

function getDefaultChapterCount(targetDurationSec: number) {
  if (targetDurationSec <= 60) return 1;
  if (targetDurationSec <= 120) return 2;
  if (targetDurationSec <= 180) return 3;
  if (targetDurationSec <= 300) return 5;
  if (targetDurationSec <= 900) return 7;
  return 10;
}

function getDefaultSceneCount(targetDurationSec: number) {
  if (targetDurationSec <= 30) return 4;
  if (targetDurationSec <= 60) return 5;
  if (targetDurationSec <= 90) return 8;
  if (targetDurationSec <= 180) return 10;
  if (targetDurationSec <= 300) return 16;
  if (targetDurationSec <= 900) return 36;
  return 60;
}

function getDefaultChapterSceneCount(chapterDurationSec: number) {
  if (chapterDurationSec <= 30) return 3;
  if (chapterDurationSec <= 120) return 5;
  if (chapterDurationSec <= 180) return 6;
  if (chapterDurationSec <= 300) return 8;
  return 10;
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
  return compact ? (compact.match(/.{1,120}/g) ?? [compact]) : ["先写入本章文案，再展开分镜。"];
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

function ensureCanvasEdge(edges: CanvasDocument["edges"], edge: CanvasDocument["edges"][number]) {
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

function birthInputFromJob(
  job: Job,
  chartNode: CanvasNode | undefined
): BirthChartInput | undefined {
  const date = stringInput(job.input.birthDate) ?? stringData(chartNode, "birthDate");
  const time = stringInput(job.input.birthTime) ?? stringData(chartNode, "birthTime");
  const timezoneOffsetMinutes =
    numberInput(job.input.timezoneOffsetMinutes) ?? numberData(chartNode, "timezoneOffsetMinutes");
  const timezone = stringInput(job.input.timezone) ?? stringData(chartNode, "timezone");
  const latitude = numberInput(job.input.latitude) ?? numberData(chartNode, "latitude");
  const longitude = numberInput(job.input.longitude) ?? numberData(chartNode, "longitude");

  if (
    !date ||
    !time ||
    latitude === undefined ||
    longitude === undefined
  ) {
    return undefined;
  }

  return {
    date,
    time,
    ...(timezoneOffsetMinutes === undefined ? {} : { timezoneOffsetMinutes }),
    timezone,
    latitude,
    longitude,
    placeName: stringInput(job.input.placeName) ?? stringData(chartNode, "placeName"),
    label: stringInput(job.input.label) ?? stringData(chartNode, "label"),
    houseSystem: (stringInput(job.input.houseSystem) ??
      stringData(chartNode, "houseSystem") ??
      "equal") as BirthChartInput["houseSystem"],
    zodiacMode: (stringInput(job.input.zodiacMode) ??
      stringData(chartNode, "zodiacMode") ??
      "tropical") as BirthChartInput["zodiacMode"],
    siderealAyanamsa:
      stringInput(job.input.siderealAyanamsa) ?? stringData(chartNode, "siderealAyanamsa"),
    planetSet: (stringInput(job.input.planetSet) ??
      stringData(chartNode, "planetSet") ??
      "modern") as BirthChartInput["planetSet"],
    nodeType: (stringInput(job.input.nodeType) ??
      stringData(chartNode, "nodeType") ??
      "mean") as BirthChartInput["nodeType"]
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
  <defs>
    <filter id="d3-card-shadow" x="-16%" y="-24%" width="132%" height="148%">
      <feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#17352f" flood-opacity="0.13"/>
    </filter>
    <linearGradient id="d3-card-fill" x1="0%" x2="100%" y1="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f0f6ec"/>
    </linearGradient>
    <marker id="d3-arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" viewBox="0 0 12 12">
      <path d="M0 0 L12 6 L0 12 Z" fill="#819989"/>
    </marker>
  </defs>
  <rect width="1080" height="1080" rx="0" fill="#f7faf4"/>
  <path d="M86 908 C262 766 406 824 560 650 C710 480 818 392 990 260" fill="none" stroke="#e0e9dd" stroke-width="6" stroke-dasharray="14 18"/>
  <text x="72" y="120" fill="#6f7f75" font-size="34" font-family="sans-serif" font-weight="900">D3 ${escapeXml(diagram.toUpperCase())}</text>
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
      const y = index % 2 === 0 ? 560 : 430;
      const cardY = index % 2 === 0 ? y + 54 : y - 128;
      return `<g>
    <line x1="${x}" y1="560" x2="${x}" y2="${y}" stroke="#d7b36f" stroke-width="8" stroke-linecap="round"/>
    <circle cx="${x}" cy="${y}" r="30" fill="${index === 0 ? "#2f6d3b" : "#d7b36f"}" stroke="#ffffff" stroke-width="10"/>
    ${renderD3AssetCard(x - 92, cardY, 184, 78, point.label, `step ${index + 1}`, index === 0 ? "#2f6d3b" : "#d7b36f")}
  </g>`;
    })
    .join("\n");

  return `<g>
  <path d="M126 560 C330 420 560 700 954 560" fill="none" stroke="#2f6d3b" stroke-width="12" stroke-linecap="round"/>
  <path d="M126 560 C330 420 560 700 954 560" fill="none" stroke="#d7b36f" stroke-width="28" stroke-linecap="round" opacity="0.26"/>
  ${circles}
</g>`;
}

function renderDistributionSvg(data: Record<string, unknown> | undefined) {
  const points = distributionVisualPoints(data);
  const maxValue = Math.max(1, ...points.map((point) => point.value));

  return `<g transform="translate(104 330)">
  ${points
    .slice(0, 5)
    .map((point, index) => {
      const y = index * 118;
      const width = Math.max(100, (point.value / maxValue) * 730);
      const fill = index % 2 === 0 ? "#26443d" : "#c89437";
      return `<g transform="translate(0 ${y})">
    <text x="0" y="22" fill="#18352f" font-size="32" font-family="sans-serif" font-weight="900">${escapeXml(compactSvgText(point.label, 18))}</text>
    <rect x="260" y="-2" width="740" height="56" rx="18" fill="#e6ecdf"/>
    <rect x="260" y="-2" width="${width}" height="56" rx="18" fill="${fill}"/>
    <text x="1000" y="36" text-anchor="end" fill="#53665c" font-size="28" font-family="sans-serif" font-weight="900">${Math.round((point.value / maxValue) * 100)}%</text>
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
  const visibleNodes = nodes.slice(0, 6);
  const primary = visibleNodes[0] ?? fallbackNodes[0]!;
  const hub = { x: 540, y: 562 };
  const slots = [
    { x: 92, y: 356, anchorX: 342, anchorY: 410 },
    { x: 738, y: 356, anchorX: 738, anchorY: 410 },
    { x: 92, y: 652, anchorX: 342, anchorY: 706 },
    { x: 738, y: 652, anchorX: 738, anchorY: 706 },
    { x: 410, y: 790, anchorX: 540, anchorY: 790 }
  ];
  const positions = new Map<string, { x: number; y: number; anchorX: number; anchorY: number; width: number; height: number }>();
  positions.set(primary, { x: 410, y: 504, anchorX: hub.x, anchorY: hub.y, width: 260, height: 116 });
  visibleNodes.slice(1).forEach((node, index) => {
    const slot = slots[index] ?? slots[slots.length - 1]!;
    positions.set(node, { ...slot, width: 250, height: 108 });
  });
  const safeLinks = links
    .filter(([source, target]) => positions.has(source) && positions.has(target))
    .slice(0, 10);
  const fallbackHubLinks = visibleNodes.slice(1).map((node) => [primary, node] as [string, string]);
  const visibleLinks = safeLinks.length > 0 ? safeLinks : fallbackHubLinks;
  const linkSvg = visibleLinks
    .map(([source, target], index) => {
      const start = positions.get(source);
      const end = positions.get(target);
      return start && end
        ? `<path d="M ${start.anchorX} ${start.anchorY} C ${hub.x} ${start.anchorY}, ${hub.x} ${end.anchorY}, ${end.anchorX} ${end.anchorY}" fill="none" stroke="#819989" stroke-width="8" stroke-linecap="round" marker-end="url(#d3-arrow)" opacity="${index > 5 ? "0.54" : "0.82"}"/>`
        : "";
    })
    .join("\n");
  const nodeSvg = [...positions.entries()]
    .map(
      ([node, position], index) =>
        renderD3AssetCard(
          position.x,
          position.y,
          position.width,
          position.height,
          node,
          index === 0 ? "core concept" : `node ${index}`,
          index === 0 ? "#2f6d3b" : index % 2 === 0 ? "#c89437" : "#d7b36f"
        )
    )
    .join("\n");

  return `<g>
  <circle cx="${hub.x}" cy="${hub.y}" r="166" fill="#e8efe5"/>
  <circle cx="${hub.x}" cy="${hub.y}" r="202" fill="none" stroke="#dbe6d8" stroke-width="6" stroke-dasharray="12 16"/>
  ${visibleLinks.length > 0 ? linkSvg : ""}
  ${nodeSvg}
</g>`;
}

function renderTreeSvg(data: Record<string, unknown> | undefined) {
  const root = stringFromRecord(data ?? {}, "root") ?? "Rising sign";
  const children = Array.isArray(data?.children)
    ? data.children.flatMap((item) => (typeof item === "string" ? [item] : []))
    : ["First impression", "Body language", "Fast reaction", "Style entry point"];
  const visibleChildren = children.slice(0, 5);
  const step = visibleChildren.length > 1 ? 720 / (visibleChildren.length - 1) : 1;

  return `<g>
  ${renderD3AssetCard(396, 320, 288, 110, root, "root", "#2f6d3b")}
  ${visibleChildren
    .map((child, index) => {
      const x = 180 + index * step;
      const y = 700;
      return `<g>
    <path d="M 540 430 C 540 565, ${x} 565, ${x} ${y - 30}" fill="none" stroke="#c89437" stroke-width="8" stroke-linecap="round"/>
    ${renderD3AssetCard(x - 92, y, 184, 82, child, `branch ${index + 1}`, index % 2 === 0 ? "#d7b36f" : "#c89437")}
  </g>`;
    })
    .join("\n")}
</g>`;
}

function renderD3AssetCard(
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  subtitle: string,
  accent: string
) {
  const safeLabel = escapeXml(compactSvgText(label, width > 220 ? 18 : 14));
  const safeSubtitle = escapeXml(subtitle);

  return `<g filter="url(#d3-card-shadow)">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="24" fill="url(#d3-card-fill)"/>
    <rect x="${x}" y="${y}" width="14" height="${height}" rx="7" fill="${accent}"/>
    <text x="${x + 34}" y="${y + height / 2 - 5}" fill="#18352f" font-size="${width > 220 ? 34 : 28}" font-family="sans-serif" font-weight="900">${safeLabel}</text>
    <text x="${x + 34}" y="${y + height / 2 + 34}" fill="#6f7f75" font-size="22" font-family="sans-serif" font-weight="800">${safeSubtitle}</text>
  </g>`;
}

function renderThreeVisualAssetSvg(node: CanvasNode, title: string) {
  const data = jsonRecordData(node, "dataJson");
  const scene = normalizeThreeScene(stringData(node, "threeScene"));
  const accentColor =
    stringFromRecord(data ?? {}, "accentColor") ?? stringData(node, "accentColor") ?? "#e8c164";
  const focus =
    stringFromRecord(data ?? {}, "focus") ?? (scene === "planet-focus" ? "Sun" : "Ascendant");
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
  return value === "relationship" || value === "tree" || value === "distribution"
    ? value
    : "timeline";
}

function normalizeThreeScene(value: string | undefined) {
  return value === "zodiac-space" || value === "planet-focus" ? value : "orbit";
}

type ImageVisualStyle =
  | "whiteboard-sketch"
  | "whiteboard"
  | "line-art"
  | "realistic"
  | "minimal-line"
  | "zodiac-whiteboard";

function normalizeImageStyle(value: string | undefined): ImageVisualStyle {
  switch (value) {
    case "whiteboard-sketch":
    case "whiteboard":
    case "line-art":
    case "realistic":
    case "minimal-line":
    case "zodiac-whiteboard":
      return value;
    case "black-whiteboard-teaching":
      return "whiteboard-sketch";
    default:
      return "whiteboard-sketch";
  }
}

function appendImagePromptPresetAdditions(
  prompt: string,
  additions: Array<{ promptSuffix: string }>
) {
  const configuredSuffix = additions
    .map((addition) => addition.promptSuffix.trim())
    .filter(Boolean)
    .join("\n");

  if (!configuredSuffix) {
    return prompt;
  }

  return [prompt.trim(), configuredSuffix].filter(Boolean).join("\n\n");
}

function normalizeImageModel(model: string | undefined) {
  const normalized = model?.trim();

  if (!normalized || !isImageGenerationModel(normalized)) {
    return "gpt-image-2";
  }

  return normalized;
}

function isImageGenerationModel(model: string) {
  const normalized = model.toLowerCase();

  return (
    normalized.includes("image") ||
    normalized.startsWith("img-") ||
    normalized.startsWith("dall-e")
  );
}

function normalizeImagePrompt(
  prompt: string,
  context: {
    title?: string;
    description?: string;
    narration?: string;
    imageStyle: ImageVisualStyle;
  }
) {
  const normalizedPrompt = prompt.replace(/\s+/g, " ").trim();
  const style = imageStylePromptText(context.imageStyle);
  const basePrompt = hasCjkText(normalizedPrompt)
    ? normalizedPrompt
    : getChineseImagePromptFromContext(context) ?? translateLegacyImagePrompt(normalizedPrompt);

  return [
    basePrompt,
    `画面要求：${style}，主体清晰，构图完整，细节精致，适合短视频画面，不要粗糙占位图，不要文字水印。`
  ]
    .filter(Boolean)
    .join("\n");
}

function getChineseImagePromptFromContext({
  title,
  description,
  narration
}: {
  title?: string;
  description?: string;
  narration?: string;
}) {
  const contextText = [description, narration, title]
    .map((value) => value?.replace(/\s+/g, " ").trim())
    .filter((value): value is string => Boolean(value && hasCjkText(value)))
    .join("。");

  if (!contextText) {
    return undefined;
  }

  return `请生成一张占星教学图片。主题：${summarizeText(contextText, 140)}。画面需要直接服务这段讲解，避免生成大段文字。`;
}

function translateLegacyImagePrompt(prompt: string) {
  const normalized = prompt.toLowerCase();

  if (normalized.includes("title card")) {
    return "简洁的占星教学标题画面，暖色调，主体清晰，适合短视频开场。";
  }

  if (normalized.includes("natal chart") || normalized.includes("astrology chart")) {
    return "占星本命盘圆盘画面，行星位置清晰，带轻微发光和教学标注。";
  }

  if (normalized.includes("door") && normalized.includes("starry")) {
    return "简洁线稿插画：一个人推开门走进星空房间，画面温暖清晰，带占星教学氛围。";
  }

  if (normalized.includes("text overlay")) {
    return "干净的重点文字画面，柔和暖色背景，优雅排版，适合教学视频。";
  }

  if (normalized.includes("line art") || normalized.includes("line drawing")) {
    return "简洁线稿插画，表现占星教学概念，画面干净，暖色背景。";
  }

  return "简洁的占星教学插画，清晰表达核心概念，画面温暖、干净、精致。";
}

function imageStylePromptText(style: ImageVisualStyle) {
  switch (style) {
    case "realistic":
      return "写实图片风格，真实光影和材质";
    case "line-art":
      return "精致线稿插画风格";
    case "minimal-line":
      return "极简线稿风格，留白充足";
    case "zodiac-whiteboard":
      return "星盘白板草图风格，符号清晰";
    case "whiteboard":
      return "白板教学插画风格";
    case "whiteboard-sketch":
    default:
      return "白板简笔画风格，但需要精致完整";
  }
}

function hasCjkText(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}

function normalizeLlmModel(model: string | undefined) {
  if (!model || model.startsWith("gpt-image") || model.includes("image")) {
    return "gpt-5.5";
  }

  return model;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function compactSvgText(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, limit - 1))}…`;
}

async function writeMockPng(outputPath: string, width = 1536, height = 1024) {
  const rowStride = 1 + width * 3;
  const raw = Buffer.alloc(rowStride * height);
  const centerX = width / 2;
  const centerY = height / 2;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * rowStride;
    raw[rowOffset] = 0;

    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + 1 + x * 3;
      const grid = x % 96 < 2 || y % 96 < 2;
      const dx = (x - centerX) / (width * 0.26);
      const dy = (y - centerY) / (height * 0.3);
      const radius = Math.sqrt(dx * dx + dy * dy);
      const inCore = radius < 0.72;
      const inRing = radius >= 0.72 && radius < 0.92;
      const inAccent = Math.abs(dx + dy) < 0.035 || Math.abs(dx - dy) < 0.035;

      let red = 248;
      let green = 246;
      let blue = 236;

      if (grid) {
        red = 232;
        green = 229;
        blue = 216;
      }

      if (inRing) {
        red = 36;
        green = 92;
        blue = 82;
      } else if (inCore) {
        red = 255;
        green = 253;
        blue = 245;
      }

      if (inAccent && radius < 1.1) {
        red = 207;
        green = 154;
        blue = 55;
      }

      raw[offset] = red;
      raw[offset + 1] = green;
      raw[offset + 2] = blue;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    createPngChunk("IHDR", header),
    createPngChunk("IDAT", deflateSync(raw)),
    createPngChunk("IEND", Buffer.alloc(0))
  ]);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, png);
}

function createPngChunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  const chunkType = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  const crcInput = Buffer.concat([chunkType, data]);

  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([length, chunkType, data, crc]);
}

function crc32(input: Buffer) {
  let crc = 0xffffffff;

  for (const byte of input) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
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
