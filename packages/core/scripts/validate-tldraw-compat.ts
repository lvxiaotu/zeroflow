import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  canvasDocumentToTldrawSnapshot,
  tldrawCompatSnapshotSchema,
  tldrawSnapshotToCanvasDocument
} from "../src/canvas";
import { canvasDocumentSchema } from "../src/schema/canvas";
import { videoProjectSchema } from "../src/schema/project";

const examplePath = join(process.cwd(), "examples", "example-canvas-project.json");
const rawProject = JSON.parse(await readFile(examplePath, "utf8"));
const project = videoProjectSchema.parse(rawProject);
const snapshot = canvasDocumentToTldrawSnapshot(project.canvas);
const parsedSnapshot = tldrawCompatSnapshotSchema.parse(snapshot);
const roundTrippedCanvas = tldrawSnapshotToCanvasDocument(parsedSnapshot, {
  fallbackDocument: project.canvas
});
const parsedCanvas = canvasDocumentSchema.parse(roundTrippedCanvas);

if (parsedCanvas.nodes.length !== project.canvas.nodes.length) {
  throw new Error(
    `roundtrip node count mismatch: ${parsedCanvas.nodes.length} !== ${project.canvas.nodes.length}`
  );
}

if (parsedCanvas.edges.length !== project.canvas.edges.length) {
  throw new Error(
    `roundtrip edge count mismatch: ${parsedCanvas.edges.length} !== ${project.canvas.edges.length}`
  );
}

console.log(
  `validated tldraw compat snapshot: ${parsedSnapshot.shapes.length} shapes, ${parsedCanvas.nodes.length} nodes`
);
