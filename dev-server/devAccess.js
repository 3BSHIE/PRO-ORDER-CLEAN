import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";

/**
 * devAccess — Phase 125.0. The gate in front of the Developer Hub.
 *
 * ── WHY THIS IS A SERVER PLUGIN AND NOT A REACT GUARD ────────────────────
 * `import.meta.env.DEV` answers "is this a development BUILD?". It does not
 * answer "is the person asking for this allowed to have it?". Those are
 * different questions, and they come apart the moment the dev server is
 * reachable at anything other than localhost — `npm run dev -- --host`, a
 * tunnel, a hosted preview. On a café or office network, everyone on the
 * LAN can reach it.
 *
 * A route check inside the bundle cannot help there, because by the time it
 * runs the visitor already has the bundle. So the decision is made here, in
 * the dev server, before anything is handed over:
 *
 *   • a request from the loopback address is the developer's own machine
 *     and passes without ceremony;
 *   • anything else needs the token, once, after which a cookie carries it;
 *   • everything else gets a 404 — the same answer any unknown path gets,
 *     so the gate does not advertise that there is something behind it.
 *
 * ── WHAT IT IS NOT ───────────────────────────────────────────────────────
 * This protects a DEVELOPMENT TOOL on a DEVELOPMENT SERVER. It is not
 * authentication, it is not a session system, and it has nothing to do with
 * the Admin/Cashier/Kitchen permissions, which are untouched. The token
 * travels over plain HTTP on a local network: it keeps the person at the
 * next table out of the reset buttons, and it is not a secret worth
 * protecting from someone who can already watch the traffic.
 *
 * The token lives in a gitignored file beside the project, never in the
 * bundle, never in an import.meta.env variable (Vite inlines those into
 * client JavaScript), and never in a log line other than the one printed
 * for the developer on their own terminal.
 */

const TOKEN_FILE = ".dev-access-token";
const COOKIE = "po_dev";
/* Long enough that guessing is hopeless, short enough to retype from a
   terminal onto a phone if the QR-less path is ever needed. */
const TOKEN_BYTES = 24;

/** The hub itself, plus the endpoint the hub asks before it renders. */
const GUARDED = /^\/(dev)(\/|$|\?)/;
const CHECK_PATH = "/__dev-access";

function loadOrCreateToken(root) {
  const file = resolve(root, TOKEN_FILE);
  if (existsSync(file)) {
    const existing = readFileSync(file, "utf8").trim();
    if (existing) return existing;
  }
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  /* Written, not just held in memory, so restarting the dev server does not
     invalidate the link already open on the developer's phone. */
  writeFileSync(file, token + "\n", { encoding: "utf8", mode: 0o600 });
  return token;
}

/** Constant-time compare that cannot throw on a length mismatch. */
function tokenMatches(given, expected) {
  if (typeof given !== "string" || given.length !== expected.length) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Is the TCP connection itself from this machine?
 *
 * Read from the socket and never from a header, because X-Forwarded-For is
 * whatever the client typed and proves nothing about who they are.
 */
function isLoopbackSocket(req) {
  const addr = req.socket?.remoteAddress || "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

/* Headers that only ever appear when something forwarded this request.
   ngrok, cloudflared, localtunnel and every ordinary reverse proxy set at
   least one. */
const FORWARD_HEADERS = [
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "forwarded",
  "x-real-ip",
  "cf-connecting-ip",
  "fly-client-ip",
];

/**
 * Does this request look like it came through a proxy or tunnel?
 *
 * ── THIS IS NOT TRUSTING THE HEADER ──────────────────────────────────────
 * Nothing here reads WHO the header claims the client is. It reads only
 * that a forwarding header is PRESENT, and uses that to withdraw a
 * privilege. The asymmetry is what makes it safe: a visitor who adds
 * X-Forwarded-For can only lock themselves out, never in. There is no value
 * an attacker can put in these headers that grants anything.
 */
function looksForwarded(req) {
  return FORWARD_HEADERS.some((h) => req.headers[h] !== undefined);
}

/**
 * May this request skip the token because it came from this machine?
 *
 * ── THE HOLE THIS CLOSES ─────────────────────────────────────────────────
 * A public tunnel — ngrok, cloudflared, a reverse proxy — runs ON the
 * developer's machine and connects to the dev server over localhost. So
 * every visitor it forwards arrives with a loopback socket address. Phase
 * 125.0 treated a loopback socket as proof of being the developer, which
 * means anyone holding the tunnel's public URL inherited the Developer Hub.
 *
 * Two independent defences, because neither is sufficient alone:
 *
 *   · the forwarding-header check above catches the tunnels people actually
 *     use, automatically, with no configuration;
 *   · strict mode catches everything else, including a bespoke proxy that
 *     strips its own headers — a case no server-side heuristic can detect,
 *     which is exactly why it has to be a decision the developer makes
 *     rather than one this file guesses.
 *
 * Nothing here claims to detect every proxy. That is the point of strict
 * mode existing, and of the banner saying so out loud when the server is
 * exposed.
 */
function canSkipToken(req, strict) {
  if (strict) return false;
  if (looksForwarded(req)) return false;
  return isLoopbackSocket(req);
}

/* Opt-in, read from the environment so it can be set per-run without
   editing anything tracked. Deliberately NOT a VITE_ variable: those are
   inlined into client JavaScript, and this is a server-side decision. */
function readStrict(env) {
  const raw = String(env.PRO_ORDER_DEV_STRICT ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** Every LAN address this machine answers on, for the printed links. */
function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}

export default function devAccess() {
  let token = "";
  let printed = false;
  let strict = false;

  return {
    name: "pro-order-dev-access",
    /* serve only: this plugin has no build hooks, so nothing it does can
       reach a production bundle. */
    apply: "serve",

    configResolved(config) {
      token = loadOrCreateToken(config.root);
      strict = readStrict(process.env);
    },

    configureServer(server) {
      /* Printed once, after the server prints its own banner, so the
         developer can copy the phone link straight out of the terminal. */
      const printBanner = () => {
        if (printed) return;
        printed = true;
        const port = server.config.server.port ?? 5173;
        const exposed = Boolean(server.config.server.host);
        const hosts = lanAddresses();
        const lines = [
          "",
          `  PRO·ORDER developer tools${strict ? "  [STRICT]" : ""}`,
          "  ─────────────────────────",
          /* In strict mode even this machine needs the token, so the link
             printed for it carries one — the laptop stays a single click. */
          strict
            ? `  this machine:  http://localhost:${port}/dev?key=${token}`
            : `  this machine:  http://localhost:${port}/dev`,
        ];
        if (hosts.length) {
          for (const h of hosts) {
            lines.push(`  phone / LAN:   http://${h}:${port}/dev?key=${token}`);
          }
          lines.push("                 (open once; the browser keeps it)");
        } else {
          lines.push("  phone / LAN:   start with `npm run dev -- --host` to enable");
        }
        lines.push(`  token file:    ${TOKEN_FILE} (gitignored — delete it to rotate)`);

        if (strict) {
          lines.push("");
          lines.push("  Strict mode: every /dev request needs the token, including");
          lines.push("  ones arriving over localhost. Use this for tunnels and proxies.");
        } else if (exposed) {
          /* The honest warning. Forwarded requests are already refused the
             loopback shortcut, but a proxy that strips its own headers is
             not detectable here, and the developer must not read "exposed
             and quiet" as "exposed and safe". */
          lines.push("");
          lines.push("  ! This server is exposed on the network. Requests from this");
          lines.push("    machine still skip the token. If you put a PUBLIC TUNNEL in");
          lines.push("    front of it, start with PRO_ORDER_DEV_STRICT=1 — see");
          lines.push("    dev-server/README.md.");
        }
        lines.push("");
        server.config.logger.info(lines.join("\n"));
      };
      server.httpServer?.once("listening", () => setTimeout(printBanner, 60));

      server.middlewares.use((req, res, next) => {
        const url = req.url || "";
        const path = url.split("?")[0];
        const isCheck = path === CHECK_PATH;
        if (!isCheck && !GUARDED.test(url)) return next();

        const query = new URLSearchParams(url.split("?")[1] || "");
        /* The token always works. The loopback shortcut is the only part
           that can be withdrawn, and canSkipToken decides that. */
        const authorised =
          tokenMatches(readCookie(req, COOKIE), token) ||
          tokenMatches(query.get("key"), token) ||
          canSkipToken(req, strict);

        if (!authorised) {
          if (isCheck) {
            res.statusCode = 403;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ok: false }));
            return;
          }
          /* 404, not 403: an unauthorised visitor should not learn that
             /dev is a real route on this server. */
          res.statusCode = 404;
          res.setHeader("content-type", "text/plain; charset=utf-8");
          res.end("Not found");
          return;
        }

        if (isCheck) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.setHeader("cache-control", "no-store");
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        /* A valid ?key= is exchanged for a cookie and removed from the URL,
           so the token stops travelling in link text, history and referrers
           after the first visit. httpOnly because no client code needs to
           read it — the hub asks the SERVER whether it is allowed. */
        if (query.has("key")) {
          res.setHeader(
            "set-cookie",
            `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`,
          );
          query.delete("key");
          const rest = query.toString();
          res.statusCode = 302;
          res.setHeader("location", path + (rest ? `?${rest}` : ""));
          res.end();
          return;
        }

        next();
      });
    },
  };
}
