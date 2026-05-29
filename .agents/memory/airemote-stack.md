---
name: AiRemote Stack Constraints
description: Critical environment constraints and library choices for AiRemote project in Replit Nix sandbox
---

**Rule:** Never use `better-sqlite3` — it requires native compilation which fails in the Nix sandbox. Use `@libsql/client` (LibSQL) instead.

**How to apply:** All DB layer functions must be async and use `await db.execute({ sql, args })` pattern.

**Why:** Replit's Nix sandbox cannot compile native Node.js addons at runtime. `@libsql/client` is pure JS and works without native builds.

---

**Rule:** `pino-pretty` must be listed as an explicit production dependency, not just a dev dependency.

**Why:** The server imports it at runtime via pino transport config; it must be in the production bundle.

---

**Rule:** `systray2` version must be `^2.1.4` or higher (not `^1.2.1` which doesn't exist on npm).

---

**Rule:** TypeScript `FastifyRequest.user` requires `as unknown as AuthTokenPayload` cast because Fastify's JWT plugin doesn't type the user property automatically.
