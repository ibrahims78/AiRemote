---
name: AiRemote Fastify Multipart Version
description: @fastify/multipart version compatibility constraint for this project's Fastify 4.x setup
---

## Rule
Always use `@fastify/multipart@8` — never install the latest version blindly.

## Why
This project uses Fastify 4.29.x. `@fastify/multipart@9+` requires Fastify 5.x and throws `FST_ERR_PLUGIN_VERSION_MISMATCH` at startup, killing the server immediately.

Attempted `pnpm add @fastify/multipart` (installed v9) → server crashed.
Fixed by: `pnpm add "@fastify/multipart@8"`.

## How to apply
Any time `@fastify/multipart` is added or upgraded, pin to `^8.x.x`. If Fastify itself is upgraded to 5.x in the future, then multipart can be upgraded too.
