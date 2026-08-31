# Plane

A gamified habit tracker built around six modules. It runs in the browser on
your phone and your laptop, installs to the home screen, works offline, and
keeps every byte of data on the device it was entered on.

You open it once a day, tap into a module, and log what you did. The dashboard
tells you what is asking for attention.

## The six modules

| # | Module | What it tracks |
|---|--------|----------------|
| 1 | **Abitos Tax Prep** | Client projects, their stage (not started → filed), due dates and per-project task lists. |
| 2 | **Bryce Tax Planning** | The weekly target of 50 S-corp outreach contacts, with a running counter, the per-day pace needed to still hit it, an 8-week history, and a deal pipeline. |
| 3 | **Spanish** | One-tap links out to italki and Babbel, a session stopwatch, and minutes logged per day — daily goal, weekly goal, and total hours over time. |
| 4 | **Fitness** | The weekly quotas — 3 MMA, 4 lifting/calisthenics, 12 sessions total (leaving 5 flexible for running or basketball) — plus half-marathon build tracking and an AI coach that can see the whole log. |
| 5 | **Finances** | Monthly budget vs. actual by category, CSV import, vendor rules, and a review queue that asks what a charge was actually for. |
| 6 | **Life Coach** | Goals, a daily mood/energy check-in, and a conversation that has every other module's numbers in front of it. |

Logging anything earns XP, which drives a level, a daily streak and twelve
badges.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
npm run typecheck  # tsc only
npm run lint       # oxlint
npm run icons      # regenerate the PWA icons from scripts/make-icons.mjs
```

`dist/` is a plain static bundle with a relative base, so it can be dropped on
GitHub Pages, Netlify, S3 or any static host with no server configuration.

### Installing it on your phone

Open the deployed URL in Safari or Chrome and use *Add to Home Screen*. It then
launches standalone, and the service worker keeps it working offline.

## Where your data lives

Everything is written to this browser's `localStorage` behind a
`StorageAdapter` interface (`src/lib/storage.ts`). Nothing is uploaded and there
are no accounts.

That means **data does not sync between your phone and your laptop.** To move it,
use *Settings → Export JSON* on one device and *Import JSON* on the other. When
you want real sync later, the swap is a second implementation of
`StorageAdapter` — the UI and the reducer do not change.

If the browser blocks site data (private windows, some privacy settings), the
app falls back to an in-memory adapter and says so in Settings, rather than
silently losing writes.

## The AI features

Three things call Claude: the fitness coach, the life coach, and turning
"$40 snorkel gear, $70 running shoes" into two budget line items.

They need your own Anthropic API key, pasted into *Settings*. It is stored only
in this browser's local storage and is sent only to `api.anthropic.com`. The
request goes straight from the page to the API via the official SDK
(`@anthropic-ai/sdk`) with `dangerouslyAllowBrowser`, so there is no server in
the middle — and no server to run.

Without a key, both coaches still answer: they fall back to built-in advice
computed from your actual logged numbers, and the split editor still works by
hand.

Get a key at [console.anthropic.com](https://console.anthropic.com). Calls are
billed to your own account.

## How the finance review queue works

Vendor rules map a substring of the vendor name to a category — `whole foods`
→ Groceries, `butcherbox` → Meat. The longest matching pattern wins, so
`uber eats` beats `uber`.

Vendors that can be anything (Amazon, Target, Venmo, Costco) are flagged
**always ask**: they get a suggested category but stay unreviewed, so they land
in the Review tab where the app asks what the charge was for. One charge can
split across several categories, and the split — not the raw amount — is what
the budget bars and category totals use.

## Layout

```
src/
  lib/          date maths, storage adapter, schema + migrations,
                gamification, finance rules & CSV parsing, Anthropic client
  state/        app context, and the derived stats every screen reads
  components/   charts (ring, bars, sparkline, budget bars), UI primitives,
                layout, the shared chat panel
  modules/      one file per module, plus the dashboard and settings
  styles/       design tokens, base, components, charts
scripts/        PNG icon generator (no image dependencies)
```

Charts are hand-built from SVG and real elements — no charting library. The
categorical palette is validated for colour-vision deficiency in both light and
dark mode; every mark that needs it carries a visible text label rather than
relying on colour alone.
