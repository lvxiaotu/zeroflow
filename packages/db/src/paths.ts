import path from "node:path";

export function getWorkspaceRoot() {
  return readPathEnv("ZEROFLOW_WORKSPACE_ROOT") ?? path.resolve(process.cwd(), "../..");
}

export function getDataDir() {
  return readPathEnv("ZEROFLOW_DATA_DIR") ?? path.join(getWorkspaceRoot(), "data");
}

export function getDatabasePath() {
  return readPathEnv("ZEROFLOW_DB_PATH") ?? path.join(getDataDir(), "zeroflow.sqlite");
}

export function getStorePath() {
  return readPathEnv("ZEROFLOW_STORE_PATH") ?? path.join(getDataDir(), "zeroflow.store.json");
}

export function getProjectAssetDir(projectId: string) {
  return path.join(getDataDir(), "projects", projectId, "assets");
}

export function getLibraryAssetDir() {
  return path.join(getDataDir(), "library");
}

function readPathEnv(name: string) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}
