<script lang="ts">
  import { activeCount } from '../lib/filters';
  import type { Suggestion } from '../lib/suggest';
  import SearchBox from './SearchBox.svelte';
  import { app, closeDrawer, prefs, setPref, type Theme } from '../lib/state.svelte';

  let { shown, total, pool }: { shown: number; total: number; pool: Suggestion[] } = $props();

  const nActive = $derived(activeCount(app.filters));
  let box: SearchBox | undefined = $state();
  // The header's height is shared with sticky elements below it.
  let headerEl: HTMLElement | undefined = $state();
  $effect(() => {
    if (!headerEl) return;
    const el = headerEl;
    const ro = new ResizeObserver(() =>
      document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`),
    );
    ro.observe(el);
    return () => ro.disconnect();
  });

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
      box?.focus();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<header class="header" bind:this={headerEl}>
  <div class="top">
    <a
      class="brand"
      href="#/explore"
      aria-label="Quantum Opportunities, home"
      onclick={(e) => {
        e.preventDefault();
        app.view = 'explore';
      }}
    >
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
    <div class="search"><SearchBox {pool} bind:this={box} /></div>
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
      <span class="word">Filters</span>{#if nActive}<span class="count">{nActive}</span>{/if}
    </button>
    <p class="shown" aria-live="polite"><b>{shown}</b> of {total}</p>
    {#if app.drawerMode}
      <button
        class="btn list-btn"
        type="button"
        aria-expanded={app.listDrawer}
        onclick={() => (app.listDrawer ? closeDrawer() : (app.listDrawer = true))}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
          ><path
            d="M4 6h16M4 12h16M4 18h16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          /></svg
        >
        <span class="word">List</span> <span class="count">{shown}</span>
      </button>
    {/if}
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
</header>

<style>
  .header {
    position: sticky;
    top: 0;
    z-index: 30;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line);
    padding: 8px max(14px, env(safe-area-inset-left)) 8px max(14px, env(safe-area-inset-right));
  }
  /* One row: logo · search · count · (Filters · List) · theme · About. On phones the search is a magnifier
     button; while it is open it takes the row and the other buttons step aside. */
  .top {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .search {
    flex: 0 1 300px;
    min-width: 0;
  }
  .shown {
    margin: 0 auto 0 0;
    color: var(--muted);
    font-size: 0.85rem;
    white-space: nowrap;
  }
  .shown b {
    color: var(--ink);
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
  .about {
    display: flex;
    align-items: center;
    padding: 6px 8px;
    border-radius: 7px;
    color: var(--muted);
    text-decoration: none;
    font-weight: 600;
    font-size: 0.9rem;
    min-height: 36px;
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
  .count {
    background: var(--accent);
    color: var(--accent-ink);
    border-radius: 999px;
    font-size: 0.75rem;
    padding: 1px 7px;
  }
  .filters-btn,
  .list-btn {
    white-space: nowrap;
  }
  @media (min-width: 960px) {
    .filters-btn {
      display: none;
    }
  }
  @media (max-width: 1239px) {
    .brand span {
      display: none;
    }
    .search {
      flex-basis: 220px;
    }
  }
  @media (max-width: 959px) {
    .search {
      flex: 0 0 auto;
    }
    .shown {
      display: none;
    }
    .theme {
      margin-left: auto;
    }
    .top:has(.search :global(.open)) .search {
      flex: 1 1 auto;
    }
    .top:has(.search :global(.open)) > :not(.search):not(.brand) {
      display: none;
    }
  }
  /* Small phones: icons and counts only. */
  @media (max-width: 480px) {
    .word {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    .filters-btn,
    .list-btn {
      padding: 8px 10px;
    }
    .about {
      padding: 6px 4px;
    }
  }
</style>
