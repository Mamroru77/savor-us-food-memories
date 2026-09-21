# ProfileEditor Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Profile editing into a dedicated native mini-program component while preserving every current avatar, identity, draft, and explicit-Save behavior.

**Architecture:** `s-sheet` remains the visual shell and renders `profile-editor` for the Profile sheet type. `profile-editor` owns its draft and existing Store/photos/identity interactions, while Sheet forwards only `close` and `nativeavatar` events. No new service layer or persisted model is introduced.

**Tech Stack:** WeChat native mini-program JavaScript, WXML, WXSS, CommonJS, Node.js assert/vm verification scripts.

**Spec:** `docs/superpowers/specs/2026-09-21-profile-editor-extraction-design.md`

## Global Constraints

- Keep `store.profile`, local storage, avatar file paths, and the cloud Profile protocol unchanged.
- Keep avatar selection on the existing `photos.choosePhotos(1)` path; `chooseAvatar` belongs to the next stage.
- Keep explicit Save: selection updates only the editor draft, and `store.updateProfile` runs only on Save.
- Preserve identity lease/resume checks, request ordering, stale-owner rejection, transient verification recovery, and safe logging.
- Add no dependency, framework, service layer, migration, deployment step, or unrelated verifier repair.
- Preserve the pre-existing `verify:all` baseline: the first failure remains `[T] restore into fresh diary adds 7 — added 0` after 316 passing checks.

## Review Focus

- Native selection completes after explicit close: the result is discarded and the sheet does not reopen.
- Native selection completes after a different user verifies: no foreign avatar path reaches the draft or Store.
- Store refresh occurs while name, bio, or avatar is edited: only untouched fields refresh.
- Avatar preview fails or Store commit throws: Save stays blocked or the editor stays open, with no success toast.
- Parent Sheet is transiently hidden during same-owner verification: the current request and draft survive until Profile returns.

---

### Task 1: Extract ProfileEditor with the existing behavior contract

**Files:**

- Create: `miniprogram/components/profile-editor/index.js`
- Create: `miniprogram/components/profile-editor/index.json`
- Create: `miniprogram/components/profile-editor/index.wxml`
- Create: `miniprogram/components/profile-editor/index.wxss`
- Modify: `miniprogram/components/sheet/index.js:85-89,120-188,194-212,228-257,494-561`
- Modify: `miniprogram/components/sheet/index.json`
- Modify: `miniprogram/components/sheet/index.wxml:166-189`
- Modify: `miniprogram/components/sheet/index.wxss:245-268,440,458`
- Modify: `tools/verify-sheet-edits.cjs`
- Modify: `tools/verify-avatar-persistence.cjs:11-53,120-131`

**Interfaces:**

- Consumes: `profile-editor` properties `active: Boolean`, `show: Boolean`, and `dusk: Boolean`.
- Produces: `close` with an optional `{ reason: 'identity' }` detail and `nativeavatar` with `{ phase: 'start'|'end', userId?: string, request: number }`.
- Preserves: `store.updateProfile({ name, bio, avatar })`, `photos.choosePhotos(1)`, and the current Me page `onNativeAvatar` contract.

- [ ] **Step 1: Add failing component-boundary checks**

Update `tools/verify-sheet-edits.cjs` so its loader captures Sheet and ProfileEditor separately instead of treating every `Component()` call as Sheet. Keep the existing Workspace fixture unchanged. Add these exact boundary assertions before retargeting the existing Profile behavior checks:

```js
const sheetWxml=fs.readFileSync('miniprogram/components/sheet/index.wxml','utf8');
const sheetJson=JSON.parse(fs.readFileSync('miniprogram/components/sheet/index.json','utf8'));

await test('sheet delegates profile UI to ProfileEditor',()=>{
  assert.equal(sheetJson.usingComponents['profile-editor'],'/components/profile-editor/index');
  assert.match(sheetWxml,/<profile-editor\b/);
  assert.doesNotMatch(sheetWxml,/bindtap="onAvatarChange"/);
});

await test('sheet forwards ProfileEditor events without changing payloads',()=>{
  const h=sheet();
  h.p.onProfileNativeAvatar({detail:{phase:'start',userId:'fixture',request:7}});
  h.p.onProfileNativeAvatar({detail:{phase:'end',request:7}});
  h.p.onProfileClose({detail:{reason:'identity'}});
  assert.deepEqual(h.events.slice(-3),[
    {name:'nativeavatar',detail:{phase:'start',userId:'fixture',request:7}},
    {name:'nativeavatar',detail:{phase:'end',request:7}},
    {name:'close',detail:{reason:'identity'}},
  ]);
});
```

Create a `profileEditor()` fixture that evaluates `miniprogram/components/profile-editor/index.js` with the existing `identity`, `identityCopy`, `i18n`, `uiFeedback`, `store`, and `photos` doubles. Its instance must call the component's `attached` lifetime and expose `enter()`, `hide()`, `show()`, `detach()`, `emitStore()`, and `events` so the current Profile tests can target the production component.

Move these existing checks from the Sheet fixture to the ProfileEditor fixture without weakening their assertions:

- profile edits survive refresh while untouched fields still update
- close and reopen discard unsaved view edits, not Store
- all avatar result ordering, close, type-switch, detach, identity, transient-null, and suspended-return checks
- selection only previews until Save
- commit failure stays open
- pending selection blocks Save
- preview failure blocks Save and a new selection clears it
- safe feedback for image, filesystem, identity, and program errors

Retain the Together-form checks on the Sheet fixture.

- [ ] **Step 2: Run the focused verifier and confirm the new boundary is missing**

Run:

```powershell
& 'C:\Users\HUAWEI\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tools\verify-sheet-edits.cjs
```

Expected: FAIL because `components/profile-editor` and Sheet forwarding methods do not exist yet. Existing unrelated checks must execute up to the first new boundary failure without syntax errors.

- [ ] **Step 3: Create the ProfileEditor component shell**

Create `miniprogram/components/profile-editor/index.json`:

```json
{
  "component": true,
  "usingComponents": {
    "s-icon": "/components/icon/index"
  },
  "styleIsolation": "apply-shared"
}
```

Create `index.wxml` by moving the existing Profile block contents from Sheet into one root view. Keep every binding and accessibility attribute, changing no copy key:

```xml
<view class="profile-editor {{dusk ? 'theme-dusk-panel' : ''}}">
  <view class="settings-form">
    <view class="edit-avatar" bindtap="onAvatarChange" aria-role="button" aria-label="{{copy.s01d39b33f0}}" hover-class="ui-pressed" hover-start-time="0" hover-stay-time="100">
      <image class="edit-avatar-img" src="{{imageErrors[(profileAvatar)] ? '/images/jamie.jpg' : (profileAvatar)}}" mode="aspectFill" data-source="{{profileAvatar}}" binderror="onImageError" />
      <view class="edit-avatar-badge">
        <s-icon name="camera" size="30" color="{{dusk ? '#d7d1c7' : '#1b1c1a'}}" stroke="1.75" />
      </view>
    </view>
    <view class="form-field">
      <text class="form-label">{{copy.sab42293e29}}</text>
      <input class="form-input {{profileError ? 'has-error' : ''}} profile-input {{focusedField === 'onProfileName-' ? 'is-focused' : ''}}" id="profile-name-field" value="{{profileName}}" placeholder="Jamie Lin" maxlength="32" bindinput="onProfileName" aria-label="{{copy.sab42293e29}}" placeholder-class="form-placeholder" data-focus-key="onProfileName-" bindfocus="onFieldFocus" bindblur="onFieldBlur" />
      <text wx:if="{{profileError}}" class="form-error field-error">{{profileError}}</text>
    </view>
    <view class="form-field">
      <text class="form-label">{{copy.saee3ef9e7d}}</text>
      <input class="form-input profile-input {{focusedField === 'onProfileBio-' ? 'is-focused' : ''}}" value="{{profileBio}}" placeholder="{{copy.sb201ed876f}}" maxlength="55" bindinput="onProfileBio" aria-label="{{copy.saee3ef9e7d}}" placeholder-class="form-placeholder" data-focus-key="onProfileBio-" bindfocus="onFieldFocus" bindblur="onFieldBlur" />
    </view>
    <view class="primary-button {{profileUploading || !profileName ? 'ghosted' : ''}}" bindtap="onProfileSave" aria-role="button" hover-class="ui-pressed" hover-start-time="0" hover-stay-time="100">
      <s-icon name="check" size="35" color="#ffffff" stroke="1.75" />
      <text>{{profileUploading ? copy.sb89bb7bce2 : copy.sf597c0e820}}</text>
    </view>
  </view>
</view>
```

Create `index.wxss` with only the Profile-specific rules moved from Sheet. App-level `.form-*`, `.primary-button`, `.ghosted`, and `.field-error` rules remain shared through `apply-shared`:

```css
.settings-form { display:flex; flex-direction:column; gap:35rpx; padding-bottom:10rpx; }
.profile-input { min-height:92rpx; }
.edit-avatar { width:195rpx; height:195rpx; position:relative; border-radius:50%; margin:8rpx auto 12rpx; }
.edit-avatar-img { width:195rpx; height:195rpx; border-radius:50%; border:5rpx solid #fff; box-sizing:border-box; }
.edit-avatar-badge { position:absolute; right:-8rpx; bottom:0; width:65rpx; height:65rpx; display:flex; align-items:center; justify-content:center; background:#eeefe7; border:5rpx solid #fff; border-radius:50%; box-sizing:border-box; }
.theme-dusk-panel .edit-avatar-badge { background:#36373b; border-color:var(--glass-border, rgba(238,234,227,.12)); }
```

- [ ] **Step 4: Move Profile behavior into `profile-editor/index.js`**

Use the existing Sheet implementations rather than rewriting them. The component top level is:

```js
const identity = require('../../utils/identity');
const identityCopy = require('../../utils/identityCopy');
const i18n = require('../../utils/i18n');
const uiFeedback = require('../../utils/uiFeedback');
const store = require('../../utils/store');
const photos = require('../../utils/photos');

Component({
  properties: {
    active: { type:Boolean, value:false },
    show: { type:Boolean, value:false },
    dusk: { type:Boolean, value:false },
  },
  data: {
    copy:i18n.copy(), focusedField:'', imageErrors:{},
    profileName:'', profileBio:'', profileAvatar:'',
    profileError:'', profileUploading:false, sheetScrollTarget:'',
  },
  observers: {
    'active, show': function(active, show) {
      const native=this._avatarNativeOwner;
      const preserving=!!native&&active&&(show||identity.snapshot().status==='verifying');
      if(preserving&&!show)native.suspended=true;
      if(show&&this._avatarViewReady){this._avatarViewReady();this._avatarViewReady=null;}
      if(!preserving&&(!active||!show))this.reset();
      if(active&&show)this.refresh();
    },
  },
  lifetimes: {
    attached() {
      this.unsubscribe=store.subscribe(function(state){
        const session=state.identity;
        if(this._avatarNativeOwner&&session){
          if(session.locked&&session.status==='verifying'){
            this._identityGeneration=session.generation;
            return;
          }
          if(session.locked||session.userId!==this._avatarNativeOwner.userId){
            this.reset();
            this.setData({profileName:'',profileBio:'',profileAvatar:'',profileError:'',imageErrors:{}});
            this.triggerEvent('close',{reason:'identity'});
            return;
          }
          this._identityGeneration=session.generation;
        } else if(session&&this._identityGeneration!==session.generation){
          this._identityGeneration=session.generation;
          this.reset();
          this.setData({profileName:'',profileBio:'',profileAvatar:'',profileError:'',imageErrors:{}});
          this.triggerEvent('close',{reason:'identity'});
          return;
        }
        if(this.data.active&&this.data.show)this.refresh();
      }.bind(this));
      const state=store.get();
      this._identityGeneration=state.identity&&state.identity.generation;
      if(this.data.active&&this.data.show)this.refresh();
    },
    detached() { this._detached=true;this.reset();if(this.unsubscribe)this.unsubscribe(); },
  },
  methods: {
    onFieldFocus:uiFeedback.onFieldFocus,
    onFieldBlur:uiFeedback.onFieldBlur,
  },
});
```

Copy Sheet's current `finishAvatar`, Profile portion of `resetFormEdits`, `refreshProfile`, `onProfileName`, `onProfileBio`, `onAvatarChange`, `onImageError` Profile branch, and `onProfileSave` into this component with these exact boundary changes:

- Rename `resetFormEdits()` to `reset()` and keep request invalidation, pending-view release, matching native end, dirty-map reset, and safe `setData`.
- `active()` checks `that.data.active && that.data.show` instead of Sheet type.
- Use the imported `identityCopy()` instead of requiring it inside catch branches.
- Successful Save emits `close`; identity invalidation emits `close` with `{reason:'identity'}`.
- `refresh()` reads `store.get()`, refreshes only untouched fields, and updates `copy`.
- Store subscription preserves the existing same-owner verifying branch and rejects a different user before refreshing.
- Do not add an adapter, service, mixin, timer, or compatibility facade.

- [ ] **Step 5: Replace inline Profile code with the component and event forwarding**

Register the child in `miniprogram/components/sheet/index.json`:

```json
"profile-editor": "/components/profile-editor/index"
```

Replace Sheet WXML lines 166-189 with:

```xml
<profile-editor
  wx:if="{{displayType === 'profile'}}"
  active="{{displayType === 'profile'}}"
  show="{{show}}"
  dusk="{{dusk}}"
  bind:close="onProfileClose"
  bind:nativeavatar="onProfileNativeAvatar"
/>
```

Add only these forwarding methods to Sheet:

```js
onProfileClose(event) {
  const detail=event&&event.detail;
  if(detail&&detail.reason==='identity')this.triggerEvent('close',detail);
  else this.close();
},
onProfileNativeAvatar(event) {
  const detail=event&&event.detail||{};
  if(detail.phase==='start'&&detail.userId)this._avatarNativeOwner={userId:detail.userId,request:detail.request};
  else if(detail.phase==='end'&&this._avatarNativeOwner&&detail.request===this._avatarNativeOwner.request)this._avatarNativeOwner=null;
  this.triggerEvent('nativeavatar',detail);
},
```

Remove Sheet's Profile data fields, Profile-specific `onImageError` branch, `finishAvatar`, avatar work from `resetFormEdits`, `refreshProfile` call and method, and Profile input/avatar/save methods. Keep `_avatarNativeOwner` only as shell state populated by forwarded child events, because the existing Sheet observer and Store subscription need it to preserve `displayType='profile'` during same-owner verification.

Remove only `.profile-input`, `.edit-avatar*`, and their dusk override from Sheet WXSS. Keep `.settings-form` because other Sheet types use it.

- [ ] **Step 6: Rewire the production-boundary avatar harness**

In `tools/verify-avatar-persistence.cjs`, capture `profileSpec` when loading `components/profile-editor/index.js`. Mount Me, Sheet, and ProfileEditor together. Parent property changes update Sheet; Sheet `displayType` and `show` changes update ProfileEditor; child events call Sheet's new forwarding methods.

Return `{me, sheet, profile, dispose}` and retarget only Profile actions:

```js
const pending=profile.onAvatarChange();
const avatar=profile.data.profileAvatar;
profile.onProfileSave();
```

Keep all assertions against Me, Store, file bytes, identity partitions, logs, and sheet visibility unchanged. Disposal must call ProfileEditor detached before Sheet detached.

- [ ] **Step 7: Run targeted behavior checks**

Run:

```powershell
& 'C:\Users\HUAWEI\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tools\verify-sheet-edits.cjs
& 'C:\Users\HUAWEI\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tools\verify-avatar-persistence.cjs
```

Expected: the Sheet/Profile verifier reports all retained checks plus the two new boundary checks as PASS; the avatar verifier reports `23 production-boundary checks passed`.

- [ ] **Step 8: Run static and full regression gates**

Run:

```powershell
npm run verify
npm run verify:all
```

Expected for `npm run verify`: ProfileEditor JS/JSON/WXML/WXSS are discovered, handlers resolve, and the only failure is the existing `[T] restore into fresh diary adds 7 — added 0`, with 316 or more preceding passes depending on the added component checks.

Expected for `npm run verify:all`: it stops at the same fresh-diary restore assertion and introduces no earlier or different failure. Do not update fixtures or assertions to make this unrelated baseline green.

- [ ] **Step 9: Review the diff for a true move, then commit**

Run:

```powershell
rg -n "profileName|profileBio|profileAvatar|profileUploading|onAvatarChange|onProfileSave|refreshProfile" miniprogram\components\sheet
git diff --check
git status --short
```

Expected: none of the Profile implementation names remain in `components/sheet`; Sheet contains only `profile-editor`, `onProfileClose`, and `onProfileNativeAvatar`. `git diff --check` is clean. Existing untracked `r7-check-runtime` and `r7-list-projects` remain untouched.

Commit:

```powershell
git add miniprogram/components/profile-editor miniprogram/components/sheet tools/verify-sheet-edits.cjs tools/verify-avatar-persistence.cjs
git commit -m "refactor: extract profile editor component"
```
