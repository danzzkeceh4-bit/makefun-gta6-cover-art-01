// Vice Cover Studio — make.fun entry program (Node 22, standard library only).
//
// The app is plain static files under app/: index.html plus its own scripts,
// styles, font and sample photos, served offline with no network request.
// This program hands the entry in: it copies app/ and screenshots/ from
// beside this file into the output directory and writes dossier.json there,
// the summary the judge reads, built by the vendored make.fun library.
//
// Run it outside the grader with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Inside the grader MAKEFUN_OUTPUT_DIR is unset and /output is used.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

// The repository root is the directory holding this file.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
// The grader gives us a writable /output; local runs override it with an env var.
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps, as the kit documents them: the text cap shapes the
// dossier bytes, the rest refuse an entry the scorer would refuse outright
// (too many or too large screenshots, too many or too large app files, or an
// app path over the byte limit). app/ shares /output's own 1000-entry cap
// with screenshots/ and dossier.json, so the caps below leave it room.
const dossierCaps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
};

function copyTree(source, target) {
  if (!existsSync(source)) return;
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
}

function main() {
  // Start from a clean output directory so a stale file can never leak in.
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  copyTree(join(repoRoot, 'app'), join(outputDir, 'app'));
  copyTree(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));

  // How many screenshots went in (the gate caps them at 4, at most 256 KiB each).
  const shotCount = existsSync(join(outputDir, 'screenshots'))
    ? readdirSync(join(outputDir, 'screenshots')).length
    : 0;
  console.log(`copied app/ and ${shotCount} screenshot(s) to ${outputDir}`);

  const dossier = buildDossier(outputDir, dossierCaps);
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
  console.log(`wrote ${join(outputDir, 'dossier.json')} (${dossier.length} bytes)`);
}

main();
