# Project i18n locations

- `src/i18n.ts`: translation IDs, `t`, structured messages/errors, locale resolution, and test-ticket text.
- `src/App.tsx`: renderer-facing text uses `tr`; structured status/discovery/error values use `translateMessage`.
- `src/main.ts`: tray menu, native dialogs, and IPC test printing use the active Electron locale.
- `src/core/server.ts`, `src/core/discovery.ts`, `src/core/printer.ts`: logic must emit IDs plus parameters, never localized prose.
- `tests/bridge.test.ts`: API error objects, configuration, and locale resolution coverage.

For a new error, prefer `new BridgeError("semantic_error_id", { ...params })`. The server serializes it as a stable API object and the renderer translates it.
