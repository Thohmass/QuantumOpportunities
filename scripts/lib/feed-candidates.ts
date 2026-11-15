// Turns the sources' feeds into candidate lines for the Scout (issue #42): fetch, parse, keep new quantum items.
// Network access is injected so tests run on fixtures.
import type { SourceEntry } from './load.ts';
import { parseFeed, relevant, robotsAllows, type FeedItem } from './feeds.ts';
import { DUPLICATE_THRESHOLD, findSimilar, type IndexEntry } from './similarity.ts';

export interface FeedLine {
  source: string;
  text: string;
  error?: boolean;
}

export interface FeedIO {
  get(url: string): Promise<string>;
  robots(url: string): Promise<string>;
}

/** At most this many items per feed and in total, so one noisy feed can't flood the Scout's turns. */
export const PER_FEED = 15;
export const TOTAL = 60;

function line(sourceId: string, it: FeedItem): string {
  const when = it.start ? (it.end && it.end !== it.start ? `${it.start}–${it.end}` : it.start) : '';
  const label = it.kind === 'post' ? `posted ${when}` : when;
  return [sourceId, it.title, label, it.location ?? '', it.url ?? ''].join(' | ');
}

export async function feedCandidates(
  sources: SourceEntry[],
  index: IndexEntry[],
  today: string,
  io: FeedIO,
): Promise<FeedLine[]> {
  const out: FeedLine[] = [];
  let total = 0;
  for (const s of sources) {
    if (!s.feed || total >= TOTAL) continue;
    const { url, format, all_quantum } = s.feed;
    try {
      const path = new URL(url).pathname + new URL(url).search;
      if (!robotsAllows(await io.robots(url), path)) {
        out.push({
          source: s.id,
          text: `${s.id} | SKIPPED: robots.txt disallows ${url}`,
          error: true,
        });
        continue;
      }
      const items = relevant(parseFeed(format, await io.get(url)), today, {
        allQuantum: all_quantum,
      });
      const seen = new Set<string>();
      let kept = 0;
      for (const it of items) {
        if (kept >= PER_FEED || total >= TOTAL) break;
        const key = (it.url ?? it.title).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const best = findSimilar(
          {
            name: it.title,
            start: it.kind === 'event' ? it.start : undefined,
            end: it.end,
            url: it.url,
          },
          index,
          1,
        )[0];
        if (best && best.score >= DUPLICATE_THRESHOLD) continue; // we already have it
        out.push({ source: s.id, text: line(s.id, it) });
        kept++;
        total++;
      }
    } catch (err) {
      out.push({
        source: s.id,
        text: `${s.id} | ERROR: ${(err as Error).message} (${url})`,
        error: true,
      });
    }
  }
  return out;
}
