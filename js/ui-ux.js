/* UI/UX 增強 — 出門儀表板、版面、手勢、地圖、Modal focus */

let dashboardRestExpanded = false;

function syncDashboardTravelToggle() {
    const btn = document.getElementById('dashboard-travel-toggle');
    const state = document.getElementById('dashboard-travel-state');
    if (!btn) return;
    btn.setAttribute('aria-pressed', travelMode ? 'true' : 'false');
    btn.setAttribute('aria-label', travelMode ? '關閉出門模式' : '開啟出門模式');
    if (state) state.textContent = travelMode ? '開' : '關';
}

function toggleDashboardRestList() {
    dashboardRestExpanded = !dashboardRestExpanded;
    renderTravelDashboard();
}

function syncTravelLayout() {
    document.body.classList.toggle('travel-mode-on', travelMode);
    document.body.classList.toggle('edit-mode-on', isEdit && !travelMode);

    const searchPanel = document.getElementById('search-panel');
    if (travelMode && searchPanelOpen) toggleSearchPanel();
    if (searchPanel && travelMode) searchPanel.classList.add('hidden');

    if (!travelMode) dashboardRestExpanded = false;
    syncDashboardTravelToggle();
    renderTravelDashboard();
    syncToolsLayout();
}

function syncToolsLayout() {
    const groupTravel = document.getElementById('tools-group-travel');
    if (groupTravel) groupTravel.textContent = '出門必備';
}

function toggleToolsAdvancedMenu() {
    const menu = document.getElementById('tools-advanced-menu');
    const btn = document.getElementById('tools-advanced-btn');
    if (!menu) return;
    const willOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');
    if (btn) btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
}

function closeToolsAdvancedMenu() {
    document.getElementById('tools-advanced-menu')?.classList.add('hidden');
    document.getElementById('tools-advanced-btn')?.setAttribute('aria-expanded', 'false');
}

function eventStatusMeta(status) {
    const s = typeof normalizeEventStatus === 'function' ? normalizeEventStatus(status) : status;
    const map = {
        pending: { label: '待辦', cls: 'status-pending', icon: 'far fa-circle' },
        booked: { label: '已訂', cls: 'status-booked', icon: 'fas fa-check' },
        done: { label: '已完成', cls: 'status-done', icon: 'fas fa-flag-checkered' },
    };
    return map[s] || map.pending;
}

function isDashboardActiveEvent(ev) {
    const s = typeof normalizeEventStatus === 'function' ? normalizeEventStatus(ev.status) : ev.status;
    return s !== 'done';
}

function renderStatusBadgeHtml(status, { interactive = false, dayIdx, eventIdx } = {}) {
    const meta = eventStatusMeta(status);
    const content = `<i class="${meta.icon} mr-1" aria-hidden="true"></i>${escapeHtml(meta.label)}`;
    if (!interactive) {
        return `<span class="status-badge ${meta.cls}">${content}</span>`;
    }
    return `<button type="button" onclick='event.stopPropagation();openEventStatusPicker(${dayIdx}, ${eventIdx})' class="status-badge ${meta.cls} status-tap" aria-label="更改狀態">${content}</button>`;
}

function openEventStatusPicker(dayIdx, eventIdx) {
    const ev = trip.itinerary[dayIdx]?.events[eventIdx];
    if (!ev) return;
    window._statusPick = { dayIdx, eventIdx };
    const locEl = document.getElementById('event-status-picker-loc');
    const optsEl = document.getElementById('event-status-picker-options');
    if (locEl) locEl.textContent = ev.loc || '景點';
    if (optsEl) {
        const cur = normalizeEventStatus(ev.status);
        const statuses = window.EVENT_STATUS_VALUES || ['pending', 'booked', 'done'];
        optsEl.innerHTML = statuses.map((s) => {
            const meta = eventStatusMeta(s);
            const active = s === cur ? ' status-picker-opt-active' : '';
            return `<button type="button" class="status-picker-opt ${meta.cls}${active}" onclick='setEventStatus(${dayIdx}, ${eventIdx}, ${JSON.stringify(s)})'><i class="${meta.icon} mr-2" aria-hidden="true"></i>${escapeHtml(meta.label)}</button>`;
        }).join('');
    }
    document.getElementById('event-status-picker')?.classList.remove('hidden');
}

function closeEventStatusPicker() {
    document.getElementById('event-status-picker')?.classList.add('hidden');
    window._statusPick = null;
}

let dashboardCountdownTimer = null;

function stopDashboardCountdownTimer() {
    if (dashboardCountdownTimer) {
        clearInterval(dashboardCountdownTimer);
        dashboardCountdownTimer = null;
    }
}

function syncDashboardCountdownTimer() {
    stopDashboardCountdownTimer();
    if (!isTodayTabActive() || !hasRealToday()) return;
    const todayIdx = getTodayDayIndex();
    if (todayIdx < 0) return;
    const next = getDashboardNextEvent(todayIdx);
    const liveToday = hasRealToday() && todayIdx === getTodayDayIndex();
    const cd = next.type === 'upcoming' ? formatEventCountdown(next.ev, liveToday) : null;
    const intervalMs = cd && cd.diffMs != null && cd.diffMs < 3600000 ? 1000 : 30000;
    dashboardCountdownTimer = setInterval(() => {
        if (!isTodayTabActive()) {
            stopDashboardCountdownTimer();
            return;
        }
        renderTravelDashboard();
    }, intervalMs);
}

function formatEventCountdown(ev, liveToday = true) {
    if (!liveToday) return null;
    const parsed = parseEventTime(ev.time);
    if (parsed == null) return null;
    const now = new Date();
    const target = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        Math.floor(parsed / 60),
        parsed % 60,
        0,
        0,
    );
    const diffMs = target - now;
    if (diffMs < 0) return null;
    const totalSec = Math.ceil(diffMs / 1000);
    if (totalSec <= 0) return { text: '而家就係時候', urgent: true, mins: 0, diffMs: 0 };
    const diffMins = Math.floor(totalSec / 60);
    if (diffMins < 1) {
        return { text: `仲有 ${totalSec} 秒`, urgent: true, mins: 0, diffMs };
    }
    if (diffMins < 60) {
        return { text: `仲有 ${diffMins} 分鐘`, urgent: true, mins: diffMins, diffMs };
    }
    const h = Math.floor(diffMins / 60);
    const m = diffMins % 60;
    const urgent = diffMins <= 120;
    if (m === 0) return { text: `仲有 ${h} 小時`, urgent, mins: diffMins, diffMs };
    return { text: `仲有 ${h} 小時 ${m} 分`, urgent, mins: diffMins, diffMs };
}

function syncDashboardDayTitle(title) {
    const el = document.getElementById('dashboard-day-title');
    if (!el) return;
    const text = typeof displayDayTitle === 'function' ? displayDayTitle(title) : (title || '').trim();
    const show = !!text;
    if (show) {
        el.textContent = text;
        el.classList.remove('hidden', 'is-empty');
    } else {
        el.textContent = '';
        el.classList.add('hidden');
        el.classList.add('is-empty');
    }
}

function renderCountdownBadge(cd) {
    if (!cd) return '';
    const cls = cd.urgent ? 'countdown-badge countdown-urgent' : 'countdown-badge';
    return `<span class="${cls}"><i class="fas fa-clock mr-1" aria-hidden="true"></i>${escapeHtml(cd.text)}</span>`;
}

function renderRemindButton(dayIdx, i) {
    return `<button type="button" class="btn-ghost-sm" onclick="event.stopPropagation();scheduleEventReminder(${dayIdx}, ${i})"><i class="fas fa-bell mr-1"></i>提醒我</button>`;
}

const TRIP_ACCENT_COLORS = ['#FF85A1', '#7C83FD', '#FFB86C', '#6BCB77', '#9D84B7', '#4ECDC4', '#F4845F', '#5DADE2'];
const SWIPE_HINT_KEY = 'TRAVEL_SWIPE_HINT_SEEN';

function tripAccentColor(name, idx) {
    let h = 0;
    const s = name || '';
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return TRIP_ACCENT_COLORS[Math.abs(h + idx) % TRIP_ACCENT_COLORS.length];
}

function renderTripPicker() {
    const list = document.getElementById('trip-picker');
    if (!list) return;
    list.innerHTML = data.trips
        .map((t, i) => {
            const active = i === data.activeIdx;
            const days = t.itinerary?.length || 0;
            const color = tripAccentColor(t.name, i);
            return `<button type="button" role="option" aria-selected="${active}" class="trip-picker-item${active ? ' active' : ''}" onclick="switchTrip(${i}); closeHeaderMenu();">
                <span class="trip-picker-swatch" style="background:${color}"></span>
                <span class="trip-picker-meta">
                    <span class="trip-picker-name">${escapeHtml(t.name || '旅程')}</span>
                    <span class="trip-picker-days">${days} 天</span>
                </span>
                ${active ? '<i class="fas fa-check trip-picker-check" aria-hidden="true"></i>' : ''}
            </button>`;
        })
        .join('');
}

function renderTripHeader() {
    const title = document.getElementById('trip-title');
    if (title) title.textContent = trip.name || '我的旅行';
    renderTripPicker();
}

function toggleHeaderMenu() {
    const menu = document.getElementById('header-menu');
    const btn = document.getElementById('header-menu-btn');
    if (!menu) return;
    const open = menu.classList.toggle('hidden');
    if (btn) btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    if (!open) {
        renderTripPicker();
        document.getElementById('del-trip-menu-btn')?.classList.toggle('hidden', travelMode || !isEdit);
    }
}

function closeHeaderMenu() {
    document.getElementById('header-menu')?.classList.add('hidden');
    document.getElementById('header-menu-btn')?.setAttribute('aria-expanded', 'false');
}

function dismissSwipeHint() {
    localStorage.setItem(SWIPE_HINT_KEY, '1');
    document.getElementById('swipe-hint')?.classList.add('hidden');
}

function maybeShowSwipeHint() {}

function getDashboardNextEvent(dayIdx) {
    const day = trip.itinerary[dayIdx];
    if (!day?.events?.length) return { type: 'empty', dayIdx };

    const entries = sortEventEntries(day.events.map((ev, i) => ({ ev, i })));
    const liveToday = hasRealToday() && dayIdx === getTodayDayIndex();

    if (!liveToday) {
        const first = entries.find(({ ev }) => isDashboardActiveEvent(ev)) || entries[0];
        return { type: 'preview', ev: first.ev, i: first.i, dayIdx, label: '首個景點' };
    }

    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    for (const { ev, i } of entries) {
        if (!isDashboardActiveEvent(ev)) continue;
        const t = parseEventTime(ev.time);
        if (t != null && t >= nowMins) {
            return { type: 'upcoming', ev, i, dayIdx, label: '下一個' };
        }
    }
    for (const { ev, i } of entries) {
        if (!isDashboardActiveEvent(ev)) continue;
        if (parseEventTime(ev.time) == null) {
            return { type: 'upcoming', ev, i, dayIdx, label: '下一個', noTime: true };
        }
    }

    const tomorrowIdx = dayIdx + 1;
    if (tomorrowIdx < trip.itinerary.length) {
        const tomorrowDay = trip.itinerary[tomorrowIdx];
        const tomorrowEntries = sortEventEntries(tomorrowDay.events.map((ev, i) => ({ ev, i }))).filter(({ ev }) =>
            isDashboardActiveEvent(ev),
        );
        if (tomorrowEntries.length) {
            const t0 = tomorrowEntries[0];
            return {
                type: 'tomorrow',
                ev: t0.ev,
                i: t0.i,
                dayIdx: tomorrowIdx,
                label: '明日第一個',
                dayLabel: formatBannerDayLabel(trip, tomorrowDay, tomorrowIdx),
            };
        }
    }

    return { type: 'done', dayIdx };
}

function expandEventEdit(dayIdx, i) {
    openEventEditSheet(dayIdx, i);
}

function renderEventEditSheetFields(dayIdx, i, ev) {
    const statusUI = renderStatusBadgeHtml(ev.status, { interactive: true, dayIdx, eventIdx: i });
    return `
        <label class="event-edit-sheet-field">
            <span class="type-micro text-muted">景點名稱</span>
            <input oninput="trip.itinerary[${dayIdx}].events[${i}].loc=this.value;debouncedSave();document.getElementById('event-edit-picker-loc').textContent=this.value||'景點'" value="${escapeAttr(ev.loc)}" placeholder="景點名稱" class="field-input w-full mt-1">
        </label>
        <div class="event-edit-sheet-field">
            <span class="type-micro text-muted">狀態</span>
            <div class="mt-1">${statusUI}</div>
        </div>
        <label class="event-edit-sheet-field">
            <span class="type-micro text-muted">時間</span>
            <input type="time" oninput="trip.itinerary[${dayIdx}].events[${i}].time=this.value;debouncedSave();debouncedRenderDay()" value="${escapeAttr(ev.time)}" class="field-input w-full mt-1">
        </label>
        <label class="event-edit-sheet-field">
            <span class="type-micro text-muted">標籤</span>
            <input oninput="trip.itinerary[${dayIdx}].events[${i}].tag=this.value;debouncedSave()" value="${escapeAttr(ev.tag)}" placeholder="例：美食" class="field-input w-full mt-1">
        </label>
        <label class="event-edit-sheet-field">
            <span class="type-micro text-muted">備註</span>
            <textarea oninput="trip.itinerary[${dayIdx}].events[${i}].remark=this.value;debouncedSave()" placeholder="備註" class="field-input field-textarea w-full mt-1">${escapeHtml(ev.remark || '')}</textarea>
        </label>
        <label class="event-edit-sheet-field">
            <span class="type-micro text-muted">地圖連結</span>
            <input oninput="trip.itinerary[${dayIdx}].events[${i}].link=this.value;debouncedSave()" value="${escapeAttr(ev.link)}" placeholder="https://…" class="field-input w-full mt-1">
        </label>
        <label class="event-edit-sheet-field">
            <span class="type-micro text-muted">訂位／票號</span>
            <input oninput="trip.itinerary[${dayIdx}].events[${i}].bookingRef=this.value;debouncedSave()" value="${escapeAttr(ev.bookingRef)}" placeholder="訂位編號" class="field-input w-full mt-1">
        </label>
        <label class="event-edit-sheet-field">
            <span class="type-micro text-muted">預估花費（${escapeAttr(tripLocalCurrency())}）</span>
            <input type="number" oninput="trip.itinerary[${dayIdx}].events[${i}].cost=this.value;debouncedSave();renderDaySelector();syncTripScheduleChrome()" value="${escapeAttr(ev.cost === '' || ev.cost == null ? '' : String(ev.cost))}" class="field-input w-full mt-1" inputmode="decimal">
        </label>
        <div class="event-edit-sheet-field">
            <span class="type-micro text-muted">圖片</span>
            <div id="event-edit-img-preview" class="event-edit-img-preview mt-1"></div>
            <button type="button" onclick="curEventIdx=${i};triggerFile('event-img-input')" class="btn-inline mt-2">上傳／更換</button>
        </div>
        <div class="event-edit-actions mt-2">
            <button type="button" onclick="copyEvent(${dayIdx}, ${i})" class="btn-inline btn-inline-pink">複製</button>
            <button type="button" onclick="closeEventEditSheet();removeEvent(${dayIdx}, ${i})" class="btn-inline btn-inline-danger">刪除</button>
        </div>`;
}

async function updateEventEditSheetImagePreview(dayIdx, i) {
    const wrap = document.getElementById('event-edit-img-preview');
    if (!wrap) return;
    const ev = trip.itinerary[dayIdx]?.events[i];
    if (!ev?.img) {
        wrap.innerHTML = '<p class="type-micro text-muted">未上傳圖片</p>';
        return;
    }
    const url = await resolveImageUrl(ev.img);
    wrap.innerHTML = `<button type="button" class="event-edit-img-thumb-btn" onclick='showBig(${JSON.stringify(ev.img)})'><img src="${escapeAttr(url || ev.img)}" alt="景點圖片" class="event-edit-img-thumb"></button>`;
}

function refreshEventEditSheetIfOpen(dayIdx, i) {
    const picker = document.getElementById('event-edit-picker');
    if (!picker || picker.classList.contains('hidden')) return;
    if (window._eventEditDayIdx !== dayIdx || window._eventEditIdx !== i) return;
    const ev = trip.itinerary[dayIdx]?.events[i];
    if (!ev) return;
    const body = document.getElementById('event-edit-picker-body');
    if (body) body.innerHTML = renderEventEditSheetFields(dayIdx, i, ev);
    updateEventEditSheetImagePreview(dayIdx, i);
}

function openEventEditSheet(dayIdx, i) {
    const ev = trip.itinerary[dayIdx]?.events[i];
    if (!ev) return;
    window._eventEditDayIdx = dayIdx;
    window._eventEditIdx = i;
    curEventIdx = i;
    const locEl = document.getElementById('event-edit-picker-loc');
    const body = document.getElementById('event-edit-picker-body');
    if (locEl) locEl.textContent = ev.loc || '景點';
    if (body) body.innerHTML = renderEventEditSheetFields(dayIdx, i, ev);
    updateEventEditSheetImagePreview(dayIdx, i);
    document.getElementById('event-edit-picker')?.classList.remove('hidden');
}

function closeEventEditSheet(opts) {
    const silent = opts === true || opts?.silent;
    const picker = document.getElementById('event-edit-picker');
    if (!picker || picker.classList.contains('hidden')) return;
    picker.classList.add('hidden');
    const dayIdx = window._eventEditDayIdx;
    window._eventEditDayIdx = null;
    window._eventEditIdx = null;
    if (!silent && dayIdx != null) {
        renderDay(dayIdx);
        renderDaySelector();
        syncTripScheduleChrome();
    }
}

function countTodayEventProgress(events) {
    const total = events.length;
    const done = events.filter((ev) => normalizeEventStatus(ev.status) === 'done').length;
    return { done, total };
}

function renderDashboardProgressRing(done, total) {
    if (total <= 0) return '';
    const r = 16;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - done / total);
    const complete = done === total;
    return `<div class="dashboard-progress-ring" role="img" aria-label="今日完成 ${done} / ${total}">
        <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
            <circle class="dashboard-progress-track" cx="20" cy="20" r="${r}" fill="none" stroke-width="3.5"></circle>
            <circle class="dashboard-progress-arc${complete ? ' is-complete' : ''}" cx="20" cy="20" r="${r}" fill="none" stroke-width="3.5"
                stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 20 20)"></circle>
        </svg>
        <span class="dashboard-progress-text">${done}/${total}</span>
    </div>`;
}

function syncDashboardProgress(events) {
    const el = document.getElementById('dashboard-progress');
    if (!el) return;
    const { done, total } = countTodayEventProgress(events);
    if (total <= 0) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }
    el.innerHTML = renderDashboardProgressRing(done, total);
    el.classList.remove('hidden');
}

function renderTodayQuickTools(hideForHero = false) {
    const el = document.getElementById('dashboard-quick-bar');
    if (!el || !isTodayTabActive()) return;
    if (hideForHero) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }
    let pinnedChip = '';
    const pinIdx = trip.pinnedDocIdx;
    if (pinIdx != null && trip.docs[pinIdx]) {
        const d = trip.docs[pinIdx];
        const label = d.label || (isPdfDoc(d) ? 'PDF' : '文件');
        pinnedChip = `<button type="button" class="dashboard-quick-icon dashboard-quick-icon-pin" onclick="openPinnedDoc()" aria-label="釘選文件"><i class="fas fa-thumbtack" aria-hidden="true"></i>${escapeHtml(label)}</button>`;
    }
    el.innerHTML = `${pinnedChip}
        <button type="button" class="dashboard-quick-icon" onclick="goToToolsSection('tools-weather-card')" aria-label="天氣"><i class="fas fa-cloud-sun" aria-hidden="true"></i>天氣</button>
        <button type="button" class="dashboard-quick-icon" onclick="goToToolsSection('tools-rate-card')" aria-label="匯率"><i class="fas fa-coins" aria-hidden="true"></i>匯率</button>
        <button type="button" class="dashboard-quick-icon" onclick="goToToolsSection('tools-docs-card')" aria-label="文件"><i class="fas fa-file-image" aria-hidden="true"></i>文件</button>`;
    el.classList.remove('hidden');
}

function renderDashboardWeather(dayIdx) {
    const el = document.getElementById('dashboard-weather');
    if (!el || typeof getDayWeatherSnippet !== 'function') return;
    if (dayIdx < 0) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }
    const w = getDayWeatherSnippet(dayIdx);
    if (!w) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }
    const mood =
        typeof weatherMoodLabel === 'function' ? weatherMoodLabel(w.code) : '';
    const moodHtml = mood
        ? `<span class="dashboard-weather-mood dashboard-weather-mood-${w.code <= 3 ? 'good' : 'warn'}">${escapeHtml(mood)}</span>`
        : '';
    el.innerHTML = `<button type="button" class="dashboard-weather" onclick="goToToolsSection('tools-weather-card')" aria-label="今日天氣：${escapeAttr(mood || w.temp)}">
        ${weatherIconHtml(w.code)}<span class="dashboard-weather-temp">${escapeHtml(w.temp)}</span>${moodHtml}
    </button>`;
    el.classList.remove('hidden');
}

function renderTravelDashboard() {
    const wrap = document.getElementById('travel-dashboard');
    const hero = document.getElementById('dashboard-hero');
    const list = document.getElementById('today-overview-list');
    const titleEl = document.getElementById('dashboard-title');
    const hintEl = document.getElementById('dashboard-hint');
    const jumpBtn = document.getElementById('dashboard-jump-btn');
    if (!wrap || !list) return;

    if (!isTodayTabActive()) return;

    const todayIdx = getDashboardDayIndex();
    if (todayIdx < 0) {
        if (titleEl) {
            titleEl.innerHTML = '<i class="fas fa-calendar-day text-pink-400 mr-1"></i>今日總覽';
        }
        if (hintEl) {
            hintEl.textContent = '';
            hintEl.classList.add('hidden');
        }
        document.getElementById('dashboard-day-title')?.classList.add('hidden');
        stopDashboardCountdownTimer();
        if (jumpBtn) jumpBtn.classList.add('hidden');
        renderDashboardWeather(-1);
        syncDashboardProgress([]);
        renderTodayQuickTools();
        if (hero) {
            hero.classList.add('hidden');
            hero.innerHTML = '';
        }
        list.classList.remove('hidden');
        list.innerHTML = trip.itinerary?.length
            ? ''
            : `<div class="dashboard-empty-state"><p class="type-caption text-muted text-center">請先新增行程</p></div>`;
        return;
    }

    const realToday = hasRealToday();

    if (titleEl) {
        titleEl.innerHTML = realToday
            ? '<i class="fas fa-calendar-day text-pink-400 mr-1"></i>今日總覽'
            : '<i class="fas fa-calendar-day text-pink-400 mr-1"></i>本日行程';
    }
    const day = trip.itinerary[todayIdx];
    syncDashboardDayTitle(day.title);
    if (hintEl) {
        hintEl.textContent = '';
        hintEl.classList.add('hidden');
    }
    if (jumpBtn) jumpBtn.classList.remove('hidden');

    syncDashboardProgress(day.events);
    renderDashboardWeather(todayIdx);
    const dayLabel = formatBannerDayLabel(trip, day, todayIdx);
    const next = getDashboardNextEvent(todayIdx);
    const entries = sortEventEntries(day.events.map((ev, i) => ({ ev, i })));
    const liveToday = hasRealToday() && todayIdx === getTodayDayIndex();
    const hasUpcomingHero = next.type === 'upcoming';
    renderTodayQuickTools(hasUpcomingHero);

    if (hero) {
        if (next.type === 'empty') {
            hero.innerHTML = `<p class="type-body text-secondary">今日未有景點，休息下啦 ☕</p>`;
            hero.classList.remove('hidden');
        } else if (next.type === 'done') {
            hero.innerHTML = `<p class="type-body text-secondary">今日行程已完，休息下啦 ☕</p>`;
            hero.classList.remove('hidden');
        } else {
            const loc = next.ev.loc || '景點';
            const time = next.ev.time || (next.noTime ? '時間未定' : '--:--');
            const jumpDayIdx = next.dayIdx;
            const cd =
                next.type === 'upcoming' ? formatEventCountdown(next.ev, liveToday) : null;
            const countdown = renderCountdownBadge(cd);
            const remindBtn =
                next.type === 'upcoming' && cd && cd.mins >= 0
                    ? renderRemindButton(jumpDayIdx, next.i)
                    : '';
            const headerLine =
                next.type === 'tomorrow'
                    ? `${escapeHtml(next.dayLabel || '明日')} · ${next.label}`
                    : `${escapeHtml(dayLabel)} · ${next.label}`;
            const mapBtn =
                loc.trim()
                    ? `<button type="button" class="dashboard-hero-map-btn" onclick='openMapPrimary(${JSON.stringify(loc)}, ${JSON.stringify(next.ev.link || "")})'><i class="fas fa-location-arrow mr-1"></i>去呢度</button>`
                    : '';
            const heroStatus = renderStatusBadgeHtml(next.ev.status, {
                interactive: true,
                dayIdx: jumpDayIdx,
                eventIdx: next.i,
            });
            hero.innerHTML = `
                <div class="dashboard-hero-prominent">
                    <p class="dashboard-hero-eyebrow">${headerLine}</p>
                    <p class="dashboard-hero-time">${escapeHtml(time)}</p>
                    <p class="dashboard-hero-loc">${escapeHtml(loc)}</p>
                    <div class="dashboard-hero-status">${heroStatus}</div>
                    ${countdown ? `<div class="dashboard-hero-countdown">${countdown}</div>` : ''}
                    ${next.ev.bookingRef ? `<button type="button" class="chip-copy mt-2" onclick='event.stopPropagation();copyBookingRef(${JSON.stringify(next.ev.bookingRef)})'><i class="fas fa-copy mr-1"></i>${escapeHtml(next.ev.bookingRef)}</button>` : ''}
                    <div class="dashboard-hero-actions">
                        ${mapBtn}
                        ${remindBtn}
                        <button type="button" class="btn-ghost-sm" onclick="jumpToEvent(${jumpDayIdx}, ${next.i})">詳情</button>
                    </div>
                </div>`;
            hero.classList.remove('hidden');
        }
    }

    const renderEventRow = ({ ev, i }, isNext) => {
        const statusBadge = renderStatusBadgeHtml(ev.status, {
            interactive: true,
            dayIdx: todayIdx,
            eventIdx: i,
        });
        return `
            <div class="today-event-row today-event-row-secondary w-full${isNext ? ' is-next-highlight' : ''}">
                <button type="button" class="today-event-row-main" onclick="jumpToEvent(${todayIdx}, ${i})">
                    <span class="time-badge">${escapeHtml(ev.time || '--')}</span>
                    <span class="flex-1 min-w-0">
                        <span class="today-event-loc block truncate">${escapeHtml(ev.loc || '景點')}</span>
                    </span>
                </button>
                <span class="today-event-row-status shrink-0">${statusBadge}</span>
            </div>`;
    };

    if (entries.length === 0) {
        list.classList.remove('hidden');
        list.innerHTML = `<p class="dashboard-divider-label">今日未有景點安排</p>`;
    } else if (hasUpcomingHero) {
        const restEntries = entries.filter(({ i }) => i !== next.i);
        list.classList.remove('hidden');
        if (restEntries.length === 0) {
            list.innerHTML = '';
        } else if (!dashboardRestExpanded) {
            list.innerHTML = `<button type="button" class="dashboard-rest-toggle" onclick="toggleDashboardRestList()" aria-expanded="false">其餘 ${restEntries.length} 個景點</button>`;
        } else {
            list.innerHTML = `<button type="button" class="dashboard-rest-toggle" onclick="toggleDashboardRestList()" aria-expanded="true">收起列表</button>${restEntries
                .map((entry) => renderEventRow(entry, false))
                .join('')}`;
        }
    } else {
        list.classList.remove('hidden');
        list.innerHTML = `<p class="dashboard-divider-label">全日行程</p>${entries
            .map((entry) => renderEventRow(entry, next.type === 'upcoming' && entry.i === next.i))
            .join('')}`;
    }

    syncDashboardCountdownTimer();
}

function openMapPrimary(loc, link) {
    const href = safeExternalUrl(link);
    if (href) {
        openExternalUrl(href);
        return;
    }
    const q = (loc || '').trim();
    if (q) openMapDirections(q);
}

function renderEventStatusUI(dayIdx, eventIdx, ev) {
    const canPick = isEdit || travelMode;
    return renderStatusBadgeHtml(ev.status, {
        interactive: canPick,
        dayIdx,
        eventIdx,
    });
}

function renderMapActionsUI(loc, link) {
    const href = safeExternalUrl(link);
    if (!(loc || '').trim() && !href) return '';
    const locStr = loc || '';
    return `<div class="map-actions">
        ${locStr.trim() ? `<button type="button" class="btn-primary-sm" onclick='openMapPrimary(${JSON.stringify(locStr)}, ${JSON.stringify(link || "")})'><i class="fas fa-location-arrow mr-1"></i>去呢度</button>` : ''}
        ${href && !locStr.trim() ? `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" class="btn-ghost-sm">開啟連結</a>` : ''}
    </div>`;
}

function setupDaySwipe() {
    const card = document.getElementById('main-day-card');
    if (!card || card._swipeBound) return;
    card._swipeBound = true;
    let startX = 0;
    let startY = 0;
    card.addEventListener(
        'touchstart',
        (e) => {
            if (e.touches.length !== 1) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        },
        { passive: true },
    );
    card.addEventListener(
        'touchend',
        (e) => {
            const dx = e.changedTouches[0].clientX - startX;
            const dy = e.changedTouches[0].clientY - startY;
            if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy)) return;
            if (dx < 0 && curDayIdx < trip.itinerary.length - 1) {
                dismissSwipeHint();
                renderDay(curDayIdx + 1);
            } else if (dx > 0 && curDayIdx > 0) {
                dismissSwipeHint();
                renderDay(curDayIdx - 1);
            }
        },
        { passive: true },
    );
}

function setupModalFocusTrap() {
    const modal = document.getElementById('app-modal');
    if (!modal || modal._trapBound) return;
    modal._trapBound = true;
    modal.addEventListener('keydown', (e) => {
        if (modal.classList.contains('hidden') || e.key !== 'Tab') return;
        const focusable = modal.querySelectorAll('button, input, [href], [tabindex]:not([tabindex="-1"])');
        const list = Array.from(focusable).filter((el) => !el.classList.contains('hidden') && !el.disabled);
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    });
}

function setupUiUx() {
    setupDaySwipe();
    setupModalFocusTrap();
    maybeShowSwipeHint();
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('header-menu');
        const btn = document.getElementById('header-menu-btn');
        if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target) && !btn?.contains(e.target)) {
            closeHeaderMenu();
        }
        const advBtn = document.getElementById('tools-advanced-btn');
        const advMenu = document.getElementById('tools-advanced-menu');
        if (
            advMenu &&
            !advMenu.classList.contains('hidden') &&
            !advMenu.contains(e.target) &&
            !advBtn?.contains(e.target)
        ) {
            closeToolsAdvancedMenu();
        }
    });
}

window.openEventStatusPicker = openEventStatusPicker;
window.closeEventStatusPicker = closeEventStatusPicker;
window.openMapPrimary = openMapPrimary;
window.toggleToolsAdvancedMenu = toggleToolsAdvancedMenu;
window.closeToolsAdvancedMenu = closeToolsAdvancedMenu;
window.openEventEditSheet = openEventEditSheet;
window.closeEventEditSheet = closeEventEditSheet;
window.refreshEventEditSheetIfOpen = refreshEventEditSheetIfOpen;
window.renderTodayQuickTools = renderTodayQuickTools;
window.syncDashboardDayTitle = syncDashboardDayTitle;
window.stopDashboardCountdownTimer = stopDashboardCountdownTimer;
window.toggleDashboardRestList = toggleDashboardRestList;
window.syncDashboardTravelToggle = syncDashboardTravelToggle;
