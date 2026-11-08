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
  /** The full details pop-up is open for the selected event (the list card shows only the essentials). */
  detailOpen: false,
});

// ---- preferences kept in this browser ---------------------------------------
export type Theme = 'system' | 'light' | 'dark';
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

function loadNumber(key: string, min: number, max: number, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return localStorage.getItem(key) !== null && v >= min && v <= max ? v : fallback;
  } catch {
    return fallback;
  }
}

/** Explore: the map's share of the height it splits with the timeline. */
export const SPLIT = { min: 0.2, max: 0.8, initial: 0.53 } as const;

/** Desktop workspace: widths (px) of the filters column and the Explore list column. */
export const WIDTHS = {
  filters: { min: 220, max: 460, initial: 290 },
  list: { min: 300, max: 760, initial: 420 },
} as const;

export const prefs = $state({
  theme: load<Theme>('qo-theme', ['system', 'light', 'dark'], 'system'),
  sidebar: load<'shown' | 'hidden'>('qo-sidebar', ['shown', 'hidden'], 'shown'),
  /** Explore on desktop: the list column can be hidden (remembered). */
  list: load<'shown' | 'hidden'>('qo-list', ['shown', 'hidden'], 'shown'),
  filtersW: loadNumber(
    'qo-filters-w',
    WIDTHS.filters.min,
    WIDTHS.filters.max,
    WIDTHS.filters.initial,
  ),
  listW: loadNumber('qo-list-w', WIDTHS.list.min, WIDTHS.list.max, WIDTHS.list.initial),
  /** Filter groups the user opened or closed this visit (others use their default). */
  toggled: [] as string[],
  split: loadNumber('qo-split', SPLIT.min, SPLIT.max, SPLIT.initial),
});

export function setSplit(value: number): void {
  prefs.split = Math.min(SPLIT.max, Math.max(SPLIT.min, value));
  save('qo-split', prefs.split.toFixed(3));
}

export function setWidth(which: 'filters' | 'list', px: number): void {
  const { min, max } = WIDTHS[which];
  const v = Math.round(Math.min(max, Math.max(min, px)));
  if (which === 'filters') prefs.filtersW = v;
  else prefs.listW = v;
  save(`qo-${which}-w`, String(v));
}

export function setPref<K extends 'theme' | 'sidebar' | 'list'>(
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
