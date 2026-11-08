<script lang="ts">
  // Our own minimal map: land and sea only (no tiles, borders, labels, roads or rivers). Lazy-loaded with its
  // geometry. The land is painted on a canvas, redrawn sharply at most once per frame while panning and zooming;
  // event dots are drawn on top at a constant size. Dots that would overlap snap onto a small hexagonal pattern.
  import { onMount, untrack } from 'svelte';
  import { geoMercator, geoPath, type GeoProjection } from 'd3-geo';
  import { select } from 'd3-selection';
  import 'd3-transition';
  import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
  import { formatRange } from '../lib/dates';
  import { whereText } from '../lib/format';
  import type { Ev } from '../lib/model';
  import ExpandButton from './ExpandButton.svelte';
  import { typeIcon } from '../lib/icons';
  import { hexPack } from '../lib/pack';
  import { app, hover, openEvent, prefs } from '../lib/state.svelte';
  import type { Meta } from '../lib/types';
  import { loadLand } from '../lib/world';

  let { events, meta, compact = false }: { events: Ev[]; meta: Meta; compact?: boolean } = $props();

  /** Closest two dots may come, centre to centre (px): small dots, and the large bubbles shown from BIG_AT. */
  const SPACING = 15;
  const SPACING_BIG = 27;
  /** Zoom level (about country scale) from which every dot grows into a bubble with its type icon. */
  const BIG_AT = 3.5;
  const land = loadLand();
  let box: HTMLDivElement;
  let svg: SVGSVGElement;
  let canvas: HTMLCanvasElement;
  let w = $state(0);
  let h = $state(0);
  let dpr = $state(1);
  let t: ZoomTransform = $state.raw(zoomIdentity);
  let moving = $state(false);
  let zoomer: ZoomBehavior<SVGSVGElement, unknown> | undefined;
  /** Becomes true once the zoom behaviour exists, so the first framing and deep-linked events can run. */
  let ready = $state(false);
  let fitted = false;

  // ---- projection and land, fitted to the box -------------------------------
  const projection = $derived.by((): GeoProjection | undefined => {
    if (!w || !h) return undefined;
    return geoMercator().fitSize([w, h], land);
  });
  const landPath = $derived.by(() => {
    if (!projection) return undefined;
    return new Path2D(geoPath(projection)(land) ?? '');
  });

  let colors = { land: '#fff', coast: '#888' };
  function readColors() {
    if (!box) return;
    const cs = getComputedStyle(box);
    colors = {
      land: cs.getPropertyValue('--map-land').trim() || colors.land,
      coast: cs.getPropertyValue('--map-coast').trim() || colors.coast,
    };
  }
  function draw() {
    const ctx = canvas?.getContext('2d');
    if (!ctx || !landPath) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);
    ctx.fillStyle = colors.land;
    ctx.fill(landPath);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.1 / t.k;
    ctx.strokeStyle = colors.coast;
    ctx.stroke(landPath);
  }
  // Redraw when the view, the size or the shape changes (the canvas is cleared when it is resized).
  $effect(() => {
    void w;
    void h;
    void dpr;
    void landPath;
    void t;
    draw();
  });
  // Theme switches change the colours.
  $effect(() => {
    void prefs.theme;
    requestAnimationFrame(() => (readColors(), draw()));
  });

  // ---- events: projected once per layout; packed so they never overlap -------------
  interface Dot {
    e: Ev;
    x: number;
    y: number;
  }
  const dots = $derived.by((): Dot[] => {
    if (!projection) return [];
    const out: Dot[] = [];
    for (const e of events) {
      if (e.lat === undefined || e.lon === undefined) continue;
      const [x, y] = projection([e.lon, e.lat]) ?? [0, 0];
      out.push({ e, x, y });
    }
    return out;
  });
  // Overlaps depend only on the zoom level (not on panning). The level is rounded to small steps and each step's
  // layout is kept, so zooming doesn't recompute it every frame; dots glide to their new spots.
  const kStep = $derived(2 ** (Math.round(Math.log2(t.k) * 8) / 8));
  const big = $derived(kStep >= BIG_AT);
  const spacing = $derived(big ? SPACING_BIG : SPACING);
  let packCache = new Map<number, [number, number][]>();
  let packFor: Dot[] | undefined;
  const offsets = $derived.by(() => {
    if (packFor !== dots) {
      packCache = new Map();
      packFor = dots;
    }
    let o = packCache.get(kStep);
    if (!o) {
      o = hexPack(
        dots.map((d) => ({ x: d.x * kStep, y: d.y * kStep })),
        spacing,
      );
      packCache.set(kStep, o);
    }
    return o;
  });
  const online = $derived(events.filter((e) => e.format === 'online').length);
  // The online button is an on/off switch for the "online only" filter.
  const onlineOnly = $derived(
    app.filters.continents.length === 1 && app.filters.continents[0] === 'online',
  );

  // ---- zoom & pan: at most one update per frame ----------------------------------
  let next: ZoomTransform | undefined;
  let frame = 0;
  function setupZoom() {
    zoomer = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 60])
      .translateExtent([
        [0, 0],
        [w, h],
      ])
      .extent([
        [0, 0],
        [w, h],
      ])
      .on('start', () => (moving = true))
      .on('zoom', (ev) => {
        next = ev.transform;
        frame ||= requestAnimationFrame(() => {
          frame = 0;
          if (next) t = next;
        });
      })
      .on('end', (ev) => {
        cancelAnimationFrame(frame);
        frame = 0;
        t = ev.transform;
        moving = false;
        publishBounds();
      });
    select(svg).call(zoomer).on('dblclick.zoom', null);
    ready = true;
  }

  function publishBounds() {
    if (!projection) return;
    // Clamp to just inside the drawn world first: at or beyond the date line, inverting wraps around to the other
    // side (180° comes back as −180°).
    const [wx0] = projection([-179.999, 0])!;
    const [wx1] = projection([179.999, 0])!;
    const clampX = (v: number) => Math.min(wx1, Math.max(wx0, v));
    const [x0, y0] = t.invert([0, 0]);
    const [x1, y1] = t.invert([w, h]);
    const nw = projection.invert?.([clampX(x0), y0]);
    const se = projection.invert?.([clampX(x1), y1]);
    if (nw && se) app.mapBounds = [se[1], nw[0], nw[1], se[0]];
  }

  onMount(() => {
    readColors();
    const ro = new ResizeObserver(([entry]) => {
      w = Math.round(entry!.contentRect.width);
      h = Math.round(entry!.contentRect.height);
      dpr = Math.min(3, window.devicePixelRatio || 1);
    });
    ro.observe(box);
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => requestAnimationFrame(() => (readColors(), draw()));
    mq.addEventListener('change', onScheme);
    return () => {
      ro.disconnect();
      mq.removeEventListener('change', onScheme);
      cancelAnimationFrame(frame);
      app.mapBounds = undefined;
    };
  });

  // Re-create the zoom behaviour for the box size. The land is re-fitted to the new size, so keep the same
  // place in the middle at the same geographic scale (panels being resized or hidden don't move the view).
  let last: { projection: GeoProjection; w: number; h: number } | undefined;
  $effect(() => {
    if (!w || !h || !svg || !projection) return;
    const p = projection;
    untrack(() => {
      let next = t;
      if (last && (last.w !== w || last.h !== h)) {
        const centre = last.projection.invert?.(t.invert([last.w / 2, last.h / 2]));
        const at = centre && p(centre);
        if (at) {
          const k = Math.max(1, (t.k * last.projection.scale()) / p.scale());
          next = zoomIdentity
            .translate(w / 2, h / 2)
            .scale(k)
            .translate(-at[0], -at[1]);
        }
      }
      last = { projection: p, w, h };
      setupZoom();
      select(svg).call(zoomer!.transform, next);
      publishBounds();
    });
  });
  // First time there are events: frame them.
  $effect(() => {
    if (fitted || !ready || !dots.length) return;
    fitted = true;
    untrack(() => fitToResults(false));
  });

  function zoomTo(k: number, cx: number, cy: number, animate = true) {
    if (!zoomer) return;
    const target = zoomIdentity
      .translate(w / 2, h / 2)
      .scale(k)
      .translate(-cx, -cy);
    const sel = select(svg);
    if (animate) sel.transition().duration(650).call(zoomer.transform, target);
    else sel.call(zoomer.transform, target);
  }

  function fitToResults(animate = true) {
    if (!dots.length) return zoomTo(1, w / 2, h / 2, animate);
    const xs = dots.map((d) => d.x);
    const ys = dots.map((d) => d.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min(8, 0.8 / Math.max((x1 - x0) / w, (y1 - y0) / h, 1 / 8));
    zoomTo(Math.max(1, k), (x0 + x1) / 2, (y0 + y1) / 2, animate);
  }

  // An event selected (clicked) in the list or timeline: fly there.
  $effect(() => {
    void app.focusTick;
    const id = app.eventId;
    if (!id || !ready) return;
    const d = untrack(() => dots.find((x) => x.e.id === id));
    if (d) untrack(() => zoomTo(Math.max(t.k, 5), d.x, d.y));
  });

  // ---- event tooltip ------------------------------------------------------------------
  const hotIndex = $derived(app.hoverId ? dots.findIndex((d) => d.e.id === app.hoverId) : -1);
  const hot = $derived(hotIndex >= 0 ? dots[hotIndex] : undefined);
  const hotOff = $derived<[number, number]>(offsets[hotIndex] ?? [0, 0]);
</script>

<section class="mapview" class:compact aria-label="Map">
  <div class="box" bind:this={box} class:moving>
    <canvas
      bind:this={canvas}
      width={Math.round(w * dpr)}
      height={Math.round(h * dpr)}
      style:width="{w}px"
      style:height="{h}px"
      aria-hidden="true"
    ></canvas>
    <svg
      bind:this={svg}
      width={w}
      height={h}
      role="img"
      aria-label="World map with {dots.length} events"
    >
      <g class="dots">
        {#each dots as d, i (d.e.id)}
          {@const x = t.applyX(d.x)}
          {@const y = t.applyY(d.y)}
          {@const o = offsets[i] ?? [0, 0]}
          {#if x > -30 && x < w + 30 && y > -30 && y < h + 30}
            {@const isHot = app.hoverId === d.e.id}
            <g
              class="dot t-{d.e.type} {d.e.status}"
              class:past={d.e.isPast}
              class:picked={app.eventId === d.e.id}
              class:hot={isHot}
              transform="translate({x} {y})"
              role="button"
              tabindex="0"
              aria-label="{d.e.name}, {formatRange(d.e.dates.start, d.e.dates.end)}"
              onclick={() => openEvent(d.e.id, true)}
              onkeydown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && openEvent(d.e.id, true)}
              onpointerenter={(ev) => ev.pointerType === 'mouse' && hover(d.e.id)}
              onpointerleave={() => hover(undefined)}
              onfocus={() => hover(d.e.id)}
              onblur={() => hover(undefined)}
            >
              <g class="shift" style:transform="translate({o[0]}px, {o[1]}px)">
                {#if isHot && (o[0] || o[1])}
                  <!-- Moved to avoid an overlap: show where it really is. -->
                  <line class="tether" x1="0" y1="0" x2={-o[0]} y2={-o[1]} />
                  <circle class="origin" cx={-o[0]} cy={-o[1]} r="2.2" />
                {/if}
                <circle class="hit" r={spacing / 2 + 1} />
                <circle class="ring" r={big ? 14.5 : 8.5} />
                <!-- One bubble, drawn at full size and scaled down to a dot below BIG_AT. -->
                <g class="bubble" class:big>
                  <circle class="pin" r="11" />
                  <path
                    class="icon"
                    d={typeIcon(d.e.type)}
                    transform="translate(-6.6 -6.6) scale(0.55)"
                  />
                </g>
              </g>
            </g>
          {/if}
        {/each}
      </g>
    </svg>

    {#if hot}
      <div
        class="label event-label"
        style:left="{t.applyX(hot.x) + hotOff[0]}px"
        style:top="{t.applyY(hot.y) + hotOff[1]}px"
      >
        <b>{hot.e.name}</b>
        <span>{formatRange(hot.e.dates.start, hot.e.dates.end)} · {whereText(hot.e)}</span>
      </div>
    {/if}

    <div class="overlay">
      <button class="btn" type="button" onclick={() => fitToResults()}>Fit to results</button>
      <label class="btn toggle" title="Hide events outside the visible map area in the other views">
        <input type="checkbox" bind:checked={app.mapOnly} /> Only map area
      </label>
      {#if online || onlineOnly}
        <button
          class="btn"
          class:on={onlineOnly}
          type="button"
          aria-pressed={onlineOnly}
          title={onlineOnly ? 'Show all events again' : 'Show only online events'}
          onclick={() => {
            app.filters = { ...app.filters, continents: onlineOnly ? [] : ['online'] };
          }}>🌐 {online} online</button
        >
      {/if}
      <ExpandButton panel="map" label="map" />
    </div>
    <div class="zoom-btns">
      <button
        type="button"
        aria-label="Zoom in"
        onclick={() => zoomer && select(svg).transition().duration(250).call(zoomer.scaleBy, 1.8)}
        >+</button
      >
      <button
        type="button"
        aria-label="Zoom out"
        onclick={() =>
          zoomer &&
          select(svg)
            .transition()
            .duration(250)
            .call(zoomer.scaleBy, 1 / 1.8)}>−</button
      >
    </div>
    <span class="credit">Land: Natural Earth</span>
  </div>
  <span class="sr-only">{meta.types.length} event types.</span>
</section>

<style>
  .mapview {
    position: relative;
    height: calc(100dvh - var(--header-h) - 70px);
    min-height: 320px;
    margin: 8px 0 16px;
  }
  .mapview.compact {
    height: 100%;
    min-height: 0;
    margin: 0;
  }
  .box {
    position: absolute;
    inset: 0;
    overflow: hidden;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .box {
    background: var(--map-sea);
  }
  canvas {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  svg {
    position: absolute;
    inset: 0;
    display: block;
    cursor: grab;
  }
  .moving svg {
    cursor: grabbing;
  }
  .shift {
    transition: transform 0.22s ease-out;
  }
  @media (prefers-reduced-motion: reduce) {
    .shift {
      transition: none;
    }
  }
  .dot {
    cursor: pointer;
    outline: none;
  }
  .hit {
    fill: transparent;
  }
  .bubble {
    transform: scale(0.5);
    transition: transform 0.25s ease-out;
  }
  .bubble.big {
    transform: scale(1);
  }
  .pin {
    fill: var(--tc);
    stroke: var(--tc-edge);
    stroke-width: 1.3;
    vector-effect: non-scaling-stroke;
  }
  .icon {
    fill: none;
    stroke: var(--tc-on);
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .bubble.big .icon {
    opacity: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .bubble,
    .icon {
      transition: none;
    }
  }
  .tether {
    stroke: var(--hot);
    stroke-width: 1.2;
    stroke-dasharray: 2 2;
  }
  .origin {
    fill: var(--hot);
  }
  .ring {
    fill: none;
    stroke: transparent;
    stroke-width: 2;
  }
  /* Dimmed = uncertain: an expected edition is a plain, faint dot (no edge). */
  .dot.expected .pin {
    fill: var(--tc);
    stroke: none;
    opacity: 0.45;
  }
  .dot.postponed .pin,
  .dot.cancelled .pin {
    fill: transparent;
    stroke: var(--warn);
    stroke-dasharray: 2 2;
  }
  .dot.past {
    opacity: 0.45;
    filter: grayscale(0.9);
  }
  .dot.picked .ring {
    stroke: var(--tc);
  }
  .dot.hot .ring,
  .dot:focus-visible .ring {
    stroke: var(--hot);
  }
  .dot.hot .bubble {
    transform: scale(0.6);
  }
  .dot.hot .bubble.big {
    transform: scale(1.12);
  }
  .label {
    position: absolute;
    transform: translate(-50%, calc(-100% - 14px));
    pointer-events: none;
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 0.8rem;
    white-space: nowrap;
    box-shadow: var(--shadow);
    z-index: 3;
  }
  .event-label {
    display: grid;
  }
  .event-label span {
    color: var(--muted);
    font-size: 0.75rem;
  }
  .overlay {
    position: absolute;
    top: 10px;
    right: 10px;
    left: 56px;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
    z-index: 4;
  }
  .overlay .btn {
    min-height: 34px;
    padding: 5px 10px;
    font-size: 0.82rem;
    box-shadow: var(--shadow);
  }
  .toggle input {
    accent-color: var(--accent);
  }
  .overlay .btn.on {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }
  .zoom-btns {
    position: absolute;
    left: 10px;
    top: 10px;
    display: grid;
    border: 1px solid var(--line);
    border-radius: 6px;
    overflow: hidden;
    box-shadow: var(--shadow);
    z-index: 4;
  }
  .zoom-btns button {
    width: 34px;
    height: 34px;
    border: 0;
    background: var(--surface);
    font-size: 1.15rem;
    line-height: 1;
  }
  .zoom-btns button + button {
    border-top: 1px solid var(--line);
  }
  @media (max-width: 560px) {
    .overlay .btn {
      min-height: 30px;
      padding: 3px 8px;
      font-size: 0.75rem;
    }
  }
  .credit {
    position: absolute;
    right: 8px;
    bottom: 6px;
    font-size: 0.68rem;
    color: var(--muted);
    opacity: 0.8;
    pointer-events: none;
  }
</style>
