const identity = require('./identity');
const localDate = require('./localDate');
// Diary store — CommonJS singleton port of the web baseline (src/store.tsx).
// Storage keys, defaults, validation, migration and dedupe semantics are
// preserved; localStorage is replaced by wx storage with a corrupt-data
// fallback, and photo files are cleaned up on delete (utils/photos).
//
// NOTE: the custom tab bar must never require this module. Pages push
// theme state into the tab bar via this.getTabBar().setData(...) so a
// store failure can never take down navigation.

const data = require('./data');
const i18n = require('./i18n');
const profileRepository = require('./profileRepository');
const settingsRepository = require('./settingsRepository');

const STORAGE_KEY = 'savor-diary-v1';
const DRAFT_KEY = 'savor-draft-v1';

const state = {
  memories: [],
  profile: Object.assign({}, data.defaultProfile),
  settings: Object.assign({}, data.defaultSettings),
  feedback: [],
  cloudHidden: [],
  outbox: [],
};

let loaded = false;
let networkBound=false;
const listeners = [];
const toastListeners = [];
let toastTimer = null;
let currentToast = null;

function defaults() {
  return {
    memories: [],
    profile: Object.assign({}, data.defaultProfile),
    settings: Object.assign({}, data.defaultSettings),
    feedback: [],
  };
}

// Strict mode: every memory must fully validate (web parity).
function allMemoriesValid(list) {
  return Array.isArray(list) && list.every(data.isMemory);
}

// Migration / normalize path: accept older or slightly malformed entries,
// coerce known shapes, and drop only irreparable items.
function normalizeMemory(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const item = Object.assign({}, raw);
  if (['tencent-picker','tencent-search'].includes(item.locationSource) && item.geoConfirmed !== true) { item.city=''; item.country=''; }
  item.id = typeof item.id === 'string' && item.id ? item.id : data.createId();
  item.restaurant = typeof item.restaurant === 'string' ? item.restaurant.trim() : '';
  item.city = typeof item.city === 'string' ? item.city : '';
  item.country = typeof item.country === 'string' ? item.country : '';
  item.neighborhood = typeof item.neighborhood === 'string' ? item.neighborhood : '';
  item.notes = typeof item.notes === 'string' ? item.notes : '';
  item.rating = Math.round(Number(item.rating));
  if (!(item.rating >= 0 && item.rating <= 5)) item.rating = 0;
  item.tags = Array.isArray(item.tags) ? item.tags.filter(function (t) { return typeof t === 'string'; }) : [];
  item.photo = typeof item.photo === 'string' ? item.photo : data.photos.meal;
  if (item.placePhoto !== undefined && !data.isSafeImage(item.placePhoto)) item.placePhoto = undefined;
  item.extraPhotos = Array.isArray(item.extraPhotos) ? item.extraPhotos.filter(data.isSafeImage) : [];
  if (Array.isArray(item.coordinates) && item.coordinates.length === 2
    && item.coordinates.every(function (c) { return typeof c === 'number' && Number.isFinite(c); })
    && Math.abs(item.coordinates[0]) <= 90 && Math.abs(item.coordinates[1]) <= 180) {
    item.coordinates = [item.coordinates[0], item.coordinates[1]];
  } else {
    item.coordinates = [48.8535, 2.3392];
  }
  item.shared = Boolean(item.shared);
  item.liked = Boolean(item.liked);
  item.saved = Boolean(item.saved);
  return data.isMemory(item) ? item : null;
}

function loadDiary() {
  let parsed = null;
  try {
    const saved = identity.getStorageSync(STORAGE_KEY);
    if (saved && typeof saved === 'string') parsed = JSON.parse(saved);
    else if (saved && typeof saved === 'object') parsed = saved;
  } catch (error) {
    throw error; // corrupt account cache remains untouched
  }
  if (!parsed || typeof parsed !== 'object') return defaults();

  const memories = Array.isArray(parsed.memories)
    ? parsed.memories.filter(data.isMemory).concat(
        // migrate repairable entries after the strict pass
        parsed.memories.filter(function (m) { return !data.isMemory(m); })
          .map(normalizeMemory).filter(Boolean)
      )
    : [];
  // dedupe by id (first wins)
  const seen = Object.create(null);
  const deduped = [];
  memories.forEach(function (memory) {
    if (!seen[memory.id]) { seen[memory.id] = true; deduped.push(memory); }
  });

  const profile = Object.assign({}, data.defaultProfile, parsed.profile && typeof parsed.profile === 'object' ? parsed.profile : {});
  const settings = settingsRepository.normalize(parsed.settings);
  const feedback = Array.isArray(parsed.feedback) ? parsed.feedback.filter(function (f) {
    return f && typeof f.message === 'string' && typeof f.date === 'string';
  }) : [];
  return { memories: deduped, profile, settings, feedback, outbox: Array.isArray(parsed.outbox) ? parsed.outbox.filter(op=>op && typeof op.id==='string' && typeof op.recordId==='string' && ['flags','delete','update'].includes(op.kind)) : [], cloudHidden: Array.isArray(parsed.cloudHidden) ? parsed.cloudHidden.filter(id => typeof id === 'string') : [] };
}

function ensureLoaded() {
  if (!loaded) {
    const loadedState = loadDiary();
    state.memories = loadedState.memories.map(m => ['tencent-picker','tencent-search'].includes(m.locationSource) && m.geoConfirmed !== true ? Object.assign({},m,{city:'',country:''}) : m);
    state.profile = loadedState.profile;
    state.settings = Object.assign({},loadedState.settings,identity.deviceSettings());
    state.feedback = loadedState.feedback;
    state.cloudHidden = loadedState.cloudHidden || [];
    state.outbox = loadedState.outbox || [];
    if(!networkBound&&wx.onNetworkStatusChange){networkBound=true;wx.onNetworkStatusChange(r=>{if(r.isConnected){identity.verify().then(()=>syncCloud()).catch(()=>{});}});}
    loaded = true;
    state.identity=identity.snapshot();
    // Unknown legacy changes are never automatically claimed.
    i18n.setLanguage(state.settings.language);

  }
}

function get() {
  ensureLoaded();
  return state;
}

function subscribe(listener) {
  listeners.push(listener);
  return function unsubscribe() {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

function notify(message) {
  currentToast = { id: Date.now(), message: i18n.t(message) };
  toastListeners.slice().forEach(function (listener) {
    try { listener(currentToast); } catch (error) { /* ignore */ }
  });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    currentToast = null;
    toastListeners.slice().forEach(function (listener) {
      try { listener(null); } catch (error) { /* ignore */ }
    });
  }, 4200);
}

function dismissToast() {
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  currentToast = null;
  toastListeners.slice().forEach(function (listener) {
    try { listener(null); } catch (error) { /* ignore */ }
  });
}

function onToast(listener) {
  toastListeners.push(listener);
  return function () {
    const index = toastListeners.indexOf(listener);
    if (index >= 0) toastListeners.splice(index, 1);
  };
}

function addMemory(memory) {
  identity.lease();
  ensureLoaded();
  if(memory.deleted) {commit(Object.assign({},state,{memories:state.memories.filter(m=>m.id!==memory.id),cloudHidden:Array.from(new Set(state.cloudHidden.concat(memory.id)))}));return;}
  commit(Object.assign({},state,{memories:[memory].concat(state.memories.filter(m=>m.id!==memory.id))}));
}

function updateMemory(id, changes) {
  identity.lease();
  ensureLoaded();
  const cloudMemory=state.memories.find(m=>m.id===id && m.cloudId);
  if(cloudMemory && Object.keys(changes).every(k=>['saved','liked','shared'].includes(k))) {
    try { queueMutation(cloudMemory,'flags',changes); flushOutbox().catch(()=>{}); } catch(e) {notify(i18n.t('Could not save. Free some storage and try again.'));}
    return;
  }
  if(cloudMemory) throw new Error('Use the cloud edit workflow for record fields.');
  const memories = state.memories.map(function (memory) {
    return memory.id === id ? Object.assign({},memory,changes) : memory;
  });
  commit(Object.assign({},state,{memories}));
}

// `collectFiles` (optional) lets the caller clean orphan photos after the
// state change; photos module handles the actual deletion.
function deleteMemory(id) {
  identity.lease();
  ensureLoaded();
  const cloudMemory=state.memories.find(m=>m.id===id && m.cloudId);
  if(cloudMemory) { queueMutation(cloudMemory,'delete',{}); flushOutbox().catch(()=>{}); return; }
  commit(Object.assign({},state,{memories:state.memories.filter(memory=>memory.id!==id)}));
}

function updateProfile(changes) {
  identity.lease();
  ensureLoaded();
  commit(profileRepository.save(state,changes));
}

// Transactional local preferences: do not show success or mutate live state
// when storage fails. Profile photo, memories and unrelated settings survive.
function updatePersonalization(pageHeadings, profile) {
  identity.lease();
  ensureLoaded();
  const headings = require('./pageHeadings');
  const name = headings.clean(profile && profile.name, 32);
  if (!name) throw new Error('Your name cannot be empty.');
  const nextProfile = Object.assign({}, state.profile, { name, bio: headings.clean(profile.bio, 55) });
  const nextSettings = Object.assign({}, state.settings, { pageHeadings: headings.normalize(pageHeadings) });
  const next = Object.assign({}, state, { profile: nextProfile, settings: nextSettings });
  identity.setStorageSync(STORAGE_KEY, JSON.stringify(next));
  state.profile = nextProfile;
  state.settings = nextSettings;
  listeners.slice().forEach(function (listener) { try { listener(state); } catch (error) {} });
}

function updateSettings(changes) {
  ensureLoaded();
  if(settingsRepository.requiresLease(changes))identity.lease();
  const settings=settingsRepository.merge(state.settings,changes);
  identity.saveDeviceSettings(settings);
  if(!identity.snapshot().locked)commit(Object.assign({},state,{settings}),settings.language);
  else {state.settings=settings;i18n.setLanguage(settings.language);listeners.slice().forEach(fn=>{try{fn(state);}catch(e){}});}
}

function importMemories(memories) {
  identity.lease();
  ensureLoaded();
  const knownIds = Object.create(null);
  state.memories.forEach(function (memory) { knownIds[memory.id] = true; });
  const additions = [];
  (memories || []).forEach(function (source) {
    if(state.memories.some(m=>m.importSourceId===source.id||m.id===source.id)||additions.some(m=>m.importSourceId===source.id))return;
    const memory = privateCopy(source);
    if (knownIds[memory.id]) return;
    knownIds[memory.id] = true;
    additions.push(memory);
  });
  if (additions.length) {
    commit(Object.assign({},state,{memories:additions.concat(state.memories)}));
  }
  return additions.length;
}

function privateCopy(source) {
  const memory=Object.assign({},source,{id:data.createId(),importSourceId:source.id,shared:false,liked:false,saved:false});
  ['cloudId','revision','localChanges','pendingDelete','deleted','memberOpenids','coupleId','operationIds','operationReceipts'].forEach(k=>delete memory[k]);
  // Backup ownership does not authorize reading private assets or dual votes.
  ['ratings'].forEach(k=>delete memory[k]);
  if(memory.ratingSource==='legacy-average'){memory.rating=0;memory.ratingSource='unrated';}
  memory.photo=data.photos.meal;memory.noPhoto=true;memory.extraPhotos=[];delete memory.placePhoto;
  return memory;
}
function saveFeedback(message) {
  identity.lease();
  ensureLoaded();
  commit(Object.assign({},state,{feedback:state.feedback.concat([{message,date:new Date().toISOString()}])}));
}

// Durable outbox: persist intent before optimistic UI; acknowledge before removing it.
let mutationFlight=null;
const resolvingRecords=new Set();
function canResolve(code) {return ['CONFLICT','DELETED','NOT_FOUND','INVALID_LOCAL_STATE','INVALID_DATE','INVALID_RATING','INVALID_PHOTOS','INVALID_COORDINATES','INVALID_LOCATION','INVALID_PER_CAPITA','INVALID_FLAG','INVALID_ID','INVALID_OPERATION_ID','RESTAURANT_REQUIRED'].includes(code);}
function commit(next, language) {
  identity.lease();
  identity.setStorageSync(STORAGE_KEY,JSON.stringify(next));
  Object.assign(state,next);
  if(language!==undefined)i18n.setLanguage(language);
  listeners.slice().forEach(fn=>{try{fn(state);}catch(e){}});
}
function overlay(memory, ops) {
  let result=Object.assign({},memory); delete result.localChanges;
  ops.filter(o=>o.recordId===memory.id).forEach(o=>{
    if(o.kind==='flags') ['saved','liked','shared'].forEach(key=>{if(o.patch && typeof o.patch[key]==='boolean') result[key]=o.patch[key];});
    // An edit snapshot may predate acknowledged flags, identity or revisions.
    // Project editable content only, not the entire cached Memory object.
    if(o.kind==='update' && o.memory) ['importAddressHint','importAreaText','platformRating','platformAveragePriceCny','diningTypes','sourceCategory','categorySource','tencentPoiId','diningMode','sourcePlatform','sourceUrl','restaurant','notes','date','city','country','neighborhood','cuisine','perCapita','dishes','tags','photo','extraPhotos','noPhoto','placePhoto','coordinates','address','locationName','locationSource','coordinateSystem','geoConfirmed','geoSource','rating','ratingSource','locationUnknown'].forEach(key=>{if(Object.prototype.hasOwnProperty.call(o.memory,key)) result[key]=o.memory[key];});
    if(o.kind==='delete') result.pendingDelete=true;
  });
  return result;
}
function queueMutation(memory,kind,patch,updated) {
  ensureLoaded();
  const token=identity.lease();
  if(resolvingRecords.has(memory.id)) throw new Error('Sync in progress. Please try again.');
  const op={actorUserId:token.userId,id:data.createId(),recordId:memory.cloudId,revision:memory.revision||0,kind,patch:patch||{},memory:updated||null,base:memory,uploads:{},submitted:false};
  const outbox=state.outbox.concat(op);
  const memories=state.memories.map(m=>m.id===memory.id?overlay(m,[op]):m).filter(m=>!m.pendingDelete);
  commit(Object.assign({},state,{outbox,memories}));
  return op;
}
function flushOutbox() {
  try{identity.assertBusinessCloudAllowed();}catch(e){return Promise.reject(e);}
  ensureLoaded(); let token;try{token=identity.lease();}catch(e){return Promise.reject(e);} if(mutationFlight) return mutationFlight;
  mutationFlight=(async()=>{
    const blocked=new Set();
    const attempted=new Set();
    while(true) {
      identity.assertLease(token);
      const op=state.outbox.find(x=>!attempted.has(x.id)&&!blocked.has(x.recordId));
      if(!op) break; attempted.add(op.id);
      if(blocked.has(op.recordId) || canResolve(op.error)) {blocked.add(op.recordId);continue;}
      try {
        if(!op.base || !Number.isInteger(op.revision) || op.revision<0 || !op.uploads || typeof op.uploads!=='object' || Array.isArray(op.uploads) || (op.kind==='update' && !data.isMemory(op.memory))) {const e=new Error(i18n.t('The local pending change is invalid. Review it in Sync status.'));e.code='INVALID_LOCAL_STATE';throw e;}
        const saved=await require('./cloudRecords').mutate(op,()=>{identity.assertLease(token);identity.setStorageSync(STORAGE_KEY,JSON.stringify(state));});
        identity.assertLease(token);
        const ownSuccessor=saved.operationRevision===op.revision+1 && saved.operationRevision===saved.revision;
        const outbox=state.outbox.filter(x=>x.id!==op.id).map(x=>x.recordId===op.recordId && ownSuccessor && x.revision===op.revision?Object.assign({},x,{revision:saved.operationRevision}):x);
        let memories=state.memories.filter(m=>m.id!==saved.id);
        if(!saved.deleted) { const m=overlay(saved,outbox); if(!m.pendingDelete) memories.unshift(m); }
        const hidden=saved.deleted?Array.from(new Set(state.cloudHidden.concat(saved.id))):state.cloudHidden;
        commit(Object.assign({},state,{outbox,memories,cloudHidden:hidden}));
      } catch(e) {
        identity.assertLease(token);
        op.error=e.code||'OFFLINE'; op.message=e.message;
        try {commit(Object.assign({},state,{outbox:state.outbox.slice()}));} catch(storageError) {}
        blocked.add(op.recordId);
      }
    }
    return state.outbox;
  })().finally(()=>{if(identity.snapshot().generation===token.generation)mutationFlight=null;});
  return mutationFlight;
}
async function useCloudVersion(recordId) {
  const token=identity.lease();
  if(mutationFlight) await mutationFlight;
  identity.assertLease(token);
  if(resolvingRecords.has(recordId)) return;
  resolvingRecords.add(recordId);
  try {
  const pending=state.outbox.filter(o=>o.recordId===recordId);
  if(!pending.length || !pending.some(o=>canResolve(o.error))) throw new Error('Retry the uncertain operation first.');
  let saved;
  try {saved=await require('./cloudRecords').getRecord(recordId);} catch(e) {if(e.code!=='NOT_FOUND') throw e;}
  identity.assertLease(token);
  const outbox=state.outbox.filter(o=>o.recordId!==recordId);
  const memories=state.memories.filter(m=>m.id!==recordId);
  if(saved&&!saved.deleted) memories.unshift(saved);
  commit(Object.assign({},state,{outbox,memories}));
  if(loadDraft().editingId===recordId) clearDraft();
  } finally {resolvingRecords.delete(recordId);}
}
function beginEdit(memory) {
  identity.lease();
  const current=loadDraft();
  if(saveFlight || (current.cloudAttempt && current.cloudAttempt.submitted) || current.editOperationId || get().outbox.some(o=>o.recordId===memory.id && o.kind!=='flags')) throw new Error(i18n.t('Changes are kept on this device. Open Sync status in Me to retry or resolve conflicts.'));
  const draft=Object.assign(freshDraft(),{editingId:memory.id,editBase:memory,importAddressHint:memory.importAddressHint||'',importAreaText:memory.importAreaText||'',platformRating:memory.platformRating==null?null:memory.platformRating,platformAveragePriceCny:memory.platformAveragePriceCny==null?null:memory.platformAveragePriceCny,diningTypes:(Array.isArray(memory.diningTypes)?memory.diningTypes:[]).slice(),sourceCategory:memory.sourceCategory||'',categorySource:memory.categorySource||'',diningMode:memory.diningMode||'',sourcePlatform:memory.sourcePlatform||'',sourceUrl:memory.sourceUrl||'',restaurant:memory.restaurant,notes:memory.notes,date:memory.date,rating:memory.rating,ratingSource:memory.ratingSource||'single',cuisine:memory.cuisine||'',perCapita:memory.perCapita||'',dishes:(memory.dishes||[]).join(', '),tags:memory.tags.slice(),photos:memory.noPhoto?[]:[memory.photo].concat(memory.extraPhotos||[]),location:['tencent-picker','tencent-search'].includes(memory.locationSource)?Object.assign({},memory):null});
  identity.setStorageSync(DRAFT_KEY,JSON.stringify(draft)); return draft;
}
// Completion belongs to one durable attempt, not whichever draft is current.
function clearCompletedDraft(kind, id) {
  try {
    const raw=identity.getStorageSync(DRAFT_KEY);
    const current=typeof raw==='string'?JSON.parse(raw):raw;
    const matches=current && (kind==='add' ? current.cloudAttempt && current.cloudAttempt.id===id : current.editOperationId===id);
    if(matches) clearDraft();
  } catch(e) { /* never clear an unreadable or unrelated draft */ }
}
async function confirmCompletedEdit(recordId, operationId) {
  const token=identity.lease();
  if (!await require('./cloudRecords').confirmOperation(recordId, operationId)) {
    throw new Error(i18n.t('The edit has no verifiable cloud receipt. Your draft is kept; do not clear it to retry.'));
  }
  identity.assertLease(token);
  clearCompletedDraft('edit', operationId);
}
async function saveEdit(memory,draft) {
  const token=identity.lease();
  if(draft.actorUserId!==token.userId) throw new Error('DRAFT_IDENTITY_MISMATCH');
  const base=draft.editBase;
  if(!base || base.id!==draft.editingId) throw new Error('Invalid edit draft.');
  // Local-only imports/samples stay local; never auto-upload them.
  const current=state.memories.find(m=>m.id===base.id)||base;
  const updated=Object.assign({},base,memory,{id:base.id,cloudId:base.cloudId,revision:base.revision,shared:current.shared,liked:current.liked,saved:current.saved});
  if(!base.cloudId) {commit(Object.assign({},state,{memories:[updated].concat(state.memories.filter(m=>m.id!==base.id))})); clearDraft(); return {pending:false};}
  if(draft.editOperationId && !state.outbox.some(x=>x.id===draft.editOperationId)) {await confirmCompletedEdit(base.cloudId,draft.editOperationId);return {pending:false};}
  let op=state.outbox.find(x=>x.id===draft.editOperationId || (x.kind==='update' && x.recordId===base.id));
  if(!op) op=queueMutation(base,'update',{},updated);
  draft.editOperationId=op.id;
  identity.setStorageSync(DRAFT_KEY,JSON.stringify(draft));
  await flushOutbox();
  identity.assertLease(token);
  if(state.outbox.some(x=>x.id===op.id)) throw new Error(i18n.t('Changes are kept on this device. Open Sync status in Me to retry or resolve conflicts.'));
  await confirmCompletedEdit(base.cloudId,op.id);
  try {const p=require('./photos');p.pruneOrphans(p.collectReferenced(state));} catch(e) {}
  return {pending:false};
}

// Cloud records are merged by primary key; a late list cannot remove a just-saved meal.
let syncFlight = null;
let saveFlight = null;
// Explicit read-only refresh must NOT flush legacy/private outboxes.
function mergeCloudRead(memories,token) {
    identity.assertLease(token);
    const byId = Object.create(null);
    state.memories.forEach(m => { byId[m.id] = m; });
    (memories.deletedIds||[]).forEach(id=>{delete byId[id];});
    memories.forEach(m => {
      if (state.cloudHidden.indexOf(m.id) >= 0) return;
      const old = byId[m.id];
      if(old && (old.revision||0)>(m.revision||0)) return;
      const pending=state.outbox.filter(o=>o.recordId===m.id);
      const merged=overlay(Object.assign({},m,old&&old.localChanges),pending);
      if(merged.pendingDelete) delete byId[m.id]; else byId[m.id]=merged;
    });
    const all = Object.keys(byId).map(id => byId[id]);
    // Keep the curated sample/local order, with cloud memories before it.
    const mergedMemories = all.filter(m => m.cloudId).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .concat(all.filter(m => !m.cloudId));
    commit(Object.assign({},state,{memories:mergedMemories}));
    return state.memories;
}
async function refreshCloudReadOnly(){identity.assertBusinessCloudAllowed();const token=identity.lease();const memories=await require('./cloudRecords').listRecords();return mergeCloudRead(memories,token);}
function applyCloudProfile(profile,preferences,token){
 identity.assertLease(token);ensureLoaded();
 commit(profileRepository.applyCloud(state,profile,preferences));
}
function syncCloud() {
  try{identity.assertBusinessCloudAllowed();}catch(e){return Promise.reject(e);}
  ensureLoaded();
  let token;try{token=identity.lease();}catch(e){return Promise.reject(e);}
  if (syncFlight) return syncFlight;
  syncFlight = flushOutbox().then(()=>{identity.assertLease(token);return require('./cloudRecords').listRecords();}).then(function (memories) {
    return mergeCloudRead(memories,token);
  }).finally(function () { if(identity.snapshot().generation===token.generation)syncFlight = null; });
  return syncFlight;
}
function createCloudMemory(memory, draft) {
  const token=identity.lease();
  if(draft.actorUserId!==token.userId) return Promise.reject(new Error('DRAFT_IDENTITY_MISMATCH'));
  if(draft.editingId) return saveEdit(memory,draft);
  if (saveFlight) return saveFlight;
  const savedDraft = Object.assign({}, draft);
  const attempt = savedDraft.cloudAttempt || { actorUserId:token.userId, id: data.createId(), memory: memory, uploads: {}, submitted: false };
  savedDraft.cloudAttempt = attempt;
  draft.cloudAttempt = attempt;
  function keepAttempt() {
    identity.assertLease(token);
    try { identity.setStorageSync(DRAFT_KEY, JSON.stringify(savedDraft)); }
    catch (e) {
      // If draft too large (e.g., many large photo paths), clear uploads to shrink and retry
      try {
        savedDraft.cloudAttempt.uploads = {};
        draft.cloudAttempt.uploads = {};
        identity.setStorageSync(DRAFT_KEY, JSON.stringify(savedDraft));
      } catch (e2) { throw new Error('Storage unavailable. Free some space before saving; your input is still here.'); }
    }
  }
  saveFlight = Promise.resolve().then(function () {
    keepAttempt();
    return require('./cloudRecords').addRecord(attempt, keepAttempt);
  }).then(function (saved) {
    identity.assertLease(token);
    addMemory(saved);
    clearCompletedDraft('add',attempt.id);
    return saved;
  }).finally(function () { saveFlight = null; });
  return saveFlight;
}

// ---------------- draft (savor-draft-v1) ----------------

const starterDraft = {
  restaurant: '', notes: '', date: localDate.today(), rating: 0,
  tags: [], photos: [], city: '', country: '', cuisine: '', perCapita: '', dishes: '',
};

function loadDraft() {
  try {
    const saved = identity.getStorageSync(DRAFT_KEY);
    const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
    if (parsed && typeof parsed === 'object'
      && typeof parsed.restaurant === 'string' && typeof parsed.notes === 'string'
      && (parsed.date === '' || data.isValidDate(parsed.date))
      && Array.isArray(parsed.photos) && parsed.photos.length <= 9 && parsed.photos.every(data.isSafeImage)
      && Array.isArray(parsed.tags) && parsed.tags.every(function (t) { return typeof t === 'string'; })
      && Number.isInteger(parsed.rating) && parsed.rating >= 0 && parsed.rating <= 5
      && typeof parsed.city === 'string') {
      return Object.assign({}, starterDraft, parsed);
    }
  } catch (error) { /* An unavailable draft store must not block adding a memory. */ }
  return freshDraft();
}

function saveDraft(draft) {
  try {
    const token=identity.lease();
    if(draft.actorUserId!==token.userId) return false;
    identity.setStorageSync(DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch (error) { return false; /* Callers that require durable import can fail closed. */ }
}

function freshDraft() {
  return {
    actorUserId:identity.snapshot().userId,
    restaurant: '',
    notes: '',
    date: localDate.today(),
    rating: 0,
    cuisine: '', perCapita: '', dishes: '',
    tags: [],
    photos: [],
    city: '', country: '',
  };
}

function clearDraft() {
  saveDraft(freshDraft());
}

async function setMemoryLocation(memory, location) {
  const token=identity.lease();
  if (memory.cloudId) {
    if(get().outbox.some(o=>o.recordId===memory.id && o.kind!=='flags')) throw new Error(i18n.t('Changes are kept on this device. Open Sync status in Me to retry or resolve conflicts.'));
    const updated=Object.assign({},memory,location,{locationUnknown:false});
    const op=queueMutation(memory,'update',{},updated);
    await flushOutbox();
    identity.assertLease(token);
    if(state.outbox.some(o=>o.id===op.id)) throw new Error(i18n.t('Changes are kept on this device. Open Sync status in Me to retry or resolve conflicts.'));
  } else updateMemory(memory.id, Object.assign({}, location, { locationUnknown: false }));
}

identity.subscribe(()=>{
  loaded=false; mutationFlight=null;syncFlight=null;saveFlight=null;resolvingRecords.clear();
  ensureLoaded();state.identity=identity.snapshot();
  dismissToast();listeners.slice().forEach(fn=>{try{fn(state);}catch(e){}});
});
module.exports = { refreshCloudReadOnly, applyCloudProfile, privateCopy, canResolve, flushOutbox, useCloudVersion, beginEdit,
  setMemoryLocation,
  STORAGE_KEY,
  DRAFT_KEY,
  get,
  syncCloud,
  createCloudMemory,
  subscribe,
  notify,
  dismissToast,
  onToast,
  addMemory,
  updateMemory,
  deleteMemory,
  updateProfile,
  updatePersonalization,
  updateSettings,
  importMemories,
  saveFeedback,
  loadDraft,
  saveDraft,
  clearDraft,
  freshDraft,
  starterDraft,
};
