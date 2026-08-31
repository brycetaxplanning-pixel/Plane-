# Tests

End-to-end, driven through the real UI in a real browser. There is no unit layer
under them on purpose: what is worth protecting here is behaviour, not
functions — that an import cannot double a month, that a failed write is
visible, that a wake schedule uploads timestamps and nothing else.

```bash
npm run build      # the suites run against the production build
npm test           # all of them
npm test health    # just the ones whose filenames match
npm run test:server  # the Worker and the push encryption, no browser needed
```

The runner starts `vite preview` itself, waits for it, runs each suite in its
own process, and reports which failed. A production build is used rather than
the dev server because the service worker only registers in one, and three
suites pull the network out to check what happens offline.

## What is deliberately not covered

Two things cannot be checked without a real device, and are called out here
rather than left to be discovered:

- the browser's own `pushManager.subscribe`, which headless Chromium refuses
  outright — everything on either side of that call is covered by `push.mjs`
- whether iPhone Safari accepts a payload-less push in practice

## Adding one

Copy the shape of any existing file: collect failures into `problems`, print
`PASS` / `FAIL` lines as you go, and exit non-zero at the end. The runner picks
up any `.mjs` in this directory automatically.

Write the assertions as sentences about behaviour rather than about the DOM —
`ok('a night that crosses midnight counts on the day you woke up')` says what
broke when it fails, which is the point of the line.
