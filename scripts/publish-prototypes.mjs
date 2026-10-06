#!/usr/bin/env node
/* ============================================================================
   Publish the prototype estate -> static/prototypes/ so every page resolves
   at /prototypes/... on any host that serves this app (SvelteKit only serves
   static/; the Vercel adapter bundles static/ + the built server).

   - prototypes/ is the SOURCE OF TRUTH and is never edited or moved here.
     This writes a generated copy, which is gitignored.
   - The copy is CLEANED before every run: a prototype deleted from the estate
     must not survive in the output and keep answering.
   - prototypes/feedback/ is machine-local (gitignored - the reviewer's marks)
     and is NEVER published. Deployed pages find no collector and must say so
     rather than pretend a save worked.

   GATE (default): published on local + preview/test builds; NOT published when
   VERCEL_ENV=production. Internal design artefacts on the customer-facing
   domain is an owner's call, so production stays clean by default. To flip:
   set PUBLISH_PROTOTYPES=1 in the production environment (or change the
   `!production` default below to `true`).
   ========================================================================== */
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'prototypes');
const OUT = join(root, 'static', 'prototypes');

/** Top-level entries of prototypes/ that stay machine-local, never published. */
const LOCAL_ONLY = new Set(['feedback']);

function clean() {
	// clean BEFORE copying: stale output would resurrect deleted prototypes
	rmSync(OUT, { recursive: true, force: true });
}

function countFiles(dir) {
	let n = 0;
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		n += e.isDirectory() ? countFiles(join(dir, e.name)) : 1;
	}
	return n;
}

// gate: PUBLISH_PROTOTYPES=1 forces on (even production), =0 forces off
const override = process.env.PUBLISH_PROTOTYPES;
const production = process.env.VERCEL_ENV === 'production';
const publish = override != null ? override !== '0' && override !== 'false' : !production;

if (!publish) {
	clean();
	console.log(
		'prototypes: NOT published (production default; set PUBLISH_PROTOTYPES=1 to publish)'
	);
	process.exit(0);
}

clean();
cpSync(SRC, OUT, {
	recursive: true,
	filter: (src) => {
		if (src === SRC) return true;
		const rel = src.slice(SRC.length + 1);
		return !LOCAL_ONLY.has(rel.split(sep)[0]);
	}
});

const files = countFiles(OUT);
if (!existsSync(join(OUT, 'index.html'))) {
	console.error('prototypes: publish failed - no index.html in output');
	process.exit(1);
}
console.log(`prototypes: published ${files} files -> static/prototypes/ (feedback/ excluded)`);
