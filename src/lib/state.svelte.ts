// The app's mutable UI state. Components import `app` and change it directly; App.svelte keeps the URL in sync.
import { DEFAULT_FILTERS, dateRanges, type Filters, type View } from './filters';
import { formatRangeKey, type Interval } from './ranges';

export const app = $state({
  view: 'list' as View,
  filters: { ...DEFAULT_FILTERS } as Filters,
  eventId: undefined as string | undefined,
  filtersOpen: false,
  /** Event under the pointer (or keyboard focus) in any view: highlighted everywhere. */
  hoverId: undefined as string | undefined,
  /** Visible map area [south, west, north, east], set by the map. */
  mapBounds: undefined as [number, number, number, number] | undefined,
  /** Hide (instead of dim) events outside the visible map area. */
  mapOnly: false,
  /** Bumped when an event is selected from a list card, so the map and timeline focus on it. */
  focusTick: 0,
});

// ---- preferences kept in this browser ---------------------------------------
export type Theme = 'system' | 'light' | 'dark';
export type Layout = 'grid' | 'wide';
function load<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: preference lasts for this visit */
  }
}

export const prefs = $state({
  theme: load<Theme>('qo-theme', ['system', 'light', 'dark'], 'system'),
  layout: load<Layout>('qo-layout', ['grid', 'wide'], 'grid'),
  sidebar: load<'shown' | 'hidden'>('qo-sidebar', ['shown', 'hidden'], 'shown'),
  listOpen: false, // wide layout: list drawer
  collapsed: [] as string[], // collapsed filter groups (this visit)
});

export function setPref<K extends 'theme' | 'layout' | 'sidebar'>(
  key: K,
  value: (typeof prefs)[K],
): void {
  prefs[key] = value;
  save(`qo-${key}`, value);
}

export function isDark(): boolean {
  return (
    prefs.theme === 'dark' ||
    (prefs.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  );
}

export function hover(id: string | undefined): void {
  app.hoverId = id;
}

/** Sets the selected date periods (an empty list clears the date filter). */
export function setRanges(list: Interval[]): void {
  app.filters = list.length
    ? { ...app.filters, when: 'custom', ranges: list.map(formatRangeKey) }
    : { ...app.filters, when: 'any', ranges: [] };
}

/** The selection the timeline edits: the custom periods, or the preset's period. */
export function currentIntervals(today: number): Interval[] {
  return dateRanges(app.filters, today) ?? [];
}

export function resetFilters(): void {
  app.filters = { ...DEFAULT_FILTERS, sort: app.filters.sort };
}

export function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function openEvent(id: string, focus = false): void {
  app.eventId = id;
  if (focus) app.focusTick++;
}
