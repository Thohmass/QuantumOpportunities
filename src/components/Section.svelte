<script lang="ts">
  // A collapsible filter group. Clicking the title folds it; `summary` (e.g. the active choices) stays visible.
  import type { Snippet } from 'svelte';
  import { prefs } from '../lib/state.svelte';

  let {
    title,
    active = 0,
    children,
    summary,
  }: { title: string; active?: number; children: Snippet; summary?: Snippet } = $props();

  const collapsed = $derived(prefs.collapsed.includes(title));
  const toggle = () =>
    (prefs.collapsed = collapsed
      ? prefs.collapsed.filter((t) => t !== title)
      : [...prefs.collapsed, title]);
</script>

<section class="section" class:collapsed>
  <h3>
    <button type="button" aria-expanded={!collapsed} onclick={toggle}>
      <svg class="chev" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
        ><path
          d="m6 9 6 6 6-6"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
        /></svg
      >
      <span>{title}</span>
      {#if active}<span class="active">{active}</span>{/if}
    </button>
  </h3>
  {#if !collapsed}
    <div class="body">{@render children()}</div>
  {:else if summary}
    <div class="body">{@render summary()}</div>
  {/if}
</section>

<style>
  .section {
    display: grid;
    gap: 4px;
  }
  h3 {
    margin: 0;
  }
  h3 button {
    all: unset;
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    cursor: pointer;
    font-weight: 700;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    padding: 4px 0;
  }
  h3 button:hover {
    color: var(--ink);
  }
  h3 button:focus-visible {
    outline: 2px solid var(--accent);
    border-radius: 4px;
  }
  .chev {
    transition: transform 0.15s;
  }
  .collapsed .chev {
    transform: rotate(-90deg);
  }
  .active {
    background: var(--accent);
    color: var(--accent-ink);
    border-radius: 999px;
    font-size: 0.7rem;
    padding: 0 6px;
    letter-spacing: 0;
  }
  .body {
    display: grid;
    gap: 6px;
  }
</style>
