import { describe, expect, it } from 'vitest';
import { parseDay } from './dates';
import {
  clickSelect,
  covers,
  formatRangeKey,
  normalise,
  subtract,
  toIntervals,
  union,
  type Interval,
} from './ranges';

const d = parseDay;
const iv = (a: string, b: string): Interval => [d(a), d(b)];
const keys = (l: Interval[]) => l.map(formatRangeKey);
const jan = iv('2027-01-01', '2027-01-31');
const feb = iv('2027-02-01', '2027-02-28');
const mar = iv('2027-03-01', '2027-03-31');

describe('ranges', () => {
  it('parses and merges touching periods', () => {
    expect(keys(toIntervals(['2027-02', '2027-01-01~2027-01-31']))).toEqual([
      '2027-01-01~2027-02-28',
    ]);
    expect(keys(normalise([mar, jan]))).toEqual(['2027-01-01~2027-01-31', '2027-03-01~2027-03-31']);
  });
  it('subtracts a month from the middle of a selection', () => {
    expect(keys(subtract([iv('2027-01-01', '2027-03-31')], feb))).toEqual([
      '2027-01-01~2027-01-31',
      '2027-03-01~2027-03-31',
    ]);
    expect(covers(union([jan], feb), feb)).toBe(true);
  });
  it('selects like a file manager', () => {
    // plain click: select only it; again: unselect
    let s = clickSelect([], jan, 'plain');
    expect(keys(s)).toEqual(['2027-01-01~2027-01-31']);
    expect(clickSelect(s, jan, 'plain')).toEqual([]);
    // ctrl/cmd: add March, keep January (gap allowed)
    s = clickSelect(s, mar, 'toggle');
    expect(keys(s)).toEqual(['2027-01-01~2027-01-31', '2027-03-01~2027-03-31']);
    // ctrl/cmd on a selected month removes only it
    expect(keys(clickSelect(s, jan, 'toggle'))).toEqual(['2027-03-01~2027-03-31']);
    // shift: everything from the anchor to the clicked one
    expect(keys(clickSelect([jan], mar, 'extend', jan))).toEqual(['2027-01-01~2027-03-31']);
    // plain click on a month inside a multi-month selection removes just that month
    expect(keys(clickSelect([iv('2027-01-01', '2027-03-31')], feb, 'plain'))).toEqual([
      '2027-01-01~2027-01-31',
      '2027-03-01~2027-03-31',
    ]);
  });
});
