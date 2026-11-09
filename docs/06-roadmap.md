# Roadmap after the MVP

Status: 6 Nov 2026 · rough order, to be re-prioritised with real usage.

## v0.2 — Identity and polish
- Visual identity (07-design-vision §2): stylised real-proportion map, round shapes, texture, gradients; every colour and shape carries meaning.
- Tomáš's quantum Easter eggs (07-design-vision §3).
- Real feedback address; custom domain if wanted.

## v0.3 — Stay informed without accounts
- **Calendar feeds (.ics)** per event and per filtered view ("subscribe to this search"); calendar apps pick up date changes automatically.
- **Atom/RSS feeds** for new and updated events, also per filter.
- Saved filters, favourites and a "my deadlines" view in the browser.

## v0.4 — Watch an event
Pick an event with unknown info and get notified when its data changes: per-event feeds first (no personal data); email notifications via a small service only if people ask for them.

## v0.5 — Channel and newsletter
Weekly digest generated from merged data PRs (new events, newly confirmed editions, deadlines in the next 14 days) as a page, an email newsletter and/or a Telegram/Discord channel.

## v0.6 — Contributions
Submission form on the site (form service → issue), contributor guide, email intake.

## Accounts and a social layer (vision, 7 Nov 2026, from Tomáš)

Accounts would make personal features easier and enable social ones:
- **Personal:** favourites, "not interested" (hides an event for you; a filter switch shows everything again), saved filter presets you apply with one button, default filters, notification and newsletter settings.
- **Social:**
  - who is interested in, watching or going to an event, so people team up and go together
  - after an event: ratings and reviews, which give a reputation to recurring series and organisers (e.g. "past IonQ events rated well")
  - winners of hackathons, with shout-outs, special Easter-egg awards and a mention in the newsletter

**Suggested order** (to discuss):
1. The personal features without accounts first: favourites, "not interested" and presets kept in the browser (presets can also be shared as links).
2. Per-event alerts.
3. Accounts, then the social layer once enough people use the site that "who's going" isn't empty.

**What accounts bring with them:**
- a backend and sign-in, which ends "static, no server"
- personal data under GDPR
- moderation for reviews: in a small community a review can identify a person or an organiser

## Proposals parked for later (9 Nov 2026, from Tomáš)

Discussed and wanted; not started. Each needs an issue approved by the owner first (new dependencies, a workflow and/or a schema change, per CLAUDE.md).

### 1. Watches and email notifications (the most important missing feature)
- **What:** people sign up with an email, set up their own watches and get a digest of changes.
  - Sign-in: magic link first, passkeys added on top. No passwords.
  - Watches: any filter or search (types, topics, organisations, cities, countries, continents…). A watch is the filter address the site already makes, so a "Watch this search" button can sit on any view.
  - Schedule: the user picks the frequency, the weekday and the time of day.
- **Pieces:**
  1. **Change feed:** every data run records what changed (new event, dates confirmed, deadline added, registration opened, cancelled). This is useful on its own as a "What's new" view and an Atom feed.
  2. **Small backend:** for example Cloudflare Workers with its database, or Supabase. It stores emails, watches and schedules, and an hourly job sends the digests that are due, each with a one-click unsubscribe.
  3. **Email sending:** an email service on a custom domain (mail from a `github.io` address tends to land in spam).
- **Needs:**
  - **Owner decisions:** the hosting provider (leaning Cloudflare), a domain, and an email service account.
  - **Privacy (EU users):** a privacy page, double opt-in, deleting the account, and storing only email + watches + schedule.
- **Shared with:** the interest signals (proposal 4) can use the same backend.

### 2. Pictures for cities, countries and organisations
- **Where:** in the opened card, the small card and the full details. Not on folded cards, so the list stays quick to scan.
- **Sources (not legal advice):**
  - **Wikimedia Commons:** free licences, but check each file's licence, and most need a credit line (author + licence).
  - **Unsplash:** no attribution needed for photos downloaded by hand. Its API requires hotlinking and credit.
  - **Own photos.**
  - **Never** pictures copied from event or company websites.
- **Scope:** about one photo per city, about 50 in all, stored with its credit next to it. Organisations are harder, because logos are trademarks; photos of their buildings from Commons are an option.
- **Weight:** small WebP thumbnails, loaded lazily, within the size budget.
- **Schema:** image + credit fields. Agents fill them only with a source and a licence.

### 3. Partners, sponsors and who will be there
- **What:** a list of companies per event with their role (sponsor, partner, hardware or platform provider, mentors from…), each with a source.
  - It becomes a "Companies" filter and a section in the event details.
  - The agents can read most of it from the "Sponsors" sections of event pages. "Who will be there" is patchier.
- **Logos (not legal advice):** showing a sponsor's logo to state accurately that it supports an event is generally accepted, as long as it doesn't suggest the company endorses this site. Logos can still be protected, so the safe route is official press-kit logos used as the brands' guidelines allow. Start with names only.
- **Schema:** a `partners` list referencing organisations.

## Before v1.0

- **Guided tour:** a short walkthrough of the less obvious features (multi-select months with Shift/Ctrl, dragging dates, the map as a lens, search suggestions, gestures). Built last, once the layout has settled (Tomáš, 8 Nov 2026).

## Later
Jobs, PhD positions, internships, grants (deadline-first views); PWA/offline; trends page; embeddable widget (e.g. for the QIS student board); translations; dev agents (Lynote's Developer + Reviewer).
