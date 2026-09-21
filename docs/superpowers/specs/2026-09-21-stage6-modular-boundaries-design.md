# Stage 6 Modular Boundaries Design

## Purpose

Stage 6 reduces the remaining maintenance hotspots without changing behavior or public contracts. The work follows three narrow boundaries:

1. move Preferences, Settings, and Privacy UI behavior from the Sheet component into one settings editor component;
2. move pure Memory, Settings, and Sync transformations out of `store.js`, while retaining `store.js` as the public state and orchestration facade;
3. split workspace cloud calls, owner-scoped files, and archive workflows behind the existing `workspace.js` facade.

The goal is smaller responsibility boundaries, not a rewrite. Existing callers continue to use the same Store and Workspace APIs.

## Current Baseline

The remaining large files combine unrelated responsibilities:

- `miniprogram/components/sheet/index.js` is about 31 KB and handles library, settings, preferences, privacy, help, feedback, native flows, and sheet navigation.
- `miniprogram/components/sheet/index.wxml` is about 30 KB and contains the corresponding views.
- `miniprogram/components/sheet/index.wxss` is about 20 KB and contains styles for all sheet types.
- `miniprogram/utils/store.js` is about 28 KB and combines state lifecycle, persistence, memory transforms, profile/settings updates, sync queues, cloud orchestration, drafts, and notifications.
- `miniprogram/utils/workspace.js` is about 6 KB and combines cloud transport, local files, archive parsing and execution, and avatar selection.

Earlier stages already established narrower boundaries that Stage 6 must reuse:

- `profileRepository.js` owns pure profile state transformations.
- `profileSync.js` owns profile pull/push/apply orchestration.
- `avatar.js` owns avatar processing and persistence.
- `nativeFlow.js` owns native-flow cancellation and owner validation.

## Scope

### 1. Settings editor vertical slice

Create `miniprogram/components/settings-editor/` and move these sheet types into it:

- `preferences`
- `settings`
- `privacy`

The component owns their markup, minimum required styles, local draft state, refresh logic, and event handlers. It receives only the state needed to render the active settings view and emits the existing semantic outcomes:

- `close` when the view should close;
- `sheetchange` when navigation should switch to another sheet.

Behavior remains unchanged:

- Preferences keeps an editable draft and writes only on explicit Save.
- Settings toggles continue to update Store immediately.
- Privacy toggles continue to update Store immediately.
- Existing validation, localization, reduced-motion behavior, and navigation semantics remain intact.

The Sheet component remains the shell that selects the active sheet, passes Store state down, and forwards events. Component-local styles are copied only where WeChat style isolation requires them; no shared styling abstraction is introduced.

Library stays in Sheet during this stage. Its import/export controls depend directly on both Store and Workspace workflows, so extracting it at the same time would couple all three refactors. It can be reconsidered after these boundaries are stable.

### 2. Store pure-logic boundaries

`store.js` remains the only public Store facade and continues to own:

- the in-memory state closure;
- load, commit, persistence, listeners, and toast delivery;
- identity lease checks;
- cloud calls and async flight control;
- sequencing between local state, outbox state, drafts, and cloud responses;
- the current exported API.

Extract only pure transformations into three modules:

#### `memoryRepository.js`

Owns deterministic memory data operations such as normalization, validation, private-copy conversion, import merging, and list replacement/removal. It receives values and returns values; it does not read storage, call cloud functions, mutate Store state, or acquire identity leases.

#### `settingsRepository.js`

Owns settings defaults, allowed-key filtering, normalization, and merging. It does not persist settings or change the active language. `store.js` keeps the lease rule, commit, persistence, and `i18n.setLanguage` side effect.

#### `syncRepository.js`

Owns deterministic outbox and cloud-overlay transforms, including overlay application, resolvable-error predicates, and merge calculations where they can be expressed without I/O. `store.js` keeps operation ID and timestamp creation, network calls, retries, identity validation, conflict orchestration, draft cleanup, and commit order.

These are plain modules, not classes, factories, dependency-injection layers, or interfaces. Logic that cannot be made pure without introducing callback plumbing stays in `store.js`.

### 3. Workspace boundaries

Split the internal responsibilities into:

#### `workspaceClient.js`

Owns the cloud-function call wrapper, protocol checks, and lease assertion around workspace requests. It does not manage local files or archive state.

#### `workspaceFiles.js`

Owns owner-scoped workspace directory creation and file writing. Every path operation continues to require and validate the current identity lease. It does not call the cloud or interpret archive contents.

#### `archiveService.js`

Owns archive parsing, local-row conversion, creation, mutation execution, retry, pending-intent preservation, task completion, and export. It composes the client and file modules while preserving the existing operation-intent and resume behavior.

`workspace.js` becomes a compatibility facade that re-exports the existing public functions. `chooseAvatar` remains as the small adapter to the existing Avatar service because avatar work is outside the archive/client/files split and already has its own boundary.

## Public Contracts

The following contracts must not change:

- Existing `store.js` export names, return shapes, synchronous versus asynchronous behavior, and error codes.
- Existing `workspace.js` export names and task/archive payload formats.
- Existing sheet names and `close`/`sheetchange` behavior.
- Store storage keys, persisted data shapes, draft formats, outbox formats, and cloud record shapes.
- Identity lease checks and owner scoping for cloud, workspace, and file operations.

Call sites should not need to know which internal module performs a transformation.

## Data and Control Flow

### Settings UI

1. Sheet selects one of the three settings-related sheet types.
2. Sheet renders the settings editor and passes the current Store-backed values.
3. The editor keeps only the draft state required by the active view.
4. Save or toggle handlers call the existing Store facade methods.
5. Store notifications refresh the parent state, which flows back to the editor.
6. The editor emits `close` or `sheetchange`; Sheet retains navigation ownership.

### Store

1. A caller invokes the unchanged Store facade.
2. `store.js` performs lease checks and orchestration.
3. The relevant repository calculates a next value without side effects.
4. `store.js` commits once, preserving persistence and notification order.
5. Async cloud work and failures remain visible through the existing result and error contracts.

### Workspace

1. A caller invokes the unchanged Workspace facade.
2. Archive service validates the business operation and captures the owner lease.
3. Workspace client performs cloud requests using that lease.
4. Workspace files performs owner-scoped local writes using that lease.
5. Pending intent is kept or cleared at the same points as today.

## Error Handling and Security

- Trust-boundary validation stays mandatory for archive input, cloud results, storage data, and file paths.
- Identity leases must be asserted before and after lease-sensitive asynchronous work where the current behavior requires it.
- No module may weaken owner scoping or fall back to a global workspace path.
- Error codes and user-visible messages remain compatible.
- Logs and diagnostics must not expose archive contents, profile data, tokens, or local paths.
- A failed extraction must leave the current persisted data readable by the previous commit; no migration is introduced in this stage.

## Testing Strategy

Each boundary is implemented test-first:

1. Add the smallest focused failing check for the behavior being moved.
2. Move only enough code to make it pass.
3. Run the existing related verifier before starting the next slice.

Coverage must demonstrate:

- Preferences still saves only on explicit Save, while Settings and Privacy still apply immediately.
- Sheet navigation and close events are unchanged.
- Pure Store repositories reject or normalize the same edge cases as the current facade.
- Store facade exports and persistence/notification order remain compatible.
- Workspace facade exports, archive parsing, owner-scoped writes, pending-intent retry, and task export remain compatible.
- Identity changes during lease-sensitive operations still fail safely.

Prefer extending existing verifiers such as `verify-sheet-edits`, cloud, and workspace checks. Add a new focused verifier only when an extracted pure module cannot be covered clearly through an existing one. No new test framework or duplicate harness is introduced.

After each slice, run its focused checks. At stage completion, run the repository verification command and compare any failure with the documented baseline. The existing fresh-diary restore failure is not part of Stage 6 and must not be misreported as a new regression.

## Implementation Order

1. Extract the settings editor and verify UI event compatibility.
2. Extract Store pure transformations one repository at a time: Settings, Memory, then Sync.
3. Split Workspace into client, files, and archive service behind its facade.
4. Run the full verification suite and inspect the final diff for accidental contract or schema changes.

This order establishes the UI boundary before changing its data helpers, then leaves the most identity- and I/O-sensitive split until the pure Store seams are stable.

## Migration and Rollback

No data migration is required because persisted schemas and public payloads do not change.

Each slice remains separately reviewable and revertible. Since callers continue through the Store and Workspace facades, rolling back an extracted module restores the prior internal implementation without changing caller code or stored data.

Stage 7, not this stage, owns storage schema migration, obsolete API removal, compatibility-branch cleanup, and rollback verification for those changes.

## Non-Goals

- No Store schema or storage-key changes.
- No cloud protocol, cloud function, archive format, or record-shape changes.
- No public Store or Workspace API removal.
- No UI restyling, wording changes, or navigation redesign.
- No photo cleanup-policy changes.
- No Library extraction while it still spans Store and Workspace workflows.
- No classes, factories, service container, event bus, or new dependency.
- No cleanup assigned to Stage 7 unless it is strictly required to preserve behavior during extraction.

## Completion Criteria

Stage 6 is complete when:

- Preferences, Settings, and Privacy behavior and markup are owned by `settings-editor`, with Sheet acting as the shell.
- Memory, Settings, and Sync pure transformations are owned by focused repository modules, while `store.js` remains the compatible state/orchestration facade.
- Workspace client, owner-scoped files, and archive workflows are separated behind the compatible `workspace.js` facade.
- Existing public contracts, storage shapes, cloud payloads, and identity guarantees are unchanged.
- Focused verifiers pass and the full verification result has no regression beyond the documented baseline failure.
- The diff contains no speculative abstraction or unrelated cleanup.
