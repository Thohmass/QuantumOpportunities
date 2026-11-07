/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Relative base: the site works at any path (GitHub Pages project URL or a custom domain).
export default defineConfig({
  base: './',
  plugins: [svelte()],
  build: {
    target: 'es2022',
    sourcemap: false,
    reportCompressedSize: false,
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'tool/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
