const API_BASE_URL = 'http://localhost:3000/api';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'CHECK_DOWNLOAD_LIMIT') {
        checkDownloadLimit().then(sendResponse);
        return true; // Keep the message channel open for async response
    }
});

async function checkDownloadLimit() {
    const token = (await chrome.storage.local.get('token')).token;
    if (!token) {
        return { success: false, error: '请先在插件弹窗中登录微信' };
    }

    try {
        const res = await fetch(`${API_BASE_URL}/user/download`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            return { success: true };
        } else {
            const data = await res.json();
            return { success: false, error: data.error || '下载失败，请重试' };
        }
    } catch (err) {
        console.error('Failed to check download limit:', err);
        return { success: false, error: '无法连接到服务器，请检查网络' };
    }
}
