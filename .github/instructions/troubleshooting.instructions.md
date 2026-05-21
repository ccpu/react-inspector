---
description: React Inspector extension workflow and troubleshooting playbook for runtime source-resolution issues.
applyTo: "src/**/*.ts"
---

# React Inspector Workflow

## Goal

- When an element is inspected, always resolve the most useful source location and open it in the editor.
- Prefer app source files first.
- Fall back to library or story files only when app source is unavailable.

## Runtime Debugging Process

1. Reproduce the issue on the exact URL provided by the user.
2. Identify runtime type:

- Next/Turbopack app
- Storybook Vite iframe
- Storybook Webpack iframe

3. Use MCP browser/runtime probing to verify:

- `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` shape
- Fiber availability on DOM nodes (`__reactFiber$...` keys)
- Presence/absence of `_debugSource`
- Presence of `_debugStack`
- Availability and format of source maps

4. If source maps fail, test all map forms:

- External `.map`
- Sectioned maps (FlattenMap required)
- Inline `sourceMappingURL=data:application/json;base64,...`

5. For Storybook iframes, resolve current story via `index.json` and `id` query param.
6. Validate with `npm run build` after each meaningful change.

## Source Resolution Priority

1. `fiber._debugSource` on current element
2. Stack-based mapping from `_debugStack`
3. Parent DOM traversal and owner-chain traversal
4. Storybook fallback by story id
5. node_modules fallback only if no app/story file exists

## Storybook Rules

- Detect iframe mode by pathname ending in `/iframe.html` and query params `id` + `viewMode`.
- Use `index.json` for `entries[id].importPath`.
- For Vite Storybook:
- Support `/@fs/...` path normalization.
- Try `@storybook/builder-vite/storybook-stories.js` import map when needed.
- For Webpack Storybook:
- Use `main.iframe.bundle.js.map`.
- If absolute paths are missing from `sources`, scan `sourcesContent` for absolute path hints.
- Derive project root from `/node_modules/` split and resolve relative story import paths.

## Interaction Safety

- Inspector selection must never trigger the page element action.
- Consume selection event at capture phase:
- call `preventDefault` when cancelable
- call `stopPropagation`
- call `stopImmediatePropagation` when available
- Use pointer-based selection events to avoid click-through behavior.

## Code Organization Rules

- Keep files domain-focused and small.
- Use `src/utils/` modules by concern:
- react fiber detection
- path normalization
- source-map resolution
- Storybook fallback resolution
- high-level debug-source resolver
- editor-link formatting
- Keep `src/utils.ts` as a thin barrel for stable imports.
- Avoid duplicated regex, path parsing, or fallback logic.

## Error Messaging

- If React DevTools is not running, show explicit guidance to install/enable and refresh.
- If React is not detected, say that clearly.
- If element-specific mapping fails, give a short fallback message and still attempt Storybook-level resolution before alerting failure.

## Validation Checklist (Run Every Time)

1. `npm run build`
2. Verify at least one Next/Turbopack URL.
3. Verify at least one Storybook Vite iframe URL.
4. Verify at least one Storybook Webpack iframe URL.
5. Confirm inspected button click does not trigger underlying page action.
