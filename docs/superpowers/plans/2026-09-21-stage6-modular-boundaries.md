# Stage 6 Modular Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the Settings UI, Store pure transformations, and Workspace internals behind their existing public facades without changing persisted data, cloud payloads, or user-visible behavior.

**Architecture:** Sheet delegates Preferences, Settings, and Privacy to one native component. `store.js` keeps state, identity, persistence, and async orchestration while three CommonJS repositories own value transformations. `workspace.js` remains the compatibility entry point over a cloud client, owner-scoped files, and archive workflows.

**Tech Stack:** WeChat native mini-program JavaScript, WXML, WXSS, CommonJS, Node.js `assert`/`vm` verification scripts.

**Spec:** `docs/superpowers/specs/2026-09-21-stage6-modular-boundaries-design.md`

## Global Constraints

- Keep Store export names, return shapes, sync/async behavior, error codes, storage keys, and persisted shapes unchanged.
- Keep Workspace export names, protocol version `1`, archive format version `1`, task payloads, pending-intent behavior, and owner-scoped paths unchanged.
- Keep Preferences explicit-Save behavior; Settings and Privacy continue to apply immediately.
- Preserve identity lease checks before and after lease-sensitive asynchronous work.
- Keep Library in Sheet and keep `chooseAvatar` as the small Workspace facade adapter to the existing Avatar service.
- Add no dependency, framework, class, factory, service container, schema migration, cloud-function change, photo-policy change, or unrelated cleanup.
- Extend existing verifiers where practical; use one small direct verifier for the three Store repositories instead of enlarging `verify-cloud.cjs`.
- Preserve the current baseline: `npm run verify` may report only `[T] restore into fresh diary adds 7 — added 0`; every focused Stage 6 verifier must pass.
- Do not add or commit the user-owned untracked files `r7-check-runtime` or `r7-list-projects`.

## Review Focus

- A Store notification while a Preferences draft is open must not overwrite unsaved dietary or cuisine edits; Task 1 pins this.
- Unsupported saved or updated language values must normalize to `system`, while device-only settings remain usable without an account lease; Task 2 pins this.
- Repairable legacy memories with duplicate IDs must normalize once, first entry winning, while invalid entries are dropped; Task 3 pins this.
- Hidden or lower-revision cloud rows must not resurface or overwrite newer local rows, and pending overlays must remain projected; Task 4 pins this.
- An owner change during a Workspace response must reject the old response and must not clear the new owner's pending intent; Task 7 retains the existing check.

---

### Task 1: Extract the SettingsEditor vertical slice

**Files:**

- Create: `miniprogram/components/settings-editor/index.js`
- Create: `miniprogram/components/settings-editor/index.json`
- Create: `miniprogram/components/settings-editor/index.wxml`
- Create: `miniprogram/components/settings-editor/index.wxss`
- Modify: `miniprogram/components/sheet/index.js:17-19,66-115,227-255,513-564`
- Modify: `miniprogram/components/sheet/index.json`
- Modify: `miniprogram/components/sheet/index.wxml:203-304`
- Modify: `miniprogram/components/sheet/index.wxss:244-307,406-415,428-436`
- Modify: `tools/verify-sheet-edits.cjs`
- Modify: `tools/verify-preferences-contrast.cjs`

**Interfaces:**

- Consumes: `active: Boolean`, `show: Boolean`, `type: String`, and `dusk: Boolean`.
- Produces: `close` and `sheetchange` with `{ type: 'library', memoryId: '', filter: 'all' }`.
- Uses unchanged Store calls `updateSettings`, `notify`, `get`, and `subscribe`.
- Sheet retains sheet selection, closing, scrolling, title/subtitle, and identity reset behavior.

- [ ] **Step 1: Add failing behavior and boundary checks**

Extend the fixture Store in `tools/verify-sheet-edits.cjs` so `updateSettings` records calls and updates `state.settings`. Add a `settingsEditor(type)` fixture using the existing `loadComponent()` helper, then add:

```js
await test('sheet delegates settings views to SettingsEditor',()=>{
  const wxml=fs.readFileSync('miniprogram/components/sheet/index.wxml','utf8');
  const json=JSON.parse(fs.readFileSync('miniprogram/components/sheet/index.json','utf8'));
  assert.equal(json.usingComponents['settings-editor'],'/components/settings-editor/index');
  assert.match(wxml,/<settings-editor\b/);
  assert.doesNotMatch(wxml,/bindchange="onDietaryChange"/);
  assert.doesNotMatch(wxml,/bindtap="onPrivateToggle"/);
});
await test('Preferences stays local until Save and survives Store refresh',()=>{
  const h=settingsEditor('preferences');
  h.p.onDietaryChange({detail:{value:'2'}});
  h.p.onCuisineTap({currentTarget:{dataset:{value:'Japanese'}}});
  h.state.settings.reminders=false;h.emit();
  assert.equal(h.p.data.dietary,'Vegan');
  assert(h.p.data.cuisines.includes('Japanese'));
  assert.equal(h.updates.length,0);
  h.p.onPreferencesSave();
  assert.deepEqual(h.updates,[{dietary:'Vegan',cuisines:['Japanese']}]);
  assert(h.events.some(e=>e.name==='close'));
});
await test('Settings and Privacy still apply immediately',()=>{
  const settings=settingsEditor('settings');
  settings.p.onThemeTap({currentTarget:{dataset:{value:'dusk'}}});
  settings.p.onRemindersToggle();
  assert.deepEqual(settings.updates,[{theme:'dusk'},{reminders:false}]);
  const privacy=settingsEditor('privacy');
  privacy.p.onPrivateToggle();privacy.p.onManageMemories();
  assert.deepEqual(privacy.updates,[{privateByDefault:true}]);
  assert.deepEqual(privacy.events.at(-1),{name:'sheetchange',detail:{type:'library',memoryId:'',filter:'all'}});
});
```

- [ ] **Step 2: Verify the extraction contract fails**

Run `node tools/verify-sheet-edits.cjs`.

Expected: FAIL because `settings-editor` is not registered and its files do not exist.

- [ ] **Step 3: Create the minimal component**

Create `index.json`:

```json
{"component":true,"usingComponents":{"s-icon":"/components/icon/index"},"styleIsolation":"apply-shared"}
```

Create `index.js` with the current constants and handlers moved from Sheet. Use this lifecycle so immediate settings refresh while an edited Preferences draft remains local:

```js
const i18n=require('../../utils/i18n'),store=require('../../utils/store');
const DIETARY_OPTIONS=['No restrictions','Vegetarian','Vegan','Pescatarian','Gluten-free','Dairy-free'];
const CUISINE_OPTIONS=['French','Japanese','Italian','Chinese','Korean','Mediterranean','Mexican','Indian'];
Component({
 properties:{active:Boolean,show:Boolean,type:String,dusk:Boolean},
 data:{copy:i18n.copy(),dietary:'No restrictions',dietaryOptions:[],dietaryIndex:0,dietaryLabel:'',cuisines:[],cuisineOptions:[],languageOptions:[],languageIndex:0,theme:'pearl',reminders:true,reduceMotion:false,privateByDefault:false,showLocations:true},
 observers:{'active, show, type':function(active,show,type){const view=active&&show?type:'';if(view===this._view)return;this._view=view;this._editingPreferences=false;if(view)this.refresh();}},
 lifetimes:{
  attached(){this.unsubscribe=store.subscribe(()=>{if(!this._view||(this._view==='preferences'&&this._editingPreferences))return;this.refresh();});if(this.data.active&&this.data.show){this._view=this.data.type;this.refresh();}},
  detached(){if(this.unsubscribe)this.unsubscribe();},
 },
 methods:{
  refresh(){const s=store.get().settings,languageOptions=i18n.options(),patch={copy:i18n.copy(),languageOptions,languageIndex:Math.max(0,languageOptions.findIndex(x=>x.value===s.language)),theme:s.theme,reminders:s.reminders,reduceMotion:s.reduceMotion,privateByDefault:s.privateByDefault,showLocations:s.showLocations};if(this._view==='preferences'&&!this._editingPreferences)Object.assign(patch,{dietary:s.dietary,dietaryOptions:DIETARY_OPTIONS.map(value=>i18n.t(value)),dietaryLabel:i18n.t(s.dietary),dietaryIndex:Math.max(0,DIETARY_OPTIONS.indexOf(s.dietary)),cuisines:s.cuisines.slice(),cuisineOptions:CUISINE_OPTIONS.map(value=>({value,label:i18n.t(value)}))});this.setData(patch);},
  onDietaryChange(e){const i=Number(e.detail.value);this._editingPreferences=true;this.setData({dietaryIndex:i,dietary:DIETARY_OPTIONS[i],dietaryLabel:i18n.t(DIETARY_OPTIONS[i])});},
  onCuisineTap(e){const value=e.currentTarget.dataset.value,list=this.data.cuisines.slice(),i=list.indexOf(value);this._editingPreferences=true;if(i>=0)list.splice(i,1);else list.push(value);this.setData({cuisines:list});},
  onPreferencesSave(){store.updateSettings({dietary:this.data.dietary,cuisines:this.data.cuisines});store.notify(i18n.t('Your tastes, remembered. Preferences saved.'));this.triggerEvent('close');},
  onLanguageChange(e){const option=i18n.options()[Number(e.detail.value)];if(option)store.updateSettings({language:option.value});},
  onThemeTap(e){store.updateSettings({theme:e.currentTarget.dataset.value});},
  onRemindersToggle(){store.updateSettings({reminders:!this.data.reminders});},onQuietToggle(){store.updateSettings({reduceMotion:!this.data.reduceMotion});},
  onPrivateToggle(){store.updateSettings({privateByDefault:!this.data.privateByDefault});},onLocationsToggle(){store.updateSettings({showLocations:!this.data.showLocations});},
  onManageMemories(){this.triggerEvent('sheetchange',{type:'library',memoryId:'',filter:'all'});},
 },
});
```

Move the complete existing Preferences, Settings, and Privacy children from Sheet WXML lines 203-304 into a root `<view class="settings-editor {{dusk ? 'is-dusk' : ''}}">`, retaining the three `type` conditions and all accessibility attributes. Move only their specific WXSS rules from Sheet lines 244-307 and 414-415; copy relevant dark descendants from lines 428-436 with `.theme-dusk-panel` changed to `.is-dusk`. Common form/button/toggle rules stay in `app.wxss`.

- [ ] **Step 4: Wire the child and remove moved Sheet code**

Register `settings-editor` and replace the three WXML blocks with:

```xml
<settings-editor wx:if="{{displayType === 'preferences' || displayType === 'settings' || displayType === 'privacy'}}" active="{{displayType === 'preferences' || displayType === 'settings' || displayType === 'privacy'}}" show="{{show}}" type="{{displayType}}" dusk="{{dusk}}" bindclose="onSettingsClose" bindsheetchange="onSettingsSheetChange" />
```

Add only:

```js
onSettingsClose(){this.close();},
onSettingsSheetChange(event){this.triggerEvent('sheetchange',event.detail);},
```

Remove the moved constants, data fields, refresh branches, handlers, markup, and styles. Keep `dusk`, `quiet`, titles, and all Library code in Sheet.

- [ ] **Step 5: Retarget and run focused checks**

Make `tools/verify-preferences-contrast.cjs` read the new WXSS, then run:

```powershell
node tools/verify-sheet-edits.cjs
node tools/verify-preferences-contrast.cjs
node tools/verify-audit-stages.cjs sheet
```

Expected: all checks PASS.

- [ ] **Step 6: Commit the UI slice**

```powershell
git add -- miniprogram/components/settings-editor miniprogram/components/sheet/index.js miniprogram/components/sheet/index.json miniprogram/components/sheet/index.wxml miniprogram/components/sheet/index.wxss tools/verify-sheet-edits.cjs tools/verify-preferences-contrast.cjs
git commit -m "refactor: extract settings editor"
```

---

### Task 2: Extract Settings repository transformations

**Files:**

- Create: `miniprogram/utils/settingsRepository.js`
- Create: `tools/verify-store-repositories.cjs`
- Modify: `miniprogram/utils/store.js:12-15,35-42,105-108,231-239`
- Modify: `package.json`

**Interfaces:**

- Produces: `normalize(saved)`, `merge(current, changes)`, and `requiresLease(changes)`.
- Store retains device-setting I/O, commits, language side effects, and listeners.
- Unknown keys remain merged; only `theme`, `language`, and `reduceMotion` are device-safe.

- [ ] **Step 1: Write the failing direct checks**

Create `tools/verify-store-repositories.cjs`:

```js
const assert=require('node:assert/strict');let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
const settings=require('../miniprogram/utils/settingsRepository');
test('settings normalize invalid persisted display values',()=>{const value=settings.normalize({theme:'unknown',language:'xx',reminders:false});assert.equal(value.theme,'pearl');assert.equal(value.language,'system');assert.equal(value.reminders,false);});
test('settings merge preserves data and classifies lease-required keys',()=>{assert.deepEqual(settings.merge({language:'en',custom:true},{language:'xx'}),{language:'system',custom:true});assert.equal(settings.requiresLease({theme:'dusk',language:'en',reduceMotion:true}),false);assert.equal(settings.requiresLease({dietary:'Vegan'}),true);});
console.log(count+' Store repository checks passed.');
```

- [ ] **Step 2: Verify the module is missing**

Run `node tools/verify-store-repositories.cjs`.

Expected: FAIL with `Cannot find module '../miniprogram/utils/settingsRepository'`.

- [ ] **Step 3: Implement and delegate**

Create:

```js
const data=require('./data'),DEVICE_KEYS=['theme','language','reduceMotion'];
const language=value=>['system','zh-CN','en'].includes(value)?value:'system';
function normalize(saved){const value=Object.assign({},data.defaultSettings,saved&&typeof saved==='object'?saved:{});if(value.theme!=='dusk')value.theme='pearl';value.language=language(value.language);return value;}
function merge(current,changes){const value=Object.assign({},current,changes);value.language=language(value.language);return value;}
function requiresLease(changes){return Object.keys(changes).some(key=>!DEVICE_KEYS.includes(key));}
module.exports={normalize,merge,requiresLease};
```

Use `settingsRepository.normalize(parsed.settings)` in `loadDiary`, and:

```js
function updateSettings(changes){ensureLoaded();if(settingsRepository.requiresLease(changes))identity.lease();const settings=settingsRepository.merge(state.settings,changes);identity.saveDeviceSettings(settings);if(!identity.snapshot().locked)commit(Object.assign({},state,{settings}),settings.language);else{state.settings=settings;i18n.setLanguage(settings.language);listeners.slice().forEach(fn=>{try{fn(state);}catch(e){}});}}
```

Add `"verify:store-boundaries": "node tools/verify-store-repositories.cjs"` to `package.json` and include it once in `verify:all` after `verify:cloud`.

- [ ] **Step 4: Run and commit**

Run `npm run verify:store-boundaries`, `npm run verify:cloud`, and `node tools/verify-preferences-contrast.cjs`; expect PASS. Then:

```powershell
git add -- miniprogram/utils/settingsRepository.js miniprogram/utils/store.js tools/verify-store-repositories.cjs package.json
git commit -m "refactor: extract settings repository"
```

---

### Task 3: Extract Memory repository transformations

**Files:**

- Create: `miniprogram/utils/memoryRepository.js`
- Modify: `miniprogram/utils/store.js:12-15,44-112,241-268`
- Modify: `tools/verify-store-repositories.cjs`

**Interfaces:**

- Produces: `restore(list)`, `privateCopy(source, id)`, and `mergeImports(current, copies)`.
- Store retains storage, leases, generated IDs, commit order, and exported `privateCopy(source)`.

- [ ] **Step 1: Add failing Memory checks**

Insert before the script's final `console.log` so the total remains last:

```js
const data=require('../miniprogram/utils/data'),memories=require('../miniprogram/utils/memoryRepository');
const sample=()=>JSON.parse(JSON.stringify(data.initialMemories[0]));
test('memory restore repairs once, drops invalid rows, and keeps first duplicate',()=>{const result=memories.restore([{...sample(),id:'same',restaurant:'First'},{...sample(),id:'same',restaurant:'Second'},{...sample(),id:'repair',restaurant:' Repair ',rating:99,locationSource:'tencent-search',geoConfirmed:false,city:'private',country:'private'},null]);assert.equal(result.filter(x=>x.id==='same').length,1);assert.equal(result.find(x=>x.id==='same').restaurant,'First');assert.equal(result.find(x=>x.id==='repair').restaurant,'Repair');assert.equal(result.find(x=>x.id==='repair').rating,0);assert.equal(result.find(x=>x.id==='repair').city,'');});
test('private import strips remote authority and media',()=>{const copy=memories.privateCopy({...sample(),id:'foreign',cloudId:'cloud',coupleId:'space',shared:true,ratings:{A:5},ratingSource:'legacy-average'},'local');assert.equal(copy.id,'local');assert.equal(copy.importSourceId,'foreign');assert(!copy.cloudId&&!copy.coupleId&&!copy.ratings&&!copy.shared);assert.equal(copy.noPhoto,true);assert.equal(copy.rating,0);});
test('import merge deduplicates source ownership without mutating current rows',()=>{const current=[{...sample(),id:'kept',importSourceId:'foreign'}],result=memories.mergeImports(current,[memories.privateCopy({...sample(),id:'foreign'},'skip'),memories.privateCopy({...sample(),id:'new-source'},'new-local')]);assert.equal(result.count,1);assert.equal(result.memories[0].id,'new-local');assert.equal(current.length,1);});
```

- [ ] **Step 2: Verify the module is missing**

Run `npm run verify:store-boundaries`.

Expected: FAIL with `Cannot find module '../miniprogram/utils/memoryRepository'`.

- [ ] **Step 3: Move transformations and delegate**

Move the current `normalizeMemory` body unchanged into `normalize`. Add:

```js
function restore(list){if(!Array.isArray(list))return [];const normalized=list.filter(data.isMemory).concat(list.filter(item=>!data.isMemory(item)).map(normalize).filter(Boolean)),seen=Object.create(null);return normalized.filter(memory=>seen[memory.id]?false:(seen[memory.id]=true));}
function privateCopy(source,id){const memory=Object.assign({},source,{id,importSourceId:source.id,shared:false,liked:false,saved:false});['cloudId','revision','localChanges','pendingDelete','deleted','memberOpenids','coupleId','operationIds','operationReceipts','ratings'].forEach(key=>delete memory[key]);if(memory.ratingSource==='legacy-average'){memory.rating=0;memory.ratingSource='unrated';}memory.photo=data.photos.meal;memory.noPhoto=true;memory.extraPhotos=[];delete memory.placePhoto;return memory;}
function mergeImports(current,copies){const additions=[];copies.forEach(memory=>{if(current.some(row=>row.importSourceId===memory.importSourceId||row.id===memory.importSourceId)||additions.some(row=>row.importSourceId===memory.importSourceId)||current.some(row=>row.id===memory.id)||additions.some(row=>row.id===memory.id))return;additions.push(memory);});return {memories:additions.concat(current),count:additions.length};}
module.exports={restore,privateCopy,mergeImports};
```

Store uses `memoryRepository.restore(parsed.memories)`, keeps `function privateCopy(source){return memoryRepository.privateCopy(source,data.createId());}`, and changes import to:

```js
function importMemories(sources){identity.lease();ensureLoaded();const merged=memoryRepository.mergeImports(state.memories,(sources||[]).map(privateCopy));if(merged.count)commit(Object.assign({},state,{memories:merged.memories}));return merged.count;}
```

Remove only the now-unused local `allMemoriesValid` and `normalizeMemory` functions.

- [ ] **Step 4: Run and commit**

Run `npm run verify:store-boundaries`, `npm run verify:cloud`, `npm run verify:identity`, and `node tools/verify-miniprogram.cjs`. Focused checks must PASS; the last command may stop only at the documented baseline. Then:

```powershell
git add -- miniprogram/utils/memoryRepository.js miniprogram/utils/store.js tools/verify-store-repositories.cjs
git commit -m "refactor: extract memory repository"
```

---

### Task 4: Extract Sync repository transformations

**Files:**

- Create: `miniprogram/utils/syncRepository.js`
- Modify: `miniprogram/utils/store.js:12-15,275-305,307-339,404-428`
- Modify: `tools/verify-store-repositories.cjs`

**Interfaces:**

- Produces: `canResolve(code)`, `overlay(memory, operations)`, and `mergeCloud(local, remote, hiddenIds, outbox)`.
- Store retains IDs, identity, commits, network calls, flights, retries, draft cleanup, and public delegates.

- [ ] **Step 1: Add failing Sync checks**

Insert before the script's final `console.log` so the total remains last:

```js
const sync=require('../miniprogram/utils/syncRepository');
test('sync overlay projects only editable fields, flags, and deletes',()=>{const base={id:'r',restaurant:'Old',liked:false,revision:2,createdBy:'owner'},value=sync.overlay(base,[{recordId:'r',kind:'flags',patch:{liked:true,createdBy:'forged'}},{recordId:'r',kind:'update',memory:{restaurant:'New',createdBy:'forged'}}]);assert.equal(value.restaurant,'New');assert.equal(value.liked,true);assert.equal(value.createdBy,'owner');assert.equal(sync.overlay(base,[{recordId:'r',kind:'delete'}]).pendingDelete,true);});
test('cloud merge excludes hidden and stale rows while retaining overlays',()=>{const local=[{id:'newer',cloudId:'newer',date:'2026-01-02',revision:3,restaurant:'Local',liked:true},{id:'overlay',cloudId:'overlay',date:'2026-01-03',revision:1,restaurant:'Server',liked:false},{id:'local',date:'2026-01-01',restaurant:'Local only'}],remote=[{id:'newer',cloudId:'newer',date:'2026-01-04',revision:2,restaurant:'Stale'},{id:'overlay',cloudId:'overlay',date:'2026-01-03',revision:1,restaurant:'Server',liked:false},{id:'hidden',cloudId:'hidden',date:'2026-01-05',revision:1,restaurant:'Hidden'}];remote.deletedIds=[];const result=sync.mergeCloud(local,remote,['hidden'],[{recordId:'overlay',kind:'flags',patch:{liked:true}}]);assert.equal(result.find(x=>x.id==='newer').restaurant,'Local');assert.equal(result.find(x=>x.id==='overlay').liked,true);assert(!result.some(x=>x.id==='hidden'));assert.equal(result.at(-1).id,'local');});
```

- [ ] **Step 2: Verify the module is missing**

Run `npm run verify:store-boundaries`.

Expected: FAIL with `Cannot find module '../miniprogram/utils/syncRepository'`.

- [ ] **Step 3: Move pure Sync logic**

Move `canResolve` and `overlay` unchanged. Add:

```js
function mergeCloud(local,remote,hiddenIds,outbox){const byId=Object.create(null);local.forEach(memory=>{byId[memory.id]=memory;});(remote.deletedIds||[]).forEach(id=>{delete byId[id];});remote.forEach(memory=>{if(hiddenIds.includes(memory.id))return;const old=byId[memory.id];if(old&&(old.revision||0)>(memory.revision||0))return;const merged=overlay(Object.assign({},memory,old&&old.localChanges),outbox.filter(operation=>operation.recordId===memory.id));if(merged.pendingDelete)delete byId[memory.id];else byId[memory.id]=merged;});const all=Object.keys(byId).map(id=>byId[id]);return all.filter(memory=>memory.cloudId).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)).concat(all.filter(memory=>!memory.cloudId));}
module.exports={canResolve,overlay,mergeCloud};
```

Replace internal Store calls with repository calls, retain `function canResolve(code){return syncRepository.canResolve(code);}`, and reduce cloud merge to:

```js
function mergeCloudRead(memories,token){identity.assertLease(token);const merged=syncRepository.mergeCloud(state.memories,memories,state.cloudHidden,state.outbox);commit(Object.assign({},state,{memories:merged}));return state.memories;}
```

- [ ] **Step 4: Run and commit**

Run `npm run verify:store-boundaries`, `npm run verify:cloud`, and `npm run verify:identity`; expect PASS. Then:

```powershell
git add -- miniprogram/utils/syncRepository.js miniprogram/utils/store.js tools/verify-store-repositories.cjs
git commit -m "refactor: extract sync repository"
```

---

### Task 5: Extract the Workspace cloud client

**Files:**

- Create: `miniprogram/utils/workspaceClient.js`
- Modify: `miniprogram/utils/workspace.js:1-10,63`
- Modify: `tools/verify-workspace.cjs`

**Interfaces:**

- Produces: `call(action, args = {}, token = identity.lease())`.
- Preserves business-cloud permission, both lease assertions, protocol `1`, expected owner ID, identity invalidation, and error codes.
- `workspace.js.call` remains the exact public function reference.

- [ ] **Step 1: Add a failing boundary check**

Add beside the real client-module setup in `tools/verify-workspace.cjs`:

```js
await test('workspace facade exposes the extracted client unchanged',()=>{const client=require('../miniprogram/utils/workspaceClient');assert.equal(service.call,client.call);});
```

- [ ] **Step 2: Verify the module is missing**

Run `npm run verify:workspace`.

Expected: FAIL because `workspaceClient.js` does not exist.

- [ ] **Step 3: Move the cloud wrapper unchanged**

Create:

```js
const identity=require('./identity'),records=require('./cloudRecords');
const fail=code=>{throw Object.assign(new Error(code),{code});};
async function call(action,args={},token=identity.lease()){
 identity.assertBusinessCloudAllowed();identity.assertLease(token);records.initCloud();
 const response=await wx.cloud.callFunction({name:'workspace',data:{...args,action,protocolVersion:1,expectedUserId:token.userId}});
 identity.assertLease(token);const result=response&&response.result;
 if(result&&result.code==='IDENTITY_MISMATCH'){identity.invalidate();fail('IDENTITY_MISMATCH');}
 if(!result||!result.success)fail(result&&result.code||'WORKSPACE_UNAVAILABLE');
 if(result.protocolVersion!==1)fail('UPGRADE_REQUIRED');return result;
}
module.exports={call};
```

Replace the local implementation with `const client=require('./workspaceClient')`, route every internal cloud call through `client.call`, and export `call:client.call`.

- [ ] **Step 4: Run and commit**

Run `npm run verify:workspace`, `npm run verify:profile-sync`, and `npm run verify:identity`; expect PASS. Then:

```powershell
git add -- miniprogram/utils/workspaceClient.js miniprogram/utils/workspace.js tools/verify-workspace.cjs
git commit -m "refactor: extract workspace client"
```

---

### Task 6: Extract owner-scoped Workspace files

**Files:**

- Create: `miniprogram/utils/workspaceFiles.js`
- Modify: `miniprogram/utils/workspace.js:1-16,63`
- Modify: `tools/verify-workspace.cjs`

**Interfaces:**

- Produces: `directory(token)` and `writeFile(contents, suffix = 'json', token = identity.lease())`.
- `workspace.js.writeFile` remains the public compatibility reference.
- Every directory/write operation retains owner lease checks and the current scoped path format.

- [ ] **Step 1: Add a failing file-boundary check**

```js
await test('workspace facade uses owner-scoped file adapter',()=>{const filesApi=require('../miniprogram/utils/workspaceFiles');assert.equal(service.writeFile,filesApi.writeFile);const saved=service.writeFile('fixture','json',identity.lease());assert(saved.startsWith('/user/savor-workspace/'));assert(files.has(saved));});
```

- [ ] **Step 2: Verify the module is missing**

Run `npm run verify:workspace`.

Expected: FAIL because `workspaceFiles.js` does not exist.

- [ ] **Step 3: Move the owner-scoped functions**

Create:

```js
const identity=require('./identity'),data=require('./data'),config=require('./runtimeConfig');
function directory(token){identity.assertLease(token);const path=wx.env.USER_DATA_PATH+'/savor-workspace/'+config.fileScope+token.userId;try{wx.getFileSystemManager().accessSync(path);}catch(error){wx.getFileSystemManager().mkdirSync(path,true);}return path;}
function writeFile(contents,suffix='json',token=identity.lease()){const path=directory(token)+'/savor-'+Date.now()+'-'+data.createId()+'.'+suffix;wx.getFileSystemManager().writeFileSync(path,contents,'utf8');identity.assertLease(token);return path;}
module.exports={directory,writeFile};
```

Replace Workspace's local functions with `const files=require('./workspaceFiles')`, use `files.directory` and `files.writeFile` internally, and export `writeFile:files.writeFile`.

- [ ] **Step 4: Run and commit**

Run `npm run verify:workspace` and `npm run verify:profile-sync`; expect PASS. Then:

```powershell
git add -- miniprogram/utils/workspaceFiles.js miniprogram/utils/workspace.js tools/verify-workspace.cjs
git commit -m "refactor: extract workspace files"
```

---

### Task 7: Move archive workflows behind the Workspace facade

**Files:**

- Create: `miniprogram/utils/archiveService.js`
- Modify: `miniprogram/utils/workspace.js`
- Modify: `tools/verify-workspace.cjs`

**Interfaces:**

- Produces: `localRows`, `parseArchive`, `createArchive`, `mutate`, `retry`, `preservePending`, `finishTask`, and `exportTask` with their current signatures.
- Consumes: `workspaceClient.call`, `workspaceFiles.directory`, and `workspaceFiles.writeFile`.
- `workspace.js` exports the same eleven public names and keeps only facade wiring plus `chooseAvatar`.

- [ ] **Step 1: Add failing facade and path-safety checks**

```js
await test('workspace facade exposes archive service without changing its API',()=>{const archive=require('../miniprogram/utils/archiveService');for(const name of ['localRows','parseArchive','createArchive','mutate','retry','preservePending','finishTask','exportTask'])assert.equal(service[name],archive[name]);assert.deepEqual(Object.keys(service).sort(),['call','chooseAvatar','createArchive','exportTask','finishTask','localRows','mutate','parseArchive','preservePending','retry','writeFile'].sort());});
await test('archive retry rejects a path outside its owner directory',async()=>{const token=identity.lease();identity.saveWorkspaceIntent({actorUserId:token.userId,operationId:'bad_path',action:'archive',kind:'import',count:1,filePath:'/user/savor-workspace/../foreign.json'});await assert.rejects(()=>service.retry(),error=>error.code==='INVALID_ARCHIVE_PATH');identity.saveWorkspaceIntent(null);});
```

- [ ] **Step 2: Verify the service is missing**

Run `npm run verify:workspace`.

Expected: FAIL because `archiveService.js` does not exist.

- [ ] **Step 3: Move archive behavior without rewriting it**

Move `localRows`, `parseArchive`, `keep`, `execute`, `mutate`, `createArchive`, `retry`, `preservePending`, `finishTask`, and `exportTask` from `workspace.js` into `archiveService.js`. Keep their bodies and checks unchanged except these direct substitutions:

```js
const identity=require('./identity'),data=require('./data'),records=require('./cloudRecords'),stats=require('./memoryStats');
const client=require('./workspaceClient'),files=require('./workspaceFiles');
const fail=code=>{throw Object.assign(new Error(code),{code});};
// call(...) becomes client.call(...)
// directory(...) becomes files.directory(...)
// writeFile(...) becomes files.writeFile(...)
module.exports={localRows,parseArchive,createArchive,mutate,retry,preservePending,finishTask,exportTask};
```

Do not export internal `keep` or `execute`. Keep the lazy `require('./store')` inside `localRows` so initialization order is unchanged.

Reduce `workspace.js` to:

```js
const identity=require('./identity'),avatar=require('./avatar');
const client=require('./workspaceClient'),files=require('./workspaceFiles'),archive=require('./archiveService');
const fail=code=>{throw Object.assign(new Error(code),{code});};
async function chooseAvatar(){let token=identity.lease();const picked=await new Promise((resolve,reject)=>wx.chooseMedia({count:1,mediaType:['image'],sourceType:['album','camera'],success:resolve,fail:reject}));token=await identity.resumeNative(token);const src=picked.tempFiles&&picked.tempFiles[0]&&picked.tempFiles[0].tempFilePath;if(!src)fail('NO_AVATAR_SELECTED');return avatar.forCloud(await avatar.prepare(src,token,'album'),token);}
module.exports={call:client.call,writeFile:files.writeFile,...archive,chooseAvatar};
```

- [ ] **Step 4: Run and commit**

Run `npm run verify:workspace`, `npm run verify:profile-sync`, `npm run verify:identity`, and `npm run verify:audit-stages`; expect PASS, including the existing late-owner-response check. Then:

```powershell
git add -- miniprogram/utils/archiveService.js miniprogram/utils/workspace.js tools/verify-workspace.cjs
git commit -m "refactor: extract archive service"
```

---

### Task 8: Verify Stage 6 compatibility

**Files:**

- Modify only if a failing focused check identifies a Stage 6 regression in a file already listed above.

**Interfaces:**

- Consumes all boundaries from Tasks 1-7.
- Produces verification evidence and a clean Stage 6 diff; no new runtime API.

- [ ] **Step 1: Run focused boundary suites**

```powershell
npm run verify:sheet-edits
npm run verify:preferences-contrast
npm run verify:store-boundaries
npm run verify:cloud
npm run verify:identity
npm run verify:profile-sync
npm run verify:workspace
npm run verify:audit-stages
npm run verify:structure
```

Expected: every command PASS.

- [ ] **Step 2: Run the repository baseline verifier**

Run `npm run verify`.

Expected: no Stage 6 regression. The only permitted failure is `[T] restore into fresh diary adds 7 — added 0`.

- [ ] **Step 3: Inspect scope and contracts**

```powershell
git diff 00a45ba --check
git diff 00a45ba --stat
git status --short
```

Confirm Store and Workspace exports match their pre-stage exports; no storage key, cloud payload, archive format, cloud function, Library, photo policy, copy, or migration changed; and the two user-owned untracked files remain untouched.

- [ ] **Step 4: Correct only an evidenced regression**

If verification exposes a Stage 6 regression, make the smallest correction in the owning task's files, rerun that focused command and every command from Step 1, use the owning task's exact `git add -- ...` command, inspect the staged names, and commit:

```powershell
git diff --cached --name-only
git commit -m "fix: preserve stage 6 compatibility"
```

If no correction is required, do not create an empty commit.
