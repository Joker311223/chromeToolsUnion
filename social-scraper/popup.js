// popup.js - 读取两个平台的缓存数量并展示

const XHS_CACHE_KEY = 'xhs_collected_articles_v1';
const WX_CACHE_KEY  = 'tm_collected_articles_v2';

// 查询指定 tab 的 localStorage 数据
function queryCount(tabId, key, callback) {
    chrome.scripting.executeScript(
        {
            target: { tabId },
            func: (storageKey) => {
                const raw = localStorage.getItem(storageKey);
                if (!raw) return 0;
                try { return JSON.parse(raw).length; } catch { return 0; }
            },
            args: [key],
        },
        (results) => {
            if (chrome.runtime.lastError || !results || !results[0]) {
                callback(0);
            } else {
                callback(results[0].result || 0);
            }
        }
    );
}

// 更新徽章数字
function updateCounts() {
    chrome.tabs.query({}, (tabs) => {
        let xhsCount = 0;
        let wxCount  = 0;
        let pending  = 0;

        const xhsTabs = tabs.filter(t => t.url && t.url.includes('creator.xiaohongshu.com'));
        const wxTabs  = tabs.filter(t => t.url && t.url.includes('mp.weixin.qq.com/cgi-bin/appmsgpublish'));

        const done = () => {
            pending--;
            if (pending <= 0) {
                document.getElementById('xhs-count').textContent = xhsCount;
                document.getElementById('wx-count').textContent  = wxCount;
            }
        };

        if (xhsTabs.length > 0) {
            pending++;
            queryCount(xhsTabs[0].id, XHS_CACHE_KEY, (n) => { xhsCount = n; done(); });
        }
        if (wxTabs.length > 0) {
            pending++;
            queryCount(wxTabs[0].id, WX_CACHE_KEY, (n) => { wxCount = n; done(); });
        }
        if (pending === 0) {
            document.getElementById('xhs-count').textContent = '—';
            document.getElementById('wx-count').textContent  = '—';
        }
    });
}

// 打开或聚焦到对应平台
function openOrFocus(url) {
    chrome.tabs.query({}, (tabs) => {
        const existing = tabs.find(t => t.url && t.url.includes(new URL(url).hostname));
        if (existing) {
            chrome.tabs.update(existing.id, { active: true });
            chrome.windows.update(existing.windowId, { focused: true });
        } else {
            chrome.tabs.create({ url });
        }
        window.close();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    updateCounts();

    document.getElementById('open-xhs').addEventListener('click', () => {
        openOrFocus('https://creator.xiaohongshu.com/publish/publish');
    });

    document.getElementById('open-wx').addEventListener('click', () => {
        openOrFocus('https://mp.weixin.qq.com/cgi-bin/appmsgpublish?sub=list&type=10&begin=0&count=10');
    });
});
