/**
 * 小红书文章批量抓取器 - Chrome Extension
 * 支持自动翻页、去重、导出真实 xlsx
 */
(function () {
    'use strict';

    // ─── 常量 ───────────────────────────────────────────────────────────────
    const CACHE_KEY = 'xhs_collected_articles_v1';
    const TASK_KEY  = 'xhs_auto_task_state_v1';

    // ─── 存储操作（chrome.storage.local 替代 localStorage，跨页面持久化）──
    // 同时保留 localStorage 作为同步读写的快速通道
    const getData   = ()    => JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    const saveData  = (d)   => localStorage.setItem(CACHE_KEY, JSON.stringify(d));
    const getTask   = ()    => JSON.parse(localStorage.getItem(TASK_KEY)  || '{"isFetching":false}');
    const saveTask  = (s)   => localStorage.setItem(TASK_KEY, JSON.stringify(s));
    const clearTask = ()    => localStorage.removeItem(TASK_KEY);

    // ─── 工具函数 ────────────────────────────────────────────────────────────
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

    const setStatus = (msg) => {
        const el = document.getElementById('xhs-status');
        if (el) el.textContent = msg;
    };

    // ─── 翻页：点击小红书分页器"下一页"按钮 ─────────────────────────────────
    const clickNextPage = () => {
        const nextBtn =
            document.querySelector('.el-pagination .btn-next') ||
            document.querySelector('[aria-label="Next Page"]')  ||
            document.querySelector('.pagination-next')          ||
            document.querySelector('button.next');
        if (nextBtn && !nextBtn.disabled && !nextBtn.classList.contains('disabled')) {
            nextBtn.click();
            return true;
        }
        return false;
    };

    // ─── 核心：搜集当前页 ────────────────────────────────────────────────────
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

    // ─── 导出 xlsx ───────────────────────────────────────────────────────────
    const exportAndClear = (clearAfter = true) => {
        const data = getData();
        if (data.length === 0) {
            setStatus('⚠️ 暂无数据，请先搜集文章！');
            return;
        }

        // XLSX 由 content_scripts 中的 lib/xlsx.full.min.js 注入
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

        // MV3 中 XLSX.writeFile 内部使用 URL.createObjectURL + <a> 触发下载
        XLSX.writeFile(wb, `小红书数据导出_${data.length}条_${Date.now()}.xlsx`);

        if (clearAfter) {
            localStorage.removeItem(CACHE_KEY);
            updateBadge();
            setStatus(`✅ 已导出 ${data.length} 条并清空缓存`);
        }
    };

    // ─── 自动任务调度器 ──────────────────────────────────────────────────────
    let countdownTimer = null;

    const runAutoTask = () => {
        const state = getTask();
        if (!state.isFetching) return;

        setStatus(`📄 正在搜集第 ${state.currentPage + 1} / ${state.targetPages} 页...`);

        // 等待 SPA 渲染（1.2s）
        setTimeout(() => {
            const added = collectCurrentPage();
            updateBadge();

            const nextPage = state.currentPage + 1;

            if (nextPage < state.targetPages) {
                const ok = clickNextPage();
                if (!ok) {
                    setStatus('⚠️ 已到最后一页，提前结束，正在导出...');
                    clearTask();
                    setTimeout(exportAndClear, 800);
                    return;
                }

                let countdown = 2;
                setStatus(`✅ 第 ${state.currentPage + 1} 页完成，${countdown}s 后继续...`);

                countdownTimer = setInterval(() => {
                    countdown--;
                    setStatus(`✅ 第 ${state.currentPage + 1} 页完成，${countdown}s 后继续...`);
                    if (countdown <= 0) {
                        clearInterval(countdownTimer);
                        state.currentPage = nextPage;
                        saveTask(state);
                        runAutoTask();
                    }
                }, 1000);

            } else {
                setStatus('🎉 任务完成，正在导出...');
                clearTask();
                setTimeout(exportAndClear, 800);
            }
        }, 1200);
    };

    // ─── UI ──────────────────────────────────────────────────────────────────
    const updateBadge = () => {
        const el = document.getElementById('xhs-badge');
        if (el) el.textContent = `已收 ${getData().length} 篇`;
    };

    const initUI = () => {
        if (document.getElementById('xhs-panel')) return;

        // 悬浮面板
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
            <button id="xhs-clear-btn" class="xhs-btn">🗑️ 仅清空缓存</button>
            <div style="text-align:right">
                <span id="xhs-minimize-btn" style="font-size:11px;color:#aaa;cursor:pointer;user-select:none;">收起 ▲</span>
            </div>
        `;
        document.body.appendChild(panel);

        // 最小化切换按钮
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'xhs-toggle-btn';
        toggleBtn.textContent = '🍠';
        toggleBtn.title = '展开小红书抓取器';
        toggleBtn.style.display = 'none';
        document.body.appendChild(toggleBtn);

        // ── 事件绑定 ──
        document.getElementById('xhs-collect-btn').onclick = () => {
            const added = collectCurrentPage();
            updateBadge();
            setStatus(`✅ 本页新增 ${added} 篇`);
        };

        document.getElementById('xhs-auto-btn').onclick = () => {
            const pages = parseInt(document.getElementById('xhs-input-page').value) || 5;
            if (!confirm(`将从当前页开始自动抓取 ${pages} 页数据，是否继续？`)) return;
            if (countdownTimer) clearInterval(countdownTimer);
            const state = { isFetching: true, targetPages: pages, currentPage: 0 };
            saveTask(state);
            runAutoTask();
        };

        document.getElementById('xhs-stop-btn').onclick = () => {
            if (countdownTimer) clearInterval(countdownTimer);
            clearTask();
            setStatus('🛑 任务已停止');
        };

        document.getElementById('xhs-export-btn').onclick = () => {
            if (!confirm('确定导出并清空缓存吗？')) return;
            exportAndClear(true);
        };

        document.getElementById('xhs-clear-btn').onclick = () => {
            if (!confirm('确定清空所有已搜集的缓存数据吗？')) return;
            localStorage.removeItem(CACHE_KEY);
            updateBadge();
            setStatus('🗑️ 缓存已清空');
        };

        // 收起/展开
        document.getElementById('xhs-minimize-btn').onclick = () => {
            panel.style.display = 'none';
            toggleBtn.style.display = 'flex';
        };
        toggleBtn.onclick = () => {
            panel.style.display = 'flex';
            toggleBtn.style.display = 'none';
        };

        updateBadge();

        // 恢复未完成的自动任务
        const state = getTask();
        if (state.isFetching) {
            setStatus(`⏳ 检测到未完成任务，继续第 ${state.currentPage + 1} 页...`);
            setTimeout(runAutoTask, 1500);
        }
    };

    // ─── 入口 ────────────────────────────────────────────────────────────────
    const tryInit = () => {
        // 仅在内容管理相关页面注入
        if (!location.href.includes('creator.xiaohongshu.com')) return;
        initUI();
    };

    // SPA 路由变化监听（浅层监听，避免性能问题）
    let lastHref = location.href;
    const routeObserver = new MutationObserver(() => {
        if (location.href !== lastHref) {
            lastHref = location.href;
            // 路由切换后稍等 DOM 稳定再注入
            setTimeout(tryInit, 800);
        }
        // 面板被意外移除时重新注入
        if (!document.getElementById('xhs-panel')) {
            tryInit();
        }
    });
    routeObserver.observe(document.body, { childList: true, subtree: false });

    if (document.readyState === 'complete') {
        tryInit();
    } else {
        window.addEventListener('load', tryInit);
    }

})();
