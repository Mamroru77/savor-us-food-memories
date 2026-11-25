#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const mp = path.join(root, 'miniprogram');
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
let count = 0;
async function test(name, fn) {
  try {
    await fn();
    count++;
    console.log('PASS ' + name);
  } catch (e) {
    console.error('FAIL ' + name + ': ' + (e && e.stack ? e.stack : e));
    process.exitCode = 1;
  }
}

const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const clone = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

(async () => {
  // T1: localDate.daysInclusive & existing daysSince compatibility
  await test('T1 localDate.daysInclusive counts inclusively while preserving daysSince', () => {
    const localDate = require(path.join(mp, 'utils/localDate.js'));
    assert.equal(typeof localDate.daysInclusive, 'function', 'localDate.daysInclusive must be exported');
    const now = new Date(2026, 2, 9, 0, 5); // 2026-03-09 00:05 local
    assert.equal(localDate.daysInclusive('', now), 0);
    assert.equal(localDate.daysInclusive(null, now), 0);
    assert.equal(localDate.daysInclusive('2026-02-30', now), 0);
    assert.equal(localDate.daysInclusive('2026-03-10', now), 0);
    assert.equal(localDate.daysInclusive('2026-03-09', now), 1);
    assert.equal(localDate.daysInclusive('2026-03-08', now), 2);
    assert.equal(localDate.daysInclusive('2026-03-07', now), 3);
    assert.equal(localDate.daysSince('2026-03-07', now), 2, 'daysSince contract unchanged');
  });

  // Shared domain harness for T2, T3, T4
  function createSpacesEnv(initialClock = Date.UTC(2026, 8, 16, 4, 0, 0)) {
    const { createHandler } = require(path.join(root, 'cloudfunctions/spaces/handler.js'));
    let actor = 'A';
    let clock = initialClock;
    let db = new Map();
    let serial = Promise.resolve();
    let seq = 0;
    const uid = name => 'u_' + name.toLowerCase().repeat(48);
    const accountKey = name => hash(JSON.stringify(['app', name]));
    const key = (c, id) => c + '/' + id;
    for (const name of ['A', 'B', 'C', 'D']) {
      db.set(key('savor_accounts', accountKey(name)), { _id: accountKey(name), userId: uid(name), membershipVersion: 0 });
    }
    const handler = createHandler({
      context: () => ({ OPENID: actor, APPID: 'app' }),
      now: () => clock,
      repository: {
        transaction(fn) {
          const result = serial.then(async () => {
            const draft = new Map([...db].map(([k, v]) => [k, clone(v)]));
            const response = await fn({
              get: async (c, id) => clone(draft.get(key(c, id))),
              set: async (c, id, v) => { draft.set(key(c, id), clone(v)); },
            });
            db = draft;
            return response;
          });
          serial = result.catch(() => {});
          return result;
        },
      },
    });
    const call = (name, action, args = {}) => {
      actor = name;
      return handler({ protocolVersion: 1, expectedUserId: uid(name), action, operationId: 'operation_' + (++seq), ...args });
    };
    return {
      db: () => db, key, uid, handler, call,
      setClock: ms => { clock = ms; },
      getClock: () => clock,
      setActor: name => { actor = name; },
      getActor: () => actor,
      nextSeq: () => ++seq,
    };
  }

  // T2: spaces handler defaults on acceptInvite and legacy space fallback
  await test('T2 spaces handler initializes togetherSince on acceptInvite and falls back on legacy docs', async () => {
    const env = createSpacesEnv(Date.UTC(2026, 8, 16, 4, 0, 0)); // 2026-09-16 12:00 UTC+8
    const inv1 = await env.call('A', 'createInvite');
    assert.equal(inv1.success, true);
    const acc1 = await env.call('B', 'acceptInvite', {
      token: inv1.invitation.token, consent: true, clientDate: '2026-09-16',
    });
    assert.equal(acc1.success, true);
    assert.equal(acc1.space.togetherSince, '2026-09-16');
    assert.equal(acc1.space.togetherRevision, 0);

    // Without clientDate, server initializes using UTC+8 date
    const inv2 = await env.call('C', 'createInvite');
    assert.equal(inv2.success, true);
    const acc2 = await env.call('D', 'acceptInvite', { token: inv2.invitation.token, consent: true });
    assert.equal(acc2.success, true);
    assert.equal(acc2.space.togetherSince, '2026-09-16');

    // Legacy savor_spaces doc without togetherSince field derives from createdAt in status & list
    const spaceDoc = clone(env.db().get(env.key('savor_spaces', acc2.space.id)));
    delete spaceDoc.togetherSince;
    delete spaceDoc.togetherRevision;
    spaceDoc.createdAt = Date.UTC(2025, 11, 24, 18, 0, 0); // 2025-12-25 02:00 UTC+8
    env.db().set(env.key('savor_spaces', acc2.space.id), spaceDoc);
    const st = await env.call('C', 'status');
    assert.equal(st.space.togetherSince, '2025-12-25');
    assert.equal(st.space.togetherRevision, 0);
    const listed = await env.call('D', 'list', { spaceId: acc2.space.id, membershipVersion: acc2.space.version });
    assert.equal(listed.space.togetherSince, '2025-12-25');
  });

  // T3: spaces handler setTogetherSince
  await test('T3 spaces handler setTogetherSince supports both members, idempotency, validation, and isolation', async () => {
    const env = createSpacesEnv(Date.UTC(2026, 8, 16, 4, 0, 0));
    const inv = await env.call('A', 'createInvite');
    const joined = await env.call('B', 'acceptInvite', { token: inv.invitation.token, consent: true });
    const sp = joined.space;
    const scope = { spaceId: sp.id, membershipVersion: sp.version };

    // A updates to 2022-05-20
    const rA = await env.call('A', 'setTogetherSince', { ...scope, togetherSince: '2022-05-20', operationId: 'together_op_1' });
    assert.equal(rA.success, true);
    assert.equal(rA.space.togetherSince, '2022-05-20');
    assert.equal(rA.space.togetherRevision, 1);

    // Replay same operationId -> idempotent, does not bump revision
    const rReplay = await env.call('A', 'setTogetherSince', { ...scope, togetherSince: '2022-05-20', operationId: 'together_op_1' });
    assert.equal(rReplay.success, true);
    assert.equal(rReplay.space.togetherRevision, 1);

    // B sees synced date in status & list, and B can update to 2021-10-01
    assert.equal((await env.call('B', 'status')).space.togetherSince, '2022-05-20');
    assert.equal((await env.call('B', 'list', scope)).space.togetherSince, '2022-05-20');
    const rB = await env.call('B', 'setTogetherSince', { ...scope, togetherSince: '2021-10-01' });
    assert.equal(rB.success, true);
    assert.equal(rB.space.togetherSince, '2021-10-01');
    assert.equal(rB.space.togetherRevision, 2);
    assert.equal((await env.call('A', 'status')).space.togetherSince, '2021-10-01');

    // Validation failures
    assert.equal((await env.call('A', 'setTogetherSince', { ...scope, togetherSince: '2026-02-30' })).code, 'INVALID_DATE');
    assert.equal((await env.call('A', 'setTogetherSince', { ...scope, togetherSince: '2099-01-01' })).code, 'INVALID_DATE');
    assert.equal((await env.call('A', 'setTogetherSince', { ...scope, togetherSince: '1899-12-31' })).code, 'INVALID_DATE');
    assert.equal((await env.call('C', 'setTogetherSince', { ...scope, togetherSince: '2021-01-01' })).code, 'SPACE_REQUIRED');
    assert.equal((await env.call('A', 'setTogetherSince', { ...scope, membershipVersion: 99, togetherSince: '2021-01-01' })).code, 'MEMBERSHIP_CHANGED');

    // After leave -> SPACE_REQUIRED; new space starts fresh
    assert.equal((await env.call('B', 'leave', { ...scope, consent: true })).success, true);
    assert.equal((await env.call('A', 'setTogetherSince', { ...scope, togetherSince: '2020-01-01' })).code, 'SPACE_REQUIRED');

    env.setClock(Date.UTC(2026, 8, 20, 4, 0, 0));
    const inv2 = await env.call('A', 'createInvite');
    const joined2 = await env.call('D', 'acceptInvite', { token: inv2.invitation.token, consent: true });
    assert.equal(joined2.space.togetherSince, '2026-09-20');
  });

  // T4: miniprogram/utils/spaces.js status cache, listeners, peekStatus invalidation, DEFINITE errors
  await test('T4 utils/spaces caches status in memory, notifies listeners, and invalidates on identity change or expiry', async () => {
    const env = createSpacesEnv(Date.UTC(2026, 8, 16, 4, 0, 0));
    const inv = await env.call('A', 'createInvite');
    const joined = await env.call('B', 'acceptInvite', { token: inv.invitation.token, consent: true });
    const sp = joined.space;

    let generation = 1;
    let locked = false;
    let storeTouched = false;
    const intents = new Map();
    const clientIdentity = {
      assertBusinessCloudAllowed() {},
      snapshot: () => ({ userId: locked ? '' : env.uid(env.getActor()), generation, locked }),
      lease: () => ({ userId: env.uid(env.getActor()), generation }),
      assertLease(token) {
        if (locked || token.userId !== env.uid(env.getActor()) || token.generation !== generation) {
          throw Object.assign(new Error('STALE_IDENTITY'), { code: 'STALE_IDENTITY' });
        }
      },
      spaceIntent: () => clone(intents.get(env.getActor())),
      saveSpaceIntent(intent) { intents.set(env.getActor(), clone(intent)); },
    };

    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(mp, 'utils/spaces.js'), 'utf8'), {
      module, exports: module.exports,
      Date: { now: () => env.getClock() },
      require(name) {
        if (name === './identity') return clientIdentity;
        if (name === './data') return { createId: () => 'client_op_' + env.nextSeq() };
        if (name === './cloudRecords') return { initCloud() {} };
        if (name === './store') return new Proxy({}, { get() { storeTouched = true; throw Error('private store must not be touched'); } });
        throw Error('Unexpected require in utils/spaces.js: ' + name);
      },
      wx: { cloud: { async callFunction({ data }) { return { result: await env.handler(data) }; } } },
    }, { filename: 'miniprogram/utils/spaces.js' });

    const spaces = module.exports;
    assert.equal(typeof spaces.status, 'function', 'spaces.status must be exported');
    assert.equal(typeof spaces.peekStatus, 'function', 'spaces.peekStatus must be exported');
    assert.equal(typeof spaces.subscribeStatus, 'function', 'spaces.subscribeStatus must be exported');
    assert.equal(typeof spaces.clearCache, 'function', 'spaces.clearCache must be exported');

    env.setActor('A');
    let listenerCount = 0;
    const unsub = spaces.subscribeStatus(() => { listenerCount++; });

    const st = await spaces.status();
    assert.equal(st.space.id, sp.id);
    assert.equal(spaces.peekStatus().space.togetherSince, '2026-09-16');
    assert.equal(storeTouched, false);

    // Submit setTogetherSince updates cache and notifies listeners
    await spaces.submit('setTogetherSince', { spaceId: sp.id, membershipVersion: sp.version, togetherSince: '2023-06-15' });
    assert.equal(spaces.peekStatus().space.togetherSince, '2023-06-15');
    assert.ok(listenerCount >= 1, 'subscribeStatus listener must fire on setTogetherSince');

    // INVALID_DATE is DEFINITE so spaceIntent must be cleared immediately
    await assert.rejects(
      spaces.submit('setTogetherSince', { spaceId: sp.id, membershipVersion: sp.version, togetherSince: '2099-01-01' }),
      e => e.code === 'INVALID_DATE'
    );
    assert.equal(clientIdentity.spaceIntent(), null, 'INVALID_DATE clears spaceIntent');

    // Identity change invalidates peekStatus
    generation++;
    assert.equal(spaces.peekStatus(), null, 'peekStatus invalidates on identity generation change');

    // Expiry invalidates peekStatus
    await spaces.status();
    assert.ok(spaces.peekStatus());
    env.setClock(env.getClock() + 16000);
    assert.equal(spaces.peekStatus(), null, 'peekStatus invalidates after 15000ms lease expiry');

    // Leave clears space from cache
    const latest = await spaces.status();
    await spaces.submit('leave', { spaceId: latest.space.id, membershipVersion: latest.space.version, consent: true });
    assert.equal(spaces.peekStatus() && spaces.peekStatus().space, null);
    unsub();
  });

  // T5: components/sheet/index.js unbound & bound onTogetherSave + refreshTogether
  await test('T5 sheet together handles date-only local save and bound cloud sync safely', async () => {
    const i18n = require(path.join(mp, 'utils/i18n.js'));
    i18n.setLanguage('zh-CN');

    function mountSheet({ boundSpace = null, submitError = null } = {}) {
      let spec;
      const profileUpdates = [];
      const notifications = [];
      const closed = [];
      const submitCalls = [];
      let statusListeners = [];
      let cached = boundSpace ? { space: clone(boundSpace), expiresAt: 9999999999999 } : null;
      const state = {
        identity: { userId: 'u_test', generation: 1, locked: false, status: 'verified' },
        settings: { theme: 'pearl', language: 'zh-CN', reduceMotion: false, loveSent: false, notificationsRead: true },
        profile: { name: 'Me', bio: '', avatar: '', partner: '', togetherSince: '' },
        memories: [], outbox: [], feedback: [],
      };
      const spacesMock = {
        peekStatus: () => cached,
        status: async () => {
          cached = { space: boundSpace ? clone(boundSpace) : null, expiresAt: 9999999999999 };
          return cached;
        },
        subscribeStatus: fn => { statusListeners.push(fn); return () => {}; },
        submit: async (action, args) => {
          submitCalls.push({ action, args });
          if (submitError) throw Object.assign(new Error(submitError), { code: submitError });
          if (boundSpace && action === 'setTogetherSince') {
            boundSpace.togetherSince = args.togetherSince;
            cached = { space: clone(boundSpace), expiresAt: 9999999999999 };
          }
          return { success: true, space: clone(boundSpace) };
        },
      };
      const deps = {
        identity: { snapshot: () => state.identity },
        motionPresence: { update() {}, dispose() {} },
        imageCache: { ensureLocal: () => Promise.resolve(null), isCloudSource: () => false },
        localDate: require(path.join(mp, 'utils/localDate.js')),
        i18n,
        uiFeedback: require(path.join(mp, 'utils/uiFeedback.js')),
        store: {
          get: () => state,
          subscribe: () => () => {},
          updateProfile: ch => { profileUpdates.push(clone(ch)); state.profile = { ...state.profile, ...ch }; },
          updateSettings() {},
          notify: msg => notifications.push(msg),
          canResolve: () => false,
        },
        pageHeadings: {},
        data: require(path.join(mp, 'utils/data.js')),
        memoryStats: {},
        metrics: { getMetrics: () => ({ headerTop: 60, screenWidth: 375 }) },
        nativeFlow: { snapshot: () => null, cancel() {}, suspend() {}, show() {} },
        spaces: spacesMock,
      };
      vm.runInNewContext(fs.readFileSync(path.join(mp, 'components/sheet/index.js'), 'utf8'), {
        Component: x => { spec = x; },
        require: p => { const k = p.split('/').pop(); if (!(k in deps)) throw Error('Missing stub: ' + k); return deps[k]; },
        wx: {}, Promise, Date, Math, setTimeout, clearTimeout,
      }, { filename: 'miniprogram/components/sheet/index.js' });

      const comp = {
        ...spec.methods,
        data: { ...JSON.parse(JSON.stringify(spec.data)), show: true, type: 'together' },
        setData(patch, cb) { Object.assign(this.data, patch); if (cb) cb(); },
        triggerEvent(name, detail) { if (name === 'close') closed.push(detail || {}); },
      };
      spec.lifetimes.attached.call(comp);
      comp.refresh();
      return { comp, state, profileUpdates, notifications, closed, submitCalls };
    }

    // Unbound: both empty -> notify + stay open
    {
      const h = mountSheet();
      await h.comp.onTogetherSave();
      assert.equal(h.closed.length, 0);
      assert.ok(h.notifications.length >= 1, 'empty save notifies user instead of silently returning');
    }

    // Unbound: date only (partner empty) -> saves locally & closes
    {
      const h = mountSheet();
      h.comp.onSinceChange({ detail: { value: '2023-02-14' } });
      await h.comp.onTogetherSave();
      assert.equal(h.profileUpdates.length, 1);
      assert.equal(h.profileUpdates[0].togetherSince, '2023-02-14');
      assert.equal(h.closed.length, 1);
    }

    // Bound: loads cloud date without writing to private store; updates copy; saves to cloud
    {
      const boundSpace = { id: 's_1', version: 1, status: 'active', togetherSince: '2024-01-01' };
      const h = mountSheet({ boundSpace });
      assert.equal(h.comp.data.since, '2024-01-01');
      assert.equal(h.state.profile.togetherSince, '', 'cloud togetherSince never written to private store');
      assert.ok(h.comp.data.copy.s0b17f5b5cf.includes('双人'), 'bound copy indicates cloud sync: ' + h.comp.data.copy.s0b17f5b5cf);

      h.comp.onSinceChange({ detail: { value: '2021-08-08' } });
      await h.comp.onTogetherSave();
      assert.equal(h.submitCalls.length, 1);
      assert.deepEqual(clone(h.submitCalls[0]), {
        action: 'setTogetherSince',
        args: { spaceId: 's_1', membershipVersion: 1, togetherSince: '2021-08-08' },
      });
      assert.equal(h.state.profile.togetherSince, '', 'cloud save never leaks date into private store');
      assert.equal(h.closed.length, 1);
    }

    // Bound: cloud error (UNKNOWN_ACTION / network) keeps sheet open with clear notification
    {
      const boundSpace = { id: 's_1', version: 1, status: 'active', togetherSince: '2024-01-01' };
      const h = mountSheet({ boundSpace, submitError: 'UNKNOWN_ACTION' });
      h.comp.onSinceChange({ detail: { value: '2021-08-08' } });
      await h.comp.onTogetherSave();
      assert.equal(h.closed.length, 0);
      assert.ok(h.notifications.some(m => m.includes('spaces') || m.includes('部署')));
    }
  });

  // T6: pages/us/index.js uses inclusive day count, cloud preference, live updates & offline fallback
  await test('T6 pages/us computes inclusive days from cloud space with local fallback', async () => {
    const localDate = require(path.join(mp, 'utils/localDate.js'));
    const todayStr = localDate.today();
    const yesterdayStr = localDate.shift(todayStr, -1);
    const fiveDaysAgo = localDate.shift(todayStr, -4);

    let spec;
    const listeners = [];
    const statusListeners = [];
    let cached = null;
    let statusResp = { space: null };
    let statusReject = false;
    const state = {
      identity: { userId: 'u_test', generation: 1, locked: false, status: 'verified' },
      settings: { theme: 'pearl', language: 'zh-CN', reduceMotion: false, loveSent: false },
      profile: { name: 'Me', avatar: '', partner: '', togetherSince: '' },
      memories: [],
    };
    const deps = {
      i18n: {
        copy: () => ({}), locale: () => 'zh-CN', t: s => s,
        syncPage(pg, st) { pg.setData({ identityReady: !(st.identity && st.identity.locked) }); },
      },
      uiFeedback: { onImageError() {} },
      store: { get: () => state, subscribe: fn => { listeners.push(fn); return () => {}; } },
      data: { photos: { paris: '/images/paris-evening.jpg', meal: '/images/le-comptoir.jpg' }, formatDate: s => s },
      metrics: { getMetrics: () => ({ headerTop: 60 }) },
      memoryStats: { summary: () => ({ all: [], meals: 0, places: 0 }), countSaved: () => 0 },
      localDate,
      locations: { display: () => '' },
      memoryPreview: { open() {} },
      spaces: {
        peekStatus: () => cached,
        subscribeStatus: fn => { statusListeners.push(fn); return () => {}; },
        status: async () => {
          if (statusReject) throw new Error('OFFLINE');
          cached = clone(statusResp);
          return cached;
        },
      },
    };
    vm.runInNewContext(fs.readFileSync(path.join(mp, 'pages/us/index.js'), 'utf8'), {
      Page: x => { spec = x; },
      require: p => { const k = p.split('/').pop(); if (!(k in deps)) throw Error('Missing dep in us: ' + k); return deps[k]; },
      wx: { getMenuButtonBoundingClientRect: () => ({ top: 60, height: 32 }) },
      Date, Math, Promise, setTimeout, clearTimeout,
    }, { filename: 'miniprogram/pages/us/index.js' });

    const pg = { ...spec, data: clone(spec.data), setData(p) { Object.assign(this.data, p); } };
    pg.onLoad();

    // Unbound empty -> 0 days
    pg.onShow();
    await flush();
    assert.equal(pg.data.days, 0);

    // Unbound today -> 1 day
    state.profile.togetherSince = todayStr;
    pg.syncState(state);
    assert.equal(pg.data.days, 1);

    // Bound space -> fetches cloud space and displays cloud days (fiveDaysAgo => 5 days)
    statusResp = { space: { id: 's_1', version: 1, togetherSince: fiveDaysAgo } };
    cached = null;
    pg.onShow();
    await flush();
    assert.equal(pg.data.days, 5);

    // subscribeStatus live update (yesterday => 2 days)
    cached = { space: { id: 's_1', version: 1, togetherSince: yesterdayStr } };
    statusListeners.forEach(fn => fn());
    assert.equal(pg.data.days, 2);

    // Leave space (space: null) reverts to local profile date (today => 1 day)
    cached = { space: null };
    statusListeners.forEach(fn => fn());
    assert.equal(pg.data.days, 1);

    // Offline error when status() rejects falls back cleanly to local date
    cached = null;
    statusReject = true;
    state.profile.togetherSince = fiveDaysAgo;
    pg.onShow();
    await flush();
    assert.equal(pg.data.days, 5);
  });

  // T7: space-together component & pages/space wiring
  await test('T7 space-together component and pages/space wire clientDate and setTogetherSince', async () => {
    const localDate = require(path.join(mp, 'utils/localDate.js'));
    const dataMod = require(path.join(mp, 'utils/data.js'));
    const copyMod = require(path.join(mp, 'utils/spaceCopy.js'));

    const compPath = path.join(mp, 'components/space-together/index.js');
    assert.ok(fs.existsSync(compPath), 'miniprogram/components/space-together/index.js must exist');
    let compSpec;
    vm.runInNewContext(fs.readFileSync(compPath, 'utf8'), {
      Component: x => { compSpec = x; },
      require: p => {
        const k = p.split('/').pop();
        if (k === 'spaceCopy') return copyMod;
        if (k === 'localDate') return localDate;
        if (k === 'data') return dataMod;
        throw Error('Unexpected dep: ' + k);
      },
      Date, Math,
    }, { filename: compPath });

    const events = [];
    const comp = {
      ...compSpec.methods,
      data: { ...clone(compSpec.data), space: { id: 's_1', version: 1, togetherSince: localDate.today() }, busy: false, pending: false, dusk: false, locale: 'zh-CN' },
      setData(p) { Object.assign(this.data, p); },
      triggerEvent(name, detail) { events.push({ name, detail }); },
    };
    compSpec.observers['space, locale'].call(comp);
    assert.equal(comp.data.savedDate, localDate.today());
    assert.equal(comp.data.draftDate, localDate.today());
    assert.ok(comp.data.daysSummary.includes('1'), 'today summary shows 1 day: ' + comp.data.daysSummary);

    // No-op when unchanged
    comp.onSaveTap();
    assert.equal(events.length, 0);

    // Dirty draft preserved if unchanged space refreshes; emitted on save
    comp.onDateChange({ detail: { value: '2020-05-20' } });
    assert.equal(comp.data.draftDate, '2020-05-20');
    comp.onSaveTap();
    assert.deepEqual(clone(events), [{ name: 'save', detail: { date: '2020-05-20' } }]);

    // When bound space updates togetherSince, draft resets to synced savedDate
    comp.data.space = { id: 's_1', version: 1, togetherSince: '2020-05-20' };
    compSpec.observers['space, locale'].call(comp);
    assert.equal(comp.data.savedDate, '2020-05-20');
    assert.equal(comp.data.draftDate, '2020-05-20');

    // Busy blocks save
    comp.onDateChange({ detail: { value: '2019-01-01' } });
    comp.data.busy = true;
    comp.onSaveTap();
    assert.equal(events.length, 1);

    // pages/space/index.js passes clientDate in acceptInvite & submits setTogetherSince
    let pageSpec;
    const submitted = [];
    const pageDeps = {
      '../../utils/secondaryUI': { sync() {}, onFieldFocus() {}, onFieldBlur() {} },
      '../../utils/i18n': { copy: () => ({}), locale: () => 'zh-CN' },
      '../../utils/identity': { snapshot: () => ({ locked: false }), lease: () => ({ userId: 'u_a' }), isCurrent: () => true, spaceIntent: () => null, mediaIntent: () => null, subscribe: () => () => {}, assertLease() {} },
      '../../utils/spaces': { parseToken: t => t, preview: async () => ({}), submit: async (action, args) => { submitted.push({ action, args }); return { success: true }; }, load: async () => ({ space: { id: 's_1', version: 2, members: [] }, wishes: [], meals: [], expiresAt: Date.now() + 15000 }) },
      '../../utils/spaceCopy': copyMod,
      '../../utils/store': { get: () => ({ memories: [] }), notify() {} },
      '../../utils/sharedMedia': { clear() {} },
      '../../utils/photos': {},
      '../../utils/localDate': localDate,
    };
    vm.runInNewContext(fs.readFileSync(path.join(mp, 'pages/space/index.js'), 'utf8'), {
      Page: x => { pageSpec = x; },
      require: p => { if (!(p in pageDeps)) throw Error('Missing space dep: ' + p); return pageDeps[p]; },
      wx: { setNavigationBarTitle() {}, showModal: ({ success }) => success({ confirm: true }) },
      Date, setTimeout, clearTimeout,
    }, { filename: 'miniprogram/pages/space/index.js' });

    const pg = {
      ...pageSpec,
      active: true,
      _serial: 0,
      data: { ...clone(pageSpec.data), locked: false, busy: false, inviteText: 'a'.repeat(64), space: { id: 's_1', version: 2 } },
      _expires: Date.now() + 10000,
      setData(p) { Object.assign(this.data, p); },
    };
    await pg.acceptInvite();
    await flush();
    assert.equal(submitted[0].action, 'acceptInvite');
    assert.equal(submitted[0].args.clientDate, localDate.today());

    pg.onSaveTogetherSince({ detail: { date: '2021-01-01' } });
    await flush();
    pg.onUnload();
    assert.equal(submitted[1].action, 'setTogetherSince');
    assert.deepEqual(clone(submitted[1].args), { spaceId: 's_1', membershipVersion: 2, togetherSince: '2021-01-01' });
  });

  if (process.exitCode) console.error('Some tests failed.');
  else console.log(`\n${count}/${count} together-date verification checks passed.`);
})();
