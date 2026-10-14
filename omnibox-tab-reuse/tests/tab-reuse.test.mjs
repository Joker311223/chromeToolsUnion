import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageKey, createTabReuse } from '../tab-reuse.js';

const A = 'https://example.com/a';
const B = 'https://example.com/b';
function tab(id, url = A, extra = {}) {
  return { id, url, windowId: 1, index: id, active: false,
    pinned: false, incognito: false, documentId: `doc-${id}`, ...extra };
}
function event(id, extra = {}) {
  return { tabId: id, frameId: 0, url: A, documentId: `doc-${id}`,
    documentLifecycle: 'active', transitionType: 'link',
    transitionQualifiers: [], ...extra };
}
function harness(initialTabs) {
  const tabs = new Map(initialTabs.map(t => [t.id, { ...t }]));
  const saved = {};
  const calls = { activate: [], focus: [], remove: [], errors: [] };
  const hooks = {};
  const api = {
    storage: { session: {
      async get(key) { return { [key]: structuredClone(saved[key]) }; },
      async set(value) { Object.assign(saved, structuredClone(value)); }
    } },
    tabs: {
      async get(id) {
        if (!tabs.has(id)) throw new Error('No tab');
        return { ...tabs.get(id) };
      },
      async query() { return [...tabs.values()].map(t => ({ ...t })); },
      async update(id, values) {
        if (hooks.failActivate) throw new Error('Activation failed');
        const target = tabs.get(id);
        if (!target) throw new Error('No target');
        for (const t of tabs.values()) if (t.windowId === target.windowId) t.active = false;
        Object.assign(target, values);
        calls.activate.push(id);
        hooks.afterActivate?.();
        return { ...target };
      },
      async remove(id) { calls.remove.push(id); tabs.delete(id); }
    },
    windows: {
      async get(id) { return { id, state: hooks.minimized ? 'minimized' : 'normal' }; },
      async update(id, options) {
        if (hooks.failFocus) throw new Error('Focus failed');
        calls.focus.push({ id, ...options });
      }
    },
    webNavigation: {
      async getFrame({ tabId }) { return { documentId: tabs.get(tabId)?.documentId }; }
    }
  };
  const make = options => createTabReuse(api, e => calls.errors.push(e.message), options);
  return { reuse: make(), make, tabs, calls, hooks, saved, api };
}

test('URL comparison retains query/hash and only supports web URLs', () => {
  assert.equal(pageKey('https://EXAMPLE.com:443'), 'https://example.com/');
  assert.notEqual(pageKey(A), pageKey(`${A}/`));
  assert.notEqual(pageKey(A), pageKey(`${A}?x=1`));
  assert.notEqual(pageKey(A), pageKey(`${A}#x`));
  for (const value of ['bad', 'chrome://newtab/', 'file:///tmp/a', undefined]) {
    assert.equal(pageKey(value), null);
  }
});

test('address bar duplicate is untouched and loses new-tab close eligibility', async () => {
  const h = harness([tab(1), tab(2)]);
  await h.reuse.created(tab(2));
  await h.reuse.committed(event(2, { transitionQualifiers: ['from_address_bar'] }));
  assert.deepEqual(h.calls.activate, []);
  await h.reuse.committed(event(2));
  assert.deepEqual(h.calls.activate, [1]);
  assert.deepEqual(h.calls.remove, []);
});

test('new duplicate activates older tab then closes only the source', async () => {
  const h = harness([tab(1), tab(2)]);
  await h.reuse.created(tab(2));
  await h.reuse.committed(event(2));
  assert.deepEqual(h.calls.activate, [1]);
  assert.deepEqual(h.calls.remove, [2]);
  assert.deepEqual(h.calls.focus, [{ id: 1, focused: true }]);
});

test('existing source tab is preserved', async () => {
  const h = harness([tab(1), tab(2)]);
  await h.reuse.committed(event(2));
  assert.deepEqual(h.calls.activate, [1]);
  assert.deepEqual(h.calls.remove, []);
});

test('no match does nothing, including to itself', async () => {
  const h = harness([tab(1, B), tab(2)]);
  await h.reuse.created(tab(2));
  await h.reuse.committed(event(2));
  assert.deepEqual(h.calls.activate, []);
  assert.deepEqual(h.calls.remove, []);
});

test('cross-window target is focused and minimized window restored', async () => {
  const h = harness([tab(1, A, { windowId: 7 }), tab(2)]);
  h.hooks.minimized = true;
  await h.reuse.created(tab(2));
  await h.reuse.committed(event(2));
  assert.deepEqual(h.calls.focus, [{ id: 7, state: 'normal', focused: true }]);
  assert.deepEqual(h.calls.remove, [2]);
});

test('same-window match has priority', async () => {
  const h = harness([tab(1, A, { windowId: 7 }), tab(2), tab(3)]);
  await h.reuse.created(tab(3));
  await h.reuse.committed(event(3));
  assert.deepEqual(h.calls.activate, [2]);
});

test('iframes, prerender and internal pages do not trigger reuse', async () => {
  const h = harness([tab(1), tab(2)]);
  await h.reuse.created(tab(2));
  await h.reuse.committed(event(2, { frameId: 4 }));
  await h.reuse.committed(event(2, { documentLifecycle: 'prerender' }));
  await h.reuse.committed(event(2, { url: 'chrome://newtab/' }));
  assert.deepEqual(h.calls.activate, []);
  await h.reuse.committed(event(2));
  assert.deepEqual(h.calls.remove, [2]);
});

test('private tabs and different URLs are not candidates', async () => {
  const h = harness([tab(1, A, { incognito: true }), tab(2, `${A}?q=1`),
    tab(3, `${A}#part`), tab(4)]);
  await h.reuse.created(tab(4));
  await h.reuse.committed(event(4));
  assert.deepEqual(h.calls.activate, []);
});

test('concurrent new tabs retain the oldest even if newest event arrives first', async () => {
  const h = harness([tab(1), tab(2)]);
  await Promise.all([h.reuse.created(tab(1)), h.reuse.created(tab(2))]);
  await Promise.all([h.reuse.committed(event(2)), h.reuse.committed(event(1))]);
  assert.deepEqual(h.calls.remove, [2]);
  assert.equal(h.tabs.has(1), true);
});

test('earliest commit must not switch to a newer tab', async () => {
  const h = harness([tab(1), tab(2)]);
  await h.reuse.created(tab(1));
  await h.reuse.created(tab(2));
  await h.reuse.committed(event(1));
  assert.deepEqual(h.calls.activate, []);
  await h.reuse.committed(event(2));
  assert.deepEqual(h.calls.remove, [2]);
});

test('worker restart preserves first-navigation metadata', async () => {
  const h = harness([tab(1), tab(2)]);
  await h.reuse.created(tab(2));
  const restarted = h.make();
  await restarted.committed(event(2));
  assert.deepEqual(h.calls.remove, [2]);
});

test('stale source document or pending navigation is ignored', async () => {
  for (const extra of [{ documentId: 'new-doc' }, { pendingUrl: B }]) {
    const h = harness([tab(1), tab(2, A, extra)]);
    await h.reuse.created(tab(2));
    await h.reuse.committed(event(2));
    assert.deepEqual(h.calls.activate, []);
    assert.deepEqual(h.calls.remove, []);
  }
});

test('target leaving the URL during activation preserves source', async () => {
  const h = harness([tab(1), tab(2)]);
  h.hooks.afterActivate = () => { h.tabs.get(1).url = B; };
  await h.reuse.created(tab(2));
  await h.reuse.committed(event(2));
  assert.deepEqual(h.calls.remove, []);
});

test('source changing document during activation preserves source', async () => {
  const h = harness([tab(1), tab(2)]);
  h.hooks.afterActivate = () => { h.tabs.get(2).documentId = 'new-doc'; };
  await h.reuse.created(tab(2));
  await h.reuse.committed(event(2));
  assert.deepEqual(h.calls.remove, []);
});

test('activation or window focus failure never closes source', async () => {
  for (const failure of ['failActivate', 'failFocus']) {
    const h = harness([tab(1), tab(2)]);
    h.hooks[failure] = true;
    await h.reuse.created(tab(2));
    await h.reuse.committed(event(2));
    assert.deepEqual(h.calls.remove, []);
    assert.equal(h.calls.errors.length, 1);
  }
});

test('pinned source, reload and forward/back are never closed', async () => {
  for (const [sourceExtra, eventExtra] of [
    [{ pinned: true }, {}], [{}, { transitionType: 'reload' }],
    [{}, { transitionQualifiers: ['forward_back'] }]
  ]) {
    const h = harness([tab(1), tab(2, A, sourceExtra)]);
    await h.reuse.created(tab(2));
    await h.reuse.committed(event(2, eventExtra));
    assert.deepEqual(h.calls.activate, [1]);
    assert.deepEqual(h.calls.remove, []);
  }
});

test('target navigating elsewhere, even before commit, is ignored', async () => {
  const h = harness([tab(1, A, { pendingUrl: B }), tab(2)]);
  await h.reuse.created(tab(2));
  await h.reuse.committed(event(2));
  assert.deepEqual(h.calls.activate, []);
});

test('removed metadata is cleared and prerender replacement is not disposable', async () => {
  const h = harness([tab(1), tab(2)]);
  await h.reuse.created(tab(2));
  await h.reuse.replaced(2, 9);
  await h.reuse.committed(event(2));
  assert.deepEqual(h.calls.activate, [1]);
  assert.deepEqual(h.calls.remove, []);
  await h.reuse.removed(2);
  assert.equal(h.saved.tabReuseStateV1.tabs[2], undefined);
});

test('service worker registers all required handlers synchronously', async () => {
  const registered = [];
  const listener = name => ({ addListener(fn) {
    assert.equal(typeof fn, 'function'); registered.push(name);
  } });
  globalThis.chrome = {
    storage: { local: { async get() { return {}; } },
      onChanged: listener('settings') },
    action: { async setIcon() {}, async setBadgeText() {},
      async setBadgeBackgroundColor() {}, async setTitle() {} },
    runtime: { id: 'test-extension', onInstalled: listener('installed'),
      onStartup: listener('startup'), onMessage: listener('message') },
    tabs: { onCreated: listener('created'), onRemoved: listener('removed'),
      onReplaced: listener('replaced') },
    webNavigation: { onCommitted: listener('committed') }
  };
  try {
    await import('../background.js');
    assert.deepEqual(registered, ['created', 'removed', 'replaced', 'committed',
      'settings', 'installed', 'startup', 'message']);
  } finally { delete globalThis.chrome; }
});

test('disabled mode does not switch or close and consumes initial navigation', async () => {
  const h = harness([tab(1), tab(2)]);
  let enabled = false;
  const reused = [];
  const reuse = h.make({ isEnabled: async () => enabled, onReused: async r => reused.push(r) });
  await reuse.created(tab(2));
  await reuse.committed(event(2));
  assert.deepEqual(h.calls.activate, []);
  assert.deepEqual(h.calls.remove, []);
  assert.deepEqual(reused, []);
  enabled = true;
  await reuse.committed(event(2));
  assert.deepEqual(h.calls.activate, [1]);
  assert.deepEqual(h.calls.remove, []);
  assert.deepEqual(reused, [{ targetTabId: 1, sourceClosed: false }]);
});

test('successful duplicate reuse emits one notice after closing new source', async () => {
  const h = harness([tab(1), tab(2)]);
  const reused = [];
  const reuse = h.make({ onReused: async r => {
    assert.equal(h.tabs.has(2), false);
    reused.push(r);
  } });
  await reuse.created(tab(2));
  await reuse.committed(event(2));
  assert.deepEqual(reused, [{ targetTabId: 1, sourceClosed: true }]);
});

test('address bar and no-match cases never emit a reuse notice', async () => {
  for (const addressBar of [true, false]) {
    const h = harness([tab(1, addressBar ? A : B), tab(2)]);
    const reused = [];
    const reuse = h.make({ onReused: async r => reused.push(r) });
    await reuse.created(tab(2));
    await reuse.committed(event(2, { transitionQualifiers: addressBar ? ['from_address_bar'] : [] }));
    assert.deepEqual(reused, []);
  }
});

test('disabling before activation prevents switching', async () => {
  const h = harness([tab(1), tab(2)]);
  let checks = 0;
  const reuse = h.make({ isEnabled: async () => ++checks === 1 });
  await reuse.created(tab(2));
  await reuse.committed(event(2));
  assert.deepEqual(h.calls.activate, []);
});

test('disabling while activating preserves source and skips notice', async () => {
  const h = harness([tab(1), tab(2)]);
  let enabled = true;
  const reused = [];
  h.hooks.afterActivate = () => { enabled = false; };
  const reuse = h.make({ isEnabled: async () => enabled, onReused: async r => reused.push(r) });
  await reuse.created(tab(2));
  await reuse.committed(event(2));
  assert.deepEqual(h.calls.remove, []);
  assert.deepEqual(reused, []);
});

test('notification failure cannot undo reuse or duplicate cleanup', async () => {
  const h = harness([tab(1), tab(2)]);
  const reuse = h.make({ onReused: async () => { throw new Error('Notifications denied'); } });
  await reuse.created(tab(2));
  await reuse.committed(event(2));
  assert.deepEqual(h.calls.activate, [1]);
  assert.deepEqual(h.calls.remove, [2]);
  assert.deepEqual(h.calls.errors, ['Notifications denied']);
});
