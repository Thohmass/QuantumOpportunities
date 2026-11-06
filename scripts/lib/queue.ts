// The deterministic refresh queue (docs/04-data-pipeline.md §4): which events are due for a re-check, in order.
import { addDays, bounds, daysBetween, eventSpan, isoDay, parseDay } from '../../src/lib/dates.ts';
import type { RawEvent } from '../../src/lib/types.ts';
import { missingFields } from './derive.ts';

export type Tier = 'A' | 'B' | 'C' | 'D';

export interface QueueItem {
  id: string;
  name: string;
  file: string;
  priority: number;
  tier: Tier;
  due: string;
  lastChecked: string;
  missing: string[];
  reason: string;
}

const BASE_INTERVAL: Record<Tier, number> = { A: 3, B: 7, C: 14, D: 30 };
const WEIGHT: Record<Tier, number> = { A: 8, B: 4, C: 2, D: 1 };
const MAX_INTERVAL = 60;

/** The next date that matters: the next open deadline, else the start. */
export function nextKeyDay(e: RawEvent, today: number): number {
  const deadlines = Array.isArray(e.deadlines)
    ? e.deadlines
        .map((d) => bounds(d.date)[1])
        .filter((t) => t >= today)
        .sort((a, b) => a - b)
    : [];
  return deadlines[0] ?? bounds(e.dates.start)[0];
}

export function tierFor(daysAway: number): Tier {
  if (daysAway <= 30) return 'A';
  if (daysAway <= 90) return 'B';
  if (daysAway <= 180) return 'C';
  return 'D';
}

export function intervalDays(e: RawEvent, tier: Tier, missingCount: number): number {
  let days = BASE_INTERVAL[tier] * 2 ** Math.min(e.checks.unchanged_streak, 3);
  if (missingCount === 0) days *= 2; // complete events only need change detection
  return Math.min(days, MAX_INTERVAL);
}

export function buildQueue(
  events: { file: string; doc: RawEvent }[],
  todayMs: number,
  flagged: Set<string> = new Set(),
): QueueItem[] {
  const items: QueueItem[] = [];
  for (const { file, doc: e } of events) {
    if (e.status === 'cancelled') continue;
    if (eventSpan(e.dates.start, e.dates.end)[1] < todayMs) continue; // past
    const missing = missingFields(e);
    const tier = tierFor(Math.max(0, daysBetween(todayMs, nextKeyDay(e, todayMs))));
    const interval = intervalDays(e, tier, missing.length);
    const dueMs = addDays(parseDay(e.checks.last_checked), interval);
    const isFlagged = flagged.has(e.id);
    if (dueMs > todayMs && !isFlagged) continue;
    let priority = WEIGHT[tier] * (1 + missing.length);
    const reasons = [
      `tier ${tier}`,
      missing.length ? `missing: ${missing.join(', ')}` : 'complete, change check',
    ];
    if (e.status === 'expected' && tier !== 'D') {
      priority += 3;
      reasons.push('expected edition coming up');
    }
    if (isFlagged) {
      priority += 5;
      reasons.push('flagged (broken link or correction request)');
    }
    items.push({
      id: e.id,
      name: e.name,
      file,
      priority,
      tier,
      due: isoDay(dueMs),
      lastChecked: e.checks.last_checked,
      missing,
      reason: reasons.join('; '),
    });
  }
  return items.sort(
    (a, b) =>
      b.priority - a.priority ||
      a.lastChecked.localeCompare(b.lastChecked) ||
      a.id.localeCompare(b.id),
  );
}
