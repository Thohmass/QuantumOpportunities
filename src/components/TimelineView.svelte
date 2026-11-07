<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { bounds, formatRange, isoDay, monthName } from '../lib/dates';
  import { statusLabel } from '../lib/format';
  import type { Ev } from '../lib/model';
  import {
    clickSelect,
    covers,
    overlapsAny,
    union,
    type ClickMode,
    type Interval,
  } from '../lib/ranges';
  import { app, currentIntervals, hover, openEvent, setRanges } from '../lib/state.svelte';

  let {
    events,
    today,
    dimmed = new Set<string>(),
    compact = false,
  }: { events: Ev[]; today: number; dimmed?: Set<string>; compact?: boolean } = $props();

  const DAY = 86_400_000;
  const ZOOMS = { week: 30, month: 9, quarter: 3.2, year: 1.1 } as const;
  type Zoom = keyof typeof ZOOMS;
  let zoom: Zoom = $state('quarter');
  const ppd = $derived(ZOOMS[zoom]);
  const ROW = 32;
  const HEAD = 46;
  const CHAR = 7;

  const range = $derived.by(() => {
    let lo = today - 21 * DAY;
    let hi = today + 120 * DAY;
    for (const e of events) {
      lo = Math.min(lo, e.display.span[0]);
      hi = Math.max(hi, e.display.span[1]);
    }
    const a = new Date(lo);
    const b = new Date(hi);
    return [
      Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1),
      Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 2, 0),
    ] as const;
  });
  const x = (t: number) => ((t - range[0]) / DAY) * ppd;
  const dayAt = (px: number) => range[0] + Math.floor(px / ppd) * DAY;
  const width = $derived(x(range[1]) + 40);

  // ---- header cells: months, then weeks or days ----------------------------
  interface Cell {
    key: string;
    x: number;
    w: number;
    label: string;
    aria: string;
    iv: Interval;
    year?: boolean;
  }
  const months = $derived.by(() => {
    const out: Cell[] = [];
    const d = new Date(range[0]);
    while (d.getTime() <= range[1]) {
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      const start = Date.UTC(y, m, 1);
      const end = Date.UTC(y, m + 1, 0);
      out.push({
        key: isoDay(start),
        x: x(start),
        w: x(end + DAY) - x(start),
        label: `${monthName(m)}${m === 0 || out.length === 0 ? ' ' + y : ''}`,
        aria: `${monthName(m, true)} ${y}`,
        iv: [start, end],
        year: m === 0,
      });
      d.setUTCMonth(m + 1);
    }
    return out;
  });
  const sub = $derived.by(() => {
    const out: Cell[] = [];
    if (ppd >= 20) {
      for (let t = range[0]; t <= range[1]; t += DAY) {
        out.push({
          key: isoDay(t),
          x: x(t),
          w: ppd,
          label: String(new Date(t).getUTCDate()),
          aria: isoDay(t),
          iv: [t, t],
        });
      }
    } else if (ppd >= 3) {
      const first = new Date(range[0]);
      for (let t = range[0] - ((first.getUTCDay() + 6) % 7) * DAY; t <= range[1]; t += 7 * DAY) {
        const thursday = new Date(t + 3 * DAY);
        const week = Math.ceil(
          ((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / DAY + 1) / 7,
        );
        out.push({
          key: isoDay(t),
          x: x(t),
          w: 7 * ppd,
          label: 7 * ppd >= 26 ? `W${week}` : '',
          aria: `week ${week} (${isoDay(t)})`,
          iv: [t, t + 6 * DAY],
        });
      }
    }
    return out;
  });

  // ---- rows ----------------------------------------------------------------
  interface Placed {
    e: Ev;
    left: number;
    barW: number;
    lane: number;
    deadlines: { x: number; label: string }[];
  }
  const placed = $derived.by(() => {
    const lanes: number[] = [];
    const out: Placed[] = [];
    const sorted = [...events].sort(
      (a, b) => a.display.span[0] - b.display.span[0] || a.name.localeCompare(b.name),
    );
    for (const e of sorted) {
      const left = x(e.display.span[0]);
      const barW = Math.max(10, x(e.display.span[1] + DAY) - left);
      const deadlines = Array.isArray(e.deadlines)
        ? e.deadlines
            .map((d) => ({
              x: x(bounds(d.date)[1]),
              label: `${d.kind.replace('_', ' ')} deadline ${d.date}`,
            }))
            .filter((d) => d.x >= 0 && d.x < left)
        : [];
      const startX = Math.min(left, ...deadlines.map((d) => d.x - 6));
      const label = e.name + (e.display.approx ? ' · month not known' : '');
      const end = left + barW + 8 + label.length * CHAR;
      let lane = lanes.findIndex((r) => r + 12 < startX);
      if (lane === -1) lane = lanes.push(end) - 1;
      else lanes[lane] = end;
      out.push({ e, left, barW, lane, deadlines });
    }
    return { items: out, lanes: Math.max(lanes.length, 1) };
  });

  // ---- selection (= the date filter): file-manager clicks and drags ---------
  const sel = $derived(currentIntervals(today));
  const selBands = $derived(
    sel
      .map(([a, b]) => [Math.max(a, range[0]), Math.min(b, range[1])] as const)
      .filter(([a, b]) => b >= a)
      .map(([a, b]) => ({ left: x(a), w: x(b + DAY) - x(a) })),
  );
  const outside = (e: Ev) => sel.length > 0 && !overlapsAny(sel, e.span[0], e.span[1]);
  let anchor: Interval | undefined;

  const modeOf = (ev: MouseEvent): ClickMode =>
    ev.shiftKey ? 'extend' : ev.ctrlKey || ev.metaKey ? 'toggle' : 'plain';
  function pickCell(cell: Cell, ev: MouseEvent) {
    const mode = modeOf(ev);
    setRanges(clickSelect(sel, cell.iv, mode, anchor));
    if (mode !== 'extend') anchor = cell.iv;
  }

  // Dragging across header cells selects every cell between; dragging in the body selects days.
  // Pointer capture starts only after the mouse moves, so plain clicks on bars and cells still work.
  let drag: { x0: number; x1: number; head: boolean; add: boolean } | undefined = $state();
  let pending: { x: number; id: number; head: boolean; add: boolean } | undefined;
  let canvas: HTMLDivElement | undefined = $state();
  let suppressClick = false;
  const localX = (ev: PointerEvent) => ev.clientX - canvas!.getBoundingClientRect().left;
  function down(ev: PointerEvent) {
    if (ev.pointerType !== 'mouse' || ev.button !== 0) return;
    const head = !!(ev.target as HTMLElement).closest('.head');
    pending = { x: localX(ev), id: ev.pointerId, head, add: ev.ctrlKey || ev.metaKey };
  }
  function move(ev: PointerEvent) {
    if (drag) drag.x1 = localX(ev);
    else if (pending && Math.abs(localX(ev) - pending.x) > 6) {
      drag = { x0: pending.x, x1: localX(ev), head: pending.head, add: pending.add };
      canvas!.setPointerCapture(pending.id);
    }
  }
  function cellsBetween(cells: Cell[], a: number, b: number): Interval | undefined {
    const hit = cells.filter((c) => c.x + c.w > a && c.x < b);
    return hit.length ? [hit[0]!.iv[0], hit[hit.length - 1]!.iv[1]] : undefined;
  }
  function up(ev: PointerEvent) {
    pending = undefined;
    if (!drag) return;
    const [a, b] = [Math.min(drag.x0, drag.x1), Math.max(drag.x0, drag.x1)];
    let iv: Interval | undefined;
    if (drag.head) {
      const subRow = ev.clientY - canvas!.getBoundingClientRect().top > 22 && sub.length;
      iv = cellsBetween(subRow ? sub : months, a, b);
    } else iv = [dayAt(a), dayAt(b)];
    if (iv) setRanges(drag.add ? union(sel, iv) : [iv]);
    drag = undefined;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
  }

  // ---- scrolling -------------------------------------------------------------
  let scroller: HTMLDivElement | undefined = $state();
  async function scrollToToday(smooth = false) {
    await tick();
    scroller?.scrollTo({ left: Math.max(0, x(today) - 60), behavior: smooth ? 'smooth' : 'auto' });
  }
  // Re-centre on today only when the zoom or the start of the axis actually changes — not when a selection
  // changes the filtered events (the axis start is a number, so an unchanged value doesn't re-run this).
  const axisStart = $derived(range[0]);
  $effect(() => {
    void zoom;
    void axisStart;
    untrack(() => scrollToToday());
  });
  function reveal(id: string, force: boolean) {
    if (!scroller || (!force && scroller.matches(':hover'))) return;
    const p = placed.items.find((i) => i.e.id === id);
    if (!p) return;
    const top = HEAD + p.lane * ROW;
    const { scrollLeft, clientWidth, scrollTop, clientHeight } = scroller;
    const left =
      force || p.left < scrollLeft + 20 || p.left > scrollLeft + clientWidth - 80
        ? p.left - clientWidth / 3
        : scrollLeft;
    const vTop =
      force || top < scrollTop + HEAD || top > scrollTop + clientHeight - ROW
        ? top - clientHeight / 2
        : scrollTop;
    if (left !== scrollLeft || vTop !== scrollTop)
      scroller.scrollTo({ left, top: vTop, behavior: 'smooth' });
  }
  // Bring an event hovered in another view into sight, and focus on a selected one.
  $effect(() => {
    if (app.hoverId) reveal(app.hoverId, false);
  });
  $effect(() => {
    void app.focusTick;
    if (app.eventId) reveal(app.eventId, true);
  });
</script>

<section class="timeline" class:compact aria-label="Timeline">
  <div class="toolbar">
    <p class="count"><b>{events.length - events.filter(outside).length}</b> in range</p>
    {#if sel.length}
      <button class="clear" type="button" onclick={() => setRanges([])}>Clear dates ×</button>
    {:else}
      <span class="hint muted"
        >Click months or weeks (Shift / Ctrl to add), or drag, to pick dates</span
      >
    {/if}
    <div class="zoom" role="group" aria-label="Zoom">
      {#each Object.keys(ZOOMS) as z (z)}
        <button
          type="button"
          class:on={zoom === z}
          aria-pressed={zoom === z}
          onclick={() => (zoom = z as Zoom)}>{z}</button
        >
      {/each}
      <button type="button" onclick={() => scrollToToday(true)}>Today</button>
    </div>
  </div>

  <div class="scroller" bind:this={scroller}>
    <div
      class="canvas"
      class:dragging={!!drag}
      bind:this={canvas}
      style:width="{width}px"
      style:height="{HEAD + placed.lanes * ROW + 16}px"
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={() => ((drag = undefined), (pending = undefined))}
      role="presentation"
    >
      {#each months as m, i (m.key)}
        <div
          class="month-bg"
          class:alt={i % 2 === 1}
          style:left="{m.x}px"
          style:width="{m.w}px"
        ></div>
        <div class="gridline" class:year={m.year} style:left="{m.x}px"></div>
      {/each}
      {#each selBands as b, i (i)}<div
          class="band"
          style:left="{b.left}px"
          style:width="{b.w}px"
        ></div>{/each}
      {#if drag && !drag.head}
        <div
          class="band drag"
          style:left="{Math.min(drag.x0, drag.x1)}px"
          style:width="{Math.abs(drag.x1 - drag.x0)}px"
        ></div>
      {/if}
      <div class="head">
        {#each months as m (m.key)}
          <button
            type="button"
            class="cell month"
            class:on={covers(sel, m.iv)}
            style:left="{m.x}px"
            style:width="{m.w}px"
            onclick={(ev) => !suppressClick && pickCell(m, ev)}
            aria-label="Select {m.aria}"
            aria-pressed={covers(sel, m.iv)}><span>{m.label}</span></button
          >
        {/each}
        {#each sub as s (s.key)}
          <button
            type="button"
            class="cell sub"
            class:on={covers(sel, s.iv)}
            style:left="{s.x}px"
            style:width="{s.w}px"
            onclick={(ev) => !suppressClick && pickCell(s, ev)}
            aria-label="Select {s.aria}"
            aria-pressed={covers(sel, s.iv)}
            title={s.aria}>{s.label}</button
          >
        {/each}
      </div>
      <div class="today" style:left="{x(today)}px"><span>Today</span></div>
      {#if !events.length}
        <p class="empty">No events match these filters.</p>
      {/if}
      {#each placed.items as p (p.e.id)}
        {@const top = HEAD + p.lane * ROW}
        {@const hot = app.hoverId === p.e.id}
        {@const picked = app.eventId === p.e.id}
        {@const faded = !hot && !picked && (outside(p.e) || dimmed.has(p.e.id))}
        <div class="t-{p.e.type}" class:faded class:past={p.e.isPast}>
          {#each p.deadlines as d (d.x)}
            <span
              class="link"
              style:left="{d.x}px"
              style:width="{p.left - d.x}px"
              style:top="{top + 12}px"
              aria-hidden="true"
            ></span>
            <span
              class="diamond"
              style:left="{d.x - 5}px"
              style:top="{top + 8}px"
              title={d.label}
              aria-hidden="true"
            ></span>
          {/each}
          <button
            type="button"
            class="item {p.e.status}"
            class:hot
            class:picked
            class:approx={p.e.display.approx}
            style:left="{p.left}px"
            style:top="{top}px"
            onclick={() => !suppressClick && openEvent(p.e.id)}
            onmouseenter={() => hover(p.e.id)}
            onmouseleave={() => hover(undefined)}
            onfocus={() => hover(p.e.id)}
            onblur={() => hover(undefined)}
            aria-label="{p.e.name}, {formatRange(p.e.dates.start, p.e.dates.end)}, {statusLabel(
              p.e,
            )}"
          >
            <span class="bar" style:width="{p.barW}px"></span>
            <span class="label"
              >{p.e.name}{#if p.e.display.approx}<span class="approx-note">
                  · month not known</span
                >{/if}</span
            >
          </button>
        </div>
      {/each}
    </div>
  </div>
  {#if !compact}
    <p class="hint muted">
      Colour = event type. Faded gradient = expected, not announced. Dotted outline = month not
      known. Diamonds = deadlines.
    </p>
  {/if}
</section>

<style>
  .timeline {
    display: grid;
    gap: 8px;
    padding-bottom: 20px;
    grid-template-rows: auto minmax(0, 1fr) auto;
    height: calc(100dvh - var(--header-h) - 70px);
    min-height: 360px;
  }
  .timeline.compact {
    height: 100%;
    min-height: 0;
    padding: 0;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    padding-top: 6px;
  }
  .count {
    margin: 0;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .count b {
    color: var(--ink);
  }
  .hint {
    font-size: 0.8rem;
    margin: 0;
  }
  .clear {
    border: 1px solid var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 0.82rem;
    font-weight: 600;
  }
  .zoom {
    display: flex;
    margin-left: auto;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    background: var(--surface);
  }
  .zoom button {
    border: 0;
    border-right: 1px solid var(--line);
    background: transparent;
    padding: 5px 9px;
    font-size: 0.82rem;
    text-transform: capitalize;
    min-height: 32px;
  }
  .zoom button:last-child {
    border-right: 0;
  }
  .zoom button.on {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  /* No frame: the axis fades out at the sides, so time reads as continuing beyond the screen. */
  .scroller {
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    min-height: 0;
    mask-image: linear-gradient(
      to right,
      transparent,
      #000 28px,
      #000 calc(100% - 28px),
      transparent
    );
  }
  .month-bg {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--surface);
    opacity: 0.55;
  }
  .month-bg.alt {
    background: var(--surface-2);
    opacity: 1;
  }
  .canvas {
    position: relative;
    min-height: 100%;
    user-select: none;
  }
  .canvas.dragging {
    cursor: col-resize;
  }
  .gridline {
    position: absolute;
    top: 0;
    bottom: 0;
    border-left: 1px solid var(--line);
  }
  .gridline.year {
    border-left: 2px solid color-mix(in srgb, var(--muted) 50%, var(--line));
  }
  .band {
    position: absolute;
    top: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border-left: 2px solid var(--accent);
    border-right: 2px solid var(--accent);
  }
  .band.drag {
    background: color-mix(in srgb, var(--accent) 20%, transparent);
  }
  .head {
    position: sticky;
    top: 0;
    height: 42px;
    z-index: 7;
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    border-bottom: 1px solid var(--line);
  }
  .cell {
    position: absolute;
    border: 0;
    background: transparent;
    padding: 0;
    color: var(--muted);
    font-family: var(--mono);
    text-align: left;
    overflow: hidden;
    white-space: nowrap;
  }
  .cell:hover {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .cell.on {
    background: color-mix(in srgb, var(--accent) 28%, transparent);
    color: var(--accent);
    font-weight: 700;
  }
  .cell.month {
    top: 0;
    height: 22px;
    font-size: 0.72rem;
    text-transform: uppercase;
  }
  .cell.month span {
    position: sticky;
    left: 0;
    padding: 0 6px;
  }
  .cell.sub {
    top: 22px;
    height: 19px;
    font-size: 0.66rem;
    text-align: center;
    border-left: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  }
  .today {
    position: absolute;
    top: 0;
    bottom: 0;
    border-left: 2px solid var(--warn);
    pointer-events: none;
    z-index: 5;
  }
  .today span {
    position: absolute;
    bottom: 4px;
    left: 4px;
    font-size: 0.7rem;
    color: var(--warn);
    font-weight: 700;
  }
  .empty {
    position: absolute;
    top: 60px;
    left: 16px;
    margin: 0;
    color: var(--muted);
  }
  .item {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 4px 0 0;
    border: 0;
    background: transparent;
    white-space: nowrap;
    z-index: 3;
    border-radius: 3px;
    transition: opacity 0.15s;
  }
  .bar {
    display: block;
    height: 14px;
    border-radius: 2px;
    background: var(--tc);
    flex: none;
  }
  .item.expected .bar {
    /* Uncertain = soft gradient: solid in the middle, fading towards both ends. */
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--tc) 12%, transparent),
      color-mix(in srgb, var(--tc) 75%, transparent) 35%,
      color-mix(in srgb, var(--tc) 75%, transparent) 65%,
      color-mix(in srgb, var(--tc) 12%, transparent)
    );
  }
  .item.approx .bar {
    background: linear-gradient(
      90deg,
      transparent,
      color-mix(in srgb, var(--tc) 45%, transparent) 50%,
      transparent
    );
    outline: 1px dotted var(--tc);
    outline-offset: -1px;
  }
  .item.postponed .bar,
  .item.cancelled .bar {
    background: transparent;
    outline: 2px dashed var(--warn);
    outline-offset: -2px;
  }
  .past .bar,
  .past .diamond,
  .past .link {
    filter: grayscale(0.85);
    opacity: 0.6;
  }
  .label {
    font-size: 0.8rem;
    color: var(--ink);
  }
  .item.expected .label {
    font-style: italic;
  }
  .approx-note {
    color: var(--muted);
    font-style: italic;
  }
  .faded {
    opacity: 0.25;
  }
  .item.picked {
    z-index: 6;
    background: var(--surface);
    box-shadow: 0 0 0 2px var(--tc);
  }
  .item.hot {
    z-index: 6;
    background: var(--surface);
    box-shadow: 0 0 0 2px var(--warn);
  }
  .item.hot .label {
    color: var(--warn);
    font-weight: 700;
  }
  .diamond {
    position: absolute;
    width: 9px;
    height: 9px;
    background: var(--tc);
    transform: rotate(45deg);
    border-radius: 1px;
    z-index: 3;
  }
  .link {
    position: absolute;
    height: 0;
    border-top: 1.5px dotted var(--tc);
    z-index: 2;
  }
</style>
