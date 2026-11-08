<script lang="ts">
  // The corner button of a panel (map, timeline, list): expands it over the other panels, or shrinks it back
  // into the Explore workspace. Expanded panels have their own URL (#/map, #/timeline, #/list).
  import { app } from '../lib/state.svelte';

  let { panel, label }: { panel: 'map' | 'timeline' | 'list'; label: string } = $props();
  const expanded = $derived(app.view === panel);
</script>

<button
  class="btn expand"
  type="button"
  aria-label={expanded ? `Shrink the ${label}` : `Expand the ${label}`}
  title={expanded ? `Shrink the ${label}` : `Expand the ${label}`}
  onclick={() => (app.view = expanded ? 'explore' : panel)}
>
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    {#if expanded}
      <path d="M4 14h6v6M20 10h-6V4M10 14l-7 7M14 10l7-7" />
    {:else}
      <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
    {/if}
  </svg>
</button>

<style>
  .expand {
    min-width: 36px;
    min-height: 36px;
    padding: 0;
    display: inline-grid;
    place-items: center;
    flex: none;
  }
  path {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
