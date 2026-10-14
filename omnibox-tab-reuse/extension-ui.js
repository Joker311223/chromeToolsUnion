export function createExtensionUI(api) {
  let queue = Promise.resolve();
  const serialize = task => {
    const pending = queue.then(task);
    queue = pending.catch(() => {});
    return pending;
  };
  async function isEnabled() {
    return (await api.storage.local.get('enabled')).enabled !== false;
  }
  async function paint(enabled, reused = false) {
    const prefix = enabled ? 'icon' : 'icon-off';
    await api.action.setIcon({ path: {
      16: `icons/${prefix}-16.png`, 32: `icons/${prefix}-32.png`
    } });
    await api.action.setBadgeBackgroundColor({ color: enabled ? '#0F766E' : '#64748B' });
    await api.action.setBadgeText({ text: enabled ? (reused ? '↗' : '') : 'OFF' });
    await api.action.setTitle({ title: enabled
      ? (reused ? '已有标签定位 · 已切换到已有标签' : '已有标签定位 · 已开启')
      : '已有标签定位 · 已关闭' });
  }
  return {
    isEnabled,
    refresh() { return serialize(async () => paint(await isEnabled())); },
    notifyReuse(result) {
      return serialize(async () => {
        if (!await isEnabled()) return;
        await api.storage.session.set({ lastReuse: { ...result, at: Date.now() } });
        await paint(true, true);
        // OS notifications may be muted. The popup keeps the latest event as fallback.
        await api.notifications.create('tab-reuse-latest', {
          type: 'basic',
          iconUrl: api.runtime.getURL('icons/icon-128.png'),
          title: '已定位到已有标签',
          message: result.sourceClosed
            ? '该网址已经打开，已切换到已有标签，并关闭新建的重复标签。'
            : '该网址已经打开，已切换到已有标签。来源标签已保留。',
          silent: true
        });
      });
    }
  };
}
