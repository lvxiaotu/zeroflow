import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { readDotenvValue, readEnv } from "./env";
import { createMockTtsProvider } from "./mock";
import type { TtsProvider } from "./types";

const defaultIndexTtsProjectDir = "G:\\ob-book\\indextts-cli";

type IndexTtsRuntimeConfig = {
  projectDir: string;
  runningHubApiKey?: string;
  referenceAudioName?: string;
  referenceAudioPath?: string;
};

export function createIndexTtsProvider(): TtsProvider {
  const config = getIndexTtsRuntimeConfig();
  const runningHubApiKey = config.runningHubApiKey;
  const mock = createMockTtsProvider();

  if (!runningHubApiKey) {
    return mock;
  }

  return {
    async generateVoiceover(input) {
      const referenceAudioPath = input.referenceAudioPath ?? config.referenceAudioPath;
      const referenceAudioName = input.referenceAudioName ?? config.referenceAudioName;

      if (!referenceAudioPath && !referenceAudioName) {
        return mock.generateVoiceover(input);
      }

      const args = [
        "-m",
        "indextts_cli",
        "--text",
        input.text,
        "--output",
        input.outputPath,
        "--chunk-max",
        String(input.chunkMax ?? 80),
        "--pause-ms",
        String(input.pauseMs ?? 260),
        "--resume"
      ];

      if (referenceAudioPath) {
        args.push("--reference-audio", referenceAudioPath);
      }
      if (referenceAudioName) {
        args.push("--reference-audio-name", referenceAudioName);
      }
      if (input.dryRun) {
        args.push("--dry-run");
      }

      const completed = await runPython(args, config.projectDir, {
        RUNNINGHUB_API_KEY: runningHubApiKey
      });

      if (completed.exitCode !== 0) {
        return mock.generateVoiceover(input);
      }

      return {
        provider: "runninghub-indextts",
        usedMock: false,
        data: {
          audioPath: input.outputPath,
          manifestPath: path.join(`${input.outputPath}.runninghub`, "manifest.json"),
          stdout: completed.stdout,
          stderr: completed.stderr
        }
      };
    }
  };
}

export function getIndexTtsRuntimeConfig(): IndexTtsRuntimeConfig {
  const projectDir = readEnv("INDEXTTS_CLI_DIR") ?? defaultIndexTtsProjectDir;
  const dotenvPath = path.join(projectDir, ".env");
  const manifestReference = readManifestReference(projectDir);

  return {
    projectDir,
    runningHubApiKey:
      readEnv("RUNNINGHUB_API_KEY") ?? readDotenvValue(dotenvPath, "RUNNINGHUB_API_KEY"),
    referenceAudioPath:
      readEnv("INDEXTTS_REFERENCE_AUDIO_PATH") ?? manifestReference.referenceAudioPath,
    referenceAudioName:
      readEnv("INDEXTTS_REFERENCE_AUDIO_NAME") ?? manifestReference.referenceAudioName
  };
}

function readManifestReference(
  projectDir: string
): Pick<IndexTtsRuntimeConfig, "referenceAudioName" | "referenceAudioPath"> {
  const manifestPaths = [
    path.join(projectDir, "voiceover.mp3.runninghub", "manifest.json"),
    ...latestDistManifestPaths(projectDir)
  ];

  for (const manifestPath of manifestPaths) {
    const reference = readReferenceFromManifest(manifestPath);

    if (reference.referenceAudioName || reference.referenceAudioPath) {
      return reference;
    }
  }

  return {};
}

function latestDistManifestPaths(projectDir: string) {
  const tasksDir = path.join(projectDir, "dist", "tasks");

  if (!fs.existsSync(tasksDir)) {
    return [];
  }

  return fs
    .readdirSync(tasksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(tasksDir, entry.name, "manifest.json"))
    .filter((manifestPath) => fs.existsSync(manifestPath))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
}

function readReferenceFromManifest(
  manifestPath: string
): Pick<IndexTtsRuntimeConfig, "referenceAudioName" | "referenceAudioPath"> {
  if (!fs.existsSync(manifestPath)) {
    return {};
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      referenceAudio?: unknown;
      referenceAudioFileName?: unknown;
    };

    return {
      referenceAudioPath:
        typeof manifest.referenceAudio === "string" && manifest.referenceAudio.length > 0
          ? manifest.referenceAudio
          : undefined,
      referenceAudioName:
        typeof manifest.referenceAudioFileName === "string" &&
        manifest.referenceAudioFileName.length > 0
          ? manifest.referenceAudioFileName
          : undefined
    };
  } catch {
    return {};
  }
}

function runPython(args: string[], cwd: string, env: Record<string, string>) {
  return new Promise<{ exitCode: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn("python", args, {
      cwd,
      env: {
        ...process.env,
        ...env
      },
      shell: false
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}
