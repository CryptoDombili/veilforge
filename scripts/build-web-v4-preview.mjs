import process from 'node:process';

process.env.VEILFORGE_WEB_V4_ENABLED = 'true';
process.env.VEILFORGE_WEB_OUTPUT_DIR = 'dist-preview-v4';
await import('./build-web.mjs');
