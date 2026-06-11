import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { videoProjectSchema } from "../src/schema/project";

const examplePath = join(process.cwd(), "examples", "example-canvas-project.json");
const rawProject = JSON.parse(await readFile(examplePath, "utf8"));
const project = videoProjectSchema.parse(rawProject);

console.log(`validated example project: ${project.id}`);
