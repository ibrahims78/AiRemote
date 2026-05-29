---
name: AiRemote UI System
description: Theme/language system for AiRemote dashboard — how dark/light mode and AR/EN i18n work
---

**Theme system:**
- Dark mode = default (no class on `<html>`)
- Light mode = `html.light` class applied
- CSS overrides in `index.css` handle all light-mode color changes globally; no per-component changes needed
- Store: `uiStore.ts` (Zustand) with key `airemote-ui` in localStorage; auto-applies on module load via IIFE
- Toggle: Moon/Sun icon in DashboardLayout header and LoginPage/SetupPage

**Why:** Tailwind `darkMode: 'class'` requires a `.dark` class by convention, but AiRemote flips it: dark is the default, light is the override. The `html.light` class triggers CSS variable overrides that invert all the dark tokens.

**i18n system:**
- Full AR/EN dictionary in `lib/i18n.ts` with `T.ar` and `T.en` objects
- `useT()` hook — reactive via `useUIStore(s => s.lang)` — returns a translator function `(key: TKey) => string`
- `t(lang, key)` utility for non-component use
- All 9 pages use `useT()`: LoginPage, SetupPage, OverviewPage, DevicesPage, SessionsPage, UsersPage, AiPage, DeviceWorkspacePage, SettingsPage
- DashboardLayout sidebar also uses `useT()` for nav labels

**Critical gotcha:** `useT()` MUST use `useUIStore` hook directly (reactive). Using `localStorage.getItem()` or `require()` inside the function breaks reactivity and crashes in Vite ESM environment.

**Sidebar:**
- Mobile: fixed position + CSS `translateX` for slide-in (RTL-aware: LTR uses `-100%` closed, RTL uses `100%` closed)
- Desktop: `w-60` open / `w-16` collapsed with transition
- RTL: `dir="rtl"` on `<html>` when lang=ar; sidebar moves to right side automatically via `end-0` / `start-0` CSS logical props

**How to apply:** When adding new pages, import `useT` from `../lib/i18n`, call `const t = useT()` at top of component, add new keys to both `T.ar` and `T.en` in `i18n.ts`, use `t('key')` for all user-visible strings.
