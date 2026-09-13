import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

if (process.env.CF_PAGES && !process.env.VITE_SERVER_URL?.trim()) {
  throw new Error('Cloudflare Pages build requires VITE_SERVER_URL');
}

export default defineConfig({
  base: './',
  plugins: [tailwindcss()],
  server: { fs: { allow: [resolve(dirname(fileURLToPath(import.meta.url)), '../..')] } },
});
