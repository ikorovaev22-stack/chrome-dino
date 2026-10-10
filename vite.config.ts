import {readFileSync} from 'node:fs';
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
  plugins: [inlineAudio()],
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
