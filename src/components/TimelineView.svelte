<script lang="ts" module>
  // Zoom and position survive the timeline being re-created (e.g. when a panel is expanded or shrunk).
  let remembered: { ppd: number; leftDate: number } | undefined;
</script>

<script lang="ts">
  import { tick, untrack } from 'svelte';
  import ExpandButton from './ExpandButton.svelte';
  import TypeIcon from './TypeIcon.svelte';
  import { bounds, formatRange, isoDay, monthName } from '../lib/dates';
  import { NOT_FOUND, statusLabel, whereText } from '../lib/format';
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
    types = [],
  }: {
    events: Ev[];
    today: number;
    dimmed?: Set<string>;
    compact?: boolean;
    /** Event types in their display order: one band of rows per type. */
    types?: { id: string; name: string }[];
  } = $props();

  const DAY = 86_400_000;
  // Zoom is continuous (pixels per day): the mouse wheel, trackpad or touch pinch, or the − / + buttons.
  const DEFAULT_PPD = 3.2;
  const MIN_PPD = 0.45;
  const MAX_PPD = 48;
  let ppd = $state<number>(remembered?.ppd ?? DEFAULT_PPD);
  /** The visible part of the scroller, kept up to date (once per frame) while scrolling and resizing. */
  let view = $state({ left: 0, width: 800, height: 0 });
  const HEAD = 46;

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
    /** A day cell (selectable); week cells are labels only. */
    day?: boolean;
  }
  function monthLabel(m: number, y: number, first: boolean, w: number): string {
    const year = m === 0 || first;
    if (w >= 46) return `${monthName(m)}${year ? ' ' + y : ''}`;
    if (w >= 20) return year ? String(y) : monthName(m).slice(0, 1);
    return year ? String(y) : '';
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
        label: monthLabel(m, y, out.length === 0, x(end + DAY) - x(start)),
        aria: `${monthName(m, true)} ${y}`,
        iv: [start, end],
        year: m === 0,
      });
      d.setUTCMonth(m + 1);
    }
    return out;
  });
  // Only the day/week cells near the visible part of the axis are drawn.
  const subFrom = $derived(Math.max(range[0], dayAt(view.left - view.width)));
  const subTo = $derived(Math.min(range[1], dayAt(view.left + 2 * view.width)));
  const sub = $derived.by(() => {
    const out: Cell[] = [];
    if (ppd >= 20) {
      for (let t = subFrom; t <= subTo; t += DAY) {
        out.push({
          key: isoDay(t),
          x: x(t),
          w: ppd,
          label: String(new Date(t).getUTCDate()),
          aria: isoDay(t),
          iv: [t, t],
          day: true,
        });
      }
    } else if (ppd >= 3) {
      const first = new Date(subFrom);
      for (let t = subFrom - ((first.getUTCDay() + 6) % 7) * DAY; t <= subTo; t += 7 * DAY) {
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

  // ---- rows: one band per event type ------------------------------------------
  // Each type gets its own band of rows (its icon at the left edge), so the colours sort themselves and a glance
  // answers "what kinds of events, when". Within a band, bars are packed into as few rows as possible. A name is
  // written inside its bar only where it fits at the current zoom; pointing at a bar (or selecting it) opens a
  // line under it with the name and the place.
  interface Placed {
    e: Ev;
    left: number;
    barW: number;
    row: number;
    /** Width of the name in the full label size (it is scaled with the bar height). */
    textW: number;
    deadlines: { x: number; label: string }[];
  }
  interface Band {
    type: string;
    name: string;
    firstRow: number;
    rows: number;
  }
  const GAP = 6;
  const LANE_GAP = 7;
  // Text widths for "does the name fit in the bar", measured once per name in the label font.
  let measure: CanvasRenderingContext2D | null | undefined;
  const widths = new Map<string, number>();
  let rem = 0;
  function remPx(): number {
    return (rem ||= parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
  }
  function textW(text: string): number {
    let v = widths.get(text);
    if (v !== undefined) return v;
    measure ??= document.createElement('canvas').getContext('2d');
    if (measure) {
      measure.font = `600 ${0.72 * remPx()}px ${getComputedStyle(document.body).fontFamily}`;
      v = measure.measureText(text).width;
    } else v = text.length * 6.5;
    widths.set(text, v);
    return v;
  }
  const placed = $derived.by(() => {
    const order = new Map(types.map((t, i) => [t.id, i]));
    const byType = new Map<string, Ev[]>();
    for (const e of events) {
      const list = byType.get(e.type);
      if (list) list.push(e);
      else byType.set(e.type, [e]);
    }
    const typeIds = [...byType.keys()].sort(
      (a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99) || a.localeCompare(b),
    );
    const items: Placed[] = [];
    const bands: Band[] = [];
    let row = 0;
    for (const type of typeIds) {
      const list = byType
        .get(type)!
        .sort((a, b) => a.display.span[0] - b.display.span[0] || a.name.localeCompare(b.name));
      const ends: number[] = [];
      for (const e of list) {
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
        let r = ends.findIndex((end) => end + GAP <= startX);
        if (r === -1) r = ends.push(left + barW) - 1;
        else ends[r] = left + barW;
        items.push({
          e,
          left,
          barW,
          row: row + r,
          textW: textW(e.name),
          deadlines,
        });
      }
      bands.push({
        type,
        name: types.find((t) => t.id === type)?.name ?? type,
        firstRow: row,
        rows: Math.max(1, ends.length),
      });
      row += Math.max(1, ends.length);
    }
    return { items, bands, rows: Math.max(row, 1) };
  });
  // Rows shrink (down to a minimum) so that all of them fit the box.
  const ROW_MAX = 30;
  const ROW_MIN = 20;
  const rowH = $derived(
    !view.height
      ? ROW_MAX
      : Math.max(
          ROW_MIN,
          Math.min(
            ROW_MAX,
            Math.floor((view.height - HEAD - 12 - placed.bands.length * LANE_GAP) / placed.rows),
          ),
        ),
  );
  const itemH = $derived(rowH - 6);
  const barH = $derived(Math.max(8, Math.min(18, itemH)));
  /** Names inside bars: the text follows the bar height (down to a size that is still readable). */
  const fontPx = $derived(Math.min(0.72 * remPx(), barH - 3));
  const roomy = $derived(fontPx >= 10);

  // The extra line with the name and place: under the bar the mouse rests on, or the selected one.
  const LINE = 20;
  let pointed: string | undefined = $state();
  let pointTimer = 0;
  function point(id: string | undefined) {
    clearTimeout(pointTimer);
    pointTimer = window.setTimeout(() => (pointed = id), 90);
  }
  const opened = $derived(pointed ?? app.eventId);
  const openedRow = $derived(placed.items.find((p) => p.e.id === opened)?.row);
  const bandOf = $derived.by(() => {
    const out: number[] = [];
    placed.bands.forEach((b, i) => {
      for (let r = 0; r < b.rows; r++) out[b.firstRow + r] = i;
    });
    return out;
  });
  /** Top (px) of a row: rows above it, the gaps between bands, and the opened line if it is above. */
  const rowTop = (r: number) =>
    HEAD +
    6 +
    r * rowH +
    (bandOf[r] ?? 0) * LANE_GAP +
    (openedRow !== undefined && r > openedRow ? LINE : 0);
  const canvasH = $derived(
    HEAD +
      6 +
      placed.rows * rowH +
      Math.max(0, placed.bands.length - 1) * LANE_GAP +
      (openedRow !== undefined ? LINE : 0) +
      12,
  );

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
      iv = !subRow
        ? cellsBetween(months, a, b)
        : sub[0]?.day
          ? cellsBetween(sub, a, b)
          : [dayAt(a), dayAt(b)];
    } else iv = [dayAt(a), dayAt(b)];
    if (iv) setRanges(drag.add ? union(sel, iv) : [iv]);
    drag = undefined;
    suppressClick = true;
    // The click that ends a drag is not a click on the page either (it would deselect the event).
    const stop = (e: Event) => e.stopPropagation();
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => {
      suppressClick = false;
      window.removeEventListener('click', stop, { capture: true });
    }, 0);
  }

  // ---- scrolling and zooming ---------------------------------------------------
  let scroller: HTMLDivElement | undefined = $state();
  let viewFrame = 0;
  function readView() {
    viewFrame = 0;
    if (scroller) {
      view = {
        left: scroller.scrollLeft,
        width: scroller.clientWidth,
        height: scroller.clientHeight,
      };
      remembered = { ppd, leftDate: range[0] + (scroller.scrollLeft / ppd) * DAY };
    }
  }
  const onScroll = () => (viewFrame ||= requestAnimationFrame(readView));
  $effect(() => {
    if (!scroller) return;
    const ro = new ResizeObserver(onScroll);
    ro.observe(scroller);
    return () => ro.disconnect();
  });

  async function scrollToToday(smooth = false) {
    await tick();
    scroller?.scrollTo({ left: Math.max(0, x(today) - 60), behavior: smooth ? 'smooth' : 'auto' });
  }
  // Re-centre on today only when the start of the axis changes (first load, or new data far in the past) — not
  // when a selection changes the filtered events (an unchanged number doesn't re-run this).
  const axisStart = $derived(range[0]);
  let restored = false;
  /** Where an earlier timeline was (read now, before this one's first scroll overwrites it). */
  const startAt = remembered;
  $effect(() => {
    void axisStart;
    untrack(() => {
      const r = startAt;
      if (!restored && r) {
        restored = true;
        void tick().then(() => scroller?.scrollTo({ left: Math.max(0, x(r.leftDate)) }));
      } else scrollToToday();
    });
  });

  /** Zooms to `next` pixels per day, keeping the date under `at` (px from the scroller's left) in place. */
  async function zoomTo(next: number, at?: number) {
    if (!scroller) return;
    const clamped = Math.min(MAX_PPD, Math.max(MIN_PPD, next));
    if (clamped === ppd) return;
    const ax = at ?? scroller.clientWidth / 2;
    const day = (scroller.scrollLeft + ax) / ppd;
    ppd = clamped;
    await tick();
    scroller.scrollLeft = day * ppd - ax;
    readView();
  }
  // Wheel and pinch: collect the gesture and apply it once per frame.
  let zoomFactor = 1;
  let zoomAt = 0;
  let zoomFrame = 0;
  function queueZoom(factor: number, at: number) {
    zoomFactor *= factor;
    zoomAt = at;
    zoomFrame ||= requestAnimationFrame(() => {
      zoomFrame = 0;
      const f = zoomFactor;
      zoomFactor = 1;
      void zoomTo(ppd * f, zoomAt);
    });
  }
  $effect(() => {
    const el = scroller;
    if (!el) return;
    const left = (clientX: number) => clientX - el.getBoundingClientRect().left;
    // The mouse wheel (and a trackpad pinch, reported as Ctrl + wheel) zooms around the pointer. Sideways
    // scrolling (trackpad swipe, Shift + wheel) still moves along the timeline.
    const onWheel = (ev: WheelEvent) => {
      if (ev.shiftKey || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;
      ev.preventDefault();
      const dy = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY;
      queueZoom(Math.exp(-dy * 0.004), left(ev.clientX));
    };
    // Two-finger pinch on touch screens.
    let pinch: { dist: number; ppd: number } | undefined;
    const spread = (ev: TouchEvent) =>
      Math.hypot(
        ev.touches[0]!.clientX - ev.touches[1]!.clientX,
        ev.touches[0]!.clientY - ev.touches[1]!.clientY,
      );
    const onTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length === 2) pinch = { dist: spread(ev), ppd };
    };
    const onTouchMove = (ev: TouchEvent) => {
      if (!pinch || ev.touches.length !== 2) return;
      ev.preventDefault();
      const mid = (ev.touches[0]!.clientX + ev.touches[1]!.clientX) / 2;
      const target = (pinch.ppd * spread(ev)) / pinch.dist;
      queueZoom(target / (ppd * zoomFactor), left(mid));
    };
    const onTouchEnd = (ev: TouchEvent) => {
      if (ev.touches.length < 2) pinch = undefined;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  });

  // An event selected (clicked) anywhere: bring it into sight. Hovering never scrolls.
  function reveal(id: string) {
    if (!scroller) return;
    const p = placed.items.find((i) => i.e.id === id);
    if (!p) return;
    const top = rowTop(p.row);
    const { scrollLeft, clientWidth, scrollTop, clientHeight } = scroller;
    const left =
      p.left < scrollLeft + 20 || p.left > scrollLeft + clientWidth - 80
        ? p.left - clientWidth / 3
        : scrollLeft;
    const vTop =
      top < scrollTop + HEAD || top > scrollTop + clientHeight - rowH
        ? top - clientHeight / 2
        : scrollTop;
    if (left !== scrollLeft || vTop !== scrollTop)
      scroller.scrollTo({ left, top: vTop, behavior: 'smooth' });
  }
  $effect(() => {
    void app.focusTick;
    const id = app.eventId;
    // After the layout settles (row heights depend on the box size).
    if (id) setTimeout(() => untrack(() => reveal(id)), 80);
  });
</script>

<section class="timeline" class:compact aria-label="Timeline">
  <!-- Controls float over the timeline: expand in the top-right corner (as on every panel), zoom bottom-left. -->
  <div class="corner"><ExpandButton panel="timeline" label="timeline" /></div>
  <div class="stage">
    <div class="zoom" role="group" aria-label="Zoom">
      <button
        type="button"
        class="btn"
        aria-label="Zoom out"
        title="Zoom out (or mouse wheel, pinch)"
        disabled={ppd <= MIN_PPD}
        onclick={() => zoomTo(ppd / 1.5)}>−</button
      >
      <button
        type="button"
        class="btn"
        aria-label="Zoom in"
        title="Zoom in (or mouse wheel, pinch)"
        disabled={ppd >= MAX_PPD}
        onclick={() => zoomTo(ppd * 1.5)}>+</button
      >
      {#if sel.length}
        <button class="btn clear" type="button" onclick={() => setRanges([])}>Clear dates ×</button>
      {/if}
    </div>
    <div class="scroller" bind:this={scroller} onscroll={onScroll}>
      <div
        class="canvas"
        class:dragging={!!drag}
        bind:this={canvas}
        style:width="{width}px"
        style:height="{canvasH}px"
        style:--item-h="{itemH}px"
        style:--bar-h="{barH}px"
        style:--in-font="{fontPx}px"
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
        {#each placed.bands as b, i (b.type)}
          {#if i > 0}<div
              class="band-line"
              style:top="{rowTop(b.firstRow) - LANE_GAP / 2 - 3}px"
            ></div>{/if}
        {/each}
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
          <!-- The selection shows as one continuous band in the lower header row too, so a selected month is lit
             to its exact first and last day, even where a week runs across two months. -->
          {#each selBands as b, i (i)}<div
              class="head-band"
              style:left="{b.left}px"
              style:width="{b.w}px"
            ></div>{/each}
          {#each sub as s (s.key)}
            {#if s.day}
              <button
                type="button"
                class="cell sub"
                style:left="{s.x}px"
                style:width="{s.w}px"
                onclick={(ev) => !suppressClick && pickCell(s, ev)}
                aria-label="Select {s.aria}"
                aria-pressed={covers(sel, s.iv)}
                title={s.aria}>{s.label}</button
              >
            {:else}
              <!-- Weeks are a reference only: select months, days, or drag. -->
              <span class="cell sub ref" style:left="{s.x}px" style:width="{s.w}px" title={s.aria}
                >{s.label}</span
              >
            {/if}
          {/each}
        </div>
        <!-- The type of each band, pinned to the left edge while scrolling sideways. -->
        <div class="band-icons" aria-hidden="true">
          {#each placed.bands as b (b.type)}
            <span
              class="band-icon t-{b.type}"
              style:top="{rowTop(b.firstRow) - HEAD}px"
              title={b.name}><TypeIcon type={b.type} size={13} /></span
            >
          {/each}
        </div>
        <div class="today" style:left="{x(today)}px"><span>Today</span></div>
        {#if !events.length}
          <p class="empty">No events match these filters.</p>
        {/if}
        {#each placed.items as p (p.e.id)}
          {@const top = rowTop(p.row)}
          {@const hot = app.hoverId === p.e.id}
          {@const picked = app.eventId === p.e.id}
          {@const faded = !hot && !picked && (outside(p.e) || dimmed.has(p.e.id))}
          <div class="t-{p.e.type}" class:faded class:past={p.e.isPast}>
            {#each p.deadlines as d (d.x)}
              <span
                class="link"
                style:left="{d.x}px"
                style:width="{p.left - d.x}px"
                style:top="{top + itemH / 2}px"
                aria-hidden="true"
              ></span>
              <span
                class="diamond"
                style:left="{d.x - 5}px"
                style:top="{top + itemH / 2 - 4.5}px"
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
              style:width="{p.barW}px"
              title={p.e.name}
              onclick={() => !suppressClick && openEvent(p.e.id)}
              onpointerenter={(ev) => {
                if (ev.pointerType !== 'mouse') return;
                hover(p.e.id);
                point(p.e.id);
              }}
              onpointerleave={() => {
                hover(undefined);
                point(undefined);
              }}
              onfocus={(ev) => ev.currentTarget.matches(':focus-visible') && hover(p.e.id)}
              onblur={() => hover(undefined)}
              aria-label="{p.e.name}, {formatRange(p.e.dates.start, p.e.dates.end)}, {statusLabel(
                p.e,
              )}"
            >
              <span class="bar"
                >{#if roomy && (p.textW * fontPx) / (0.72 * remPx()) + 14 <= p.barW}<span class="in"
                    >{p.e.name}</span
                  >{/if}</span
              >
            </button>
            {#if opened === p.e.id}
              {@const where = whereText(p.e)}
              <div
                class="name-line"
                class:hot={hot || picked}
                style:left="{Math.max(0, p.left)}px"
                style:top="{top + itemH + 1}px"
                aria-hidden="true"
              >
                <b>{p.e.name}</b>{#if where !== NOT_FOUND}<span>{where}</span>{/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
  {#if !compact}
    <p class="hint muted">
      One band of rows per event type. Faint = expected, not announced yet. Fading bar = only the
      month or year is known. Diamonds = deadlines. Names appear where they fit: zoom in, or point
      at a bar.
    </p>
  {/if}
</section>

<style>
  /* Named for the expand/shrink animation (view transitions). */
  .timeline {
    view-transition-name: qo-timeline;
  }
  .timeline {
    display: grid;
    gap: 8px;
    padding-bottom: 20px;
    position: relative;
    grid-template-rows: minmax(0, 1fr) auto;
    height: calc(100dvh - var(--header-h) - 70px);
    min-height: 360px;
  }
  .corner {
    position: absolute;
    top: 4px;
    right: 6px;
    z-index: 12;
  }
  .zoom {
    position: absolute;
    left: 8px;
    bottom: 10px;
    z-index: 12;
    display: flex;
    gap: 6px;
  }
  .stage {
    position: relative;
    display: grid;
    min-height: 0;
  }
  .zoom .btn {
    min-width: 36px;
    min-height: 36px;
    padding: 0 10px;
    box-shadow: var(--shadow);
  }
  .zoom .btn:disabled {
    opacity: 0.45;
  }
  .timeline.compact {
    height: 100%;
    min-height: 0;
    padding: 0;
  }
  .hint {
    font-size: 0.8rem;
    margin: 0;
  }
  .clear {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  /* No frame. (No fade at the edges either: gradients mean "uncertain" on this site.) */
  .scroller {
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    min-height: 0;
    /* Pinch zooms the timeline, not the page. */
    touch-action: pan-x pan-y;
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
  .cell.sub.ref {
    pointer-events: none;
    background: transparent;
    font-weight: 400;
  }
  .head-band {
    position: absolute;
    top: 22px;
    height: 19px;
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    pointer-events: none;
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
    height: var(--item-h, 26px);
    padding: 0;
    border: 0;
    background: transparent;
    white-space: nowrap;
    z-index: 3;
    border-radius: 3px;
    transition:
      opacity 0.15s,
      top 0.18s ease-out;
  }
  .bar {
    display: flex;
    align-items: center;
    width: 100%;
    height: var(--bar-h, 14px);
    overflow: hidden;
    border-radius: 3px;
    background: var(--tc);
    box-shadow: inset 0 0 0 1px var(--tc-edge);
    flex: none;
  }
  /* A name inside its bar (only when it fits). */
  .in {
    padding: 0 7px;
    font-size: var(--in-font, 0.72rem);
    font-weight: 600;
    color: var(--tc-on);
    overflow: hidden;
  }
  .item.expected .in,
  .item.approx .in {
    color: var(--ink);
  }
  /* The type of each band, pinned to the left edge. */
  .band-icons {
    position: sticky;
    left: 0;
    width: 0;
    height: 0;
    z-index: 6;
  }
  .band-icon {
    position: absolute;
    left: 3px;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    box-shadow: 0 0 0 1px var(--line);
    transition: top 0.18s ease-out;
  }
  .band-line {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px dashed color-mix(in srgb, var(--line) 80%, transparent);
    transition: top 0.18s ease-out;
  }
  /* The opened line: name (and place) under the bar the mouse rests on, or the selected one. */
  .name-line {
    position: absolute;
    z-index: 6;
    display: flex;
    align-items: baseline;
    gap: 8px;
    max-width: 520px;
    padding: 1px 6px;
    font-size: 0.78rem;
    white-space: nowrap;
    color: var(--ink);
    pointer-events: none;
    animation: line-in 0.16s ease-out;
  }
  .name-line span {
    color: var(--muted);
    font-size: 0.72rem;
  }
  .name-line.hot b {
    color: var(--hot);
  }
  @keyframes line-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .item,
    .band-icon,
    .band-line,
    .name-line {
      transition: none;
      animation: none;
    }
  }
  .item.expected .bar,
  .item.approx .bar {
    box-shadow: none;
  }
  .item.expected .bar {
    /* Uncertain = soft gradient: solid in the middle, fading towards both ends. */
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--tc) 25%, transparent),
      color-mix(in srgb, var(--tc) 90%, transparent) 35%,
      color-mix(in srgb, var(--tc) 90%, transparent) 65%,
      color-mix(in srgb, var(--tc) 25%, transparent)
    );
  }
  .item.approx .bar {
    background: linear-gradient(
      90deg,
      transparent,
      color-mix(in srgb, var(--tc) 45%, transparent) 50%,
      transparent
    );
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
  .item.expected .in {
    font-style: italic;
  }
  /* Dimmed = uncertain: expected editions are drawn faint until you point at them. */
  .item.expected:not(.hot):not(.picked) {
    opacity: 0.82;
  }
  .faded {
    opacity: 0.25;
  }
  /* One highlight for "this event": pointed at anywhere, or selected. */
  .item.picked,
  .item.hot {
    z-index: 6;
  }
  .item.picked .bar,
  .item.hot .bar {
    box-shadow:
      0 0 0 2px var(--surface),
      0 0 0 4px var(--hot);
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
