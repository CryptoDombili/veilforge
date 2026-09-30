import process from 'node:process';
import { buildProductionSnapshot } from './lib/production-provenance.mjs';

buildProductionSnapshot({ root: process.cwd() });
await import('./verify-arc-mainnet-production.mjs');
