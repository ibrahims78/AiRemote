---
name: AiRemote JWT Migration
description: @fastify/jwt replaced with custom jsonwebtoken plugin due to Replit firewall blocking fast-jwt
---

# AiRemote JWT Migration

## The Rule
Use `jsonwebtoken` + custom Fastify plugin instead of `@fastify/jwt`.

**Why:** Replit's package firewall blocks `fast-jwt` 3.x and 4.x (HTTP 403). `@fastify/jwt` v7–v8 all depend on `fast-jwt`, making it unusable. `jsonwebtoken` (9.x) is accessible.

**How to apply:** The custom plugin lives at `packages/server/src/plugins/jwt.ts`. It exposes the same API:
- `fastify.jwt.sign(payload, opts?)` — signs a JWT
- `fastify.jwt.verify(token)` — verifies and decodes
- `request.jwtVerify()` — verifies the Bearer token in the Authorization header and sets `request.user`

Register in `app.ts` as `jwtPlugin` (imported from `./plugins/jwt`) with `{ secret, sign: { expiresIn } }`.

No changes needed to routes or middleware — the API surface is identical to `@fastify/jwt`.
