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
 * Is this request coming from the machine running the dev server?
 *
 * Deliberately read from the SOCKET and not from a header: X-Forwarded-For
 * is whatever the client typed. A proxy in front of the dev server would
 * therefore read as non-local and need the token, which is the safe way for
 * this to be wrong.
 */
function isLoopback(req) {
  const addr = req.socket?.remoteAddress || "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
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

  return {
    name: "pro-order-dev-access",
    /* serve only: this plugin has no build hooks, so nothing it does can
       reach a production bundle. */
    apply: "serve",

    configResolved(config) {
      token = loadOrCreateToken(config.root);
    },

    configureServer(server) {
      /* Printed once, after the server prints its own banner, so the
         developer can copy the phone link straight out of the terminal. */
      const printBanner = () => {
        if (printed) return;
        printed = true;
        const port = server.config.server.port ?? 5173;
        const hosts = lanAddresses();
        const lines = [
          "",
          "  PRO·ORDER developer tools",
          "  ─────────────────────────",
          `  this machine:  http://localhost:${port}/dev`,
        ];
        if (hosts.length) {
          for (const h of hosts) {
            lines.push(`  phone / LAN:   http://${h}:${port}/dev?key=${token}`);
          }
          lines.push("                 (open once; the browser keeps it. needs --host)");
        } else {
          lines.push("  phone / LAN:   start with `npm run dev -- --host` to enable");
        }
        lines.push(`  token file:    ${TOKEN_FILE} (gitignored — delete it to rotate)`);
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
        const authorised =
          isLoopback(req) ||
          tokenMatches(readCookie(req, COOKIE), token) ||
          tokenMatches(query.get("key"), token);

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
