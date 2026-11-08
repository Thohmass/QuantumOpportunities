# MVP Spec (v0.1)

Status: built · 6 Nov 2026

## 1. Goal

A public site on GitHub Pages with linked map, timeline and list views over a seeded dataset of real events, shared search and filters, honest rendering of unknown and expected data, and a working agent data pipeline.

## 2. Layout and state

- **Header:** name; view switcher (Explore on wide screens · List · Timeline · Map); About; search (`/` focuses it); Filters button (drawer on phones and tablets, sidebar from 960 px); result count.
- **Explore (≥ 1100 px, default there):** map top-left, timeline bottom-left, list on the right, all on one screen.
- **Active filters** show as removable chips with *Clear all*.
- **All views share one filtered result set.**
- **URL state:** view, search and filters live in the hash (`#/map?type=hackathon&country=DK&e=qip-2027`), so any view can be shared or bookmarked; `e=` opens an event. Opening events and switching views create history entries (back button works).

## 3. Linked views (07-design-vision)

- **Cross-highlighting:** hovering or focusing an event in any view highlights it in all others (card outline, timeline bar ring, map halo + tooltip) and scrolls it into sight in the list and timeline.
- **Map as a lens:** events outside the visible map area are dimmed in the list and timeline; *Only map area* hides them instead. Online events are never dimmed by the map.
- **Timeline selection:** click a month, a week (W45) or a day (in Week zoom), or drag across the timeline with the mouse, to set the date filter; the selection is shaded and *Clear dates* removes it. The timeline keeps showing events outside the selection, dimmed, so a selection never loses context.

## 4. Views

- **List:** grouped by month of the next relevant date (next open deadline, else start); sorts: next date, start date, recently added, recently checked. Cards show dates, name, status, type, cost, place, next deadline with days left, topics. Expected events have dashed borders.
- **Timeline:** zoom Week / Month / Quarter / Year, *Today* button, today line. Bars from start to end; expected editions striped; month- or year-precision dates have faded ends; deadlines are diamonds on the same row.
- **Map:** clustered markers (filled = confirmed, dashed hollow = expected, grey = past); *Fit to results*; a chip with the number of online events that filters to them. Map code loads only when a map is first shown.
- **Event detail:** side panel on desktop, bottom sheet on mobile, Esc closes. All fields; unknowns read *Not found yet*; expected banner with basis and confidence; official page, registration, add to calendar (.ics, when days are known), copy link; missing-fields note with a "tell us" link; sources with access dates; last checked; links to the data file and its history; correction by email or issue.
- **About:** how to read the data, data health (upcoming count, share of events with each key field, last runs), how it stays current, how to help, licences and credits.

## 5. Filters

Search (fuzzy, prefix) · when (presets: next 30 days, next 3 months, this year, next year, pick dates; optionally match deadlines) · applications (open now, closing within 2 weeks) · show expected / past / cancelled · event type · topic (parents include children) · format · continent (incl. online only) · country · city · organiser type · organiser · cost (free / paid / not found yet) · travel support · real quantum hardware · audience (incl. not found yet). Options show counts that ignore their own facet; options with 0 results are greyed out.

## 6. Non-functional targets

- Initial JS ≤ 100 KB gzip (v0.1: ~43 KB); event data ≤ 150 KB gzip; enforced by `scripts/size-budget.ts` in CI.
- 360 px phones to wide desktops; touch targets ≥ 34–44 px; keyboard navigable; visible focus; status never shown by colour alone; reduced motion respected; light and dark themes.
- No cookies, no analytics, no third-party requests except map tiles.

## 7. Out of scope for v0.1

Accounts, notifications, a submission form with its own backend, newsletter/channel, saved filters, PWA/offline, translations, job/PhD/grant listings, the visual identity and Easter eggs (06-roadmap, 07-design-vision).

## 8. Acceptance criteria

1. Live on GitHub Pages; deploys on merge to `main`.
2. Seeded data validates (`npm run data:check`).
3. Explore, list, timeline and map show the same filtered set; filters live in the URL.
4. Unknowns render as *Not found yet*; expected events are distinct in every view.
5. Every event shows at least one source and a last-checked date.
6. Size budgets pass in CI.
7. A Scout run and a Refresher run produce data-only PRs that pass the gates and merge (after the ruleset exists).
8. A planted duplicate fails CI (unit-tested).

## 9. v0.2 changes (7 Nov 2026, from Tomáš's first review)

- **Colour = event type** everywhere (cards' left edge and type chip, timeline bars, map pins, the Event type filter as legend). Status is texture: soft gradient = expected (v0.3; stripes in v0.2), grey = past, dashed red outline = postponed/cancelled. Orange is reserved for "hovered".
- **Map:** one bounded world (no wrapping, no panning past the poles or the date line); the hover marker is a small dot that grows with zoom; the hover tooltip closes when the pointer leaves the event in any view; selecting an event flies the map to it and rings its pin.
- **Timeline:** deadlines are joined to their event by a dotted line in the event's colour. File-manager selection on month/week/day cells (click = select only / unselect if selected, Shift = range from the last click, Ctrl/Cmd = add or remove one), dragging across cells selects several, dragging in the body selects days; selections can have gaps (`dates=` in the URL holds a list of periods). The timeline always fills its box. Year-only dates are drawn as one likely month (series' usual month, or the season for schools) with a dotted outline and "month not known".
- **Filters:** every group collapses (selected options stay visible); options keep a fixed order and never disappear (zero-count options are dimmed); the sidebar can be hidden.
- **List:** name first; date smaller; larger flag. Selecting an event unfolds its details inside the card (with a collapse button) and focuses the map and timeline on it. The standalone Timeline and Map views keep the side panel.
- **Layouts:** Explore has "Side by side" and "Wide map" (map across the screen, timeline below, list as a drawer that opens on demand or when an event is selected). The choice is remembered in the browser.
- **Theme:** System / Light / Dark switch in the header, remembered in the browser.

## 10. v0.3 changes (7 Nov 2026, second review)

- **Own minimal map** instead of map tiles: land, sea and simplified country borders only (Natural Earth 1:110m), no labels, roads or rivers. Hovering a country lightens it and shows its name (tap on phones). Pan and zoom move a single SVG layer while event dots stay a constant size, which keeps it smooth on phones. Bounded to one world; zoom 1–60×.
- **No clusters:** every event is its own dot. Events in exactly the same place are spread on a small ring with a thin tether (a better solution for dense areas is still to be designed).
- **Timeline:** alternating month shading; no frame (the axis fades out at both sides); sharper bars; expected editions drawn as a soft gradient instead of stripes; picking a month or week no longer jumps back to today.
- **Phones:** Explore is available and is the default: map, then timeline, then the list in the page flow.

## 11. v0.4 changes (7 Nov 2026, third review)

- **Map is land and sea only:** no country borders and no country hover. The sea is one flat colour, with no gradient. The land is painted on a canvas and redrawn sharply once per frame while you pan or zoom, so edges stay crisp and movement stays smooth. Hovering an event shows its dates, city and country.
- **Dots never overlap:** dots that would overlap at the current zoom snap onto a small hexagonal pattern centred on their group. The pattern's position and each dot's place in it move every dot as little as possible from its real location; dots with room around them stay put. Hovering a moved dot draws a dotted line to its real location (`src/lib/pack.ts`).
- **Fixed:** the first framing of the map and flying to a deep-linked event (`?e=`) didn't run. The visible map area could also wrap at the date line, which dimmed every event.
- **Hover only highlights.** Only selecting (clicking) an event scrolls the list and timeline or moves the map.
- **Timeline:**
  - continuous zoom: Ctrl/⌘ + wheel, trackpad or touch pinch, − / + buttons, plus the presets
  - no fade at the edges
  - long names are shortened (full name on hover), so more events share a row
  - rows shrink so all of them fit the box
  - in Explore, a bar between the map and the timeline resizes them (remembered; double-click resets)
  - on phones, the timeline grows to show every row
- **Cards:** an unfolded card shows only the essentials (status note, short description, organisers, official page, registration, sources). *More details* opens everything in a pop-up.
- **Filters:** only *When*, *Applications* and *Show* are open at first; the other groups start folded.
- **Design rule:** gradients mean *uncertain* (expected editions, unknown months). They are not used for decoration.


## 12. v0.5 changes (8 Nov 2026, fourth review)

- **Two layouts, one rule:**
  - **Desktop (≥ 1100 px):** a workspace that fills the window. Filters, then map + timeline, then the list. Every border can be dragged and is remembered (double-click resets; arrow keys work too). Filters and list can be hidden and stay hidden.
  - **Narrower screens:** one scrolling page (map, timeline, list).
  - The *Side by side* / *Wide map* switch is gone.
- **Fixed: list scrolling on narrow windows.** Scrolling over the list scrolled nothing: the list was still its own scroll box, which also blocked the page. It is now part of the page.
- **Details on Explore:** with the list hidden, clicking an event opens the centred pop-up (with a backdrop) instead of the side panel, and the list stays hidden.
- **The map keeps its place:** when its panel is resized or a panel is hidden, the same spot stays in the middle at the same scale.
- **Search** is compact, in the header between the logo and the view switch.
- **Online button** on the map is an on/off switch for the "online only" filter.
- **Warm colours:**
  - **Light theme:** "old paper" cream with a faint grain (one generated noise tile, no image).
  - **Dark theme:** near-black purple with orange and yellow highlights.
  - **Hover highlight:** its own `--hot` token in every view.
- **Type colours:**
  - hackathons and challenges: pink
  - summer schools: sun yellow
  - workshops: green
  - conferences: blue
  - winter schools: snow white
  - programmes and others: grey
  - Each colour has a darker edge (`--tc-edge`), so white and yellow stay visible.
- **Timeline selection:** weeks are reference labels only. Select months or days (when zoomed in), or drag. A selected month is lit to its exact first and last day in both header rows, including weeks that run across two months.
- **Desktop Explore** fills the window exactly to its bottom edge: no leftover strip and no page scroll.

## 13. v0.6 changes (8 Nov 2026, fifth review)

- **Panels instead of view tabs.**
  - The header no longer lists views. Map, timeline and list each have an expand/shrink button in their corner. An expanded panel covers the workspace, and the same button puts it back.
  - Expanded panels keep their URLs (`#/map`, `#/timeline`, `#/list`), so old links still work.
  - The logo goes back to Explore.
- **List drawer.** When the map or timeline is expanded, and on phones and narrow windows (< 1100 px), the list is a drawer from the right. It opens from *List (n)* in the header, or by itself when an event is selected, with that card unfolded. On phones the map is therefore never far away.
- **Expanded list on desktop:** 2–3 columns of cards, depending on the width.
- **Details** always open as the centred pop-up (a bottom sheet on phones), through *More details*. With the list hidden on desktop Explore, selecting an event opens it directly.
- **Search:**
  - Typing filters live.
  - Matching filter options are suggested below the box (e.g. "Ger" → Germany). Arrows or Tab move through them; Enter picks one and sets that filter exactly.
  - Enter on the text itself keeps it as a search chip (`k=` in the URL) and clears the box for the next term. An event must match all terms; Backspace in an empty box removes the last one.
  - On phones the search is a magnifier button. Tapping it opens the box across the header.
- **Map bubbles:** from about country zoom (×3.5), every dot grows into a bubble with its event-type icon. The hexagonal no-overlap grid grows with it, so spacing stays proportional to size.
- **Type icons:** each event type has an icon. It replaces the coloured dot on type labels, in the Event type filter and in search suggestions:
  - conference: speech bubbles
  - workshop: wrench
  - hackathon: code brackets
  - challenge: trophy
  - summer school: sun
  - winter school: snowflake
  - programme: book
  - meetup: people
  - career fair: briefcase
  - other: sparkle
- **Dimmed = uncertain.** Events outside the map area are no longer dimmed; *Only map area* still hides them. Expected editions are dimmed instead, in every view. On the map they are plain faint dots with no ring.
- **Removed:** the dotted "month not known" outline. Year-only events keep only the faint gradient.
- **Dark theme grain:** light-coloured grain on the dark background.
