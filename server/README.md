# The push server

Everything the app cannot do on its own: hold a push subscription and wake the
phone when something is due. About 200 lines, one table, no framework.

## What it knows about you

It stores an endpoint for your browser, and a list of times. That is all — the
`wakes` table is a device id and an integer, with no room for anything else.

Pushes are sent **with no payload**. When one lands, the service worker on your
phone reads the wording out of IndexedDB — written there by the app, never
uploaded — and shows the notification. So this server, its logs, its database,
and Apple's or Google's push service in the middle all learn one thing: that
*something* was due at *some* time. Never what, never which module, never a
name.

The trade is that a push cannot say anything the device does not already know.
That is the right way round.

## Deploying it (Cloudflare, free tier, no card)

```bash
cd server
npx wrangler login

# 1. The database
npx wrangler d1 create plane-push          # copy the id it prints
#    paste that id into wrangler.toml, then:
npx wrangler d1 execute plane-push --remote --file=./schema.sql

# 2. The VAPID keys — printed once, pasted straight into the secrets below
node -e "import('./push.mjs').then(async m => console.log(await m.generateVapidKeys()))"
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY

# 3. Ship it
npx wrangler deploy
```

Then set `ALLOWED_ORIGINS` in `wrangler.toml` to wherever the app is served
from, and paste the Worker's URL into the app under *Settings → Notifications
with the app closed*.

On an iPhone this only works once the app is on the home screen — Safari does
not allow web push from a tab. Add to Home Screen first, then turn it on from
inside the installed app.

## Two things worth knowing about the endpoint

`/subscribe` only accepts an endpoint belonging to a real push service —
Google's, Mozilla's, Apple's or Microsoft's, over https, never an IP literal.
Without that check the Worker would be an open request forwarder: anyone who
found its URL could register any address as their "endpoint" and have the Worker
fetch it from Cloudflare's egress. `/test` returns a status and never the push
service's response body, for the same reason.

## Running the tests

```bash
node test-push.mjs     # encryption against the RFC 8291 test vector
node test-worker.mjs   # the routes and the cron, against an in-memory D1
```

`test-push.mjs` is the one that matters: RFC 8291 fixes the salt and both key
pairs, so the encrypted output is reproducible byte for byte. If it passes, the
bytes on the wire are right.

## What is not covered by any test here

The browser's own `pushManager.subscribe`, and whether Apple's push service
accepts a payload-less push in practice. Neither can be checked without a real
device. Everything on either side of them is tested.

## Cost

Cloudflare's free tier covers Workers, D1 and cron. One person's reminders are
a few hundred rows and a few thousand requests a month, which is far inside it.
