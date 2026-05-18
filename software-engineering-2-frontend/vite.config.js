/**
 * @fileoverview Vite configuration for React frontend.
 * Configures dev server port, React plugin, and build output.
 * @module vite.config
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 3000,
        open: true
    },
    build: {
        outDir: 'build', // Match CRA's output directory
        sourcemap: false
    }
});
