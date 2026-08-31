# Plane

A gamified habit tracker built around eleven modules. It runs in the browser on
your phone and your laptop, installs to the home screen, works offline, and
keeps every byte of data on the device it was entered on.

You open it once a day, tap into a module, and log what you did. The dashboard
tells you what is asking for attention.

## The eleven modules

| # | Module | What it tracks |
|---|--------|----------------|
| 1 | **Abitos Tax Prep** | Client projects, their stage (not started → filed), due dates and per-project task lists. |
| 2 | **Business** | One tab per business — Bryce Tax Planning and the flaxseed gel line ship as the two examples, and you can add more. Each keeps its own weekly outreach target (the 50 S-corp contacts, the per-day pace needed to still hit it, an 8-week history) and its own deal pipeline; set a target of zero and the counter disappears for a business that does not do outreach. Plus a numbered **idea list**, where "Help me start it" turns an idea into first actions you can tick off. |
| 3 | **Spanish** | One-tap links out to italki and Babbel, a session stopwatch, minutes logged per day — and an **AI tutor you talk to out loud**, built for a commute. It listens, replies in Spanish, speaks it back, corrects one thing at a time, and logs the time when you stop. |
| 4 | **Fitness** | A weekly plan you build from pills: lock in the things that happen every week (4 lifts, 3 MMA), and the remainder become open slots you fill however you like. Locked lines carry over on Monday; one-off lines don't. Plus half-marathon tracking, physique goals with measurements, and an AI coach that can see the whole log. |
| 5 | **Finances** | Monthly budget vs. actual by category, CSV import, vendor rules, a review queue that asks what a charge was actually for, a **Saving** tab where a preset goal fills in what it can from your own spending and then says plainly whether the date is affordable, and an **Invest** tab that projects your accounts forward with sliders for horizon, return and monthly contribution. |
| 6 | **Habits** | Daily and weekly habits with green / yellow / red status. Green is done, yellow is one miss, red is two or more in a row — with a "days since" count and an escalating nudge whose bluntness you set. |
| 7 | **Goals** | One visual card per goal: a picture, what it costs, and how you get there. Fields adapt to the kind of goal — a purchase asks for a price, a training goal asks for a window in weeks. |
| 8 | **Notes** | Journal entries, to-do lists and everything you'd otherwise put in your phone's notes app. Talk a note in without typing. |
| 9 | **Life Coach** | Three tabs. A daily mood/energy check-in; an **Analysis** tab that finds patterns in your own log and adds up whether the week fits in the hours that exist; and a conversation in one of three modes — Coach, Sounding board or Straight talk. |
| 10 | **Health** | The logbook side of the body, kept apart from training: food and protein against a daily target, weight, sleep, resting heart rate and blood pressure over time, and blood panels typed in by hand. A marker is compared against the range printed on your own report and reported as inside or outside it — nothing here interprets a result, and nothing syncs from a watch or a lab yet. |
| 11 | **Dating** | Who you are seeing and what it costs: spend per outing and per night together, per person and overall, and this month's dating spend against your budget. It asks for a first name or initials and nothing else — no surname field, no number field — because it is the one module holding data about someone who never agreed to be in it. |

Home is a grid of big module buttons — one press each. Logging anything earns
XP, which drives a level, a daily streak and fourteen badges, and checking a
task off plays one of eighteen animations.

## What the analysis does and does not claim

The Analysis tab aggregates every module into weekly columns and compares
them. A finding like *"in the 6 weeks where fitness sessions reached 10 or
more, client tasks finished averaged 6.8; across the other 4 weeks it averaged
3.5"* is a median split over your own log, and the sample size is printed
under every one.

It deliberately refuses to say more than that:

- Findings are descriptive. One person's self-reported log cannot establish
  that one thing causes another, so nothing here says it does.
- Both halves of a split need at least three weeks, and the gap has to be at
  least a third before anything is reported.
- Two metrics are only compared over the span where **both** were being
  tracked. Without this, anything started recently correlates with everything
  else that happened recently — every earlier week reads as a zero.
- A metric that is mostly zeros inside its own window, or a driver that barely
  moves, is skipped rather than reported.

At most one finding is raised unprompted, at most once a day, and dismissing
one retires it for good. All of it can be switched off in Settings.

## The Spanish tutor

Press start and talk. It uses the browser's speech recognition to hear you,
sends the turn to Claude with a brief written for the ear — no markdown, no
lists, expect mistranscribed words — and speaks the reply back through the
device's own Spanish voice. Corrections come back as one short English line,
at most one per turn, and can be spoken aloud too. Time is logged to Spanish
automatically when you end the session.

It needs two things the browser may not have: speech recognition (Chrome and
Safari, not Firefox) and an installed Spanish voice. Both are checked up front
and named if missing, rather than failing silently mid-sentence.

## Talking instead of typing

Every long text field has a microphone, and Notes and Ideas have a
press-and-talk panel that captures a whole thought hands-free. It uses the
browser's own speech recognition — no key, no upload, nothing to configure.

Support is uneven and the app is explicit about it: Chrome and Safari have it,
Firefox does not, and some in-app browsers refuse. Where it's missing the
microphone simply isn't offered and typing works as normal.

## Tracker

A cross-module view, so it has no data of its own and sits with Progress and
Settings rather than in the numbered modules.

**Timeline** puts everything with a date on it — client projects, deal next
steps, goal dates, the race, reminders — on one week or five-week view, empty
days included so the shape of the week is visible. Anything already past gets
its own section at the top.

**Reminders** come in two shapes, because they answer different questions. A
dated one fires on a date. An interval one fires a number of days after you
last did the thing — "27 days since the last haircut, due every 21" — so it
drifts with reality instead of nagging on a calendar you already fell off.
Marking one done resets its clock rather than deleting it.

Say a reminder out loud and it is parsed into structure: title, date, time and
repeat, with today's date supplied so "Thursday" resolves. Export produces a
`.ics` file with proper repeat rules, which is the only way to put something
into Apple Calendar — Apple has no calendar API for third-party apps. Each
reminder also has a one-click Google Calendar link.

## Notifications

The app raises things on its own: a habit two days into a slip, a client
project past its date, a deal's next step landing today, the outreach pace
falling behind mid-week, a race approaching, transactions piling up
uncategorised, and the strongest finding from the analysis.

- Each condition has a stable key, so opening the app three times in a day
  never raises the same thing three times.
- A worsening habit escalates at widening intervals — 2 days, 3, 5, 7, 10 —
  rather than nagging every morning.
- Unread items flag their own module on the launcher, so you can see from the
  home screen which one wants you.
- The bell in the header opens the last ten on hover, with the full log a click
  away. Opening one marks it read and deep-links to the right tab.

**Device alerts only fire while the app is open.** An alert that reaches you
with the app closed needs a server holding a push subscription and signing
messages; a static site cannot do it. External sources — a saved search for a
car, say — will feed the same log once there is a backend to run them; the
notification record already carries a `href` field for that.

## Enlightenment

Meet every daily habit every day, and every weekly habit, Monday to Sunday,
and the next time you open the app it says so. You wear 🧘 beside your name for
the following week and lose it if you don't repeat. It's the only award of its
kind on purpose — a row of five badges means nothing.

## Keyboard and screen readers

Audited rather than assumed, and four things were broken.

Eight tab rows carried `role="tab"` without keeping the contract that role
makes — no arrow keys, every tab a separate tab stop, and no panel to point at.
A row that announces itself as tabs and then does not behave like them is worse
than plain buttons. They now share one component with a roving tabindex, arrow,
Home and End keys, and `aria-controls` wired to a real `role="tabpanel"`. The
one row that was never really tabs — the timeline's week / five-weeks switch,
which shows the same region over a different span — says what it is instead:
toggle buttons with `aria-pressed`.

Dialogs did not trap focus, so tabbing walked out into the page behind, and did
not give focus back on close. Both fixed, with the opener captured during render
because by the time effects run an autofocused field has already taken it.

There was no skip link past the fourteen-item nav, and the launcher — the one
page with no header — had no `h1` at all.

## Themes

Seven skins: Classic (which follows your light/dark setting) plus Neon Miami,
Arcade Brawler, Shinobi, Deployment, Ringworld and Late Night Set. They can
rotate automatically every 24 hours. They are original colour schemes, not
licensed artwork — each one's eight module colours were run through the palette
validator against that skin's own surface, so charts stay readable whichever
skin is up.

Late Night Set puts a cat on the decks above the launcher: an SVG drawn in this
repo, animated in CSS, with an optional four-on-the-floor loop synthesised in
the browser from oscillators and filtered noise. It only starts when you press
play, there is no audio file anywhere in the app, and nothing is fetched to
draw or play it. `prefers-reduced-motion` holds the whole thing still.

## Getting health data in

The Body tab imports from a file, so a watch's history does not have to be
retyped:

- **CSV** — Garmin Connect, Whoop, a spreadsheet of your own. The header row is
  read and each column guessed, and you correct the guesses before anything is
  saved.
- **Apple Health** — on the iPhone, *Health → your picture → Export All Health
  Data*. Unzip it and pick `export.xml`. Weight, resting heart rate, blood
  pressure, sleep and dietary protein and calories are pulled out; everything
  else is ignored. The file is streamed rather than read whole — a 99 MB export
  parses in about a second and never holds more than a chunk in memory.

Bloodwork takes a paste instead of typing: select the results table out of the
lab's PDF or website, paste it in, and Claude transcribes it into rows — name,
value, unit and the range as printed — which you check and correct before
saving. It is asked to copy what is printed and not to interpret anything or
invent a range the report does not show. Without an API key the button says so
and the by-hand path is unchanged.

Two rules hold for both file imports. Numbers are stored exactly as the file wrote them —
nothing is converted between pounds and kilos, and the unit is whichever you set
under Targets. And an import fills gaps rather than overwriting: anything you
typed by hand survives unless you tick the box, and the number of clashes is
shown before you decide. Everything is read on the device; no file is uploaded.

## Backups, and why you need them

Everything lives in one browser's localStorage. That is what makes the app work
offline with no account, and it is also the whole risk: clearing your browsing
data wipes it, losing the phone takes it, and Safari evicts storage for sites
you have not opened in about a week.

Goal photos are the one thing that used to threaten that budget on its own — a
data URL is a hundred kilobytes or so, and a handful of them was most of the
five megabytes. They now live in IndexedDB, which has orders of magnitude more
room, and the state keeps only an id. A backup is still one self-contained file:
the photos are inlined on the way out and put back on the way in, so the file's
shape has not changed and an older backup still imports. An older save with its
photos still inline is lifted into the store the first time it loads.

There is one more failure mode underneath those: the storage can simply fill
up. When a write fails, a banner comes down and stays until a write succeeds —
because what is on screen is then ahead of what is stored, and the previous
version of this dropped that on the floor, so the change looked saved and was
gone on the next reload. The banner names the parts using the most space, and
its backup button reads straight off state rather than through the storage that
just failed.

Settings also has a Backups card that says all of that plainly, downloads a dated
JSON file in one tap, records when you last did it, and starts saying so after a
fortnight — in the card and in the notification log. It also asks the browser to
mark the storage persistent, which exempts it from routine eviction, and reports
whether the browser agreed rather than assuming it did.

## Notifications with the app closed

Everything else in this app works with no server. This does not, and cannot:
a push has to be sent by something that stays awake. `server/` holds that
something — a Cloudflare Worker, one table, deployable in four commands, well
inside the free tier. `server/README.md` has them.

It is built so that the server learns as little as possible. Pushes are sent
**with no payload**; when one lands, the service worker reads the wording out of
IndexedDB on the device and shows the notification from there. What goes up is a
list of timestamps — no titles, no module names, no record ids — so the server,
and the push service in the middle, know that something was due and never what.

The encryption is written from scratch on WebCrypto and checked against the test
vector in RFC 8291 §5, which fixes the salt and both key pairs: the output is
reproducible byte for byte. Two things are untested here and cannot be tested
without a real device — the browser's own `pushManager.subscribe`, and whether
iPhone Safari accepts a payload-less push in practice.

On an iPhone, add the app to the home screen first: Safari does not allow web
push from a tab.

## Putting it on a phone

The app is a static bundle with no server behind it, so any static host will do.
A GitHub Actions workflow (`.github/workflows/deploy.yml`) is already committed:
it lints, typechecks, builds and publishes to GitHub Pages on every push.

To turn it on, once, in the browser:

1. Repo → **Settings** → **Pages**
2. **Build and deployment → Source: GitHub Actions**

The next push publishes to `https://<owner>.github.io/<repo>/`. Open that on a
phone and use *Add to Home Screen* — Settings has a card with the steps for
whichever browser you are in, and offers a one-tap install where the browser
supports it.

Installed, it is a real offline app: the shell is cached on first visit, and the
other screens are fetched quietly in the background a couple of seconds after
the launcher paints (skipped on 2G or with Data Saver on), so a module you have
never opened still works with no signal. Only the launcher is in the first
chunk — about 93 kB of JavaScript rather than the 728 kB it was before the split
— and the Anthropic SDK is fetched only when something actually calls Claude.

Safe-area insets are paid on all four sides, so nothing sits under a notch or a
home bar in either orientation.

Your data stays in that browser. Two devices are two separate copies until there
is a backend; *Settings → Export* moves a snapshot between them by hand.

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

Five things call Claude: the fitness coach, the life coach, turning
"$40 snorkel gear, $70 running shoes" into two budget line items, the sharper
follow-up questions on a saving goal, and transcribing a pasted lab report into
blood markers.

They need your own Anthropic API key, pasted into *Settings*. It is stored only
in this browser's local storage and is sent only to `api.anthropic.com`. The
request goes straight from the page to the API via the official SDK
(`@anthropic-ai/sdk`) with `dangerouslyAllowBrowser`, so there is no server in
the middle — and no server to run.

Without a key, both coaches still answer: they fall back to built-in advice
computed from your actual logged numbers, the split editor still works by
hand, and every saving goal still comes with the preset's own questions.

Get a key at [console.anthropic.com](https://console.anthropic.com). Calls are
billed to your own account.

## How a saving goal is checked

A preset picks the shape of the goal and, where your own data can answer it,
the amount: the emergency fund suggests three times your average logged month,
business runway six times, moving out three times your Housing spend. The
average is taken over the last three *complete* months, so a month that is two
days old does not read as a cheap one.

The balance is the sum of its deposits — there is no second stored figure to
disagree with them. From that:

- **the date needs** — what is left, divided by the months left;
- **lands** — when it arrives at what you are actually putting in, to the month,
  because a specific day would be false precision;
- **the verdict** — on pace, short by an amount, or the maths works but the
  month does not.

That last one is the point. If every goal's monthly amount adds up to more than
take-home minus an average month of spending, the app says so and names your
biggest movable categories with what halving one would free. It needs a
take-home figure to do it; without one it says the figure is unknown rather
than inventing a number.

Nothing here connects to a bank. Take-home is typed in, deposits are logged by
hand, and the spending it is checked against is whatever you imported.

## Getting transactions in

No US bank publishes an API an individual can sign up for, so the free route is
the file your bank already offers.

- **QFX / OFX** — the "Download for Quicken" button. Prefer this one: it carries
  the bank's own transaction ids, so re-importing a month that overlaps the last
  one cannot double anything. Both dialects are read, the old SGML with its
  unclosed tags and the newer XML.
- **CSV** — Bank of America, Chase, Amex and Capital One shapes all work as
  downloaded. The header row is found rather than assumed, because BofA puts a
  balance summary above it. The sign convention is read off the data rather than
  a list of banks: Chase and BofA write spending as negative, Amex writes every
  charge as positive, and whichever sign is in the majority is the spending.
  Payments, refunds and deposits are left out — this is a spend log.

Nothing is imported twice. A row already in the log is recognised by the bank's
id where there is one, and otherwise by date, vendor and amount together; the
count of each is shown before you commit.

If the monthly download gets old, an aggregator can do it automatically.
SimpleFIN Bridge is about $15 a year and built for exactly this; Teller has a
free developer tier. Both would run through the Worker in `server/`, since a
browser cannot call a bank directly. Plaid's production pricing is sales-led and
the wrong shape for one person.

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
