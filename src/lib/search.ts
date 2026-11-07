// Client-side full-text search (fuzzy + prefix) over the fields people type.
import MiniSearch from 'minisearch';
import { countryName } from './geo';
import type { Ev } from './model';
import type { Meta } from './types';

export function buildIndex(events: Ev[], meta: Meta): MiniSearch {
  const ms = new MiniSearch({
    fields: ['name', 'series', 'orgs', 'place', 'topics', 'type', 'description'],
    storeFields: [],
    searchOptions: {
      boost: { name: 3, series: 2, orgs: 2, place: 2 },
      prefix: true,
      fuzzy: (term) => (term.length > 4 ? 0.2 : false),
      combineWith: 'AND',
    },
  });
  const topicName = new Map(meta.topics.map((t) => [t.id, t.name]));
  const typeName = new Map(meta.types.map((t) => [t.id, t.name]));
  ms.addAll(
    events.map((e) => ({
      id: e.id,
      name: e.name,
      series: e.series ? (meta.series[e.series]?.name ?? '') : '',
      orgs: e.orgNames.join(' '),
      place: [
        e.venue,
        e.city,
        e.country ? countryName(e.country) : '',
        e.format === 'online' ? 'online remote' : '',
      ]
        .filter(Boolean)
        .join(' '),
      topics: (e.topics ?? []).map((t) => topicName.get(t) ?? t).join(' '),
      type: typeName.get(e.type) ?? e.type,
      description: e.description ?? '',
    })),
  );
  return ms;
}

export function search(ms: MiniSearch, q: string): Set<string> | undefined {
  const query = q.trim();
  if (!query) return undefined;
  return new Set(ms.search(query).map((r) => String(r.id)));
}
