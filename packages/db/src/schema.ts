import type Database from "better-sqlite3";

export function migrate(database: Database.Database) {
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  database.exec(`
    CREATE TABLE IF NOT EXISTS video_projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      status TEXT NOT NULL,
      spec_json TEXT NOT NULL,
      canvas_json TEXT NOT NULL,
      asset_refs_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS library_assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      path TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      reusable INTEGER NOT NULL DEFAULT 1,
      license_json TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_assets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      path TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES video_projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_asset_refs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      asset_scope TEXT NOT NULL,
      usage TEXT NOT NULL,
      scene_id TEXT,
      canvas_node_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES video_projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scene_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scene_type TEXT NOT NULL,
      template_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS style_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      preset_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      canvas_node_id TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      input_json TEXT NOT NULL DEFAULT '{}',
      output_json TEXT,
      error_json TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES video_projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_project_assets_project_id ON project_assets(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_asset_refs_project_id ON project_asset_refs(project_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_project_status ON jobs(project_id, status);
  `);
}
