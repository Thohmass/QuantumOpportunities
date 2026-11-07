# Design vision

Status: captured 6 Nov 2026 from Tomáš · §1 is in v0.1; §2–3 come after the MVP.

## 1. One connected picture (built in v0.1)

The point of the site is **connecting information in one picture**: where, when and what at a glance.

- **Linked views.** On a PC, the map, the timeline and the list are visible **at the same time** (Explore). On a phone the views are tabs.
- **Cross-highlighting.** Hovering (or focusing) an event anywhere — list card, timeline bar, map marker — highlights it **everywhere**, so you immediately see when and where it is.
- **The map viewport is a lens.** Zooming and panning focuses a continent, region, country or city. Events outside the visible map area are **dimmed** in the timeline and list; *Only map area* hides them instead. Online events are never dimmed by the map.
- **Time selection on the timeline.** Click a **month**, **week** or **day**, or **drag** across any period; the selection becomes the date filter, shades the timeline and clears in one click.
- **Zooming is the most important map feature:** smooth zoom from world to city (clusters were dropped in v0.3; overlapping dots snap onto a hexagonal pattern since v0.4).

**v0.2 additions:** colour = event type in every view; texture = status; deadlines joined to events by lines; file-manager style time selection with gaps; selected events unfold inline in the list and focus the map and timeline; a "Wide map" layout to compare with "Side by side".

**v0.3–v0.4 additions:**
- Our own minimal map: land and sea only, with no clusters. Dots that would overlap snap onto a hexagonal pattern, placed so that each dot moves as little as possible from its real location.
- Hover only highlights; only clicking moves other views.
- The timeline zooms continuously, and its height can be shared with the map.
- **Gradients mean uncertainty.** They mark expected editions and unknown months. Decorative fades and gradient backgrounds are avoided, so the signal stays clear. Texture for the sea or land (pattern, noise) is welcome later.

## 2. Visual identity (after the MVP, Tomáš leads)

- A real-proportions map, but with curves, lines, colours and shapes from the project's own identity rather than a stock basemap.
- Round edges, texture and gradients.
- **Every colour and shape means something** (status, type, confidence, urgency), consistently across map, timeline and list.
- The styling already runs on design tokens (CSS variables in `src/styles.css`), so the identity can be applied in one place.

## 3. Quantum lore Easter eggs (after the MVP, Tomáš's creative decision)

- Ideas such as a Bloch sphere that changes state while data loads.
- Not designed or added by agents unless Tomáš specifies them.
