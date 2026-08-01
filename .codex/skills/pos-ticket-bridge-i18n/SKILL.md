---
name: pos-ticket-bridge-i18n
description: Enforce stable translation IDs for every user-visible text added or changed in POS Ticket Bridge. Use when modifying React UI, Electron menus/dialogs, test tickets, discovery/status messages, API errors, or any human-readable application text.
---

# Pos Ticket Bridge I18n

## Overview

Use `src/i18n.ts` as the only catalog of user-visible text. Support both `es` and `en` for every new ID.

## Required workflow

1. Classify the text.
   - UI, Electron tray/native dialogs, and test tickets: resolve the active language and call `t(language, id, params)`.
   - Renderer: use the component's `tr(id, params)` helper.
   - Domain logic, discovery, diagnostics, and HTTP responses: return `BridgeMessage` objects through `message(id, params)` or throw `BridgeError(id, params)`; never return localized prose.
2. Add a semantic, stable `snake_case` ID to `TranslationKey` and both `es`/`en` dictionaries in `src/i18n.ts`. Use parameters such as `{ printerId }`, never string interpolation in logic.
3. Render structured messages in the UI with `translateMessage(language, value)`.
4. Preserve API error shape: `{ ok: false, error: { code, params? } }`. Do not make API response text depend on the selected language.
5. Add or update focused tests for a new behavior or error code, then run `npm test` and `npm run lint`.

## Rules

- Do not hardcode Spanish or English user-facing prose outside `src/i18n.ts`.
- Do not translate product names, protocol fields, printer names, URLs, ports, or other user data.
- Keep technical causes in diagnostics/logs; expose their stable code to the UI/API.
- When adding a special-case text path, read [references/project-locations.md](references/project-locations.md) first.

