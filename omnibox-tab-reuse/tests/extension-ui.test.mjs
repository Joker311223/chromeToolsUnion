import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExtensionUI } from '../extension-ui.js';

function harness() {
  const local = {}, session = {}, calls = [];
  const api = {
    storage: {
      local: { async get() { return { ...local }; } },
      session: { async set(value) { Object.assign(session, value); } }
    },
    action: Object.fromEntries(['setIcon', 'setBadgeText', 'setBadgeBackgroundColor', 'setTitle']
      .map(name => [name, async value => calls.push([name, value])])),
    runtime: { getURL: path => `chrome-extension://test/${path}` },
    notifications: { async create(id, options) { calls.push(['notice', { id, ...options }]); } }
  };
  return { local, session, calls, api, ui: createExtensionUI(api) };
}

test('default enabled and disabled icon/badge/title follow persistent setting', async () => {
  const h = harness();
  assert.equal(await h.ui.isEnabled(), true);
  await h.ui.refresh();
  assert.deepEqual(h.calls.find(([name]) => name === 'setBadgeText')[1], { text: '' });
  h.local.enabled = false;
  h.calls.length = 0;
  await h.ui.refresh();
  assert.equal(await h.ui.isEnabled(), false);
  assert.match(h.calls.find(([name]) => name === 'setIcon')[1].path[16], /icon-off/);
  assert.deepEqual(h.calls.find(([name]) => name === 'setBadgeText')[1], { text: 'OFF' });
  assert.match(h.calls.find(([name]) => name === 'setTitle')[1].title, /已关闭/);
});

test('reuse stores a recent record and creates a quiet notice with no URL', async () => {
  const h = harness();
  await h.ui.notifyReuse({ targetTabId: 7, sourceClosed: true });
  assert.equal(h.session.lastReuse.targetTabId, 7);
  assert.equal(h.session.lastReuse.sourceClosed, true);
  assert.equal(typeof h.session.lastReuse.at, 'number');
  assert.match(h.calls.find(([name]) => name === 'notice')[1].message, /关闭新建/);
  assert.equal(h.calls.find(([name]) => name === 'notice')[1].silent, true);
  assert.deepEqual(h.calls.find(([name]) => name === 'setBadgeText')[1], { text: '↗' });
  assert.equal('url' in h.session.lastReuse, false);
});

test('retained source gets different notification copy', async () => {
  const h = harness();
  await h.ui.notifyReuse({ targetTabId: 7, sourceClosed: false });
  assert.match(h.calls.find(([name]) => name === 'notice')[1].message, /来源标签已保留/);
});

test('disabled mode produces neither recent record nor notification', async () => {
  const h = harness();
  h.local.enabled = false;
  await h.ui.notifyReuse({ targetTabId: 7, sourceClosed: false });
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.session, {});
});

test('notification failure retains the in-popup record and badge', async () => {
  const h = harness();
  h.api.notifications.create = async () => { throw new Error('Denied'); };
  await assert.rejects(h.ui.notifyReuse({ targetTabId: 7, sourceClosed: true }), /Denied/);
  assert.equal(h.session.lastReuse.targetTabId, 7);
  assert.deepEqual(h.calls.find(([name]) => name === 'setBadgeText')[1], { text: '↗' });
});

test('opening popup clears reuse badge without losing recent record', async () => {
  const h = harness();
  await h.ui.notifyReuse({ targetTabId: 7, sourceClosed: true });
  h.calls.length = 0;
  await h.ui.refresh();
  assert.deepEqual(h.calls.find(([name]) => name === 'setBadgeText')[1], { text: '' });
  assert.equal(h.session.lastReuse.targetTabId, 7);
});

test('refreshed reuse notice and recent record describe the refresh', async () => {
  const h = harness();
  await h.ui.notifyReuse({ targetTabId: 7, sourceClosed: true, refreshed: true });
  const notice = h.calls.find(([name]) => name === 'notice')[1];
  assert.match(notice.title, /刷新/);
  assert.match(notice.message, /切换并刷新/);
  assert.equal(h.session.lastReuse.refreshed, true);
});
