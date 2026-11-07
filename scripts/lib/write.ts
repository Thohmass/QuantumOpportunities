// Writes event YAML with a stable key order, so agent and human edits produce small diffs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Document, isScalar, isSeq, visit } from 'yaml';
import type { RawEvent } from '../../src/lib/types.ts';

const ORDER: (keyof RawEvent)[] = [
  'id',
  'series',
  'name',
  'type',
  'status',
  'format',
  'dates',
  'deadlines',
  'location',
  'organizers',
  'partners',
  'topics',
  'audience',
  'eligibility',
  'team',
  'hardware',
  'prizes',
  'cost',
  'support',
  'url',
  'registration_url',
  'description',
  'expected',
  'sources',
  'checks',
  'added',
];

export function eventYaml(e: RawEvent): string {
  const ordered: Record<string, unknown> = {};
  for (const k of ORDER) if (e[k] !== undefined) ordered[k] = e[k];
  for (const k of Object.keys(e))
    if (!(k in ordered)) ordered[k] = (e as unknown as Record<string, unknown>)[k];
  const doc = new Document(ordered);
  // Short lists of plain values on one line: `topics: [computing, qml]`.
  visit(doc, {
    Seq(_, node) {
      if (isSeq(node) && node.items.every((i) => isScalar(i))) node.flow = true;
    },
  });
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}

export function writeEvent(file: string, e: RawEvent): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, eventYaml(e));
}
