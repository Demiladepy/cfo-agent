#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sqlitePkg = dirname(require.resolve("better-sqlite3/package.json"));
const binding = join(sqlitePkg, "build", "Release", "better_sqlite3.node");

if (!existsSync(binding)) {
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prebuild-install"],
    { cwd: sqlitePkg, stdio: "inherit" },
  );
}
