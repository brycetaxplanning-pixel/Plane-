import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * What this bundle was built from.
 *
 * The commit, so rebuilding the same code gives the same answer and a running
 * app is never told to reload for a build that changed nothing. Falls back to
 * the clock where there is no git — a local tarball, a sandbox — which errs
 * toward "something changed", the safe direction.
 */
function buildId(): string {
  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim() || String(Date.now());
  } catch {
    return String(Date.now());
  }
}

const BUILD = buildId();

/**
 * Writes the build id where a running copy of the app can read it.
 *
 * Emitted from the same constant that is compiled into the bundle, so the file
 * on the server and the figure in the code cannot drift apart: they are the
 * same string by construction.
 */
function versionFile(): Plugin {
  return {
    name: 'plane-version',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) });
    },
  };
}

// Relative base so a build works from any static host — GitHub Pages project
// pages, a subdirectory, or opened straight off disk.
export default defineConfig({
  base: './',
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD) },
  build: { outDir: 'dist', sourcemap: false },
});
