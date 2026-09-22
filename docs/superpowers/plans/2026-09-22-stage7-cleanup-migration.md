# Stage 7 Cleanup and Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a canonical versioned avatar asset with direct Stage 6 rollback compatibility, remove dead photo-cleanup APIs, and retire the temporary Workspace facade without changing cloud or identity protocols.

**Architecture:** `profileRepository.js` normalizes the canonical `avatarAsset` and derives the Stage 6 `profile.avatar` projection. `store.js` owns complete schema-2 diary migration and atomic persistence through the existing identity/chunk-storage path. Existing focused Workspace modules become direct dependencies, and `workspace.js` is deleted only after every production and test caller moves.

**Tech Stack:** WeChat native mini-program JavaScript/CommonJS, synchronous `wx` storage facade backed by the existing chunk store, Node.js `assert` verification scripts, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-22-stage7-cleanup-migration-design.md`

## Global Constraints

- Directly checking out Stage 6 commit `2ce0497` after Stage 7 writes data must keep the Profile usable through the string `profile.avatar` field.
- Re-entering Stage 7 after Stage 6 changes only `profile.avatar` must rebuild `avatarAsset` from that newer string.
- `avatarAsset` is canonical in Stage 7; `profile.avatar` is only its persisted compatibility projection.
- Every durable Store write builds, persists, and then publishes one complete normalized schema-2 diary; never patch migrated fields independently.
- Preserve unknown diary/Profile fields, old storage keys, quarantine data, other owners, cloud records, and existing user files.
- Do not change identity-partition V2, chunk-storage V2, cloud Profile payloads, cloud functions, archive formats, backup formats, explicit Profile Save, UI copy, or navigation.
- Do not add image garbage collection, reference counting, directory scans, a migration framework, a universal VM harness, or any dependency.
- Keep `store.js` as the public Store facade.
- No deployment and no claim of iOS/Android device acceptance.

## Review Focus

- A valid Stage 6 avatar string paired with malformed or stale asset metadata must keep the string and rebuild the asset; Task 1 pins this.
- A Stage 6 rollback that changes avatar A to B must survive a later Stage 7 upgrade as B; Task 2 pins the full round trip.
- A migration write failure must leave old bytes intact, continue with normalized memory state, and make the next successful action persist a complete schema-2 diary; Task 2 pins this.
- Empty avatars and unknown future fields must survive normalization without invented assets or dropped data; Tasks 1 and 2 pin this.
- Owner A assets and stale native results must never appear in owner B state; Task 3 retains and extends the production-boundary checks.

---

### Task 1: Define the Profile avatar migration contract

**Files:**
- Modify: `miniprogram/utils/data.js:31-37`
- Modify: `miniprogram/utils/profileRepository.js:1-17`
- Test: `tools/verify-store-repositories.cjs:1-38`

**Interfaces:**
- Consumes: `data.defaultProfile` and `data.isSafeImage(path)`.
- Produces: `profileRepository.migrate(profile, defaults) -> { profile, changed }`, where `profile.avatarAsset` is canonical and `profile.avatar` is its string projection.
- Produces: `profileRepository.save(state, changes)` and `applyCloud(state, profile, preferences)` that always return schema-2-compatible state.

- [ ] **Step 1: Add failing repository migration tests**

Add `global.wx={env:{USER_DATA_PATH:'/user'}}` before requiring `data`, then add these checks after the settings tests:

```js
const profiles=require('../miniprogram/utils/profileRepository');
test('profile migration creates one canonical asset and preserves future fields',()=>{
  const result=profiles.migrate({name:'A',avatar:'/user/avatar-a.jpg',futureProfile:{keep:true}},data.defaultProfile);
  assert.equal(result.changed,true);
  assert.equal(result.profile.avatar,'/user/avatar-a.jpg');
  assert.deepEqual(result.profile.avatarAsset,{
    formatVersion:1,localPath:'/user/avatar-a.jpg',digest:null,mime:null,width:null,height:null,
    source:'legacy',syncState:'local',remoteRef:null,
  });
  assert.deepEqual(result.profile.futureProfile,{keep:true});
  assert.equal(profiles.migrate(result.profile,data.defaultProfile).changed,false);
});
test('Stage 6 string wins over malformed or stale asset metadata',()=>{
  const stale={formatVersion:1,localPath:'/user/avatar-a.jpg',source:'cloud',syncState:'synced'};
  const result=profiles.migrate({avatar:'/user/avatar-b.jpg',avatarAsset:stale},data.defaultProfile).profile;
  assert.equal(result.avatar,'/user/avatar-b.jpg');
  assert.equal(result.avatarAsset.localPath,'/user/avatar-b.jpg');
  assert.equal(result.avatarAsset.source,'legacy');
  assert.equal(profiles.migrate({avatar:'/user/avatar-b.jpg',avatarAsset:{bad:true}},data.defaultProfile).profile.avatarAsset.localPath,'/user/avatar-b.jpg');
});
test('empty avatar stays empty and does not invent an asset',()=>{
  const result=profiles.migrate({name:'A',avatar:'',avatarAsset:{bad:true}},data.defaultProfile).profile;
  assert.equal(result.avatar,'');
  assert.equal(result.avatarAsset,null);
});
```

- [ ] **Step 2: Run the repository check and verify RED**

Run: `npm run verify:store-boundaries`

Expected: FAIL because `profileRepository.migrate` is not defined.

- [ ] **Step 3: Add the versioned default and minimal pure migration logic**

Add `avatarAsset: null` beside `avatar: ''` in `data.defaultProfile`.

Implement these focused helpers in `profileRepository.js`; retain the existing preference whitelist and cloud payload contract:

```js
const data=require('./data');
const ASSET_SOURCES=['chooseAvatar','album','camera','cloud','legacy'];
const SYNC_STATES=['local','pending','synced','failed'];
const has=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);

function legacyAsset(localPath){
  return localPath?{formatVersion:1,localPath,digest:null,mime:null,width:null,height:null,source:'legacy',syncState:'local',remoteRef:null}:null;
}
function cleanAsset(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.formatVersion!==1||!data.isSafeImage(value.localPath))return null;
  return {
    formatVersion:1,
    localPath:value.localPath,
    digest:typeof value.digest==='string'&&/^[a-f0-9]{64}$/.test(value.digest)?value.digest:null,
    mime:['image/jpeg','image/png','image/gif','image/webp'].includes(value.mime)?value.mime:null,
    width:Number.isFinite(value.width)&&value.width>0?value.width:null,
    height:Number.isFinite(value.height)&&value.height>0?value.height:null,
    source:ASSET_SOURCES.includes(value.source)?value.source:'legacy',
    syncState:SYNC_STATES.includes(value.syncState)?value.syncState:'local',
    remoteRef:typeof value.remoteRef==='string'?value.remoteRef:null,
  };
}
function migrate(value,defaults){
  const original=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const profile={...defaults,...original};
  const path=typeof profile.avatar==='string'&&data.isSafeImage(profile.avatar)?profile.avatar:'';
  const asset=cleanAsset(profile.avatarAsset);
  profile.avatarAsset=asset&&asset.localPath===path?asset:legacyAsset(path);
  profile.avatar=profile.avatarAsset?profile.avatarAsset.localPath:'';
  return {profile,changed:JSON.stringify(profile)!==JSON.stringify(original)};
}
function save(state,changes){
  const profile={...state.profile,...changes};
  if(has(changes,'avatarAsset')){
    const asset=cleanAsset(changes.avatarAsset);
    profile.avatarAsset=asset;
    profile.avatar=asset?asset.localPath:'';
  }
  return {...state,schemaVersion:2,profile:migrate(profile,data.defaultProfile).profile};
}
```

Update `applyCloud` to call `save` for Profile text and optional `profile.avatarAsset`, then merge the whitelisted preferences. Export `migrate` with the existing functions. Keep `payload()` unchanged so the cloud protocol still sends `avatar: null` until Profile Sync chooses a cloud payload.

- [ ] **Step 4: Run the focused repository test**

Run: `npm run verify:store-boundaries`

Expected: PASS with the new Profile checks plus the existing Settings, Memory, and Sync checks.

- [ ] **Step 5: Commit the pure migration contract**

```bash
git add miniprogram/utils/data.js miniprogram/utils/profileRepository.js tools/verify-store-repositories.cjs
git commit -m "refactor: define versioned avatar profile"
```

### Task 2: Migrate complete diaries and prove the Stage 6 round trip

**Files:**
- Modify: `miniprogram/utils/store.js:20-81, 201-210`
- Test: `tools/verify-avatar-persistence.cjs:10-64, 151-166`

**Interfaces:**
- Consumes: `profileRepository.migrate(profile, data.defaultProfile)` from Task 1.
- Produces: internal `normalizeDiary(value) -> { diary, changed }` used by both load migration and every normal `commit`.
- Guarantees: persistence precedes publication for every normal mutation; failed eager migration leaves stored Stage 6 bytes unchanged.

- [ ] **Step 1: Add failing schema, rollback, and migration-failure tests**

Extend the avatar runtime storage mock with a one-shot numbered failure:

```js
let storageWrites=0;
// Inside wx.setStorageSync:
storageWrites++;
if(options.failStorageAtCall===storageWrites||failStorage||failOnce){failOnce=false;throw apiError();}
```

Add these tests after the current cold-runtime persistence check:

```js
await test('Stage 6 diary migrates once and keeps rollback-readable projection plus unknown fields',async()=>{
  const r=runtime();await r.ready();
  const stage6={profile:{...r.data.defaultProfile,avatar:'/images/jamie.jpg',futureProfile:'keep'},memories:[],settings:{futureSetting:true},feedback:[],futureDiary:{keep:true}};
  r.identity.setStorageSync('savor-diary-v1',JSON.stringify(stage6));
  const cold=runtime({},r.disk,r.base);await cold.ready();
  const current=cold.store.get(),persisted=JSON.parse(cold.identity.getStorageSync('savor-diary-v1'));
  assert.equal(current.schemaVersion,2);assert.equal(persisted.schemaVersion,2);
  assert.equal(persisted.profile.avatar,'/images/jamie.jpg');
  assert.equal(persisted.profile.avatarAsset.localPath,'/images/jamie.jpg');
  assert.deepEqual(persisted.futureDiary,{keep:true});assert.equal(persisted.profile.futureProfile,'keep');
  assert.equal(Object.assign({},cold.data.defaultProfile,persisted.profile).avatar,'/images/jamie.jpg');
});
await test('Stage 6 avatar change wins when Stage 7 is entered again',async()=>{
  const r=runtime();await r.ready();r.store.updateProfile({avatar:'/images/jamie.jpg'});
  const stage6=JSON.parse(r.identity.getStorageSync('savor-diary-v1'));
  stage6.profile.avatar='/images/alex.jpg';
  r.identity.setStorageSync('savor-diary-v1',JSON.stringify(stage6));
  const upgraded=runtime({},r.disk,r.base);await upgraded.ready();
  assert.equal(upgraded.store.get().profile.avatar,'/images/alex.jpg');
  assert.equal(upgraded.store.get().profile.avatarAsset.localPath,'/images/alex.jpg');
  assert.equal(upgraded.store.get().profile.avatarAsset.source,'legacy');
});
await test('failed eager migration keeps old bytes and next commit writes one complete schema 2 diary',async()=>{
  const seed=runtime();await seed.ready();
  const stage6={profile:{...seed.data.defaultProfile,avatar:'/images/jamie.jpg'},memories:[],settings:{...seed.data.defaultSettings},feedback:[],futureDiary:'keep'};
  seed.identity.setStorageSync('savor-diary-v1',JSON.stringify(stage6));
  const before=seed.identity.getStorageSync('savor-diary-v1');
  const cold=runtime({failStorageAtCall:1},seed.disk,seed.base);await cold.ready();
  assert.equal(cold.identity.getStorageSync('savor-diary-v1'),before);
  assert.equal(cold.store.get().profile.avatarAsset.localPath,'/images/jamie.jpg');
  cold.store.updateProfile({name:'After retry'});
  const saved=JSON.parse(cold.identity.getStorageSync('savor-diary-v1'));
  assert.equal(saved.schemaVersion,2);assert.equal(saved.profile.name,'After retry');
  assert.equal(saved.profile.avatarAsset.localPath,saved.profile.avatar);assert.equal(saved.futureDiary,'keep');
});
```

- [ ] **Step 2: Run the avatar verifier and verify RED**

Run: `npm run verify:avatar`

Expected: FAIL because loaded diaries have no `schemaVersion` or `avatarAsset`, and Store drops unknown top-level fields.

- [ ] **Step 3: Normalize one complete diary on load and commit**

In `store.js`, add one internal normalizer that preserves unknown fields:

```js
function normalizeDiary(value){
  const parsed=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const migrated=profileRepository.migrate(parsed.profile,data.defaultProfile);
  const diary={
    ...parsed,
    schemaVersion:2,
    memories:memoryRepository.restore(parsed.memories),
    profile:migrated.profile,
    settings:settingsRepository.normalize(parsed.settings),
    feedback:Array.isArray(parsed.feedback)?parsed.feedback.filter(f=>f&&typeof f.message==='string'&&typeof f.date==='string'):[],
    outbox:Array.isArray(parsed.outbox)?parsed.outbox.filter(op=>op&&typeof op.id==='string'&&typeof op.recordId==='string'&&['flags','delete','update'].includes(op.kind)):[],
    cloudHidden:Array.isArray(parsed.cloudHidden)?parsed.cloudHidden.filter(id=>typeof id==='string'):[],
  };
  return {diary,changed:parsed.schemaVersion!==2||migrated.changed||JSON.stringify(diary)!==JSON.stringify(parsed)};
}
```

Change `defaults()` and the initial state to include `schemaVersion: 2` and `avatarAsset: null` through `data.defaultProfile`.

In `loadDiary()`:

```js
const result=normalizeDiary(parsed||defaults());
if(result.changed){try{identity.setStorageSync(STORAGE_KEY,JSON.stringify(result.diary));}catch(error){/* old bytes remain; normal commit retries */}}
return result.diary;
```

In `ensureLoaded()`, use `Object.assign(state, loadedState)` before applying the existing location and device-setting adjustments so unknown fields remain in the live state.

Change `commit(next, language)` to normalize the complete next diary, persist it once, and only then publish it:

```js
function commit(next,language){
  identity.lease();
  const diary=normalizeDiary(next).diary;
  identity.setStorageSync(STORAGE_KEY,JSON.stringify(diary));
  Object.assign(state,diary);
  if(language!==undefined)i18n.setLanguage(language);
  listeners.slice().forEach(fn=>{try{fn(state);}catch(e){}});
}
```

Route `updatePersonalization` through the same complete `commit` path instead of performing its own storage write and publication sequence.

- [ ] **Step 4: Run schema and existing Store checks**

Run:

```bash
npm run verify:store-boundaries
npm run verify:avatar
```

Expected: both PASS; the failure-injection test proves old bytes survive and the next action writes the complete schema-2 diary.

- [ ] **Step 5: Commit complete diary migration**

```bash
git add miniprogram/utils/store.js tools/verify-avatar-persistence.cjs
git commit -m "refactor: migrate profile avatar schema"
```

### Task 3: Carry canonical assets through Profile UI and cloud apply

**Files:**
- Modify: `miniprogram/utils/avatar.js:1-55`
- Modify: `miniprogram/components/profile-editor/index.js:18-25, 88-178`
- Modify: `miniprogram/utils/profileSync.js:34-42`
- Test: `tools/verify-avatar-persistence.cjs:67-104, 151-187`
- Test: `tools/verify-profile-sync.cjs:12-17, 36-78`
- Test: `tools/verify-sheet-edits.cjs:18-30, 152-166`

**Interfaces:**
- Consumes: `profileRepository.save` and `applyCloud` from Task 1.
- Produces: every `avatar.prepare` and `avatar.restore` result has `formatVersion: 1`.
- Produces: ProfileEditor passes `{ avatarAsset }` on explicit Save while continuing to render `profile.avatar`.
- Produces: Profile Sync passes the restored asset object rather than only its path.

- [ ] **Step 1: Tighten failing asset-flow assertions**

Update the avatar service checks to require `formatVersion: 1`. Extend the Profile UI test so selection leaves both persisted fields unchanged until Save, then commits both:

```js
assert.equal(r.store.get().profile.avatar,'');
assert.equal(r.store.get().profile.avatarAsset,null);
profile.onProfileSave();
assert.equal(r.store.get().profile.avatar,avatar);
assert.equal(r.store.get().profile.avatarAsset.localPath,avatar);
assert.equal(r.store.get().profile.avatarAsset.formatVersion,1);
```

In `verify-profile-sync.cjs`, give the test `wx` an owner root (`env.USER_DATA_PATH: '/owner'`), change the base path to `/owner/local.jpg`, include an aligned versioned asset, make `avatar.restore` return a full versioned asset, and assert:

```js
assert.equal(state.profile.avatar,appliedAsset.localPath);
assert.deepEqual(state.profile.avatarAsset,appliedAsset);
```

Also apply a remote Profile with `avatar: null` and assert the existing local `avatarAsset` and string projection are preserved while remote name/bio/preferences still apply.

Extend the existing A/B cold-runtime check in `verify-avatar-persistence.cjs`:

```js
cold.setOwner('b');await cold.ready();
assert.equal(cold.store.get().profile.avatarAsset,null);
cold.setOwner('a');await cold.ready();
assert.equal(cold.store.get().profile.avatarAsset.localPath,p);
```

Keep the existing `q.resolve(path)` test API, but make the Sheet harness stub build the same versioned asset shape as production:

```js
h.deps.avatar.prepare=(source,owner,kind)=>{
  calls.push({source,userId:owner.userId,kind});
  return persisted.then(localPath=>({formatVersion:1,localPath,digest:null,mime:'image/jpeg',width:1,height:1,source:kind,syncState:'local',remoteRef:null}));
};
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm run verify:avatar
npm run verify:profile-sync
npm run verify:sheet-edits
```

Expected: FAIL because service assets are unversioned and ProfileEditor/Profile Sync still discard the asset object.

- [ ] **Step 3: Preserve the asset object through Save and cloud apply**

Add `formatVersion: 1` to the objects returned by `avatar.prepare` and `avatar.restore`.

In ProfileEditor:

```js
// refresh(), when avatar is untouched
this._profileAvatarAsset=state.profile.avatarAsset;
patch.profileAvatar=state.profile.avatar;

// successful selection
that._profileAvatarAsset=asset;
that.setData({profileAvatar:asset.localPath,profileUploading:false,imageErrors:{}});

// explicit Save
store.updateProfile({name,bio:this.data.profileBio.trim(),avatarAsset:this._profileAvatarAsset});
```

Clear `_profileAvatarAsset` when identity invalidation or component teardown discards the draft. Do not clear it merely because text changes.

In `profileSync.apply`, retain the full restored asset:

```js
const profile={name:remote.profile.name,bio:remote.profile.bio},remoteAsset=remote.profile.avatar;
if(remoteAsset)profile.avatarAsset=await avatar.restore(remoteAsset,token);
identity.assertLease(token);
store.applyCloudProfile(profile,remote.preferences,token);
```

- [ ] **Step 4: Run the Profile and owner-safety checks**

Run:

```bash
npm run verify:avatar
npm run verify:profile-sync
npm run verify:sheet-edits
npm run verify:identity
```

Expected: focused Profile suites PASS. `verify:identity` may retain only the documented empty-sample fixture failure; no earlier or additional failure is acceptable.

- [ ] **Step 5: Commit the canonical asset flow**

```bash
git add miniprogram/utils/avatar.js miniprogram/components/profile-editor/index.js miniprogram/utils/profileSync.js tools/verify-avatar-persistence.cjs tools/verify-profile-sync.cjs tools/verify-sheet-edits.cjs
git commit -m "refactor: persist canonical avatar assets"
```

### Task 4: Remove misleading photo cleanup APIs

**Files:**
- Modify: `miniprogram/utils/photos.js:174-204`
- Modify: `miniprogram/utils/store.js:115-130, 318-326`
- Modify: `miniprogram/components/profile-editor/index.js:164-183`
- Modify: `miniprogram/components/sheet/index.js:363-376`
- Modify: `miniprogram/pages/add/index.js:240-252`
- Modify: `tools/verify-sheet-edits.cjs:18-30`
- Modify: `tools/verify-cloud.cjs:780-790`
- Test: `tools/verify-store-repositories.cjs`

**Interfaces:**
- Removes: `photos.removePhoto`, `photos.pruneOrphans`, and `photos.collectReferenced`.
- Preserves: all photo creation, validation, rendering, drafts, memories, Profile assets, and append-only local-file behavior.

- [ ] **Step 1: Add a failing static contract for the dead API names**

At the end of `verify-store-repositories.cjs`, scan production JavaScript only:

```js
const fs=require('node:fs'),path=require('node:path');
function jsFiles(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?jsFiles(path.join(dir,entry.name)):entry.name.endsWith('.js')?[path.join(dir,entry.name)]:[]);}
test('production contains no fake photo cleanup API',()=>{
  const source=jsFiles(path.resolve(__dirname,'../miniprogram')).map(file=>fs.readFileSync(file,'utf8')).join('\n');
  for(const name of ['removePhoto','pruneOrphans','collectReferenced'])assert(!new RegExp('\\b'+name+'\\b').test(source),name+' remains');
});
```

- [ ] **Step 2: Run the static contract and verify RED**

Run: `npm run verify:store-boundaries`

Expected: FAIL reporting the three current names.

- [ ] **Step 3: Delete the no-op exports and every dead call**

Delete the three functions and exports from `photos.js`. Delete calls after Profile Save, local memory deletion, Add save, and edit completion. Remove the obsolete Store comment claiming photos are cleaned on delete.

Remove the two photo-cleanup stubs from `verify-sheet-edits.cjs` and remove the `collectReferenced` assertion from `verify-cloud.cjs`. Do not replace any call with filesystem deletion or a scan.

- [ ] **Step 4: Verify deletion and unchanged photo behavior**

Run:

```bash
npm run verify:store-boundaries
npm run verify:avatar
npm run verify:sheet-edits
npm run verify:cloud
```

Expected: the first three suites PASS. `verify:cloud` may retain only its documented Add WXML hash mismatch; no new photo or Store failure is acceptable.

- [ ] **Step 5: Commit the truthful append-only policy**

```bash
git add miniprogram/utils/photos.js miniprogram/utils/store.js miniprogram/components/profile-editor/index.js miniprogram/components/sheet/index.js miniprogram/pages/add/index.js tools/verify-sheet-edits.cjs tools/verify-cloud.cjs tools/verify-store-repositories.cjs
git commit -m "refactor: remove fake photo cleanup APIs"
```

### Task 5: Retire the Workspace compatibility facade

**Files:**
- Modify: `miniprogram/utils/avatar.js`
- Modify: `miniprogram/utils/profileSync.js:1-42`
- Modify: `miniprogram/pages/workspace/index.js:1-46`
- Modify: `miniprogram/pages/reports/index.js:1-3`
- Delete: `miniprogram/utils/workspace.js`
- Modify: `tools/verify-avatar-persistence.cjs:39-64, 91-100`
- Modify: `tools/verify-profile-sync.cjs:1-90`
- Modify: `tools/verify-workspace.cjs:88-120`
- Modify: `tools/verify-audit-repairs.cjs:45-52`
- Modify: `tools/verify-page-lifecycle.cjs:5-22`
- Modify: `tools/verify-audit-stages.cjs:5-12`

**Interfaces:**
- Produces: `avatar.chooseForCloud() -> Promise<{ asset, base64 }>`.
- Direct dependencies: `workspaceClient.call`, `workspaceFiles.writeFile`, and the existing `archiveService` methods.
- Removes: all production/test imports of `miniprogram/utils/workspace.js`, then the file itself.

- [ ] **Step 1: Change focused tests to demand direct modules**

In `verify-avatar-persistence.cjs`, load and expose `workspaceClient`, `workspaceFiles`, and `archiveService` directly; replace the chooser assertion with:

```js
const selected=await r.avatar.chooseForCloud();
assert(selected.asset.localPath.includes('/savor-photos/'+uid('a')+'/'));
assert.equal(selected.asset.source,'album');
```

In `verify-profile-sync.cjs`, stub and mutate the focused modules rather than `workspace`. In `verify-workspace.cjs`, delete the three facade re-export assertions and run archive tests against `archiveService`, client checks against `workspaceClient`, and file checks against `workspaceFiles`.

Update the Workspace page VM harnesses so their dependency maps provide `workspaceClient`, `archiveService`, and `avatar` separately. Add a final static assertion with a concrete production-file walk:

```js
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):entry.name.endsWith('.js')?[path.join(dir,entry.name)]:[]);
const productionJs=walk(path.resolve(__dirname,'../miniprogram'));
assert.equal(fs.existsSync('miniprogram/utils/workspace.js'),false);
for(const file of productionJs){
  const source=fs.readFileSync(file,'utf8');
  assert(!source.includes("utils/workspace')"),file);
  assert(!source.includes("require('./workspace')"),file);
}
```

- [ ] **Step 2: Run Workspace-related tests and verify RED**

Run:

```bash
npm run verify:avatar
npm run verify:profile-sync
npm run verify:workspace
npm run verify:audit
npm run verify:page-lifecycle
npm run verify:audit-stages
```

Expected: FAIL because `avatar.chooseForCloud` does not exist and production still imports the facade.

- [ ] **Step 3: Move cloud avatar selection into the existing avatar service**

Add this composition to `avatar.js` without adding a new module:

```js
async function chooseForCloud(){
  let owner=identity.lease();
  const picked=await new Promise((resolve,reject)=>wx.chooseMedia({count:1,mediaType:['image'],sourceType:['album','camera'],success:resolve,fail:reject}));
  owner=await identity.resumeNative(owner);
  const source=picked.tempFiles&&picked.tempFiles[0]&&picked.tempFiles[0].tempFilePath;
  if(!source)throw failure('choose','NO_AVATAR_SELECTED','image');
  return forCloud(await prepare(source,owner,'album'),owner);
}
```

Export `chooseForCloud` with `prepare`, `forCloud`, and `restore`.

- [ ] **Step 4: Replace facade imports with focused modules**

In `profileSync.js`, use:

```js
const client=require('./workspaceClient'),files=require('./workspaceFiles'),archive=require('./archiveService');
```

Map `workspace.call` to `client.call`, `workspace.writeFile` to `files.writeFile`, and `workspace.mutate` to `archive.mutate`.

In the Workspace page, import `client`, `archive`, and `avatar`. Route read-only calls to `client.call`, durable mutations/archive/task methods to `archive`, and avatar selection to `avatar.chooseForCloud`.

In Reports, import `workspaceFiles` directly. In diagnostic tests, check `workspaceClient.call` and `archiveService` operations directly. Preserve all identity checks, pending-intent behavior, request ordering, and error codes.

Delete `miniprogram/utils/workspace.js` only after `rg` shows no remaining production or active-test import.

- [ ] **Step 5: Run direct-module and lifecycle verification**

Run:

```bash
npm run verify:avatar
npm run verify:profile-sync
npm run verify:workspace
npm run verify:audit
npm run verify:page-lifecycle
npm run verify:audit-stages
npm run verify:reports-title
rg -n "removePhoto|pruneOrphans|collectReferenced" miniprogram tools --glob "!tools/fixtures/**"
rg -n -F "utils/workspace')" miniprogram tools --glob "!tools/fixtures/**"
rg -n -F "require('./workspace')" miniprogram tools --glob "!tools/fixtures/**"
rg -n -F "mp+'/workspace'" tools --glob "!tools/fixtures/**"
```

Expected: focused suites have no new failure; `rg` returns no active Workspace-facade or dead photo-cleanup reference.

- [ ] **Step 6: Commit facade retirement**

```bash
git add miniprogram/utils/avatar.js miniprogram/utils/profileSync.js miniprogram/pages/workspace/index.js miniprogram/pages/reports/index.js tools/verify-avatar-persistence.cjs tools/verify-profile-sync.cjs tools/verify-workspace.cjs tools/verify-audit-repairs.cjs tools/verify-page-lifecycle.cjs tools/verify-audit-stages.cjs
git rm miniprogram/utils/workspace.js
git commit -m "refactor: retire workspace facade"
```

### Task 6: Verify Stage 7 completion and rollback boundaries

**Files:**
- Review only: all Stage 7 commits and changed files
- Do not create an empty verification commit

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: verification evidence against focused suites and the documented repository baseline.

- [ ] **Step 1: Confirm the final static boundaries**

Run:

```bash
git diff --check 86bb100..HEAD
rg -n "removePhoto|pruneOrphans|collectReferenced" miniprogram tools --glob "!tools/fixtures/**"
rg -n -F "utils/workspace')" miniprogram tools --glob "!tools/fixtures/**"
rg -n -F "require('./workspace')" miniprogram tools --glob "!tools/fixtures/**"
rg -n -F "mp+'/workspace'" tools --glob "!tools/fixtures/**"
git status --short
```

Expected: no whitespace error; no active dead-API/facade match; only the user's pre-existing untracked files and audit document remain untracked.

- [ ] **Step 2: Run all Stage 7 focused suites**

Run:

```bash
npm run verify:store-boundaries
npm run verify:avatar
npm run verify:profile-sync
npm run verify:native-flow
npm run verify:identity
npm run verify:workspace
npm run verify:audit
npm run verify:sheet-edits
npm run verify:structure
```

Expected: all new Stage 7 checks PASS. Previously documented fixture failures may remain only with the same message and position; record them precisely rather than reporting the suite as fully green.

- [ ] **Step 3: Run repository baselines**

Run:

```bash
npm run verify
npm run verify:cloud
npm run verify:all
```

Expected baseline comparison:

- `npm run verify`: only the documented fresh-diary assertion `restore into fresh diary adds 7 — added 0`, if still present.
- `npm run verify:cloud`: only the documented Add WXML review-hash mismatch, if still present.
- `npm run verify:all`: stops at the same first documented baseline failure and introduces no earlier failure.

- [ ] **Step 4: Inspect the final diff for forbidden scope**

Run:

```bash
git diff --stat 86bb100..HEAD
git diff 86bb100..HEAD -- miniprogram cloudfunctions package.json
```

Verify manually that the diff contains no cloud-function change, storage-key change, identity/chunk format change, backup/archive format change, file deletion logic, migration framework, universal test harness, UI copy/restyling, or deployment configuration.

- [ ] **Step 5: Report completion evidence**

Report each Stage 7 slice, its commit, focused test result, unchanged baseline failures, absence of deployment/device claims, and remaining release work: iOS/Android device acceptance for avatar selection, cold restart, rollback build, and re-upgrade.
