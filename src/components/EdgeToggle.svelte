<script lang="ts">
  // Hides or shows a side panel (filters, list) with an arrow instead of words.
  // Open: a small handle on the panel's inner border, pointing towards the edge it hides into.
  // Closed: a tab peeking from that screen edge, pointing back in (the same tab as on phones).
  import type { Snippet } from 'svelte';

  let {
    edge,
    open,
    label,
    onclick,
    children,
  }: {
    /** The screen edge the panel lives on (and hides into). */
    edge: 'left' | 'right';
    open: boolean;
    label: string;
    onclick: () => void;
    /** Extra content for the closed tab (an icon, a count). */
    children?: Snippet;
  } = $props();

  // Arrow towards the edge when open (hide), away from it when closed (show).
  const pointsLeft = $derived(edge === 'left' ? open : !open);
</script>

<button
  type="button"
  class="edge-toggle {edge}"
  class:open
  aria-label={label}
  aria-expanded={open}
  title={label}
  {onclick}
>
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
    ><path
      d={pointsLeft ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
      fill="none"
      stroke="currentColor"
      stroke-width="2.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    /></svg
  >
  {#if !open && children}{@render children()}{/if}
</button>

<style>
  .edge-toggle {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 3px;
    padding: 0;
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: 800;
  }
  /* On the border: half over each side, small and quiet until pointed at. */
  .edge-toggle.open {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 8;
    width: 20px;
    height: 46px;
    transform: translate(-50%, -50%);
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    color: var(--muted);
    box-shadow: var(--shadow);
  }
  .edge-toggle.open:hover,
  .edge-toggle.open:focus-visible {
    color: var(--ink);
    border-color: var(--accent);
  }
  /* Closed: peeking from the screen edge, in strong contrast (light on dark, dark on light). */
  .edge-toggle:not(.open) {
    position: fixed;
    top: 50%;
    z-index: 30;
    min-width: 32px;
    padding: 12px 6px;
    border: 0;
    background: var(--ink);
    color: var(--bg);
    box-shadow: 0 2px 10px rgb(0 0 0 / 35%);
    transform: translateY(-50%);
  }
  .edge-toggle.right:not(.open) {
    right: 0;
    border-radius: 12px 0 0 12px;
  }
  .edge-toggle.left:not(.open) {
    left: 0;
    border-radius: 0 12px 12px 0;
  }
</style>
