<script lang="ts">
  // A draggable border between two panels (the ARIA "window splitter" pattern). Dragging changes a width in
  // pixels; arrow keys change it in steps; double-click resets it.
  let {
    value,
    min,
    max,
    label,
    sign = 1,
    onresize,
    onreset,
  }: {
    /** Current width (px) of the panel this border resizes. */
    value: number;
    min: number;
    max: number;
    label: string;
    /** +1 when dragging right makes the panel wider (panel on the left), −1 when the panel is on the right. */
    sign?: 1 | -1;
    onresize: (px: number) => void;
    onreset: () => void;
  } = $props();

  let drag: { x: number; v: number } | undefined = $state();

  function down(ev: PointerEvent) {
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    drag = { x: ev.clientX, v: value };
  }
  function move(ev: PointerEvent) {
    if (drag) onresize(drag.v + sign * (ev.clientX - drag.x));
  }
  function key(ev: KeyboardEvent) {
    const step = ev.key === 'ArrowLeft' ? -24 : ev.key === 'ArrowRight' ? 24 : 0;
    if (!step) return;
    ev.preventDefault();
    onresize(value + sign * step);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="resizer"
  class:dragging={drag}
  role="separator"
  aria-orientation="vertical"
  aria-label={label}
  aria-valuemin={min}
  aria-valuemax={max}
  aria-valuenow={value}
  tabindex="0"
  title="Drag to resize · double-click to reset"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={() => (drag = undefined)}
  onpointercancel={() => (drag = undefined)}
  ondblclick={onreset}
  onkeydown={key}
></div>
{#if drag}<div class="shield" aria-hidden="true"></div>{/if}

<style>
  .resizer {
    position: relative;
    width: 12px;
    cursor: col-resize;
    touch-action: none;
    align-self: stretch;
  }
  .resizer::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 4px;
    height: 44px;
    transform: translate(-50%, -50%);
    border-radius: 2px;
    background: var(--line);
  }
  .resizer:hover::after,
  .resizer:focus-visible::after,
  .resizer.dragging::after {
    background: var(--accent);
  }
  /* While dragging: keep the col-resize cursor and stop text selection everywhere. */
  .shield {
    position: fixed;
    inset: 0;
    z-index: 100;
    cursor: col-resize;
  }
</style>
