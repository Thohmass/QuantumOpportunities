// The app's mutable UI state. Components import `app` and change it directly; App.svelte keeps the URL in sync.
import { DEFAULT_FILTERS, type Filters, type View } from './filters';

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
});

export function hover(id: string | undefined): void {
  app.hoverId = id;
}

/** Selects a date range on the timeline (or clears it with undefined). */
export function selectRange(from?: string, to?: string): void {
  if (!from) {
    app.filters = { ...app.filters, when: 'any', from: '', to: '' };
    return;
  }
  app.filters = { ...app.filters, when: 'custom', from, to: to ?? from };
}

export function resetFilters(): void {
  app.filters = { ...DEFAULT_FILTERS, sort: app.filters.sort };
}

export function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function openEvent(id: string): void {
  app.eventId = id;
}
