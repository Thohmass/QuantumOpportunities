// Shared types: the raw YAML shapes (data/**) and the built JSON the site loads (public/data/*.json).
// docs/02-data-model.md is the specification.

export type NA = 'n/a';
export type Status = 'confirmed' | 'expected' | 'postponed' | 'cancelled';
export type Format = 'in_person' | 'online' | 'hybrid';
export type OrgType =
  'university' | 'company' | 'research_institute' | 'community' | 'government' | 'other';
export type DeadlineKind = 'application' | 'registration' | 'abstract' | 'early_bird' | 'other';
export type SourceKind = 'official' | 'organiser_social' | 'aggregator' | 'news' | 'other';
export type Confidence = 'high' | 'medium' | 'low';
export type Continent = 'EU' | 'AS' | 'AF' | 'NA' | 'SA' | 'OC' | 'AN';

export interface Deadline {
  kind: DeadlineKind;
  date: string;
  note?: string;
}
export interface Team {
  min?: number;
  max?: number;
  note?: string;
}
export interface Hardware {
  real_qpu: boolean;
  note?: string;
}
export interface Cost {
  kind: 'free' | 'paid' | 'mixed';
  min?: number;
  max?: number;
  currency?: string;
  note?: string;
}
export interface Support {
  travel_grants: boolean;
  note?: string;
}
export interface Source {
  url: string;
  kind: SourceKind;
  accessed: string;
  note?: string;
}

/** One event file in data/events/<year>/<id>.yaml */
export interface RawEvent {
  id: string;
  series?: string;
  name: string;
  type: string;
  status: Status;
  format: Format;
  dates: { start: string; end?: string; note?: string };
  deadlines?: Deadline[] | NA;
  location?: {
    city: string;
    country: string;
    venue?: string;
    latlon?: [number, number];
    note?: string;
  };
  organizers?: string[];
  partners?: string[];
  topics?: string[];
  audience?: string[] | NA;
  eligibility?: string;
  team?: Team | NA;
  hardware?: Hardware | NA;
  prizes?: string | NA;
  cost?: Cost;
  support?: Support | NA;
  url?: string;
  registration_url?: string;
  description?: string;
  expected?: { basis: string; confidence: Confidence };
  sources: Source[];
  checks: { last_checked: string; unchanged_streak: number };
  added: { date: string; by: string };
}

export interface RawSeries {
  id: string;
  name: string;
  organizers?: string[];
  cadence: 'annual' | 'biennial' | 'irregular' | 'one_off';
  typical_month?: number;
  url?: string;
  aliases?: string[];
  note?: string;
}

export interface RawOrg {
  id: string;
  name: string;
  type: OrgType;
  parent?: string;
  country?: string;
  city?: string;
  url?: string;
  aliases?: string[];
}

export interface TaxonomyItem {
  id: string;
  name: string;
  parent?: string;
}

/** An event as the site receives it: raw fields plus fields derived at build time. */
export interface EventOut extends Omit<RawEvent, 'location' | 'checks' | 'added'> {
  city?: string;
  country?: string;
  venue?: string;
  lat?: number;
  lon?: number;
  continent?: Continent;
  lastChecked: string;
  addedOn: string;
  /** Critical fields not found yet (docs/02-data-model.md §3). */
  missing: string[];
}

export interface RunLog {
  date: string;
  job: 'scout' | 'refresher' | 'import' | 'manual';
  checked?: number;
  updated?: number;
  created?: number;
  note?: string;
}

export interface Meta {
  generatedAt: string;
  types: TaxonomyItem[];
  topics: TaxonomyItem[];
  audiences: TaxonomyItem[];
  orgs: Record<string, { name: string; type: OrgType; country?: string }>;
  series: Record<string, { name: string; url?: string; typicalMonth?: number }>;
  redirects: Record<string, string>;
  health: {
    total: number;
    byStatus: Record<string, number>;
    /** Share (0–1) of upcoming events that have each critical field. */
    filled: Record<string, number>;
    lastRuns: Partial<Record<RunLog['job'], string>>;
  };
}
