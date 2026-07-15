#!/usr/bin/env node
/* eslint-disable no-var -- maximizes compatibility with older Node for this guard only */
"use strict";

/** Fail fast if Node is too old for Next.js 14 (needs >= 18.17). CommonJS .cjs so Node 12+ can run it. */

var match = /^v(\d+)\.(\d+)/.exec(process.version);
if (!match) {
  console.error("Could not parse Node version:", process.version);
  process.exit(1);
}
var major = parseInt(match[1], 10);
var minor = parseInt(match[2], 10);

var ok = major > 18 || (major === 18 && minor >= 17);
if (!ok) {
  console.error("");
  console.error("  Node", process.version, "is too old for this app.");
  console.error("  Next.js 14 requires Node.js >= 18.17 (20 LTS recommended).");
  console.error("");
  console.error("  Conda:  conda install -c conda-forge \"nodejs>=20\"");
  console.error("  nvm:    nvm install 20 && nvm use");
  console.error("  Binary: https://nodejs.org/");
  console.error("");
  process.exit(1);
}
