const identity = require('./identity');

let current = null, serial = 0;

function release(state) {
  if (!state.waiter) return;
  const resolve = state.waiter;
  state.waiter = null;
  resolve();
}

function active(state) {
  return current === state && !state.cancelled;
}

function waitUntilVisible(state) {
  if (!active(state) || !state.suspended) return Promise.resolve();
  return new Promise(resolve => { state.waiter = resolve; });
}

function cancelState(state) {
  state.cancelled = true;
  release(state);
  if (current === state) current = null;
}

function isCancelled(error) {
  return !!error && (error.code === 'PHOTO_CANCELLED'
    || /^choose(?:Media|Image):fail cancel(?:\b|$)/i.test(error.errMsg || ''));
}

function begin(owner) {
  identity.assertLease(owner);
  if (current) cancelState(current);
  const state = { id: ++serial, owner, userId: owner.userId, cancelled: false, suspended: false, waiter: null };
  current = state;

  return {
    id: state.id,
    userId: state.userId,
    active: () => active(state),
    suspend() {
      if (active(state)) state.suspended = true;
    },
    show() {
      state.suspended = false;
      release(state);
    },
    cancel: () => cancelState(state),
    finish() {
      release(state);
      if (current === state) current = null;
    },
    async run(task) {
      await waitUntilVisible(state);
      if (!active(state)) return { status: 'cancelled' };
      let token;
      try {
        token = await identity.resumeNative(owner);
      } catch (error) {
        if (!active(state)) return { status: 'cancelled' };
        if (error && error.code === 'STALE_IDENTITY') return { status: 'stale-owner' };
        throw error;
      }
      await waitUntilVisible(state);
      if (!active(state)) return { status: 'cancelled' };
      let value;
      try {
        value = await task(token);
      } catch (error) {
        if (!active(state) || isCancelled(error)) return { status: 'cancelled' };
        throw error;
      }
      if (!active(state)) return { status: 'cancelled' };
      await waitUntilVisible(state);
      if (!active(state)) return { status: 'cancelled' };
      try {
        await identity.resumeNative(owner);
      } catch (error) {
        if (!active(state)) return { status: 'cancelled' };
        if (error && error.code === 'STALE_IDENTITY') return { status: 'stale-owner' };
        throw error;
      }
      await waitUntilVisible(state);
      return active(state) ? { status: 'ok', value } : { status: 'cancelled' };
    }
  };
}

function snapshot() {
  return current ? { id: current.id, userId: current.userId, suspended: current.suspended } : null;
}

function suspend(id) {
  if (current && current.id === id) current.suspended = true;
}

function show(id) {
  if (!current || current.id !== id) return;
  current.suspended = false;
  release(current);
}

function cancel(id) {
  if (current && (id === undefined || current.id === id)) cancelState(current);
}

module.exports = { begin, snapshot, suspend, show, cancel };
