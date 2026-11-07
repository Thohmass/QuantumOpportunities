<script lang="ts" module>
  export interface Option {
    value: string;
    label: string;
    count: number;
    depth?: number;
    /** CSS class giving the option a colour swatch, e.g. "t-hackathon". */
    swatch?: string;
  }
</script>

<script lang="ts">
  import Section from './Section.svelte';

  // Options keep a fixed order and never disappear: unavailable ones are dimmed, so the list doesn't jump.
  let {
    title,
    options,
    selected,
    onToggle,
    limit = 8,
    searchable = false,
  }: {
    title: string;
    options: Option[];
    selected: string[];
    onToggle: (value: string) => void;
    limit?: number;
    searchable?: boolean;
  } = $props();

  let expanded = $state(false);
  let query = $state('');
  const visible = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (q) return options.filter((o) => o.label.toLowerCase().includes(q));
    if (expanded || options.length <= limit) return options;
    // First `limit` in their fixed order, plus anything selected further down.
    return options.filter((o, i) => i < limit || selected.includes(o.value));
  });
  const chosen = $derived(options.filter((o) => selected.includes(o.value)));
</script>

{#snippet row(o: Option)}
  <li style:padding-left="{(o.depth ?? 0) * 16}px">
    <label class:zero={o.count === 0 && !selected.includes(o.value)}>
      <input
        type="checkbox"
        checked={selected.includes(o.value)}
        onchange={() => onToggle(o.value)}
      />
      {#if o.swatch}<span class="swatch {o.swatch}" aria-hidden="true"></span>{/if}
      <span class="lbl">{o.label}</span>
      <span class="n">{o.count}</span>
    </label>
  </li>
{/snippet}

{#if options.length}
  <Section {title} active={selected.length}>
    {#if searchable && options.length > limit}
      <input
        class="find"
        type="search"
        placeholder="Find {title.toLowerCase()}…"
        bind:value={query}
        aria-label="Find {title}"
      />
    {/if}
    <ul>
      {#each visible as o (o.value)}{@render row(o)}{/each}
    </ul>
    {#if options.length > limit && !query}
      <button class="more" type="button" onclick={() => (expanded = !expanded)}>
        {expanded ? 'Show fewer' : `Show all ${options.length}`}
      </button>
    {/if}
    {#snippet summary()}
      {#if chosen.length}<ul>
          {#each chosen as o (o.value)}{@render row(o)}{/each}
        </ul>{/if}
    {/snippet}
  </Section>
{/if}

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border-radius: 6px;
    min-height: 34px;
    cursor: pointer;
  }
  label:hover {
    background: var(--surface-2);
  }
  label.zero {
    opacity: 0.42;
  }
  input[type='checkbox'] {
    width: 17px;
    height: 17px;
    accent-color: var(--accent);
    flex: none;
  }
  .swatch {
    width: 10px;
    height: 10px;
  }
  .lbl {
    flex: 1;
    min-width: 0;
    font-size: 0.92rem;
  }
  .n {
    font-family: var(--mono);
    font-size: 0.78rem;
    color: var(--muted);
  }
  .more {
    justify-self: start;
    background: none;
    border: 0;
    color: var(--accent);
    font-size: 0.85rem;
    padding: 4px 6px;
  }
  .find {
    width: 100%;
    border: 1px solid var(--line);
    background: var(--surface);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 16px;
  }
</style>
