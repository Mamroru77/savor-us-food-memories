# Stage 7 Cleanup and Migration Design

## Purpose

Stage 7 completes the cleanup and migration work deferred by the earlier Profile, Store, and Workspace refactors. It introduces a versioned local avatar asset while preserving direct rollback to Stage 6, removes misleading photo-cleanup APIs, and retires the temporary Workspace compatibility facade.

The governing safety requirement is stronger than export-only recovery: after Stage 7 has migrated and written data, checking out Stage 6 commit `2ce0497` must still allow the user to read and continue using that data. If Stage 6 changes the avatar, a later return to Stage 7 must adopt that newer avatar instead of reviving stale asset metadata.

## Source and Current Baseline

The 2026-09-20 read-only audit assigns Stage 7 four responsibilities:

- remove no-op APIs;
- remove temporary runtime compatibility layers and obsolete facades while retaining the persisted compatibility projection required for Stage 6 rollback;
- remove duplicate test paths and mocks that exist only for deleted no-op APIs or facades, without a repository-wide test-harness rewrite;
- perform storage-schema migration and rollback verification.

The current code already has the following stable boundaries, which this stage reuses:

- `identityPartitions.js` and `chunkStorage.js` provide owner/environment partitioning and copy-on-write storage;
- `avatar.js` prepares, validates, restores, and derives cloud payloads from local avatar assets;
- `profileRepository.js` owns pure Profile transformations;
- `profileSync.js` owns Profile pull, push, and apply orchestration;
- `workspaceClient.js`, `workspaceFiles.js`, and `archiveService.js` own the responsibilities hidden behind `workspace.js`;
- `store.js` remains the public state and orchestration facade.

Stage 7 does not replace the existing V2 identity partition or chunk-storage formats. The pending schema change is the local diary Profile model, whose avatar is still persisted only as the string `profile.avatar` even though the avatar service already returns structured assets.

## Scope

### 1. Versioned Profile avatar asset

The local diary gains `schemaVersion: 2`. An absent schema version is treated as the Stage 6 format.

The Profile gains a canonical `avatarAsset` value:

```js
{
  formatVersion: 1,
  localPath: '/owner/scoped/path.jpg',
  digest: null,
  mime: 'image/jpeg',
  width: 256,
  height: 256,
  source: 'chooseAvatar',
  syncState: 'local',
  remoteRef: null,
}
```

Fields unavailable during migration may be `null`. A migrated or Stage 6-authored path uses source `legacy`. New service-produced assets retain their specific source and metadata.

`avatarAsset` is the canonical value for Stage 7 code. `profile.avatar` remains a derived string projection of `avatarAsset.localPath` so Stage 6 code and existing WXML bindings remain usable. Stage 7 writes both values together.

### 2. Direct Stage 6 rollback compatibility

Stage 6 ignores the new top-level and Profile fields and continues to read `profile.avatar`. Stage 7 therefore must keep the old field valid on every write.

Stage 6 may later update only `profile.avatar`, leaving an older `avatarAsset` in the Profile. On the next Stage 7 load:

- when `avatarAsset.localPath` equals `profile.avatar`, the structured asset is retained;
- when the asset is missing, malformed, or points at a different path, the Stage 6 string wins;
- a minimal versioned asset is rebuilt from that string;
- an empty string produces no avatar asset;
- stale structured metadata must never overwrite a newer Stage 6 string.

This reconciliation makes migration idempotent and supports Stage 7 to Stage 6 to Stage 7 round trips.

### 3. Photo no-op API removal

Remove these misleading exports from `photos.js`:

- `removePhoto`;
- `pruneOrphans`;
- `collectReferenced`.

Remove their runtime calls, mocks, tests, and comments that imply local photo deletion occurs. Stage 7 intentionally retains the current append-only photo policy. It does not delete any existing user file and does not add reference counting, garbage collection, timers, directory scans, or storage-pressure cleanup.

### 4. Workspace facade retirement

Migrate production callers to the existing focused modules:

- cloud requests use `workspaceClient`;
- owner-scoped local writes use `workspaceFiles`;
- durable mutations, archive workflows, retries, and task exports use `archiveService`;
- cloud-avatar selection becomes a small operation in `avatar.js` that composes selection, owner resume, preparation, and cloud-payload derivation.

After production and focused test callers use those modules directly, delete `miniprogram/utils/workspace.js` and its facade-only assertions and mocks.

`store.js` is not a temporary compatibility facade and remains the public Store API.

### 5. Narrow test cleanup

Remove tests and mocks whose only purpose is checking the deleted no-op APIs or Workspace re-exports. Do not introduce a universal mini-program VM harness: the existing avatar, page, cloud, and lifecycle harnesses have different dependency and lifecycle contracts. Shared test infrastructure is added only if the implementation reveals three or more identical touched loaders; it is not a Stage 7 deliverable by itself.

## Data Flow

### Local Profile save

1. ProfileEditor receives a prepared asset from `avatar.js` and uses its `localPath` for preview.
2. Explicit Save passes the structured asset to the Store/Profile repository.
3. The repository validates and stores `avatarAsset`.
4. The repository derives `profile.avatar` from `avatarAsset.localPath` in the same next state.
5. Store persists one diary value through the existing identity-partition copy-on-write path.
6. Store publishes the new state only after persistence succeeds.

Text-only Profile changes preserve the current asset and compatibility projection.

### Cloud Profile apply

1. Profile Sync obtains the remote avatar object.
2. `avatar.restore` validates and writes the owner-scoped local file and returns a structured asset.
3. Profile Sync passes that asset to the repository.
4. The repository commits the structured asset and string projection atomically with the remote Profile text and preferences.

The cloud Profile payload and cloud-function protocol do not change.

### Loading and migration

1. Store reads the verified owner's diary through `identity.getStorageSync`.
2. Profile repository normalizes the Profile and returns whether migration is needed.
3. Store constructs the complete schema-2 diary while preserving unknown fields, memories, settings, feedback, cloud-hidden IDs, and outbox entries.
4. Store attempts a copy-on-write persistence of the migrated diary before or during normal state publication.
5. If the migration write fails, the old stored diary remains untouched. The app may continue reading the normalized in-memory state; a later normal durable commit retries by building, persisting, and then publishing the complete schema-2 diary through the existing commit path.

No normal write may persist only `schemaVersion`, `avatarAsset`, or another migrated fragment. Every durable Store action writes one complete normalized diary before publishing live state.

No legacy/v1 key, quarantine entry, other owner partition, cloud record, or local file is deleted during migration.

## Validation Rules

- `avatarAsset` must be a plain object with `formatVersion: 1` and a safe local path.
- New service-produced assets retain validated dimensions, MIME, source, sync state, digest, and remote reference when present.
- Migrated assets may omit unavailable media metadata by storing `null`.
- Unknown Profile and diary fields are preserved for forward compatibility.
- A malformed asset cannot override a usable Stage 6 avatar string.
- Owner-scoped file validation and identity lease checks remain in `avatar.js` and `photos.js`; repository normalization does not authorize file access.
- Profile save remains explicit. Selection still changes only the draft preview until Save succeeds.

## Error Handling and Data Safety

- Migration failure never clears, overwrites, or partially publishes the previous diary.
- Store mutation failure leaves live Profile state and the editor unchanged, matching the current atomic-save behavior.
- Identity changes during avatar work remain governed by `nativeFlow` and identity leases.
- Logs continue to contain only safe stage/code values, never paths, image data, Profile contents, or user identifiers.
- Legacy recovery remains read-only until the user explicitly copies data.
- The existing chunk-storage cleanup may remove only superseded chunks and journals inside the same V2 namespace; it never removes legacy keys or other owners.

## Testing Strategy

Implementation remains test-first and extends existing focused verifiers.

### Schema and rollback contract

Tests must prove:

- an unversioned Stage 6 diary migrates to schema 2;
- migration preserves every unrelated and unknown field;
- migration is idempotent;
- a prepared local avatar persists as both a structured asset and Stage 6 string projection;
- an empty avatar remains empty without inventing an asset;
- malformed structured data cannot displace a valid string path;
- Stage 6 load semantics can read the Stage 7 result;
- a Stage 6-style write that changes only `profile.avatar` remains usable;
- re-entering Stage 7 after that write rebuilds the asset from the newer string;
- simulated migration-write failure leaves the original stored bytes readable and unchanged;
- owners A and B never read or reconstruct one another's avatar assets.

### Runtime behavior

Existing avatar and Profile tests continue to prove:

- selection changes only preview state;
- Save atomically publishes the Profile;
- close/cancel leaves the prior Profile unchanged;
- cloud apply writes through the owner photo store;
- cloud payload bounds and protocol remain unchanged;
- identity changes reject stale results.

### Cleanup behavior

Static and focused tests prove:

- no production caller references the deleted photo no-op APIs;
- no production caller imports the deleted Workspace facade;
- reports still write through `workspaceFiles`;
- Profile Sync still uses the client, durable mutation, local backup, and avatar services;
- Workspace archive, retry, pending-intent, and task flows still use their existing focused modules.

### Verification commands

Run the focused avatar, Profile Sync, identity, Store-boundary, Workspace, audit-repair, and static suites after their relevant slices. At completion run the repository verification command and compare it with the recorded baseline. Existing documented failures are not Stage 7 successes, but they are acceptable only when unchanged and no earlier or additional failure appears.

Device acceptance remains required before release and is not claimed by repository-only verification.

## Implementation Order

1. Add failing schema-migration and Stage 6 rollback-contract checks.
2. Add the minimal Profile normalization/migration functions to `profileRepository.js` and integrate them into Store loading and commits.
3. Carry structured assets through ProfileEditor and Profile Sync while deriving the string projection.
4. Remove the photo no-op APIs and all dead calls.
5. Move callers from `workspace.js` to the focused modules, move cloud-avatar selection into `avatar.js`, and delete the facade.
6. Remove facade-only test paths, run focused verification, then run the full baseline.

Each slice is separately committed and revertible. Product-code work does not begin until this design and the derived implementation plan are approved.

## Non-Goals

- No identity-partition, chunk-storage, storage-key, quarantine, or backup-format migration.
- No cloud-function, cloud Profile protocol, archive format, or cloud-record change.
- No photo deletion, reference counting, garbage collection, or storage reclamation.
- No Store rewrite or removal of the Store facade.
- No UI restyling, wording change, navigation change, or change to explicit Profile Save.
- No general-purpose migration framework, repository hierarchy, dependency injection, event bus, or new dependency.
- No repository-wide test-harness rewrite.
- No deployment or claimed iOS/Android acceptance.

## Completion Criteria

Stage 7 is complete when:

- schema-2 diaries persist a canonical `avatarAsset` and a synchronized Stage 6 `profile.avatar` projection;
- Stage 7 data works after direct rollback to Stage 6, and rollback-authored avatar changes survive re-upgrade;
- migration is idempotent, owner-safe, failure-safe, and preserves unknown data;
- the photo no-op APIs and their dead calls are gone without deleting files;
- production code no longer imports `workspace.js`, and the facade is deleted;
- cloud and local Profile behavior remain compatible;
- focused verification passes and full verification introduces no regression beyond the documented baseline;
- the final diff contains no speculative framework, unrelated cleanup, or deployment change.
