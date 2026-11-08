<script lang="ts">
  // The icon of an event type, in the type's colour (with a thin edge so white and yellow stay visible).
  import { typeIcon } from '../lib/icons';

  let { type, size = 14 }: { type: string; size?: number } = $props();
</script>

<svg
  class="type-icon t-{type}"
  viewBox="0 0 24 24"
  width={size}
  height={size}
  aria-hidden="true"
  focusable="false"
>
  <path class="edge" d={typeIcon(type)} />
  <path class="line" d={typeIcon(type)} />
</svg>

<style>
  .type-icon {
    flex: none;
    overflow: visible;
  }
  path {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .edge {
    stroke: var(--tc-edge);
    stroke-width: 4.2;
    opacity: 0.55;
  }
  .line {
    stroke: var(--tc);
    stroke-width: 2.2;
  }
</style>
