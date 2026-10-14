import { createTabReuse } from './tab-reuse.js';
import { createExtensionUI } from './extension-ui.js';

const ui = createExtensionUI(chrome);
const reuse = createTabReuse(chrome, undefined, {
  isEnabled: ui.isEnabled,
  onReused: ui.notifyReuse
});

// Register synchronously: MV3 wakes the service worker to deliver these events.
chrome.tabs.onCreated.addListener(tab => reuse.created(tab));
chrome.tabs.onRemoved.addListener(tabId => reuse.removed(tabId));
chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) =>
  reuse.replaced(addedTabId, removedTabId));
chrome.webNavigation.onCommitted.addListener(details => reuse.committed(details));
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.enabled) ui.refresh().catch(console.warn);
});
chrome.runtime.onInstalled.addListener(() => ui.refresh().catch(console.warn));
chrome.runtime.onStartup.addListener(() => ui.refresh().catch(console.warn));
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'popup-opened') return;
  ui.refresh().then(() => sendResponse({ ok: true }),
    () => sendResponse({ ok: false }));
  return true;
});

ui.refresh().catch(console.warn);
