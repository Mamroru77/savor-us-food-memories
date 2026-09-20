# ProfileEditor Extraction Design

## Purpose

Extract Profile editing from the shared Sheet component without changing user-visible behavior. This is the first implementation stage of the avatar and Profile refactor described in the 2026-09-20 read-only audit.

Success means the existing Profile flow behaves exactly as it does at commit `fb00388`: selecting an avatar creates a persistent local preview, Save atomically commits the Profile, closing discards unsaved edits, identity changes invalidate stale work, and existing failures remain visible without leaking private paths.

## Current Baseline

The current Profile implementation lives inside `miniprogram/components/sheet/index.*`. The component also owns ten other sheet types, shell animation, sizing, memory and library behavior, settings, help, and identity recovery.

The current automated baseline is:

- `node tools/verify-avatar-persistence.cjs`: 23 of 23 checks pass.
- `node tools/verify-sheet-edits.cjs`: 22 of 22 checks pass.
- `npm run verify:all`: 316 of 317 initial checks pass, then stops at the pre-existing fresh-diary restore assertion because the fixture expects seven seeded memories while `initialMemories` is empty.

The unrelated restore failure is baseline evidence, not part of this stage.

## Scope

Create a native mini-program component at `miniprogram/components/profile-editor/` and move the following responsibilities out of Sheet:

- Profile name, bio, avatar draft, validation, loading, and error state.
- Store refresh behavior that updates untouched fields without overwriting edited fields.
- Avatar selection through the existing `photos.choosePhotos(1)` path.
- Request ordering, stale-result rejection, same-owner identity recovery, and component teardown handling.
- Preview image error handling.
- Explicit Save through `store.updateProfile` and the existing success notification.

Sheet remains responsible for:

- Panel visibility, animation, measurement, title, subtitle, and scrolling.
- Selecting which sheet content is active.
- Closing the panel.
- Forwarding ProfileEditor native-avatar lifecycle events to the page.

## Non Goals

This stage does not:

- Replace `wx.chooseMedia` with `button open-type="chooseAvatar"`.
- Change `store.profile`, persisted storage, or cloud Profile schemas.
- Introduce AvatarService, ProfileRepository, NativeFlowGuard, or a new framework.
- Change the explicit Save transaction.
- Change Workspace avatar selection, upload, pull, or apply behavior.
- Implement photo deletion or orphan pruning.
- Repair unrelated verification failures.
- Perform deployment or claim iOS or Android device acceptance.

## Component Contract

ProfileEditor receives only shell context:

- `active`: whether Profile is the current sheet type.
- `show`: the parent sheet's current visibility.
- `dusk`: current theme presentation.

ProfileEditor emits:

- `close` after a successful Save. Sheet handles this through its existing `close()` method.
- `nativeavatar` with the unchanged `{ phase, userId, request }` payload. Sheet forwards the event unchanged so `pages/me/index.js` keeps its current identity-resume protocol.

ProfileEditor reads Profile state and commits through the existing Store. It does not expose draft values to Sheet.

## Lifecycle and Data Flow

When Profile becomes active, ProfileEditor loads the current Store Profile into untouched draft fields. Store notifications continue to refresh untouched fields while preserving fields marked as edited.

Avatar selection follows the existing flow:

1. Acquire the current identity lease.
2. Emit `nativeavatar` start with a request number.
3. Call `photos.choosePhotos(1)`.
4. Preserve the active request while the parent is transiently hidden during same-owner verification.
5. Recheck identity at the UI boundary.
6. Apply the persistent path only when the component, Profile sheet, owner, and request are still current.
7. Emit `nativeavatar` end only for the matching current request.

Switching sheet type, explicitly closing, detaching the component, or verifying a different owner invalidates the pending request and discards its result.

Save remains:

1. Reject while avatar processing is active.
2. Reject an avatar whose preview failed.
3. Require a non-empty trimmed name.
4. Call `store.updateProfile({ name, bio, avatar })` once.
5. Preserve the form and show a safe error if commit fails.
6. Notify success and emit `close` only after commit succeeds.

## Sheet Integration

`miniprogram/components/sheet/index.wxml` replaces the inline Profile block with `<profile-editor>`. `index.json` registers the component. `index.js` removes Profile draft and avatar methods, adds two small event-forwarding methods, and stops calling `refreshProfile`.

Profile-specific selectors move to the new component stylesheet. Shared form and button rules remain in Sheet unless the extracted component cannot receive them reliably under the current style-isolation settings; in that case only the minimum required declarations are copied into ProfileEditor. No general form-style abstraction is introduced in this stage.

## Error Handling and Privacy

The extraction preserves the current error categories and user messages:

- Cancellation is silent and leaves the draft unchanged.
- Identity failures show the existing account verification message.
- Filesystem failures show the existing storage message.
- Image and preview failures ask the user to select the photo again.
- Store failure leaves the editor open and does not show the success toast.

Logging remains limited to stage and safe code. Paths, native messages, and image data are never logged.

## Testing

Tests are changed before implementation so they fail against the missing ProfileEditor boundary.

`tools/verify-sheet-edits.cjs` will mount both Sheet and ProfileEditor production components. Existing Profile assertions move to the ProfileEditor fixture, while Sheet integration assertions verify that:

- The Profile block renders through the registered component.
- ProfileEditor `close` invokes Sheet close.
- `nativeavatar` payloads are forwarded unchanged.

`tools/verify-avatar-persistence.cjs` continues to execute the production Store, identity, photos, Me page, Sheet, and ProfileEditor together. All 45 existing avatar/Profile checks must remain green. The static verifier and the full suite are rerun; the known 316-of-317 restore failure is accepted only if it remains the first and identical failure.

Device acceptance remains required before release but is not executable in this repository-only stage.

## Migration and Rollback

There is no data migration. The Store schema, local file locations, and cloud protocol remain unchanged.

Rollback consists of restoring the inline Profile block and methods in Sheet and removing the new component registration. Because no persisted format changes, rollback does not require user-data conversion.

## Completion Criteria

Stage 1 is complete when:

- Profile UI and behavior are owned by `components/profile-editor`.
- Sheet contains no Profile draft, avatar selection, or Profile save implementation.
- The Profile flow remains explicit-Save and locally persistent.
- The 23 avatar persistence and 22 Sheet edit checks pass with the new component boundary.
- Static validation introduces no new failure.
- The full verification suite has no new failure before the known fresh-diary restore assertion.
