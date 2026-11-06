// Placeholder until Phase 2: writes an empty dataset so the site builds.
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/events.json', '[]');
writeFileSync('public/data/meta.json', JSON.stringify({ generatedAt: new Date().toISOString() }));
console.log('wrote placeholder data');
