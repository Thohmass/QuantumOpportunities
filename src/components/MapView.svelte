<script lang="ts" module>
  // The view (centre and geographic scale) survives the map being re-created, e.g. when a panel is expanded.
  let remembered: { centre: [number, number]; scale: number } | undefined;
</script>

<script lang="ts">
  // Our own minimal map: land and sea only (no tiles, borders, labels, roads or rivers). Lazy-loaded with its
  // geometry. The land is painted on a canvas, redrawn sharply at most once per frame while panning and zooming;
  // event dots are drawn on top at a constant size. Dots that would overlap snap onto a small hexagonal pattern.
  import { onMount, untrack } from 'svelte';
  import { geoMercator, geoPath, type GeoProjection, type GeoStream } from 'd3-geo';
  import { select } from 'd3-selection';
  import 'd3-transition';
  import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
  import { formatRange } from '../lib/dates';
  import { whereText } from '../lib/format';
  import type { Ev } from '../lib/model';
  import ExpandButton from './ExpandButton.svelte';
  import PeekCard from './PeekCard.svelte';
  import LensPanel from './LensPanel.svelte';
  import { LAB } from '../lib/lab';
  import { LENS_DEFAULTS, lensPoint, lensScale, makeLens, type LensSettings } from '../lib/lens';
  import { typeIcon } from '../lib/icons';
  import { hexPack } from '../lib/pack';
  import { app, hover, openEvent, prefs } from '../lib/state.svelte';
  import type { Meta } from '../lib/types';
  import { loadLand, worldExtent } from '../lib/world';

  let {
    events,
    meta,
    compact = false,
    peek = false,
    today = 0,
    onmore,
  }: {
    events: Ev[];
    meta: Meta;
    compact?: boolean;
    /** Show a small card for the selected event, pinned to its dot (where the list isn't on screen). */
    peek?: boolean;
    today?: number;
    /** The card's "all details" button. */
    onmore?: () => void;
  } = $props();

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
  /** The view this map starts from, if an earlier map was showing (read now: the first resize overwrites it). */
  const startView = remembered;

  // ---- projection and land, fitted to the box -------------------------------
  const projection = $derived.by((): GeoProjection | undefined => {
    if (!w || !h) return undefined;
    return geoMercator().fitSize([w, h], land);
  });
  const landPath = $derived.by(() => {
    if (!projection) return undefined;
    return new Path2D(geoPath(projection)(land) ?? '');
  });

  let colors = { sea: '#ddd', land: '#fff', coast: '#888' };
  function readColors() {
    if (!box) return;
    const cs = getComputedStyle(box);
    colors = {
      sea: cs.getPropertyValue('--map-sea').trim() || colors.sea,
      land: cs.getPropertyValue('--map-land').trim() || colors.land,
      coast: cs.getPropertyValue('--map-coast').trim() || colors.coast,
    };
  }
  function draw() {
    const ctx = canvas?.getContext('2d');
    if (!ctx || !landPath) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The sea is painted here too, so land and sea always come from the same theme.
    ctx.fillStyle = colors.sea;
    ctx.fillRect(0, 0, w, h);
    const L = lens;
    if (L && L.c > 0.01 && lensSettings.land && projection) {
      // The land through the lens: every coastline point is projected, zoomed, then moved by the lens (slower
      // than the ready-made path below, so only while the lens is on).
      const p = projection;
      const tr = t;
      const lensed = {
        stream: (out: GeoStream) =>
          p.stream({
            point: (x: number, y: number) => {
              const [a, b] = lensPoint(L, tr.applyX(x), tr.applyY(y));
              out.point(a, b);
            },
            lineStart: () => out.lineStart(),
            lineEnd: () => out.lineEnd(),
            polygonStart: () => out.polygonStart(),
            polygonEnd: () => out.polygonEnd(),
            sphere: () => out.sphere?.(),
          }),
      };
      ctx.beginPath();
      geoPath(lensed, ctx)(land);
      ctx.fillStyle = colors.land;
      ctx.fill();
      ctx.lineJoin = 'round';
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = colors.coast;
      ctx.stroke();
      return;
    }
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
    if (lensSettings.land) void lens;
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
      .scaleExtent([K_MIN, K_MAX])
      .translateExtent(
        projection
          ? worldExtent(projection, land)
          : [
              [0, 0],
              [w, h],
            ],
      )
      .extent([
        [0, 0],
        [w, h],
      ])
      // The wheel is handled below (smoothed); everything else as d3 does by default.
      .filter(
        (ev: Event) =>
          ev.type !== 'wheel' && !(ev as MouseEvent).ctrlKey && !(ev as MouseEvent).button,
      )
      .on('start', (ev) => {
        moving = true;
        if (ev.sourceEvent) stopGlide();
      })
      .on('zoom', (ev) => {
        next = ev.transform;
        if (ev.sourceEvent) sample(ev.transform, ev.sourceEvent);
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
        if (ev.sourceEvent) startCoast();
        if (!gliding) publishBounds();
      });
    select(svg).call(zoomer).on('dblclick.zoom', null);
    ready = true;
  }

  // ---- smoothing: momentum after a drag or pinch, and an eased mouse wheel ------------------
  // While a gesture runs, the last ~120 ms of positions are kept. On release, the view keeps moving and zooming
  // at that speed, slowing down smoothly (like Google Maps). After a pinch, the finger lifted last no longer
  // pans the view, so the centre doesn't jump.
  const K_MIN = 1;
  const K_MAX = 60;
  /** Momentum fades with this time constant (ms). */
  const TAU = 325;
  let samples: { time: number; t: ZoomTransform }[] = [];
  let pinch: [number, number] | undefined;
  let wasPinch = false;
  let gliding = false;
  let glideFrame = 0;

  function local(x: number, y: number): [number, number] {
    const r = svg.getBoundingClientRect();
    return [x - r.left, y - r.top];
  }
  function sample(tr: ZoomTransform, src: Event) {
    const now = performance.now();
    const touches = (src as TouchEvent).touches;
    if (touches?.length >= 2) {
      wasPinch = true;
      pinch = local(
        (touches[0]!.clientX + touches[1]!.clientX) / 2,
        (touches[0]!.clientY + touches[1]!.clientY) / 2,
      );
    }
    samples.push({ time: now, t: tr });
    while (samples.length > 2 && now - samples[0]!.time > 120) samples.shift();
  }
  function stopGlide() {
    cancelAnimationFrame(glideFrame);
    glideFrame = 0;
    if (gliding) {
      gliding = false;
      publishBounds();
    }
  }
  /** The same transform, moved back inside the world if it shows beyond its edges. */
  function within(tr: ZoomTransform): ZoomTransform {
    if (!zoomer) return tr;
    return zoomer.constrain()(
      tr,
      [
        [0, 0],
        [w, h],
      ],
      zoomer.translateExtent(),
    );
  }
  /** Moves the view: scale by f around the screen point a, then shift by (dx, dy), kept within the world.
   * Returns which directions hit the edge of the world (so momentum stops there instead of piling up). */
  function nudge(f: number, a: [number, number], dx: number, dy: number): [boolean, boolean] {
    if (!zoomer) return [true, true];
    const k = Math.min(K_MAX, Math.max(K_MIN, t.k * f));
    const g = k / t.k;
    const want = zoomIdentity
      .translate(a[0] + dx + g * (t.x - a[0]), a[1] + dy + g * (t.y - a[1]))
      .scale(k);
    const next = within(want);
    select(svg).call(zoomer.transform, next);
    return [Math.abs(next.x - want.x) > 0.5, Math.abs(next.y - want.y) > 0.5];
  }
  function startCoast() {
    const s = samples;
    samples = [];
    const pinched = wasPinch;
    wasPinch = false;
    if (s.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const last = s[s.length - 1]!;
    const first = s[0]!;
    const dt = last.time - first.time;
    // Released while still moving? (A pinch may end with a short pause while the last finger lifts.)
    if (dt < 16 || performance.now() - last.time > (pinched ? 160 : 60)) return;
    const a: [number, number] = pinched && pinch ? pinch : [w / 2, h / 2];
    const [wx, wy] = first.t.invert(a);
    let vx = (last.t.applyX(wx) - a[0]) / dt;
    let vy = (last.t.applyY(wy) - a[1]) / dt;
    let vz = Math.log(last.t.k / first.t.k) / dt;
    if (Math.hypot(vx, vy) < 0.08 && Math.abs(vz) < 0.0004) return;
    gliding = true;
    let prev = performance.now();
    const step = (now: number) => {
      const d = now - prev;
      prev = now;
      const decay = Math.exp(-d / TAU);
      const travel = TAU * (1 - decay);
      const [edgeX, edgeY] = nudge(Math.exp(vz * travel), a, vx * travel, vy * travel);
      // At the edge of the world the glide stops in that direction (no drifting off into empty sea).
      vx = edgeX ? 0 : vx * decay;
      vy = edgeY ? 0 : vy * decay;
      vz *= decay;
      if (Math.hypot(vx, vy) < 0.01 && Math.abs(vz) < 0.00005) return stopGlide();
      glideFrame = requestAnimationFrame(step);
    };
    glideFrame = requestAnimationFrame(step);
  }

  // Mouse wheel and trackpad: each notch sets a target zoom; the view eases towards it around the pointer.
  let wheelTarget = 0;
  let wheelAt: [number, number] = [0, 0];
  let wheelFrame = 0;
  function onWheel(ev: WheelEvent) {
    ev.preventDefault();
    if (!zoomer) return;
    if (!wheelFrame) {
      stopGlide();
      wheelTarget = Math.log2(t.k);
    }
    const delta =
      -ev.deltaY * (ev.deltaMode === 1 ? 0.05 : ev.deltaMode ? 1 : 0.002) * (ev.ctrlKey ? 10 : 1);
    wheelTarget = Math.min(Math.log2(K_MAX), Math.max(Math.log2(K_MIN), wheelTarget + delta));
    wheelAt = local(ev.clientX, ev.clientY);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nudge(2 ** wheelTarget / t.k, wheelAt, 0, 0);
      publishBounds();
      return;
    }
    if (wheelFrame) return;
    gliding = true;
    let prev = performance.now();
    const step = (now: number) => {
      const d = now - prev;
      prev = now;
      const gap = wheelTarget - Math.log2(t.k);
      if (Math.abs(gap) < 0.002) {
        wheelFrame = 0;
        return stopGlide();
      }
      nudge(2 ** (gap * (1 - Math.exp(-d / 70))), wheelAt, 0, 0);
      wheelFrame = requestAnimationFrame(step);
    };
    wheelFrame = requestAnimationFrame(step);
  }

  // After a pinch, ignore the last finger's movement (it would drag the view off centre while lifting).
  function onTouchMove(ev: TouchEvent) {
    if (wasPinch && ev.touches.length === 1) ev.stopPropagation();
  }
  function onTouchStart(ev: TouchEvent) {
    if (ev.touches.length === 1) {
      wasPinch = false;
      samples = [];
    }
    stopGlide();
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
    const centre = projection.invert?.(t.invert([w / 2, h / 2]));
    if (centre) remembered = { centre: [centre[0], centre[1]], scale: t.k * projection.scale() };
  }

  onMount(() => {
    readColors();
    const ro = new ResizeObserver(([entry]) => {
      w = Math.round(entry!.contentRect.width);
      h = Math.round(entry!.contentRect.height);
      dpr = Math.min(3, window.devicePixelRatio || 1);
    });
    ro.observe(box);
    svg.addEventListener('wheel', onWheel, { passive: false });
    box.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    box.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => requestAnimationFrame(() => (readColors(), draw()));
    mq.addEventListener('change', onScheme);
    return () => {
      ro.disconnect();
      mq.removeEventListener('change', onScheme);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(glideFrame);
      cancelAnimationFrame(wheelFrame);
      svg.removeEventListener('wheel', onWheel);
      box.removeEventListener('touchstart', onTouchStart, { capture: true });
      box.removeEventListener('touchmove', onTouchMove, { capture: true });
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
      select(svg).call(zoomer!.transform, within(next));
      publishBounds();
    });
  });
  // First time there are events: frame them.
  $effect(() => {
    if (fitted || !ready || !dots.length) return;
    fitted = true;
    untrack(() => {
      const r = startView;
      const at = r && projection?.(r.centre);
      if (r && at && projection)
        zoomTo(Math.max(K_MIN, r.scale / projection.scale()), at[0], at[1], false);
      else fitToResults(false);
    });
  });

  function zoomTo(k: number, cx: number, cy: number, animate = true) {
    if (!zoomer) return;
    const target = within(
      zoomIdentity
        .translate(w / 2, h / 2)
        .scale(k)
        .translate(-cx, -cy),
    );
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

  // ---- the lens (experiment): bubbles near the focus grow, neighbours make room -----------------------------
  function loadLens(): LensSettings {
    try {
      return { ...LENS_DEFAULTS, ...JSON.parse(localStorage.getItem('qo-lens') ?? '{}') };
    } catch {
      return { ...LENS_DEFAULTS };
    }
  }
  const lab = LAB;
  let lensSettings = $state(loadLens());
  let lensPanel = $state(false);
  $effect(() => {
    const json = JSON.stringify(lensSettings);
    try {
      localStorage.setItem('qo-lens', json);
    } catch {
      /* private mode: not remembered */
    }
  });
  // Phones (no hover) always use the middle of the map; so does desktop with "Map centre" chosen.
  const touchOnly = matchMedia('(hover: none)').matches;
  const atCentre = $derived(touchOnly || lensSettings.focus === 'centre');
  // The focus glides after its target (the mouse), and the effect fades in and out, once per frame.
  let aim = { x: 0, y: 0, on: false };
  let focus = $state({ x: 0, y: 0, s: 0 });
  let lensFrame = 0;
  let lensPrev = 0;
  function lensTick(now: number) {
    const dt = lensPrev ? now - lensPrev : 16;
    lensPrev = now;
    const tx = atCentre ? w / 2 : aim.x;
    const ty = atCentre ? h / 2 : aim.y;
    const ts = atCentre || aim.on ? 1 : 0;
    const a = lensSettings.follow ? 1 - Math.exp(-dt / lensSettings.follow) : 1;
    const b = 1 - Math.exp(-dt / 120); // fade in/out
    const f = focus;
    const nx = f.s < 0.01 ? tx : f.x + (tx - f.x) * a; // appear where the mouse is, not glide in from afar
    const ny = f.s < 0.01 ? ty : f.y + (ty - f.y) * a;
    const ns = f.s + (ts - f.s) * b;
    const settled = Math.abs(nx - tx) < 0.3 && Math.abs(ny - ty) < 0.3 && Math.abs(ns - ts) < 0.005;
    focus = settled ? { x: tx, y: ty, s: ts } : { x: nx, y: ny, s: ns };
    lensFrame = settled ? 0 : requestAnimationFrame(lensTick);
    if (settled) lensPrev = 0;
  }
  function wakeLens() {
    if (!lab) return;
    if (!lensFrame) lensFrame = requestAnimationFrame(lensTick);
  }
  function onLensMove(ev: PointerEvent) {
    if (ev.pointerType !== 'mouse') return;
    const [x, y] = local(ev.clientX, ev.clientY);
    aim = {
      x,
      y,
      on: !(ev.target as Element).closest('.overlay, .zoom-btns, .lens-panel, .peek-wrap'),
    };
    wakeLens();
  }
  function onLensLeave() {
    aim = { ...aim, on: false };
    wakeLens();
  }
  $effect(() => {
    void atCentre;
    void w;
    void h;
    void lensSettings.on;
    wakeLens();
  });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lens = $derived(
    lab && lensSettings.on && !reducedMotion && focus.s > 0.002
      ? makeLens(lensSettings, focus.x, focus.y, focus.s, big)
      : undefined,
  );
  /** A dot's place on screen: projected, zoomed, moved off its neighbours, then through the lens. */
  function placeOf(i: number): [number, number] {
    const d = dots[i]!;
    const o = offsets[i] ?? [0, 0];
    const p: [number, number] = [t.applyX(d.x) + o[0], t.applyY(d.y) + o[1]];
    return lens ? lensPoint(lens, p[0], p[1]) : p;
  }

  // ---- the selected event's card, pinned to its dot -------------------------------------------------------
  const PEEK_W = 260;
  let peekH = $state(160);
  const peekEv = $derived(
    peek && app.eventId ? events.find((e) => e.id === app.eventId) : undefined,
  );
  const peekPos = $derived.by(() => {
    if (!peekEv) return undefined;
    const cw = Math.min(PEEK_W, w - 16);
    const i = dots.findIndex((d) => d.e.id === peekEv.id);
    // Online-only events have no place on the map: the card sits at the bottom, without a pointer.
    if (i < 0) return { left: Math.max(8, (w - cw) / 2), top: h - peekH - 14 };
    const [x, y] = placeOf(i);
    if (x < -20 || x > w + 20 || y < -20 || y > h + 20) return undefined;
    const gap = (big ? 15 : 9) + 12;
    const left = Math.min(Math.max(8, x - cw / 2), w - cw - 8);
    const above = y - gap - peekH > 8;
    return {
      left,
      top: above ? y - gap - peekH : y + gap,
      above,
      tail: Math.min(Math.max(x - left, 18), cw - 18),
    };
  });
</script>

<section class="mapview" class:compact aria-label="Map">
  <div
    class="box"
    bind:this={box}
    class:moving
    onpointermove={onLensMove}
    onpointerleave={onLensLeave}
    role="presentation"
  >
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
            {@const lp = lens ? lensPoint(lens, x + o[0], y + o[1]) : undefined}
            {@const ls = lens ? lensScale(lens, x + o[0], y + o[1]) : 1}
            {@const grow =
              (big ? 1 : 0.5) * ls * (isHot || app.eventId === d.e.id ? (big ? 1.12 : 1.2) : 1)}
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
              onfocus={(ev) => ev.currentTarget.matches(':focus-visible') && hover(d.e.id)}
              onblur={() => hover(undefined)}
            >
              <g class="shift" style:transform="translate({o[0]}px, {o[1]}px)">
                {#if isHot && (o[0] || o[1])}
                  <!-- Moved to avoid an overlap: show where it really is. -->
                  <line class="tether" x1="0" y1="0" x2={-o[0]} y2={-o[1]} />
                  <circle class="origin" cx={-o[0]} cy={-o[1]} r="2.2" />
                {/if}
                <g
                  class="lensed"
                  transform={lp ? `translate(${lp[0] - x - o[0]} ${lp[1] - y - o[1]})` : undefined}
                >
                  <circle class="hit" r={(spacing / 2 + 1) * ls} />
                  <circle class="ring" r={(big ? 14.5 : 8.5) * ls} />
                  <!-- One bubble, drawn at full size and scaled down to a dot below BIG_AT. -->
                  <g
                    class="bubble"
                    class:big
                    class:lensing={!!lens}
                    class:iconic={lens && grow >= 0.8}
                    style:transform={lens ? `scale(${grow})` : undefined}
                  >
                    <circle class="pin" r="11" />
                    <path
                      class="icon"
                      d={typeIcon(d.e.type)}
                      transform="translate(-6.6 -6.6) scale(0.55)"
                    />
                  </g>
                </g>
              </g>
            </g>
          {/if}
        {/each}
      </g>
    </svg>

    {#if hot && hot.e.id !== peekEv?.id}
      <div
        class="label event-label"
        style:left="{lens ? placeOf(hotIndex)[0] : t.applyX(hot.x) + hotOff[0]}px"
        style:top="{lens ? placeOf(hotIndex)[1] : t.applyY(hot.y) + hotOff[1]}px"
      >
        <b>{hot.e.name}</b>
        <span>{formatRange(hot.e.dates.start, hot.e.dates.end)} · {whereText(hot.e)}</span>
      </div>
    {/if}

    {#if peekEv && peekPos}
      <div
        class="peek-wrap"
        style:left="{peekPos.left}px"
        style:top="{peekPos.top}px"
        bind:offsetHeight={peekH}
      >
        <PeekCard e={peekEv} {today} onmore={() => onmore?.()} />
        {#if peekPos.tail !== undefined}
          <span
            class="tail"
            class:above={peekPos.above}
            style:left="{peekPos.tail}px"
            aria-hidden="true"
          ></span>
        {/if}
      </div>
    {/if}

    {#if !lab}
      <!-- The lens is a lab experiment (see "lab" above). -->
    {:else if lensPanel}
      <div class="lens-panel-wrap">
        <LensPanel bind:s={lensSettings} onclose={() => (lensPanel = false)} />
      </div>
    {:else}
      <button
        type="button"
        class="btn lens-btn"
        class:on={lensSettings.on}
        aria-label="Lens settings"
        title="Lens settings (experiment)"
        onclick={() => (lensPanel = true)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
          ><circle
            cx="10.5"
            cy="10.5"
            r="6.5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          /><circle cx="10.5" cy="10.5" r="2.6" fill="currentColor" /><path
            d="m16 16 4.5 4.5"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
          /></svg
        >
      </button>
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
  /* Named for the expand/shrink animation (view transitions). */
  .mapview {
    view-transition-name: qo-map;
  }
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
  .bubble.big .icon,
  .bubble.iconic .icon {
    opacity: 1;
  }
  /* Under the lens the size follows the focus every frame: no easing of its own. */
  .bubble.lensing {
    transition: none;
  }
  .lens-btn {
    position: absolute;
    left: 10px;
    bottom: 34px;
    z-index: 5;
  }
  .lens-btn.on {
    color: var(--accent);
  }
  .lens-panel-wrap {
    position: absolute;
    left: 10px;
    bottom: 10px;
    z-index: 7;
    max-height: calc(100% - 20px);
    display: flex;
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
  /* One highlight for "this event": pointed at anywhere, or selected. */
  .dot.picked .ring,
  .dot.hot .ring,
  .dot:focus-visible .ring {
    stroke: var(--hot);
  }
  .dot.picked .bubble,
  .dot.hot .bubble {
    transform: scale(0.6);
  }
  .dot.picked .bubble.big,
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
  .peek-wrap {
    position: absolute;
    z-index: 6;
  }
  /* The pointer from the card to its dot. */
  .tail {
    position: absolute;
    width: 14px;
    height: 14px;
    margin-left: -7px;
    background: var(--surface);
    transform: rotate(45deg);
    box-shadow: 1px 1px 0 var(--line);
    top: -7px;
  }
  .tail.above {
    top: auto;
    bottom: -7px;
  }
  .tail:not(.above) {
    box-shadow: -1px -1px 0 var(--line);
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
