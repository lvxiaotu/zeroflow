import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import { getDatabasePath } from "./paths";
import { migrate } from "./schema";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as typeof BetterSqlite3;

let database: BetterSqlite3.Database | null = null;

export function getDb() {
  if (database) {
    return database;
  }

  const databasePath = getDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  database = new Database(databasePath);
  migrate(database);
  return database;
}

export function closeDb() {
  database?.close();
  database = null;
}
