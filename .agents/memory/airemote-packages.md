---
name: AiRemote Package Structure
description: Build order and dependency rules for the AiRemote monorepo workspace packages
---

**5 workspace packages:**
1. `@airemote/shared` — types only, no build needed at runtime
2. `@airemote/ai-engine` — must be built (`npm run build`) before server can import it
3. `@airemote/server` — depends on shared + ai-engine; build with `npm run build` in server dir
4. `@airemote/agent` — standalone Node.js agent
5. `@airemote/dashboard` — React SPA, Vite dev server

**Build order for server:** shared (no build) → ai-engine (`npm run build`) → server (`npm run build`)

**Adding ai-engine to server:** Add `"@airemote/ai-engine": "workspace:*"` to server's package.json dependencies, then run `pnpm install` from the `airemote/` root.

**Why:** The TypeScript compiler in the server package needs the compiled `dist/` output of ai-engine to resolve types. Just adding workspace:* without building ai-engine first causes "cannot find module" errors.

**Recharts Tooltip typing:** Use `TooltipProps<ValueType, NameType>` from recharts types. Import `ValueType, NameType` from `recharts/types/component/DefaultTooltipContent`.
