# Developer tools access

How to reach the Developer Hub at `/dev`, from your laptop and from your
phone — and what the protection does and does not cover.

---

## 1. On this machine (laptop)

```
npm run dev
```

Open **<http://localhost:5173/dev>**.

Nothing to configure. A request from this machine is allowed through without
a token, so starting the project and opening the Hub is one step.

## 2. From your phone (same Wi-Fi)

The dev server does not listen on the network unless you ask it to:

```
npm run dev -- --host
```

The terminal then prints:

```
  PRO·ORDER developer tools
  ─────────────────────────
  this machine:  http://localhost:5173/dev
  phone / LAN:   http://192.168.1.XXX:5173/dev?key=…
                 (open once; the browser keeps it)
  token file:    .dev-access-token (gitignored — delete it to rotate)
```

Open the **phone / LAN** link on the phone **once**. The server swaps the
`?key=` for a cookie and redirects to a plain `/dev`, so the token stops
appearing in the address bar, history and referrers.

After that the phone just uses `http://192.168.1.XXX:5173/dev`. The cookie
lasts 30 days and survives restarting the dev server.

> Your laptop and phone must be on the same network, and the printed address
> is the one to use — not `localhost`, which on the phone means the phone.

## 3. Public tunnels and reverse proxies — read this

If you put **ngrok, cloudflared, localtunnel or any reverse proxy** in front
of the dev server, start it in **strict mode**:

```
PRO_ORDER_DEV_STRICT=1 npm run dev -- --host
```

PowerShell:

```
$env:PRO_ORDER_DEV_STRICT=1; npm run dev -- --host
```

### Why this matters

A tunnel runs **on your machine** and connects to the dev server over
localhost. Every visitor it forwards therefore arrives looking like a
loopback connection — like you. Without strict mode, the "requests from this
machine skip the token" convenience would hand your Developer Hub, including
the reset buttons, to anyone holding the public URL.

### What protects you

**Automatically:** requests carrying forwarding headers
(`X-Forwarded-For`, `X-Forwarded-Host`, `cf-connecting-ip`, and the rest)
never get the loopback shortcut, even over localhost. Every tunnel in common
use sets at least one, so the usual case is covered with no configuration.
Nothing *reads* those headers to decide who you are — their presence only
ever takes a privilege away, so adding one can lock you out but never in.

**With strict mode:** the loopback shortcut is switched off entirely. Every
`/dev` request needs the token, including ones from this machine. The banner
prints `[STRICT]` and the localhost link carries a key, so your laptop is
still one click.

### What is not covered

A proxy that **strips its own forwarding headers** is indistinguishable from
you at the socket level. No server-side check can detect it. That case is
exactly why strict mode is an explicit switch rather than something this
plugin tries to guess — **if traffic from outside your network can reach the
dev server, turn strict mode on.** A quiet terminal is not evidence of
safety.

When the server is exposed with `--host` and strict mode is off, the banner
says so and points here.

## 4. Same tab or new tab

The Hub has an **"Open in a new tab"** checkbox, remembered for the browser
session.

- **Off (default):** destinations open in the Hub's tab. Browser **Back**
  returns to the Hub.
- **On:** destinations are ordinary links with `target="_blank"`, so the
  browser opens a tab and the Hub stays where it is. The new tab gets no
  `window.opener` and sends no referrer.

Sessions are per tab (`sessionStorage`), so a surface opened in a new tab
starts its own customer/staff/kitchen session. That is usually what you want
when comparing two roles side by side; it also means signing in again in the
new tab.

Navigating between surfaces never clears stored data. Only the **Danger
zone** buttons do, and each asks twice.

## 5. Rotating the token

```
rm .dev-access-token      # PowerShell: Remove-Item .dev-access-token
npm run dev
```

A new token is generated and printed. Cookies issued from the old one stop
working.

## 6. Where the token is never written

- the client bundle — it is read by the dev server in Node, never by React
- `import.meta.env` or any `VITE_*` variable (Vite inlines those into
  client JavaScript)
- version control — `.dev-access-token` is gitignored
- any log line except the banner on your own terminal

## 7. In production

None of this runs:

- `devAccess` is an `apply: "serve"` plugin, so it has no build hooks
- the `/dev` route sits behind `import.meta.env.DEV`, which becomes the
  literal `false` at build time, so the route is never registered and the Hub
  module is tree-shaken out of the bundle

Opening `/dev` on a production build gives the ordinary "this page isn't
available" screen, like any other unknown address.

## 8. What this is, and what it is not

It protects a **development tool on a development server**. It is not a
login system, and it has nothing to do with the Admin, Cashier or Kitchen
permissions.

The token travels over plain HTTP on a local network. It keeps the person at
the next table out of your reset buttons. It is not protection against
someone who can already watch your traffic, and it is not meant to be.

---

### Reference

| Request | Default | Strict |
|---|---|---|
| `/dev` from this machine | allowed | **token required** |
| `/dev` from this machine, forwarded headers present | **refused** | **refused** |
| `/dev` from the LAN, no token | refused | refused |
| `/dev?key=<valid>` | cookie + redirect | cookie + redirect |
| `/dev` with a valid cookie | allowed | allowed |
| `/dev?key=<wrong>` | refused | refused |
| `/__dev-access` unauthorised | `403` | `403` |
| `/`, customer, admin, kitchen | untouched | untouched |

Refused means **404**, not 403 — so an unauthorised visitor does not learn
that `/dev` is a real route.
