# Developer tools access — setup

Phase 125.0. How to reach the Developer Hub at `/dev`, and why it is gated
the way it is.

## On this machine (laptop)

```
npm run dev
```

Then open **http://localhost:5173/dev**.

Nothing to configure. A request from the loopback address is the developer's
own machine, so it is allowed through without a token.

## From your phone (or any other device on the network)

The dev server does not listen on the network unless you ask it to:

```
npm run dev -- --host
```

On start, the terminal prints a block like this:

```
  PRO·ORDER developer tools
  ─────────────────────────
  this machine:  http://localhost:5173/dev
  phone / LAN:   http://192.168.1.XXX:5173/dev?key=…
  token file:    .dev-access-token (gitignored — delete it to rotate)
```

Open the `phone / LAN` link on the phone **once**. The server swaps the
`?key=` for an `HttpOnly` cookie and redirects to a clean `/dev`, so the
token stops appearing in the address bar, history and referrers. After that
the phone just uses `http://192.168.1.XXX:5173/dev`.

The token is written to `.dev-access-token` the first time the server starts
and reused afterwards, so restarting the dev server does not invalidate the
link already open on your phone.

**To rotate it:** delete `.dev-access-token` and restart. A new one is
generated and the old cookies stop working.

## What is actually protected, and what is not

The gate runs in the Vite dev server (`dev-server/devAccess.js`), before any
HTML is handed over:

| Request | Result |
|---|---|
| `/dev` from loopback | allowed |
| `/dev` with a valid cookie | allowed |
| `/dev?key=<valid>` | sets the cookie, redirects to `/dev` |
| `/dev` from the network, no token | **404** |
| `/dev?key=<wrong>` | **404** |
| `/__dev-access` without authorisation | **403** |
| everything else (`/`, customer QR, admin, kitchen) | untouched |

404 rather than 403 for the page, so an unauthorised visitor does not learn
that `/dev` is a real route on this server.

The Hub also asks `/__dev-access` before it renders anything. That closes the
single-page-app hole: someone on the network can load the product at `/`,
receive the whole bundle, and then navigate to `/dev` entirely client-side
without the server seeing it. A route check inside the bundle could not stop
that; the fetch can, because only the server knows whether the caller is
authorised.

### This is not authentication

It protects a development tool on a development server. It is deliberately
not a login system, and it has nothing to do with the Admin, Cashier or
Kitchen permissions, which this phase did not touch.

The token travels over plain HTTP on a local network. It keeps the person at
the next table out of the reset buttons. It is not protection against someone
who can already watch your traffic, and it is not meant to be.

### What never contains the token

- the client bundle (it is read by the dev server in Node, never by React)
- `import.meta.env` / any `VITE_*` variable (Vite inlines those into
  client JavaScript)
- version control (`.dev-access-token` is gitignored)
- any log line except the banner printed on your own terminal

## In production

None of this runs. `devAccess` is an `apply: "serve"` plugin, so it has no
build hooks at all, and the `/dev` route is registered behind
`import.meta.env.DEV`, which Vite replaces with the literal `false` at build
time. The route is never registered and the Hub module is tree-shaken out.
Verified by grepping `dist/` after a build.

Opening `/dev` on a production build gives the ordinary "This page isn't
available" screen, exactly like any other unknown address.
