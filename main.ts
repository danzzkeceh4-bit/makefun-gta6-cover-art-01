// Vice Cover Studio — the program that hands this entry in.
//
// The entry itself is a folder of static files under app/: an index page,
// its scripts and styles, a font and two sample photos, nothing that needs
// a build step or a network connection. This program's only job is to hand
// those files (plus the screenshots) to the grader: it wipes the output
// folder, copies app/ and screenshots/ into it, and writes dossier.json,
// the summary the judge reads, using the make.fun library vendored with
// the kit. Node 22, standard library only.
//
// Try it locally with:
//   MAKEFUN_OUTPUT_DIR=out node main.ts
// (The grader runs it with MAKEFUN_OUTPUT_DIR unset, so it writes /output.)

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

// This file lives at the repository root, so its own folder is the root.
const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Caps the scorer applies, copied from the kit docs so a bad entry fails
// loudly here instead of silently at grading time. The text cap shapes the
// dossier; the other caps mirror the scorer's hard limits on screenshots,
// app files and path lengths. /output itself holds at most 1000 entries,
// shared by app/, screenshots/ and dossier.json.
const dossierCaps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
};

function copyIfThere(src, dst) {
  if (!existsSync(src)) return;
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
}

function shotCount(dir) {
  return existsSync(dir) ? readdirSync(dir).length : 0;
}

function main() {
  // Wipe first: a stale file from an earlier run must never sneak in.
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  copyIfThere(join(repoDir, 'app'), join(outDir, 'app'));
  copyIfThere(join(repoDir, 'screenshots'), join(outDir, 'screenshots'));

  const n = shotCount(join(outDir, 'screenshots'));
  console.log(`copied app/ and ${n} screenshot(s) into ${outDir}`);

  const dossier = buildDossier(outDir, dossierCaps);
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  console.log(`wrote ${join(outDir, 'dossier.json')} (${dossier.length} bytes)`);
}

main();
