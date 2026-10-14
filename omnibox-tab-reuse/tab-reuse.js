const STATE_KEY = 'tabReuseStateV1';

export function pageKey(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function isNewTabPage(url) {
  return !url || url === 'about:blank' ||
    /^chrome:\/\/newtab\/?$/.test(url) ||
    /^chrome:\/\/new-tab-page\/?$/.test(url);
}

function atUrl(tab, key) {
  return pageKey(tab.url) === key &&
    (!tab.pendingUrl || pageKey(tab.pendingUrl) === key);
}

export function createTabReuse(api, reportError = error =>
  console.warn('[已有标签定位]', error?.message ?? error), {
  isEnabled = async () => true,
  onReused = async () => {}
} = {}) {
  let state;
  let queue = Promise.resolve();

  async function init() {
    if (state) return;
    const stored = (await api.storage.session.get(STATE_KEY))[STATE_KEY];
    state = stored ?? { nextOrder: 1, tabs: {} };
  }

  async function save() {
    await api.storage.session.set({ [STATE_KEY]: state });
  }

  // Serialize creation/navigation/removal to prevent two duplicates closing each other.
  function enqueue(task) {
    queue = queue.then(async () => {
      await init();
      await task();
    }).catch(reportError);
    return queue;
  }

  async function tabOrNull(tabId) {
    try { return await api.tabs.get(tabId); } catch { return null; }
  }

  async function sourceIsCurrent(details, key) {
    const tab = await tabOrNull(details.tabId);
    if (!tab || !atUrl(tab, key)) return null;
    // URL alone cannot distinguish two successive visits to the same page.
    const frame = await api.webNavigation.getFrame({ tabId: details.tabId, frameId: 0 });
    if (!details.documentId || frame?.documentId !== details.documentId) return null;
    return tab;
  }

  async function handleCommit(details) {
    if (details.frameId !== 0 ||
        (details.documentLifecycle && details.documentLifecycle !== 'active')) return;

    const metadata = state.tabs[details.tabId];
    const key = pageKey(details.url);
    if (!key) {
      // New Tab/about:blank does not consume the first real navigation.
      if (metadata?.fresh && !isNewTabPage(details.url)) {
        metadata.fresh = false;
        await save();
      }
      return;
    }

    const source = await sourceIsCurrent(details, key);
    if (!source) return;
    const firstNavigation = metadata?.fresh === true;
    if (metadata) {
      metadata.fresh = false;
      await save();
    }

    const qualifiers = details.transitionQualifiers ?? [];
    if (qualifiers.includes('from_address_bar')) return;
    if (!await isEnabled()) return;

    const order = metadata?.order ?? 0;
    const candidates = (await api.tabs.query({})).filter(tab => {
      if (tab.id === source.id || tab.incognito !== source.incognito || !atUrl(tab, key)) {
        return false;
      }
      // A newly created tab must only reuse an older tab, never a newer duplicate.
      return !firstNavigation || (state.tabs[tab.id]?.order ?? 0) < order;
    }).sort((a, b) =>
      Number(b.windowId === source.windowId) - Number(a.windowId === source.windowId) ||
      (state.tabs[a.id]?.order ?? 0) - (state.tabs[b.id]?.order ?? 0) ||
      a.windowId - b.windowId || a.index - b.index);

    const target = candidates[0];
    if (!target || !await sourceIsCurrent(details, key)) return;
    const currentTarget = await tabOrNull(target.id);
    if (!currentTarget || !atUrl(currentTarget, key)) return;
    if (!await isEnabled()) return;

    // If activation fails, do not remove the new tab.
    await api.tabs.update(target.id, { active: true });
    const targetWindow = await api.windows.get(target.windowId);
    await api.windows.update(target.windowId, {
      ...(targetWindow.state === 'minimized' ? { state: 'normal' } : {}),
      focused: true
    });

    const canClose = firstNavigation && !source.pinned &&
      details.transitionType !== 'reload' && !qualifiers.includes('forward_back');
    const finalTarget = await tabOrNull(target.id);
    const finalSource = await sourceIsCurrent(details, key);
    if (!finalTarget || !atUrl(finalTarget, key) || !finalTarget.active ||
        !await isEnabled()) return;

    let sourceClosed = false;
    if (canClose && finalSource && !finalSource.pinned) {
      await api.tabs.remove(source.id);
      sourceClosed = true;
      delete state.tabs[source.id];
      await save();
    }
    // A failed notification must never prevent switching or duplicate cleanup.
    try {
      await onReused({ targetTabId: target.id, sourceClosed });
    } catch (error) { reportError(error); }
  }

  return {
    created(tab) {
      return enqueue(async () => {
        if (tab.id == null || tab.incognito) return;
        state.tabs[tab.id] = { fresh: true, order: state.nextOrder++ };
        await save();
      });
    },
    removed(tabId) {
      return enqueue(async () => {
        if (!state.tabs[tabId]) return;
        delete state.tabs[tabId];
        await save();
      });
    },
    replaced(addedTabId, removedTabId) {
      return enqueue(async () => {
        // Prerender replacement is not evidence of a newly opened, disposable tab.
        const old = state.tabs[removedTabId];
        state.tabs[addedTabId] = { fresh: false, order: old?.order ?? 0 };
        delete state.tabs[removedTabId];
        await save();
      });
    },
    committed(details) { return enqueue(() => handleCommit(details)); }
  };
}
