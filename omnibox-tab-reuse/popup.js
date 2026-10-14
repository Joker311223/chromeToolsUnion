const toggle = document.querySelector('#toggle');
const errorMessage = document.querySelector('#error');
let enabled = true;

function render(value) {
  enabled = value;
  toggle.setAttribute('aria-checked', String(value));
  document.querySelector('#status').textContent = value ? '已开启 · 自动复用已有标签' : '已关闭 · 所有导航正常打开';
  document.querySelector('#footer-status').textContent = value ? '正在运行' : '已暂停';
  document.querySelector('#status-dot').classList.toggle('enabled', value);
  document.querySelector('#app-icon').src = value ? 'icons/icon-48.png' : 'icons/icon-off-48.png';
}

function renderRecent(lastReuse) {
  if (!lastReuse) return;
  document.querySelector('#recent-time').textContent = new Date(lastReuse.at).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  document.querySelector('#recent-message').textContent = lastReuse.sourceClosed
    ? '已定位到已有标签，并关闭新建的重复标签。'
    : '已定位到已有标签，来源标签已保留。';
}

function showError() {
  errorMessage.hidden = false;
  errorMessage.textContent = '未能更新状态，请关闭弹窗后重试。';
}

toggle.addEventListener('click', async () => {
  toggle.disabled = true;
  errorMessage.hidden = true;
  try {
    const next = !enabled;
    await chrome.storage.local.set({ enabled: next });
    render(next);
  } catch { showError(); }
  finally { toggle.disabled = false; }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.enabled) render(changes.enabled.newValue !== false);
  if (area === 'session' && changes.lastReuse) renderRecent(changes.lastReuse.newValue);
});

try {
  const [settings, session] = await Promise.all([
    chrome.storage.local.get('enabled'), chrome.storage.session.get('lastReuse')
  ]);
  render(settings.enabled !== false);
  renderRecent(session.lastReuse);
  toggle.disabled = false;
  await chrome.runtime.sendMessage({ type: 'popup-opened' });
} catch { showError(); }
