const assert = require('assert');

global.wx = {};
const identity = require('../miniprogram/utils/identity');
const originalAssertLease = identity.assertLease;
const originalResumeNative = identity.resumeNative;
const owner = { userId: 'u_owner', generation: 1, namespace: 'savor', partition: 'p' };

identity.assertLease = token => assert.strictEqual(token, owner);
identity.resumeNative = async token => {
  assert.strictEqual(token, owner);
  return token;
};

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function test(name, run) {
  try {
    await run();
    console.log('✓ ' + name);
  } catch (error) {
    console.error('✗ ' + name);
    throw error;
  }
}

(async () => {
  const nativeFlow = require('../miniprogram/utils/nativeFlow');

  await test('returns the native chooser value after same-owner resume', async () => {
    const flow = nativeFlow.begin(owner);
    assert.deepStrictEqual(await flow.run(async () => 'avatar.png'), { status: 'ok', value: 'avatar.png' });
    flow.finish();
  });

  await test('normalizes chooser cancellation', async () => {
    const flow = nativeFlow.begin(owner);
    assert.deepStrictEqual(await flow.run(async () => { throw { code: 'PHOTO_CANCELLED' }; }), { status: 'cancelled' });
    flow.finish();
  });

  await test('reauthorizes the same owner before lease-sensitive work', async () => {
    const freshOwner = { ...owner, generation: 2 };
    identity.resumeNative = async () => freshOwner;
    const flow = nativeFlow.begin(owner);
    assert.deepStrictEqual(await flow.run(async token => token.generation), { status: 'ok', value: 2 });
    flow.finish();
    identity.resumeNative = async token => token;
  });

  await test('reports a changed owner as stale', async () => {
    identity.resumeNative = async () => { throw { code: 'STALE_IDENTITY' }; };
    const flow = nativeFlow.begin(owner);
    assert.deepStrictEqual(await flow.run(async () => 'avatar.png'), { status: 'stale-owner' });
    flow.finish();
    identity.resumeNative = async token => token;
  });

  await test('rethrows real failures', async () => {
    const expected = new Error('disk full');
    const flow = nativeFlow.begin(owner);
    await assert.rejects(flow.run(async () => { throw expected; }), error => error === expected);
    flow.finish();
  });

  await test('a newer chooser cancels the older chooser', async () => {
    const pending = deferred();
    const oldFlow = nativeFlow.begin(owner);
    const oldResult = oldFlow.run(() => pending.promise);
    const newFlow = nativeFlow.begin(owner);
    pending.resolve('old-avatar.png');
    assert.deepStrictEqual(await oldResult, { status: 'cancelled' });
    assert.strictEqual(nativeFlow.snapshot().id, newFlow.id);
    newFlow.finish();
  });

  await test('a hidden flow waits until its owner is visible again', async () => {
    const flow = nativeFlow.begin(owner);
    flow.suspend();
    let settled = false;
    const result = flow.run(async () => 'avatar.png').then(value => { settled = true; return value; });
    await Promise.resolve();
    assert.strictEqual(settled, false);
    flow.show();
    assert.deepStrictEqual(await result, { status: 'ok', value: 'avatar.png' });
    flow.finish();
  });

  console.log('Native flow verification passed.');
})().finally(() => {
  identity.assertLease = originalAssertLease;
  identity.resumeNative = originalResumeNative;
}).catch(error => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
