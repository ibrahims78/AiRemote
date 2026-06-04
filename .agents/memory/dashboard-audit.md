---
name: AiRemote Dashboard Audit
description: Full professional audit of all dashboard pages — bugs found and fixed across i18n, data correctness, and UI direction handling
---

## Audit Summary

### Round 1 (prior session)
- i18n: 44 new translation keys added to i18n.ts
- AuditPage, NotificationsPage, SessionsPage, DashboardLayout: fully i18n'd
- DeviceWorkspacePage: 8 RDP bugs fixed, version unified to 3.0.0
- All pages: TypeScript zero errors confirmed

### Round 2 (this session) — bugs found and fixed

**Bug 1 — CRITICAL data: DevicesPage hostname column showed `tunnelLayer`**
- `d.tunnelLayer || 'relay'` was shown under the column header `t('hostname')`
- Fixed: `d.info?.hostname || '—'`

**Bug 2 — i18n: WolModal 5 hardcoded Arabic strings**
- Success/fail/network-error messages, "اختياري" label, submit button text
- Fixed: added keys wol_sending/wol_send/wol_success/wol_fail/wol_network_error/wol_optional to i18n.ts, WolModal now uses useT()

**Bug 3 — i18n: AgentInstallModal hardcoded Arabic instruction**
- "انسخ القيمتين أعلاه..." was hardcoded Arabic paragraph
- Fixed: new i18n key `agent_install_hint`

**Bug 4 — UI direction: SettingsPage API key eye button `left-3`/`pr-10`**
- Eye toggle button was always at LTR end, broken in English (LTR) mode
- Fixed: `left-3` → `end-3`, `pr-10` → `pe-10` (logical CSS properties)

**Bug 5 — UI direction: GitHubRelease token eye button same issue**
- Fixed: same `end-3`/`pe-10` correction

**Bug 6 — i18n: AiChatPanel QUICK_PROMPTS all Arabic**
- Renamed to QUICK_PROMPTS_AR + QUICK_PROMPTS_EN bilingual arrays
- `buildSuggestions()` now takes `isAr` parameter

**Bug 7 — i18n: AiChatPanel welcome text all Arabic**
- "مرحباً!" and description paragraphs hardcoded
- Fixed: bilingual using `isAr` (already available via useUIStore)

**Bug 8 — i18n: SettingsPage 5 inline isAr? not using T() keys**
- theme label, lang label, WS URL label+hint, section titles (Download Agent, Publish GitHub)
- Fixed: new i18n keys, all use T()

### i18n keys added (Round 2)
wol_sending, wol_send, wol_success, wol_fail, wol_network_error, wol_optional,
agent_install_hint, download_agent, publish_github, theme_label, lang_label,
ws_url_label, ws_url_hint — all in both ar and en sections of i18n.ts

### .npmrc note
Added `confirm-module-purge=false` to root .npmrc to prevent pnpm TTY prompt on workflow start.
