// npm run data:build — compiles data/**/*.yaml into public/data/events.json and meta.json for the site.
import { writeData } from './lib/build-data.ts';

try {
  console.log(`wrote ${writeData(process.cwd(), 'public/data')} events`);
} catch (e) {
  console.error(`${(e as Error).message}; run npm run data:check`);
  process.exit(1);
}
