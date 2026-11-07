<script lang="ts">
  import { tick } from 'svelte';
  import { bounds, formatRange, isoDay, monthName, precisionOf } from '../lib/dates';
  import { dateRange } from '../lib/filters';
  import { statusLabel } from '../lib/format';
  import type { Ev } from '../lib/model';
  import { app, hover, openEvent, selectRange } from '../lib/state.svelte';

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
      lo = Math.min(lo, e.span[0]);
      hi = Math.max(hi, e.span[1]);
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
  const months = $derived.by(() => {
    const out: {
      x: number;
      w: number;
      label: string;
      aria: string;
      from: string;
      to: string;
      year: boolean;
    }[] = [];
    const d = new Date(range[0]);
    while (d.getTime() <= range[1]) {
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      const start = Date.UTC(y, m, 1);
      const end = Date.UTC(y, m + 1, 0);
      out.push({
        x: x(start),
        w: x(end + DAY) - x(start),
        label: `${monthName(m)}${m === 0 || out.length === 0 ? ' ' + y : ''}`,
        aria: `Select ${monthName(m, true)} ${y}`,
        from: isoDay(start),
        to: isoDay(end),
        year: m === 0,
      });
      d.setUTCMonth(m + 1);
    }
    return out;
  });
  const sub = $derived.by(() => {
    const out: { x: number; w: number; label: string; from: string; to: string; title: string }[] =
      [];
    if (ppd >= 20) {
      for (let t = range[0]; t <= range[1]; t += DAY) {
        const d = new Date(t);
        out.push({
          x: x(t),
          w: ppd,
          label: String(d.getUTCDate()),
          from: isoDay(t),
          to: isoDay(t),
          title: isoDay(t),
        });
      }
    } else if (ppd >= 3) {
      // ISO weeks, Monday to Sunday
      const first = new Date(range[0]);
      let t = range[0] - ((first.getUTCDay() + 6) % 7) * DAY;
      for (; t <= range[1]; t += 7 * DAY) {
        const thursday = new Date(t + 3 * DAY);
        const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
        const week = Math.ceil(((thursday.getTime() - yearStart) / DAY + 1) / 7);
        out.push({
          x: x(t),
          w: 7 * ppd,
          label: 7 * ppd >= 26 ? `W${week}` : '',
          from: isoDay(t),
          to: isoDay(t + 6 * DAY),
          title: `Week ${week}`,
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
    fuzzyStart: boolean;
    fuzzyEnd: boolean;
    deadlines: { x: number; label: string }[];
  }
  const placed = $derived.by(() => {
    const lanes: number[] = [];
    const out: Placed[] = [];
    const sorted = [...events].sort(
      (a, b) => a.span[0] - b.span[0] || a.name.localeCompare(b.name),
    );
    for (const e of sorted) {
      const left = x(e.span[0]);
      const barW = Math.max(8, x(e.span[1] + DAY) - left);
      const deadlines = Array.isArray(e.deadlines)
        ? e.deadlines
            .map((d) => ({
              x: x(bounds(d.date)[1]),
              label: `${d.kind.replace('_', ' ')} deadline ${d.date}`,
            }))
            .filter((d) => d.x >= 0 && d.x < left)
        : [];
      const startX = Math.min(left, ...deadlines.map((d) => d.x - 6));
      const end = left + barW + 8 + e.name.length * CHAR;
      let lane = lanes.findIndex((r) => r + 12 < startX);
      if (lane === -1) lane = lanes.push(end) - 1;
      else lanes[lane] = end;
      out.push({
        e,
        left,
        barW,
        lane,
        fuzzyStart: precisionOf(e.dates.start) !== 'day',
        fuzzyEnd: precisionOf(e.dates.end ?? e.dates.start) !== 'day',
        deadlines,
      });
    }
    return { items: out, lanes: Math.max(lanes.length, 1) };
  });

  // ---- selection (= the date filter) ---------------------------------------
  const sel = $derived(dateRange(app.filters, today));
  const selBand = $derived.by(() => {
    if (!sel) return undefined;
    const a = Math.max(sel[0], range[0]);
    const b = Math.min(sel[1], range[1]);
    return b < a ? undefined : { left: x(a), w: x(b + DAY) - x(a) };
  });
  const outside = (e: Ev) => !!sel && !(e.span[0] <= sel[1] && sel[0] <= e.span[1]);

  // Mouse drag anywhere below the header selects a range. Capture starts only after the pointer moves, so a
  // plain click on a bar still opens the event. Touch keeps native scrolling; header cells select on tap.
  let drag: { x0: number; x1: number } | undefined = $state();
  let pending: { x: number; id: number } | undefined;
  let canvas: HTMLDivElement | undefined = $state();
  const localX = (ev: PointerEvent) => ev.clientX - canvas!.getBoundingClientRect().left;
  function down(ev: PointerEvent) {
    if (ev.pointerType !== 'mouse' || ev.button !== 0) return;
    if ((ev.target as HTMLElement).closest('.head')) return;
    pending = { x: localX(ev), id: ev.pointerId };
  }
  function move(ev: PointerEvent) {
    if (drag) {
      drag.x1 = localX(ev);
    } else if (pending && Math.abs(localX(ev) - pending.x) > 6) {
      drag = { x0: pending.x, x1: localX(ev) };
      canvas!.setPointerCapture(pending.id);
    }
  }
  function up() {
    pending = undefined;
    if (!drag) return;
    const [a, b] = [Math.min(drag.x0, drag.x1), Math.max(drag.x0, drag.x1)];
    selectRange(isoDay(dayAt(a)), isoDay(dayAt(b)));
    drag = undefined;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
  }
  let suppressClick = false;

  // ---- scrolling -------------------------------------------------------------
  let scroller: HTMLDivElement | undefined = $state();
  async function scrollToToday(smooth = false) {
    await tick();
    scroller?.scrollTo({ left: Math.max(0, x(today) - 60), behavior: smooth ? 'smooth' : 'auto' });
  }
  $effect(() => {
    void zoom;
    void range[0];
    scrollToToday();
  });
  // Bring an event hovered in another view into sight.
  $effect(() => {
    const id = app.hoverId;
    if (!id || !scroller || scroller.matches(':hover')) return;
    const p = placed.items.find((i) => i.e.id === id);
    if (!p) return;
    const top = HEAD + p.lane * ROW;
    const { scrollLeft, clientWidth, scrollTop, clientHeight } = scroller;
    const left =
      p.left < scrollLeft + 20 || p.left > scrollLeft + clientWidth - 80
        ? p.left - clientWidth / 3
        : scrollLeft;
    const vTop =
      top < scrollTop || top > scrollTop + clientHeight - ROW ? top - clientHeight / 2 : scrollTop;
    if (left !== scrollLeft || vTop !== scrollTop)
      scroller.scrollTo({ left, top: vTop, behavior: 'smooth' });
  });
</script>

<section class="timeline" class:compact aria-label="Timeline">
  <div class="toolbar">
    <p class="count"><b>{events.length - events.filter(outside).length}</b> in range</p>
    {#if sel}
      <button class="clear" type="button" onclick={() => selectRange()}>Clear dates ×</button>
    {:else}
      <span class="hint muted">Click a month or week, or drag, to pick dates</span>
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

  {#if !events.length}
    <p class="empty">No events match these filters.</p>
  {:else}
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
        {#each months as m (m.from)}
          <div class="gridline" class:year={m.year} style:left="{m.x}px"></div>
        {/each}
        {#if selBand}<div
            class="band"
            style:left="{selBand.left}px"
            style:width="{selBand.w}px"
          ></div>{/if}
        {#if drag}
          <div
            class="band drag"
            style:left="{Math.min(drag.x0, drag.x1)}px"
            style:width="{Math.abs(drag.x1 - drag.x0)}px"
          ></div>
        {/if}
        <div class="head">
          {#each months as m (m.from)}
            <button
              type="button"
              class="cell month"
              style:left="{m.x}px"
              style:width="{m.w}px"
              onclick={() => selectRange(m.from, m.to)}
              aria-label={m.aria}><span>{m.label}</span></button
            >
          {/each}
          {#each sub as s (s.from)}
            <button
              type="button"
              class="cell sub"
              style:left="{s.x}px"
              style:width="{s.w}px"
              onclick={() => selectRange(s.from, s.to)}
              aria-label="Select {s.title}"
              title={s.title}>{s.label}</button
            >
          {/each}
        </div>
        <div class="today" style:left="{x(today)}px"><span>Today</span></div>
        {#each placed.items as p (p.e.id)}
          {@const top = HEAD + p.lane * ROW}
          {@const hot = app.hoverId === p.e.id}
          {@const faded = !hot && (outside(p.e) || dimmed.has(p.e.id))}
          {#each p.deadlines as d (d.x)}
            <span
              class="diamond"
              class:faded
              style:left="{d.x - 5}px"
              style:top="{top + 8}px"
              title={d.label}
              aria-hidden="true"
            ></span>
          {/each}
          <button
            type="button"
            class="item {p.e.status}"
            class:past={p.e.isPast}
            class:hot
            class:faded
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
            <span class="bar" class:fs={p.fuzzyStart} class:fe={p.fuzzyEnd} style:width="{p.barW}px"
            ></span>
            <span class="label">{p.e.name}</span>
          </button>
        {/each}
      </div>
    </div>
    {#if !compact}
      <p class="hint muted">
        Faded ends: exact days not known yet. Striped bars: expected editions, not announced yet.
        Diamonds: deadlines.
      </p>
    {/if}
  {/if}
</section>

<style>
  .timeline {
    display: grid;
    gap: 8px;
    padding-bottom: 30px;
    grid-template-rows: auto minmax(0, 1fr) auto;
  }
  .timeline.compact {
    height: 100%;
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
  .scroller {
    overflow: auto;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    -webkit-overflow-scrolling: touch;
  }
  .timeline:not(.compact) .scroller {
    max-height: calc(100dvh - var(--header-h) - 130px);
  }
  .canvas {
    position: relative;
    min-height: 120px;
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
    z-index: 4;
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
    border-radius: 6px;
    transition: opacity 0.15s;
  }
  .bar {
    display: block;
    height: 14px;
    border-radius: 7px;
    background: var(--accent);
    flex: none;
  }
  .bar.fs {
    mask-image: linear-gradient(to right, transparent, #000 40%);
  }
  .bar.fe {
    mask-image: linear-gradient(to right, #000 60%, transparent);
  }
  .bar.fs.fe {
    mask-image: linear-gradient(to right, transparent, #000 30%, #000 70%, transparent);
  }
  .item.expected .bar {
    background: repeating-linear-gradient(
      135deg,
      var(--expected) 0 4px,
      color-mix(in srgb, var(--expected) 25%, transparent) 4px 8px
    );
  }
  .item.postponed .bar,
  .item.cancelled .bar {
    background: var(--warn);
    opacity: 0.6;
  }
  .item.past .bar {
    background: var(--past);
  }
  .label {
    font-size: 0.8rem;
    color: var(--ink);
  }
  .item.expected .label {
    color: var(--muted);
    font-style: italic;
  }
  .item.faded {
    opacity: 0.28;
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
    background: var(--warn);
    transform: rotate(45deg);
    border-radius: 1px;
    z-index: 3;
  }
  .diamond.faded {
    opacity: 0.28;
  }
  .empty {
    text-align: center;
    padding: 40px;
    color: var(--muted);
    border: 1px dashed var(--line);
    border-radius: var(--radius);
  }
</style>
