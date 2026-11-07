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

## Later
Jobs, PhD positions, internships, grants (deadline-first views); PWA/offline; trends page; embeddable widget (e.g. for the QIS student board); translations; dev agents (Lynote's Developer + Reviewer).
