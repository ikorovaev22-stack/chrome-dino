import {createHash} from 'node:crypto';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

import {defineConfig, type Plugin} from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * The game decodes its sounds from base64 data URIs (Chrome's resource bundler
 * inlines them into the page), so the <audio> sources in index.html are
 * inlined the same way.
 */
function inlineAudio(): Plugin {
  return {
    name: 'inline-audio',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(
            /(<audio\b[^>]*\bsrc=")([^"]+\.mp3)"/g, (_match, prefix, src) => {
              const data = readFileSync(new URL(src, `file://${root}/`));
              return `${prefix}data:audio/mpeg;base64,${
                  data.toString('base64')}"`;
            });
      },
    },
  };
}

/**
 * Builds sw.js from src/service_worker.js with the list of every file the
 * game needs, so the home screen app works offline from the first launch.
 * A new build has new file names, so the list also gives the cache version.
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const publicFiles = readdirSync(`${root}public`, {recursive: true})
          .map(String)
          .filter(file => file.includes('.'));
      const files = [...Object.keys(bundle), ...publicFiles].sort();
      const version =
          createHash('sha256').update(files.join()).digest('hex').slice(0, 12);
      const source = readFileSync(`${root}src/service_worker.js`, 'utf8')
          .replace('__VERSION__', JSON.stringify(version))
          .replace('__FILES__', JSON.stringify(files));
      this.emitFile({type: 'asset', fileName: 'sw.js', source});
    },
  };
}

export default defineConfig({
  // Relative URLs, so the build works from any path (e.g. GitHub Pages).
  base: './',
  resolve: {
    // The Chromium sources import WebUI helpers through chrome:// URLs.
    alias: [
      {find: 'chrome://resources/lit/v3_0/lit.rollup.js', replacement: 'lit'},
      {
        find: /^chrome:\/\/resources\/js\/(.*)\.js$/,
        replacement: `${root}src/chrome_resources/js/$1.ts`,
      },
    ],
  },
  plugins: [inlineAudio(), serviceWorker()],
  build: {
    rollupOptions: {
      // The coloured game, and the copy of Chrome's offline page.
      input: {
        main: `${root}index.html`,
        classic: `${root}classic.html`,
      },
    },
  },
});
