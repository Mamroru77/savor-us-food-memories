# AGENTS.md — Savor WeChat Mini Program

WeChat DevTools is a SPECIALIZED TOOL SURFACE, not a generic GUI task.
Native DevTools automation MUST be attempted before Computer Use.

Stable repository rules for any AI agent or developer working in this repo.
**Status, dates and TODOs do NOT belong here** — they live in `docs/README.md` and `docs/handoff/`.

## What this repo is

A WeChat Mini Program (`miniprogram/`) plus six CloudBase functions (`cloudfunctions/`).
Production source of truth is the **local working tree**, never the remote branch.

## Non-negotiable rules

1. **Never commit, push, or deploy unless the user explicitly asks in that turn.**
   Authorization is per-request and never extends to later turns.
2. **Never advance a review/registration hash without explicit approval.**
   The checkpoint chain is a review record, not a build artifact.
3. **Never weaken a verification suite to make it pass.** If a gate is red, either fix the cause
   or report the exact expected red (suite + file + reason) and stop.
4. **Never rewrite git history**, never `git stash` (this is a `blob:none` partial clone), and never
   force-push.
5. **Distinguish evidence classes explicitly**: IMPLEMENTED / STATICALLY VERIFIED / SIMULATOR-VERIFIED /
   REAL-DEVICE-VERIFIED / VISUALLY APPROVED / CHECKPOINT-REGISTERED / CLOSED. They are not
   interchangeable. Simulator output is never hardware evidence.
6. **Do not cosmetically reopen a frozen page.** Each frozen page has a documented reopen condition;
   see `docs/README.md` §2 (frozen page matrix).
7. **Deletion requires proof**: no runtime / test / checkpoint / generator / current-doc reference,
   and the content must be reproducible or clearly obsolete. Prefer archiving over deleting.

## Architecture boundaries

- `miniprogram/pages/**` — five primary tabs (home, map, add, us, me) plus secondary pages.
  A page's `.js` holds page logic; `.wxml`/`.wxss` are its frozen UI surface.
- `miniprogram/components/**` — shared UI primitives. Most are **not** in the frozen UI manifest.
- `miniprogram/utils/**` — all data and platform access. Pages must not call CloudBase directly.
- `miniprogram/vendor/**` — vendored runtime (morphicons-core). Do not edit.
- `cloudfunctions/**` — server side; every function enforces identity server-side.
- `tools/**` — verification suites, generators, checkpoint JSON. **Never shipped.**

## Source-of-truth rules

- **Localization**: edit `tools/lib/locale-translations.tsv` (EN ⇥ ZH), then run
  `npm run build:locales`. Never hand-edit `miniprogram/utils/locales.js`.
  Note: `i18n.t()` matches on `row.en` **or** `row.zh`, so a CJK literal that exists as a `zh` value
  still resolves correctly — verify before claiming a "Chinese leak".
- **Icons**: official Lucide SVG → `miniprogram/images/icons/lucide/<name>.svg` → add `url` + `sha256`
  to `tools/assets/icons/lucide/SOURCES.json` → `node tools/build-icons.cjs`.
  Never hand-edit `utils/icons.js`, `utils/lucideMorphNodes.js` or `tools/_gen/icons.json`.
  Never add bitmaps, emoji, hand-drawn paths, or a second icon library.
- **Generated files** (regenerate, never hand-edit): `miniprogram/utils/icons.js`,
  `miniprogram/utils/lucideMorphNodes.js`, `miniprogram/utils/locales.js`, `tools/_gen/icons.json`.

## Testing requirements

- Static gate: `npm run verify` (must be EXIT 0).
- Full gate: `npm run verify:all`.
- On this Windows machine, suites that spawn child processes need
  `NODE_OPTIONS="--require <abs path>/.workbuddy-ai/scratch/map-perf/node-sync-stdin-shim.cjs"`
  (absolute path required). Do not "fix" this by editing tests.
- New behavioural gate ⇒ must be proven RED first, then GREEN.

## Frozen UI reopening rules

- Only reopen the **exact** affected frozen surface, and report PAGE / CURRENT STATE / PROPOSED
  AFFORDANCE / EXACT FILES / WHY JS-ONLY CANNOT SOLVE IT **before** editing.
- After changing a frozen `wxml`/`wxss`, the registration chain goes red **by design**.
  Do not advance it — return visual evidence and wait for approval.
- A frozen page's registered hash lives in `tools/<page>-*-review.json`; the chain is verified by
  `npm run verify:cloud`.

CORRECTION — WECHAT DEVTOOLS TOOL ROUTING

For this Savor project, do NOT use Computer Use to inspect or screenshot
WeChat Developer Tools when the dedicated WeChat DevTools automation
channel is available.

For WeChat DevTools work, use this priority order:

1. Dedicated WeChat DevTools / mini-program automation capabilities
   - simulator_screenshot
   - automation_runtime_info
   - automation_evaluate
   - automation_element_action
   - automation_viewport_action
   - simulator_refresh
   - other existing simulator_* / automation_* capabilities exposed by
     the current environment

2. Existing project CLI / DevTools automation scripts.

3. Only if the dedicated DevTools channel is genuinely unavailable:
   report exactly which capability is unavailable.

DO NOT fall back to Computer Use merely because the task involves a GUI
window.

Computer Use is not the normal inspection path for this repository.

Important distinction:

- simulator_screenshot = WeChat DevTools simulator evidence.
- It is valid for simulator UI/layout/state inspection.
- It is NOT real-device hardware evidence.

For REAL-DEVICE QA:
- first check whether an actual Android/iOS device bridge is available;
- if no real-device bridge is available, keep that item UNVERIFIED and
  ask the user for the minimum required phone interaction/screenshots;
- never substitute a DevTools simulator screenshot or Computer Use
  screenshot for real-device evidence.