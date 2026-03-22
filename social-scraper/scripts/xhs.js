/**
 * 小红书创作者平台 - 文章批量抓取
 * 运行环境：https://creator.xiaohongshu.com/*
 * 翻页方式：SPA click() 翻页
 */
(function () {
    'use strict';

    const CACHE_KEY = 'xhs_collected_articles_v1';
    const TASK_KEY  = 'xhs_auto_task_state_v1';

    const getData   = ()    => JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    const saveData  = (d)   => localStorage.setItem(CACHE_KEY, JSON.stringify(d));
    const getTask   = ()    => JSON.parse(localStorage.getItem(TASK_KEY)  || '{"isFetching":false}');
    const saveTask  = (s)   => localStorage.setItem(TASK_KEY, JSON.stringify(s));
    const clearTask = ()    => localStorage.removeItem(TASK_KEY);

    const decodeHtml = (html) => {
        const t = document.createElement('textarea');
        t.innerHTML = html;
        return t.value;
    };

    const extractNoteId = (note) => {
        const raw = note.getAttribute('data-impression');
        if (!raw) return '';
        try {
            return JSON.parse(decodeHtml(raw))?.noteTarget?.value?.noteId || '';
        } catch {
            return '';
        }
    };

    const getIconText = (icons, idx) =>
        icons[idx]?.textContent?.trim() || '0';

    const clickNextPage = () => {
        const nextBtn =
            document.querySelector('.el-pagination .btn-next') ||
            document.querySelector('[aria-label="Next Page"]') ||
            document.querySelector('.pagination-next');
        if (nextBtn && !nextBtn.disabled) {
            nextBtn.click();
            return true;
        }
        return false;
    };

    const collectCurrentPage = () => {
        const notes = document.querySelectorAll('div.note');
        const existing = getData();
        const existingLinks = new Set(existing.map(r => r['文章链接']));
        let added = 0;

        notes.forEach((note) => {
            try {
                const noteId = extractNoteId(note);
                const link   = noteId
                    ? `https://creator.xiaohongshu.com/publish/update?id=${noteId}&noteType=normal`
                    : '';

                if (link && existingLinks.has(link)) return;

                const title  = note.querySelector('.title')?.textContent?.trim()  || '';
                const time   = note.querySelector('.time')?.textContent?.trim()   || '';
                const cover  = note.querySelector('.content img')?.src            || '';
                const icons  = note.querySelectorAll('.icon_list .icon span');

                existing.push({
                    '序号'    : existing.length + 1,
                    '标题'    : title,
                    '发布时间': time,
                    '点赞'    : getIconText(icons, 0),
                    '评论'    : getIconText(icons, 1),
                    '收藏'    : getIconText(icons, 2),
                    '分享'    : getIconText(icons, 3),
                    '封面图'  : cover,
                    '文章链接': link,
                    '抓取时间': new Date().toLocaleString(),
                });
                existingLinks.add(link);
                added++;
            } catch (e) {
                console.error('[XHS Scraper] 解析文章失败:', e, note);
            }
        });

        saveData(existing);
        return added;
    };

    const exportAndClear = () => {
        const data = getData();
        if (data.length === 0) { alert('暂无数据，请先搜集文章！'); return; }

        // 检查下载限制
        chrome.runtime.sendMessage({ type: 'CHECK_DOWNLOAD_LIMIT' }, (response) => {
            if (response && response.success) {
                const ws = XLSX.utils.json_to_sheet(data);
                ws['!cols'] = [
                    { wch: 6  },
                    { wch: 40 },
                    { wch: 16 },
                    { wch: 8  },
                    { wch: 8  },
                    { wch: 8  },
                    { wch: 8  },
                    { wch: 60 },
                    { wch: 80 },
                    { wch: 20 },
                ];

                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, '小红书数据');
                XLSX.writeFile(wb, `小红书数据导出_${data.length}条_${Date.now()}.xlsx`);

                localStorage.removeItem(CACHE_KEY);
                updateBadge();
            } else {
                alert(response ? response.error : '下载失败，请重试');
            }
        });
    };

    let countdownTimer = null;

    const runAutoTask = () => {
        const state = getTask();
        if (!state.isFetching) return;

        const statusEl = document.getElementById('xhs-status');
        if (statusEl) statusEl.textContent = `📄 正在搜集第 ${state.currentPage + 1} / ${state.targetPages} 页...`;

        setTimeout(() => {
            collectCurrentPage();
            updateBadge();

            const nextPage = state.currentPage + 1;

            if (nextPage < state.targetPages) {
                const ok = clickNextPage();
                if (!ok) {
                    if (statusEl) statusEl.textContent = '⚠️ 已到最后一页，提前结束';
                    clearTask();
                    setTimeout(exportAndClear, 600);
                    return;
                }

                let countdown = 2;
                if (statusEl) statusEl.textContent = `✅ 第 ${state.currentPage + 1} 页完成，${countdown}s 后继续...`;

                countdownTimer = setInterval(() => {
                    countdown--;
                    if (statusEl) statusEl.textContent = `✅ 第 ${state.currentPage + 1} 页完成，${countdown}s 后继续...`;
                    if (countdown <= 0) {
                        clearInterval(countdownTimer);
                        state.currentPage = nextPage;
                        saveTask(state);
                        runAutoTask();
                    }
                }, 1000);

            } else {
                if (statusEl) statusEl.textContent = '🎉 任务完成，正在导出...';
                clearTask();
                setTimeout(exportAndClear, 600);
            }
        }, 1200);
    };

    const updateBadge = () => {
        const el = document.getElementById('xhs-badge');
        if (el) el.textContent = `已收 ${getData().length} 篇`;
    };

    const injectStyles = () => {
        if (document.getElementById('xhs-style')) return;
        const style = document.createElement('style');
        style.id = 'xhs-style';
        style.textContent = `
            #xhs-panel {
                position: fixed; top: 20px; right: 20px; z-index: 99999;
                background: #fff; padding: 14px 16px; border-radius: 12px;
                box-shadow: 0 8px 24px rgba(0,0,0,.18); border: 1px solid #ffe0e6;
                display: flex; flex-direction: column; gap: 10px; width: 270px;
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            }
            #xhs-panel-title {
                font-size: 13px; font-weight: 700; color: #ff2442;
                display: flex; align-items: center; justify-content: space-between;
            }
            #xhs-badge {
                background: #ff2442; color: #fff; padding: 2px 8px;
                border-radius: 10px; font-size: 12px; font-weight: 600;
            }
            .xhs-row { display: flex; gap: 6px; align-items: center; }
            .xhs-btn {
                padding: 6px 10px; border: none; border-radius: 6px;
                cursor: pointer; font-size: 12px; color: #fff;
                transition: opacity .15s; white-space: nowrap; font-weight: 600;
            }
            .xhs-btn:hover { opacity: .8; }
            #xhs-collect-btn  { background: #ff2442; flex: 1; }
            #xhs-auto-btn     { background: #ff9800; flex: 1.2; }
            #xhs-stop-btn     { background: #888;    flex: 1; }
            #xhs-export-btn   { background: #12b886; width: 100%; }
            #xhs-input-page   {
                width: 44px; padding: 4px 6px; border: 1px solid #ddd;
                border-radius: 6px; text-align: center; font-size: 12px;
            }
            #xhs-status {
                font-size: 11px; color: #d4380d; text-align: center;
                font-weight: 600; min-height: 16px; line-height: 1.4;
            }
            .xhs-divider { border: none; border-top: 1px solid #f0f0f0; margin: 0; }
        `;
        document.head.appendChild(style);
    };

    const initUI = () => {
        if (document.getElementById('xhs-panel')) return;
        injectStyles();

        const panel = document.createElement('div');
        panel.id = 'xhs-panel';
        panel.innerHTML = `
            <div id="xhs-panel-title">
                🍠 小红书抓取器
                <span id="xhs-badge">已收 0 篇</span>
            </div>
            <hr class="xhs-divider">
            <div class="xhs-row">
                <button id="xhs-collect-btn" class="xhs-btn">🔍 搜集当前页</button>
            </div>
            <div class="xhs-row">
                <span style="font-size:12px;flex-shrink:0;color:#555">页数:</span>
                <input type="number" id="xhs-input-page" value="5" min="1" max="99">
                <button id="xhs-auto-btn" class="xhs-btn">🚀 自动抓取</button>
                <button id="xhs-stop-btn" class="xhs-btn">🛑 停止</button>
            </div>
            <div id="xhs-status"></div>
            <hr class="xhs-divider">
            <button id="xhs-export-btn" class="xhs-btn">📥 导出 Excel 并清空</button>
        `;
        document.body.appendChild(panel);

        document.getElementById('xhs-collect-btn').onclick = () => {
            const added = collectCurrentPage();
            updateBadge();
            document.getElementById('xhs-status').textContent = `✅ 本页新增 ${added} 篇`;
        };

        document.getElementById('xhs-auto-btn').onclick = () => {
            const pages = parseInt(document.getElementById('xhs-input-page').value) || 5;
            if (!confirm(`将从当前页开始自动抓取 ${pages} 页数据，是否继续？`)) return;
            const state = { isFetching: true, targetPages: pages, currentPage: 0 };
            saveTask(state);
            runAutoTask();
        };

        document.getElementById('xhs-stop-btn').onclick = () => {
            if (countdownTimer) clearInterval(countdownTimer);
            clearTask();
            document.getElementById('xhs-status').textContent = '🛑 任务已停止';
        };

        document.getElementById('xhs-export-btn').onclick = () => {
            if (!confirm('确定导出并清空缓存吗？')) return;
            exportAndClear();
        };

        updateBadge();
    };

    const main = () => {
        if (!location.href.includes('creator.xiaohongshu.com')) return;
        initUI();
        const state = getTask();
        if (state.isFetching) runAutoTask();
    };

    // SPA 路由变化时重新注入面板
    const observer = new MutationObserver(() => initUI());
    observer.observe(document.body, { childList: true, subtree: false });

    if (document.readyState === 'complete') main();
    else window.addEventListener('load', main);
})();
