<script lang="ts" module>
  export interface Option {
    value: string;
    label: string;
    count: number;
    depth?: number;
    hint?: string;
  }
</script>

<script lang="ts">
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
    let list = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    if (!expanded && !q && list.length > limit) {
      // Always keep selected options visible.
      const head = list.slice(0, limit);
      const extra = list.slice(limit).filter((o) => selected.includes(o.value));
      list = [...head, ...extra];
    }
    return list;
  });
  const id = $derived(`facet-${title.toLowerCase().replace(/\W+/g, '-')}`);
</script>

{#if options.length}
  <fieldset class="facet">
    <legend {id}>{title}</legend>
    {#if searchable && options.length > limit}
      <input
        class="find"
        type="search"
        placeholder="Find {title.toLowerCase()}…"
        bind:value={query}
        aria-labelledby={id}
      />
    {/if}
    <ul>
      {#each visible as o (o.value)}
        <li style:padding-left="{(o.depth ?? 0) * 16}px">
          <label class:zero={o.count === 0 && !selected.includes(o.value)}>
            <input
              type="checkbox"
              checked={selected.includes(o.value)}
              onchange={() => onToggle(o.value)}
            />
            <span class="lbl"
              >{o.label}{#if o.hint}<span class="hint"> {o.hint}</span>{/if}</span
            >
            <span class="n">{o.count}</span>
          </label>
        </li>
      {/each}
    </ul>
    {#if options.length > limit && !query}
      <button class="more" type="button" onclick={() => (expanded = !expanded)}>
        {expanded ? 'Show fewer' : `Show all ${options.length}`}
      </button>
    {/if}
  </fieldset>
{/if}

<style>
  .facet {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  legend {
    font-weight: 700;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    margin-bottom: 4px;
    padding: 0;
  }
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
    opacity: 0.45;
  }
  input[type='checkbox'] {
    width: 17px;
    height: 17px;
    accent-color: var(--accent);
    flex: none;
  }
  .lbl {
    flex: 1;
    min-width: 0;
    font-size: 0.92rem;
  }
  .hint {
    color: var(--muted);
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
