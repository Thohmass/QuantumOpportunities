<script lang="ts">
  // Our own minimal map: land, sea and country borders only (no tiles, labels, roads or rivers).
  // Lazy-loaded with its geometry. Panning and zooming move one transformed layer; event dots are drawn on top
  // at constant size, so it stays smooth on phones.
  import { onMount, untrack } from 'svelte';
  import { geoMercator, geoPath, type GeoProjection } from 'd3-geo';
  import { select } from 'd3-selection';
  import 'd3-transition';
  import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
  import { formatRange } from '../lib/dates';
  import type { Ev } from '../lib/model';
  import { app, hover, openEvent } from '../lib/state.svelte';
  import type { Meta } from '../lib/types';
  import { loadWorld } from '../lib/world';

  let { events, meta, compact = false }: { events: Ev[]; meta: Meta; compact?: boolean } = $props();

  const world = loadWorld();
  let box: HTMLDivElement;
  let svg: SVGSVGElement;
  let w = $state(0);
  let h = $state(0);
  let t: ZoomTransform = $state(zoomIdentity);
  let moving = $state(false);
  let zoomer: ZoomBehavior<SVGSVGElement, unknown> | undefined;
  let fitted = false;

  // ---- projection, fitted to the box --------------------------------------
  const projection = $derived.by((): GeoProjection | undefined => {
    if (!w || !h) return undefined;
    return geoMercator().fitSize([w, h], world.land);
  });
  const path = $derived(projection ? geoPath(projection) : undefined);
  const landD = $derived(path?.(world.land) ?? '');
  const bordersD = $derived(path?.(world.borders) ?? '');
  const countryD = $derived(
    path ? world.countries.map((c) => ({ name: c.properties.name, d: path(c) ?? '' })) : [],
  );

  // ---- events: projected once per layout, offset when several share a place ----
  interface Dot {
    e: Ev;
    x: number;
    y: number;
    dx: number;
    dy: number;
  }
  const dots = $derived.by((): Dot[] => {
    if (!projection) return [];
    const located = events.filter((e) => e.lat !== undefined && e.lon !== undefined);
    const groups = new Map<string, Ev[]>();
    for (const e of located) {
      const k = `${e.lat!.toFixed(2)},${e.lon!.toFixed(2)}`;
      groups.set(k, [...(groups.get(k) ?? []), e]);
    }
    const out: Dot[] = [];
    for (const list of groups.values()) {
      list.forEach((e, i) => {
        const [x, y] = projection([e.lon!, e.lat!]) ?? [0, 0];
        // Same place: spread around a small circle (constant screen size) so each dot is reachable.
        const r = list.length > 1 ? 7 + list.length : 0;
        const a = (2 * Math.PI * i) / list.length - Math.PI / 2;
        out.push({ e, x, y, dx: r * Math.cos(a), dy: r * Math.sin(a) });
      });
    }
    return out;
  });
  const online = $derived(events.filter((e) => e.format === 'online').length);
  const sx = (d: Dot) => t.applyX(d.x) + d.dx;
  const sy = (d: Dot) => t.applyY(d.y) + d.dy;

  // ---- zoom & pan -------------------------------------------------------------
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
      .on('zoom', (ev) => (t = ev.transform))
      .on('end', () => {
        moving = false;
        publishBounds();
      });
    select(svg).call(zoomer).on('dblclick.zoom', null);
  }

  function publishBounds() {
    if (!projection) return;
    // Clamp to the drawn world first: beyond the date line, inverting would wrap around to the other side.
    const [wx0] = projection([-180, 0])!;
    const [wx1] = projection([180, 0])!;
    const clampX = (v: number) => Math.min(wx1, Math.max(wx0, v));
    const [x0, y0] = t.invert([0, 0]);
    const [x1, y1] = t.invert([w, h]);
    const nw = projection.invert?.([clampX(x0), y0]);
    const se = projection.invert?.([clampX(x1), y1]);
    if (nw && se) app.mapBounds = [se[1], nw[0], nw[1], se[0]];
  }

  onMount(() => {
    const ro = new ResizeObserver(([entry]) => {
      w = Math.round(entry!.contentRect.width);
      h = Math.round(entry!.contentRect.height);
    });
    ro.observe(box);
    return () => {
      ro.disconnect();
      app.mapBounds = undefined;
    };
  });

  // Re-create the zoom behaviour for the box size; keep the view's centre and zoom.
  $effect(() => {
    if (!w || !h || !svg) return;
    untrack(() => {
      setupZoom();
      select(svg).call(zoomer!.transform, t);
      publishBounds();
    });
  });
  // First time there are events: frame them.
  $effect(() => {
    if (fitted || !zoomer || !dots.length) return;
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

  // An event selected in the list or timeline: fly there.
  $effect(() => {
    void app.focusTick;
    const id = app.eventId;
    if (!id || !zoomer) return;
    const d = untrack(() => dots.find((x) => x.e.id === id));
    if (d) untrack(() => zoomTo(Math.max(t.k, 5), d.x, d.y));
  });

  // ---- country hover (desktop) / tap (touch) -------------------------------------
  let country: { name: string; x: number; y: number } | undefined = $state();
  let countryTimer: ReturnType<typeof setTimeout> | undefined;
  function onCountry(ev: PointerEvent, name: string) {
    if (moving) return;
    const r = box.getBoundingClientRect();
    country = { name, x: ev.clientX - r.left, y: ev.clientY - r.top };
    clearTimeout(countryTimer);
    if (ev.pointerType !== 'mouse') countryTimer = setTimeout(() => (country = undefined), 1800);
  }

  // ---- event tooltip ------------------------------------------------------------------
  const hot = $derived(app.hoverId ? dots.find((d) => d.e.id === app.hoverId) : undefined);
</script>

<section class="mapview" class:compact aria-label="Map">
  <div class="box" bind:this={box} class:moving>
    <svg
      bind:this={svg}
      width={w}
      height={h}
      role="img"
      aria-label="World map with {dots.length} events"
    >
      <defs>
        <radialGradient id="qo-sea" cx="50%" cy="45%" r="75%">
          <stop offset="0%" stop-color="var(--map-sea-1)" />
          <stop offset="100%" stop-color="var(--map-sea-2)" />
        </radialGradient>
      </defs>
      <rect class="sea" width={w} height={h} fill="url(#qo-sea)" />
      <g transform={t.toString()}>
        <path class="land" d={landD} />
        {#each countryD as c (c.name)}
          <path
            class="country"
            class:on={country?.name === c.name}
            d={c.d}
            role="presentation"
            onpointermove={(ev) => onCountry(ev, c.name)}
            onpointerleave={(ev) => ev.pointerType === 'mouse' && (country = undefined)}
          />
        {/each}
        <path class="borders" d={bordersD} />
        <path class="coast" d={landD} />
      </g>
      <g class="dots">
        {#each dots as d (d.e.id)}
          {@const x = sx(d)}
          {@const y = sy(d)}
          {#if x > -20 && x < w + 20 && y > -20 && y < h + 20}
            <g
              class="dot t-{d.e.type} {d.e.status}"
              class:past={d.e.isPast}
              class:picked={app.eventId === d.e.id}
              class:hot={app.hoverId === d.e.id}
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
              <circle class="hit" r="13" />
              {#if d.dx || d.dy}<line class="tether" x1="0" y1="0" x2={-d.dx} y2={-d.dy} />{/if}
              <circle class="ring" r="9" />
              <circle class="pin" r="5.5" />
            </g>
          {/if}
        {/each}
      </g>
    </svg>

    {#if country && !hot}
      <div class="label country-label" style:left="{country.x}px" style:top="{country.y}px">
        {country.name}
      </div>
    {/if}
    {#if hot}
      <div class="label event-label" style:left="{sx(hot)}px" style:top="{sy(hot)}px">
        <b>{hot.e.name}</b>
        <span
          >{formatRange(hot.e.dates.start, hot.e.dates.end)}{hot.e.city
            ? ' · ' + hot.e.city
            : ''}</span
        >
      </div>
    {/if}

    <div class="overlay">
      <button class="btn" type="button" onclick={() => fitToResults()}>Fit to results</button>
      <label class="btn toggle" title="Hide events outside the visible map area in the other views">
        <input type="checkbox" bind:checked={app.mapOnly} /> Only map area
      </label>
      {#if online}
        <button
          class="btn"
          type="button"
          onclick={() => {
            app.filters.continents = ['online'];
            if (!compact) app.view = 'list';
          }}>🌐 {online} online</button
        >
      {/if}
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
    <span class="credit">Borders: Natural Earth</span>
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
  svg {
    display: block;
    cursor: grab;
  }
  .moving svg {
    cursor: grabbing;
  }
  .land {
    fill: var(--map-land);
  }
  .country {
    fill: transparent;
    transition: fill 0.15s;
  }
  .country.on {
    fill: var(--map-land-hover);
  }
  .moving .country {
    pointer-events: none;
  }
  .borders {
    fill: none;
    stroke: var(--map-border);
    stroke-width: 0.8;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .coast {
    fill: none;
    stroke: var(--map-coast);
    stroke-width: 1.2;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .dot {
    cursor: pointer;
    outline: none;
  }
  .hit {
    fill: transparent;
  }
  .pin {
    fill: var(--tc);
    stroke: var(--map-land);
    stroke-width: 1.5;
  }
  .tether {
    stroke: var(--map-coast);
    stroke-width: 1;
    opacity: 0.6;
  }
  .ring {
    fill: none;
    stroke: transparent;
    stroke-width: 2;
  }
  .dot.expected .pin {
    fill: color-mix(in srgb, var(--tc) 40%, transparent);
    stroke: var(--tc);
    stroke-width: 1.5;
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
    stroke: var(--warn);
  }
  .dot.hot .pin {
    r: 6.5;
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
  .country-label {
    font-weight: 600;
    color: var(--muted);
    transform: translate(-50%, calc(-100% - 8px));
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
