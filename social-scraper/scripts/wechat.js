/**
 * 微信公众号后台 - 文章批量抓取
 * 运行环境：https://mp.weixin.qq.com/cgi-bin/appmsgpublish*
 * 翻页方式：修改 URL begin 参数物理跳转（MPA）
 */
(function () {
    'use strict';

    const CACHE_KEY = 'tm_collected_articles_v2';
    const TASK_KEY  = 'tm_auto_task_state_v2';

    const getStorageData = ()    => JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    const saveStorageData = (d)  => localStorage.setItem(CACHE_KEY, JSON.stringify(d));
    const getTaskState   = ()    => JSON.parse(localStorage.getItem(TASK_KEY)  || '{"isFetching":false}');
    const saveTaskState  = (s)   => localStorage.setItem(TASK_KEY, JSON.stringify(s));
    const clearTaskState = ()    => localStorage.removeItem(TASK_KEY);

    const exportAndClear = () => {
        const data = getStorageData();
        if (data.length === 0) { alert('暂无数据，请先搜集文章！'); return; }

        // 检查下载限制
        chrome.runtime.sendMessage({ type: 'CHECK_DOWNLOAD_LIMIT' }, (response) => {
            if (response && response.success) {
                const ws = XLSX.utils.json_to_sheet(data);
                ws['!cols'] = [
                    { wch: 40 },
                    { wch: 60 },
                    { wch: 10 },
                    { wch: 10 },
                    { wch: 10 },
                    { wch: 10 },
                    { wch: 10 },
                    { wch: 10 },
                    { wch: 20 },
                ];

                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, '微信公众号数据');
                XLSX.writeFile(wb, `微信数据导出_${data.length}条_${Date.now()}.xlsx`);

                localStorage.removeItem(CACHE_KEY);
                updateUI();
            } else {
                alert(response ? response.error : '下载失败，请重试');
            }
        });
    };

    const collectCurrentPage = () => {
        const items = document.querySelectorAll('.weui-desktop-mass-appmsg');
        const currentData = getStorageData();
        let addedCount = 0;

        items.forEach(item => {
            const titleNode = item.querySelector('a.weui-desktop-mass-appmsg__title');
            if (!titleNode) return;

            const href  = titleNode.href;
            const title = titleNode.innerText.trim();

            if (currentData.some(record => record['文章链接'] === href)) return;

            const getStat = (selector) => {
                const node = item.querySelector(selector + ' .weui-desktop-mass-media__data__inner');
                if (!node) return '0';
                return node.innerText.replace(/,/g, '').trim();
            };

            currentData.push({
                '文章标题': title,
                '文章链接': href,
                '阅读'    : getStat('.appmsg-view'),
                '点赞'    : getStat('.appmsg-like'),
                '分享'    : getStat('.appmsg-share'),
                '在看'    : getStat('.appmsg-haokan'),
                '留言'    : getStat('.appmsg-comment'),
                '划线'    : getStat('.appmsg-underline'),
                '抓取时间': new Date().toLocaleString(),
            });
            addedCount++;
        });

        saveStorageData(currentData);
        return addedCount;
    };

    const jumpToNextPage = (pageIndex) => {
        const url = new URL(window.location.href);
        url.searchParams.set('begin', pageIndex * 10);
        window.location.href = url.toString();
    };

    let countdownTimer = null;

    const runAutoTask = () => {
        const state = getTaskState();
        if (!state.isFetching) return;

        const statusEl = document.getElementById('tm-status');
        if (statusEl) statusEl.innerText = `📄 正在搜集第 ${state.currentPage + 1} / ${state.targetPages} 页...`;

        setTimeout(() => {
            collectCurrentPage();
            updateUI();

            if (state.currentPage + 1 < state.targetPages) {
                let countdown = 2;
                countdownTimer = setInterval(() => {
                    countdown--;
                    if (statusEl) statusEl.innerText = `✅ 已搜集，${countdown}s 后跳转...`;
                    if (countdown <= 0) {
                        clearInterval(countdownTimer);
                        state.currentPage += 1;
                        saveTaskState(state);
                        jumpToNextPage(state.currentPage);
                    }
                }, 1000);
            } else {
                if (statusEl) statusEl.innerText = '🎉 任务完成，正在导出...';
                clearTaskState();
                setTimeout(() => {
                    exportAndClear();
                }, 500);
            }
        }, 1000);
    };

    const updateUI = () => {
        const badge = document.getElementById('tm-badge');
        if (badge) badge.innerText = `已收 ${getStorageData().length} 篇`;
    };

    const injectStyles = () => {
        if (document.getElementById('tm-style')) return;
        const style = document.createElement('style');
        style.id = 'tm-style';
        style.innerHTML = `
            #tm-panel {
                position: fixed; top: 20px; right: 20px; z-index: 10000;
                background: #fff; padding: 15px; border-radius: 12px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.2); border: 1px solid #e7e7eb;
                display: flex; flex-direction: column; gap: 10px; width: 280px;
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            }
            #tm-panel-title {
                font-size: 13px; font-weight: 700; color: #07c160;
                display: flex; align-items: center; justify-content: space-between;
            }
            #tm-badge {
                background: #07c160; color: #fff; padding: 2px 8px;
                border-radius: 10px; font-size: 12px; font-weight: 600;
            }
            .tm-row { display: flex; gap: 6px; align-items: center; width: 100%; }
            .tm-btn {
                padding: 6px 8px; border: none; border-radius: 6px;
                cursor: pointer; font-size: 12px; color: white; transition: opacity .2s;
                white-space: nowrap; font-weight: 600;
            }
            .tm-btn:hover { opacity: .8; }
            #tm-collect-btn  { background: #07c160; flex: 1; }
            #tm-auto-btn     { background: #ff9800; flex: 1.2; }
            #tm-stop-btn     { background: #ff4d4f; flex: 1; }
            #tm-download-btn { background: #2f74ff; width: 100%; }
            #tm-input-page   {
                width: 44px; padding: 4px 6px; border: 1px solid #ddd;
                border-radius: 6px; text-align: center; font-size: 12px;
            }
            #tm-status {
                font-size: 11px; color: #d4380d; text-align: center;
                font-weight: 600; min-height: 16px; line-height: 1.4;
            }
            .tm-divider { border: none; border-top: 1px solid #f0f0f0; margin: 0; }
        `;
        document.head.appendChild(style);
    };

    const initUI = () => {
        if (document.getElementById('tm-panel')) return;
        injectStyles();

        const panel = document.createElement('div');
        panel.id = 'tm-panel';
        panel.innerHTML = `
            <div id="tm-panel-title">
                💬 微信公众号抓取器
                <span id="tm-badge">已收 0 篇</span>
            </div>
            <hr class="tm-divider">
            <div class="tm-row">
                <button id="tm-collect-btn" class="tm-btn">🔍 搜集当前页</button>
            </div>
            <div class="tm-row">
                <span style="font-size:12px;flex-shrink:0;color:#555">页数:</span>
                <input type="number" id="tm-input-page" value="5" min="1" max="99">
                <button id="tm-auto-btn" class="tm-btn">🚀 自动抓取</button>
                <button id="tm-stop-btn" class="tm-btn">🛑 停止</button>
            </div>
            <div id="tm-status"></div>
            <hr class="tm-divider">
            <button id="tm-download-btn" class="tm-btn">📥 导出 Excel 并清空</button>
        `;
        document.body.appendChild(panel);

        document.getElementById('tm-collect-btn').onclick = () => {
            const added = collectCurrentPage();
            updateUI();
            document.getElementById('tm-status').innerText = `✅ 本页新增 ${added} 篇`;
        };

        document.getElementById('tm-auto-btn').onclick = () => {
            const pages = parseInt(document.getElementById('tm-input-page').value) || 5;
            if (!confirm(`将从第 1 页开始自动抓取前 ${pages} 页数据，是否继续？`)) return;
            const state = { isFetching: true, targetPages: pages, currentPage: 0 };
            saveTaskState(state);
            jumpToNextPage(0);
        };

        document.getElementById('tm-stop-btn').onclick = () => {
            if (countdownTimer) clearInterval(countdownTimer);
            clearTaskState();
            document.getElementById('tm-status').innerText = '🛑 任务已停止';
        };

        document.getElementById('tm-download-btn').onclick = () => {
            if (!confirm('确定导出并清空缓存吗？')) return;
            exportAndClear();
        };

        updateUI();
    };

    const main = () => {
        initUI();
        const state = getTaskState();
        if (state.isFetching) runAutoTask();
    };

    if (document.readyState === 'complete') main();
    else window.addEventListener('load', main);
})();
