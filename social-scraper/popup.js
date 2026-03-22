// popup.js - 读取两个平台的缓存数量并展示，处理登录和会员逻辑

const XHS_CACHE_KEY = 'xhs_collected_articles_v1';
const WX_CACHE_KEY  = 'tm_collected_articles_v2';
const API_BASE_URL = 'http://localhost:3000/api';

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

// 用户登录和会员逻辑
async function fetchUserStatus() {
    const token = (await chrome.storage.local.get('token')).token;
    if (!token) return;

    try {
        const res = await fetch(`${API_BASE_URL}/user/status`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const { user } = await res.json();
            updateUserUI(user);
        } else {
            chrome.storage.local.remove('token');
        }
    } catch (err) {
        console.error('Failed to fetch user status:', err);
    }
}

function updateUserUI(user) {
    if (user) {
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('profile-view').style.display = 'flex';
        document.getElementById('user-name').textContent = `微信用户 (${user.openid.slice(0, 8)}...)`;
        
        if (user.isMember) {
            document.getElementById('user-status').textContent = '尊贵会员 (无限下载)';
            document.getElementById('upgrade-btn').style.display = 'none';
        } else {
            const remaining = Math.max(0, 2 - user.downloadsThisMonth);
            document.getElementById('user-status').textContent = `普通用户 (本月剩余 ${remaining} 次)`;
            document.getElementById('upgrade-btn').style.display = 'block';
        }
    } else {
        document.getElementById('login-view').style.display = 'flex';
        document.getElementById('profile-view').style.display = 'none';
    }
}

async function showQRCode(type) {
    const modal = document.getElementById('qr-modal');
    const title = document.getElementById('qr-title');
    const image = document.getElementById('qr-image');
    
    modal.style.display = 'flex';
    title.textContent = type === 'login' ? '微信扫码登录' : '微信扫码支付';
    
    const endpoint = type === 'login' ? '/auth/wechat/qrcode' : '/payment/create';
    const token = (await chrome.storage.local.get('token')).token;
    
    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        const { qrCodeDataUrl } = await res.json();
        image.src = qrCodeDataUrl;

        // 模拟扫码成功
        if (type === 'login') {
            setTimeout(async () => {
                const loginRes = await fetch(`${API_BASE_URL}/auth/wechat/callback`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ openid: 'mock_openid_' + Date.now() })
                });
                const { token, user } = await loginRes.json();
                await chrome.storage.local.set({ token });
                updateUserUI(user);
                modal.style.display = 'none';
            }, 3000);
        } else {
            setTimeout(async () => {
                const payRes = await fetch(`${API_BASE_URL}/payment/success`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const { user } = await payRes.json();
                updateUserUI(user);
                modal.style.display = 'none';
            }, 3000);
        }
    } catch (err) {
        console.error('Failed to show QR code:', err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateCounts();
    fetchUserStatus();

    document.getElementById('open-xhs').addEventListener('click', () => {
        openOrFocus('https://creator.xiaohongshu.com/publish/publish');
    });

    document.getElementById('open-wx').addEventListener('click', () => {
        openOrFocus('https://mp.weixin.qq.com/cgi-bin/appmsgpublish?sub=list&type=10&begin=0&count=10');
    });

    document.getElementById('login-btn').addEventListener('click', () => showQRCode('login'));
    document.getElementById('upgrade-btn').addEventListener('click', () => showQRCode('payment'));
    document.getElementById('close-qr').addEventListener('click', () => {
        document.getElementById('qr-modal').style.display = 'none';
    });
});
