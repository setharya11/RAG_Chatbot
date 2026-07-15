#!/usr/bin/env node
"use strict";

/**
 * Recovery entry: stale Next on :3000 + broken .next (tailwind/postcss from ~/,
 * missing fallback-build-manifest, EADDRINUSE) are common after a bad compile.
 */
const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const port = process.env.PORT || "3000";

function freePort(p) {
  try {
    const out = execSync(`lsof -ti :${p}`, { encoding: "utf8" }).trim();
    if (!out) return;
    for (const pid of out.split(/\s+/).filter(Boolean)) {
      try {
        process.kill(Number(pid), "SIGKILL");
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* nothing listening */
  }
}

freePort(port);

const nextDir = path.join(root, ".next");
fs.rmSync(nextDir, { recursive: true, force: true });

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "dev", "-p", port], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code == null ? 1 : code);
});
