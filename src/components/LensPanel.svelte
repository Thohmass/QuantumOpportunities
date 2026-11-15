<script lang="ts">
  // Map lab (?lab): tune the bubble sizes and the lens live. Every value is remembered in this browser.
  import { LENS_DEFAULTS, type LensSettings } from '../lib/lens';
  import { CURVES, SIZE_DEFAULTS, type Curve, type SizeSettings } from '../lib/size';

  let {
    s = $bindable(),
    size = $bindable(),
    radius,
    zoom,
    onclose,
  }: {
    s: LensSettings;
    size: SizeSettings;
    /** Current bubble radius and zoom, as a read-out while tuning. */
    radius: number;
    zoom: number;
    onclose: () => void;
  } = $props();

  interface SizeSlider {
    key: 'fromRadius' | 'toRadius' | 'fromZoom' | 'toZoom' | 'iconAt' | 'gap';
    label: string;
    min: number;
    max: number;
    step: number;
    unit: string;
  }
  const SIZES: SizeSlider[] = [
    { key: 'fromRadius', label: 'Smallest', min: 1.5, max: 12, step: 0.5, unit: 'px' },
    { key: 'toRadius', label: 'Largest', min: 4, max: 28, step: 0.5, unit: 'px' },
    { key: 'fromZoom', label: 'Grow from', min: 1, max: 16, step: 0.5, unit: '×' },
    { key: 'toZoom', label: 'Grow until', min: 2, max: 60, step: 1, unit: '×' },
    { key: 'iconAt', label: 'Icon from', min: 3, max: 24, step: 0.5, unit: 'px' },
    { key: 'gap', label: 'Gap', min: 0, max: 14, step: 0.5, unit: 'px' },
  ];
  const CURVE_LABEL: Record<Curve, string> = {
    linear: 'Linear',
    'ease-in': 'Slow, then fast',
    'ease-out': 'Fast, then slow',
    smooth: 'S-curve (slow ends)',
  };

  interface Slider {
    key: 'dotRadius' | 'dotScale' | 'iconRadius' | 'iconScale' | 'push' | 'follow';
    label: string;
    min: number;
    max: number;
    step: number;
    unit: string;
  }
  const SMALL: Slider[] = [
    { key: 'dotRadius', label: 'Reach', min: 30, max: 300, step: 5, unit: 'px' },
    { key: 'dotScale', label: 'Size at centre', min: 1, max: 4, step: 0.05, unit: '×' },
  ];
  const ICONS: Slider[] = [
    { key: 'iconRadius', label: 'Reach', min: 60, max: 600, step: 10, unit: 'px' },
    { key: 'iconScale', label: 'Size at centre', min: 1, max: 3, step: 0.05, unit: '×' },
  ];
  const BOTH: Slider[] = [
    { key: 'push', label: 'Make room', min: 0, max: 1, step: 0.05, unit: '' },
    { key: 'follow', label: 'Follow lag', min: 0, max: 300, step: 10, unit: 'ms' },
  ];
  const fmt = (v: number, unit: string) =>
    unit === '' ? `${Math.round(v * 100)}%` : unit === '×' ? `${v.toFixed(2)}×` : `${v} ${unit}`;
</script>

{#snippet sliders(list: Slider[])}
  {#each list as sl (sl.key)}
    <label class="row">
      <span>{sl.label}</span>
      <input type="range" min={sl.min} max={sl.max} step={sl.step} bind:value={s[sl.key]} />
      <output>{fmt(s[sl.key], sl.unit)}</output>
    </label>
  {/each}
{/snippet}

<div class="lens-panel" role="group" aria-label="Lens settings">
  <div class="top">
    <b>Map lab</b>
    <button type="button" class="x" aria-label="Close the lens settings" onclick={onclose}>✕</button
    >
  </div>
  <p class="h">Bubble size by zoom</p>
  <p class="note">Now: zoom {zoom.toFixed(1)}×, radius {radius.toFixed(1)} px</p>
  {#each SIZES as sl (sl.key)}
    <label class="row">
      <span>{sl.label}</span>
      <input type="range" min={sl.min} max={sl.max} step={sl.step} bind:value={size[sl.key]} />
      <output>{size[sl.key]} {sl.unit}</output>
    </label>
  {/each}
  <label class="row">
    <span>Growth</span>
    <select class="curve" bind:value={size.curve}>
      {#each Object.keys(CURVES) as c (c)}<option value={c}>{CURVE_LABEL[c as Curve]}</option
        >{/each}
    </select>
  </label>
  <button type="button" class="btn ghost" onclick={() => (size = { ...SIZE_DEFAULTS })}
    >Reset sizes</button
  >
  <div class="top lens-top">
    <label class="switch"><input type="checkbox" bind:checked={s.on} /> <b>Lens</b></label>
  </div>
  <fieldset disabled={!s.on}>
    <p class="h">Small dots (zoomed out)</p>
    {@render sliders(SMALL)}
    <p class="h">Icon bubbles (zoomed in)</p>
    {@render sliders(ICONS)}
    <p class="h">Both</p>
    {@render sliders(BOTH)}
    <div class="row">
      <span>Focus</span>
      <span class="seg">
        <label><input type="radio" bind:group={s.focus} value="pointer" /> Mouse</label>
        <label><input type="radio" bind:group={s.focus} value="centre" /> Map centre</label>
      </span>
    </div>
    <label class="check"><input type="checkbox" bind:checked={s.land} /> Magnify the land too</label
    >
  </fieldset>
  <p class="note">Phones always use the map centre.</p>
  <button type="button" class="btn ghost" onclick={() => (s = { ...LENS_DEFAULTS })}
    >Reset lens</button
  >
</div>

<style>
  .lens-panel {
    width: 270px;
    max-width: calc(100vw - 24px);
    max-height: calc(100% - 20px);
    overflow-y: auto;
    padding: 10px 12px 12px;
    border-radius: 12px;
    background: var(--surface);
    box-shadow:
      0 6px 24px rgb(0 0 0 / 25%),
      0 0 0 1px var(--line);
    font-size: 0.82rem;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .x {
    border: 0;
    background: transparent;
    color: var(--muted);
    width: 30px;
    height: 30px;
    border-radius: 8px;
  }
  .x:hover {
    background: var(--accent-soft);
  }
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
  }
  fieldset:disabled {
    opacity: 0.45;
  }
  .h {
    margin: 10px 0 2px;
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .row {
    display: grid;
    grid-template-columns: 78px 1fr 52px;
    align-items: center;
    gap: 6px;
    min-height: 30px;
  }
  .row input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
  }
  output {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  .seg {
    grid-column: 2 / 4;
    display: flex;
    gap: 10px;
  }
  .check,
  .switch {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
  }
  .curve {
    grid-column: 2 / 4;
    min-height: 30px;
  }
  .lens-top {
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }
  .note {
    margin: 6px 0;
    color: var(--muted);
    font-size: 0.74rem;
  }
</style>
