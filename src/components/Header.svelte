<script lang="ts">
  import { activeCount, type View } from '../lib/filters';
  import { app, prefs, setPref, type Theme } from '../lib/state.svelte';

  let { shown, total }: { shown: number; total: number } = $props();

  const views: { id: View; label: string; icon: string; wide?: boolean }[] = [
    { id: 'explore', label: 'Explore', icon: 'M3 4h8v7H3zM13 4h8v16h-8zM3 13h8v7H3z', wide: true },
    { id: 'list', label: 'List', icon: 'M4 6h16M4 12h16M4 18h16' },
    { id: 'timeline', label: 'Timeline', icon: 'M4 7h9M7 12h11M4 17h7' },
    {
      id: 'map',
      label: 'Map',
      icon: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
    },
  ];
  const nActive = $derived(activeCount(app.filters));
  let searchEl: HTMLInputElement | undefined = $state();
  const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
  const THEME_LABEL: Record<Theme, string> = {
    system: 'Theme: system',
    light: 'Theme: light',
    dark: 'Theme: dark',
  };
  const THEME_ICON: Record<Theme, string> = {
    system: 'M4 5h16v11H4zM9 20h6M12 16v4',
    light:
      'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10',
    dark: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5',
  };

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) {
      e.preventDefault();
      searchEl?.focus();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<header class="header">
  <div class="top">
    <a class="brand" href="#/list" aria-label="Quantum Opportunities, home">
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
        <circle cx="16" cy="16" r="4.5" fill="currentColor" />
        <g fill="none" stroke="currentColor" stroke-width="1.8">
          <ellipse cx="16" cy="16" rx="14" ry="5.5" />
          <ellipse cx="16" cy="16" rx="14" ry="5.5" transform="rotate(60 16 16)" />
          <ellipse cx="16" cy="16" rx="14" ry="5.5" transform="rotate(120 16 16)" />
        </g>
      </svg>
      <span>Quantum <b>Opportunities</b></span>
    </a>
    <nav class="views" aria-label="View">
      {#each views as v (v.id)}
        <a
          href="#/{v.id}"
          class:active={app.view === v.id}
          class:wide={v.wide}
          aria-current={app.view === v.id ? 'page' : undefined}
          onclick={(e) => {
            e.preventDefault();
            app.view = v.id;
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
            ><path
              d={v.icon}
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            /></svg
          >
          <span>{v.label}</span>
        </a>
      {/each}
    </nav>
    <button
      class="theme"
      type="button"
      onclick={() => setPref('theme', NEXT[prefs.theme])}
      title="{THEME_LABEL[prefs.theme]} (click to change)"
      aria-label="{THEME_LABEL[prefs.theme]}. Change theme"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
        ><path
          d={THEME_ICON[prefs.theme]}
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        /></svg
      >
    </button>
    <a
      class="about"
      href="#/about"
      class:active={app.view === 'about'}
      onclick={(e) => {
        e.preventDefault();
        app.view = 'about';
      }}>About</a
    >
  </div>
  <div class="bar">
    <label class="search">
      <span class="sr-only">Search events</span>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
        ><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2" /><path
          d="m20 20-3.5-3.5"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        /></svg
      >
      <input
        bind:this={searchEl}
        type="search"
        placeholder="Search events, places, organisers…"
        autocomplete="off"
        bind:value={app.filters.q}
      />
    </label>
    <button
      class="btn filters-btn"
      aria-expanded={app.filtersOpen}
      aria-controls="filters"
      onclick={() => (app.filtersOpen = !app.filtersOpen)}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
        ><path
          d="M4 6h16M7 12h10M10 18h4"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        /></svg
      >
      Filters{#if nActive}<span class="count">{nActive}</span>{/if}
    </button>
    <p class="shown" aria-live="polite"><b>{shown}</b> of {total}</p>
  </div>
</header>

<style>
  .header {
    position: sticky;
    top: 0;
    z-index: 30;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line);
    padding: 10px max(14px, env(safe-area-inset-left)) 10px max(14px, env(safe-area-inset-right));
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--ink);
    text-decoration: none;
    font-size: 1.05rem;
    white-space: nowrap;
  }
  .brand svg {
    color: var(--accent);
  }
  .views {
    display: flex;
    margin-left: auto;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 3px;
  }
  .views a,
  .about {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 7px;
    color: var(--muted);
    text-decoration: none;
    font-weight: 600;
    font-size: 0.9rem;
    min-height: 36px;
  }
  .views a.active {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .about.active {
    color: var(--accent);
  }
  .theme {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--muted);
    flex: none;
  }
  .theme:hover {
    color: var(--ink);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .search {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0 12px;
    color: var(--muted);
    min-height: 42px;
  }
  .search:focus-within {
    border-color: var(--accent);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    outline: none;
    padding: 9px 0;
    font-size: 16px; /* no zoom on iOS */
  }
  .count {
    background: var(--accent);
    color: var(--accent-ink);
    border-radius: 999px;
    font-size: 0.75rem;
    padding: 1px 7px;
  }
  .shown {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
    white-space: nowrap;
  }
  .shown b {
    color: var(--ink);
  }
  @media (min-width: 960px) {
    .filters-btn {
      display: none;
    }
  }
  @media (max-width: 640px) {
    .brand span {
      display: none;
    }
    .views {
      margin-left: 0;
      flex: 1;
      min-width: 0;
    }
    .views a {
      flex: 1;
      min-width: 0;
      justify-content: center;
      padding: 6px 4px;
    }
    .shown {
      display: none;
    }
    .top {
      gap: 8px;
    }
    .about {
      padding: 6px 4px;
    }
    .filters-btn {
      padding: 8px 10px;
    }
  }
  @media (max-width: 480px) {
    .views svg {
      display: none;
    }
    .views a {
      font-size: 0.8rem;
      padding: 6px 2px;
    }
  }
</style>
