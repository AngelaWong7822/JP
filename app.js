const KEY = 'TRAVEL_V6_STORAGE';
const OLD_KEY = 'TRAVEL_V5_5_STORAGE';
const TRAVEL_MODE_KEY = 'TRAVEL_APP_TRAVEL_MODE';
const WEATHER_TTL_MS = 30 * 60 * 1000;
const WEATHER_PAST_DAYS = 7;
const WEATHER_FORECAST_DAYS = 16;
const MAX_TRIP_DAYS = 30;
const RATE_TTL_MS = 24 * 60 * 60 * 1000;
const UI_PREFS_KEY = 'TRAVEL_APP_UI_PREFS';
const DARK_MODE_KEY = 'TRAVEL_APP_DARK_MODE';
const IDB_NAME = 'TRAVEL_APP_IMAGES';
const IDB_STORE = 'images';
const IDB_REF_PREFIX = 'idb:';

let isEdit = false, curDayIdx = 0, curEventIdx = null, lastRenderedDayIdx = -1;
let idbDb = null;
const imageUrlCache = new Map();
let searchQuery = '';
let searchTimer = null;
let lightboxScale = 1;
let swRefreshing = false;
let swUpdatePending = false;
let travelMode = localStorage.getItem(TRAVEL_MODE_KEY) === '1';
let weatherDayIdx = 0;
let weatherForecastCache = {
    city: '',
    ts: 0,
    place: '',
    daily: null,
    current: null,
};
let rateCache = { local: '', home: '', ts: 0 };

const CHECK_TEMPLATES = {
    short: ['檢查護照', '行動電源', '信用卡', '常用藥品'],
    winter: ['保暖外套', '圍巾手套', '護手霜', '暖暖包'],
    business: ['筆電', '簡報筆', '名片', '延長線'],
};

const CURRENCY_SYMBOLS = {
    JPY: '¥', CNY: '¥', USD: '$', EUR: '€', GBP: '£', HKD: 'HK$', TWD: 'NT$', KRW: '₩', THB: '฿', SGD: 'S$',
    AUD: 'A$', CAD: 'C$', MYR: 'RM', PHP: '₱', IDR: 'Rp', CHF: 'Fr', NZD: 'NZ$', MXN: 'MX$', INR: '₹',
    VND: '₫', PLN: 'zł', SEK: 'kr', NOK: 'kr', DKK: 'kr', TRY: '₺', ZAR: 'R', BRL: 'R$',
};

const SUPPORTED_CURRENCIES = [
    'JPY', 'HKD', 'TWD', 'USD', 'EUR', 'GBP', 'CNY', 'KRW', 'THB', 'SGD', 'AUD', 'CAD', 'MYR', 'PHP', 'IDR',
    'CHF', 'NZD', 'MXN', 'INR', 'VND', 'PLN', 'SEK', 'NOK', 'DKK', 'TRY', 'ZAR', 'BRL',
];

function normalizeCurrency(v) {
    return String(v || '').trim().toUpperCase().slice(0, 6);
}

function tripLocalCurrency() {
    return normalizeCurrency(trip.localCurrency) || 'JPY';
}

function tripHomeCurrency() {
    return normalizeCurrency(trip.homeCurrency) || 'HKD';
}

function currencyOptionLabel(code) {
    const sym = CURRENCY_SYMBOLS[code];
    return sym ? `${code} (${sym})` : code;
}

function ensureCurrencySelectOptions(el) {
    if (!el || el.dataset.ready === '1') return;
    el.innerHTML = SUPPORTED_CURRENCIES.map(
        (c) => `<option value="${escapeAttr(c)}">${escapeHtml(currencyOptionLabel(c))}</option>`,
    ).join('');
    el.dataset.ready = '1';
}

function renderCurrencySelect(el, selected) {
    if (!el) return;
    ensureCurrencySelectOptions(el);
    const cur = normalizeCurrency(selected);
    if (cur && ![...el.options].some((o) => o.value === cur)) {
        const opt = document.createElement('option');
        opt.value = cur;
        opt.textContent = currencyOptionLabel(cur);
        el.insertBefore(opt, el.firstChild);
    }
    el.value = cur;
}

function resetRateForCurrencyChange() {
    rateCache = { local: '', home: '', ts: 0 };
    trip.rate = null;
    trip.ratePair = null;
}

function setTripLocalCurrency(code) {
    trip.localCurrency = normalizeCurrency(code) || 'JPY';
    resetRateForCurrencyChange();
    renderCurrencyUI();
    debouncedSave();
    renderDaySelector();
    renderDay(curDayIdx);
    fetchRate();
}

function setTripHomeCurrency(code) {
    trip.homeCurrency = normalizeCurrency(code) || 'HKD';
    resetRateForCurrencyChange();
    renderCurrencyUI();
    debouncedSave();
    fetchRate();
}

function onLocalCurrencySelect(v) {
    setTripLocalCurrency(v);
}

function onHomeCurrencySelect(v) {
    setTripHomeCurrency(v);
}

function swapCurrencies() {
    const local = tripLocalCurrency();
    const home = tripHomeCurrency();
    trip.localCurrency = home;
    trip.homeCurrency = local;
    resetRateForCurrencyChange();
    const l = document.getElementById('curr-local');
    const h = document.getElementById('curr-home');
    if (l) l.value = '';
    if (h) h.value = '';
    renderCurrencyUI();
    debouncedSave();
    renderDaySelector();
    renderDay(curDayIdx);
    fetchRate();
}

function formatAmount(amount) {
    const code = tripLocalCurrency();
    const sym = CURRENCY_SYMBOLS[code];
    const n = Number(amount);
    const val = Number.isNaN(n) ? 0 : n;
    if (sym) return `${sym} ${val}`;
    return `${val} ${code}`;
}

function formatPillAmount(amount) {
    const n = Number(amount);
    if (Number.isNaN(n) || n === 0) return '—';
    const sym = CURRENCY_SYMBOLS[tripLocalCurrency()] || '';
    if (n >= 10000) {
        const w = n / 10000;
        return `${sym}${w % 1 === 0 ? w : w.toFixed(1)}萬`;
    }
    if (n >= 1000) return `${sym}${Math.round(n / 1000)}k`;
    return `${sym}${n}`;
}

function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
}

let modalResolve = null;
let modalState = { showInput: false };

function finishModal(ok) {
    let result = null;
    if (ok) {
        result = modalState.showInput ? document.getElementById('modal-input').value : true;
    }
    document.getElementById('app-modal').classList.add('hidden');
    if (modalResolve) {
        modalResolve(result);
        modalResolve = null;
    }
}

function showModal({
    title,
    message = '',
    value = '',
    placeholder = '',
    confirmText = '確定',
    cancelText = '取消',
    showInput = false,
    showCancel = true,
    danger = false,
}) {
    return new Promise((resolve) => {
        modalResolve = resolve;
        modalState.showInput = showInput;
        document.getElementById('modal-title').textContent = title;
        const msgEl = document.getElementById('modal-message');
        const inputEl = document.getElementById('modal-input');
        const cancelBtn = document.getElementById('modal-cancel');
        const confirmBtn = document.getElementById('modal-confirm');
        msgEl.textContent = message;
        msgEl.classList.toggle('hidden', !message);
        inputEl.value = value;
        inputEl.placeholder = placeholder;
        inputEl.classList.toggle('hidden', !showInput);
        cancelBtn.textContent = cancelText;
        cancelBtn.classList.toggle('hidden', !showCancel);
        confirmBtn.textContent = confirmText;
        confirmBtn.className = `flex-1 py-3 rounded-2xl type-caption font-heavy ${danger ? 'bg-red-500 text-white' : 'btn-inverse'}`;
        document.getElementById('app-modal').classList.remove('hidden');
        if (showInput) {
            setTimeout(() => {
                inputEl.focus();
                inputEl.select();
            }, 50);
        } else {
            confirmBtn.focus();
        }
    });
}

async function modalAlert(title, message) {
    await showModal({ title, message, showCancel: false, confirmText: '知道了' });
}

async function modalConfirm(title, message, { danger = false, confirmText = '確定' } = {}) {
    return (await showModal({ title, message, showCancel: true, confirmText, cancelText: '取消', danger })) === true;
}

async function modalPrompt(title, value = '', placeholder = '') {
    const result = await showModal({ title, value, placeholder, showInput: true, showCancel: true });
    return result === null || result === undefined ? null : String(result);
}

function setupModal() {
    document.getElementById('modal-confirm').addEventListener('click', () => finishModal(true));
    document.getElementById('modal-cancel').addEventListener('click', () => finishModal(false));
    document.querySelectorAll('[data-modal-dismiss]').forEach((el) => {
        el.addEventListener('click', () => finishModal(false));
    });
    document.getElementById('modal-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finishModal(true);
        if (e.key === 'Escape') finishModal(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (document.getElementById('lightbox')?.classList.contains('open')) return;
        if (!document.getElementById('app-modal').classList.contains('hidden')) finishModal(false);
    });
}

function getTodayDayIndex() {
    if (!trip.startDate) return -1;
    const start = new Date(trip.startDate + 'T12:00:00');
    const today = new Date();
    const todayNoon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
    const diffDays = Math.round((todayNoon - start) / 86400000);
    if (diffDays < 0 || diffDays >= trip.itinerary.length) return -1;
    return diffDays;
}

function getDashboardDayIndex() {
    const realToday = getTodayDayIndex();
    if (realToday >= 0) return realToday;
    if (!trip.itinerary?.length) return -1;
    return Math.min(Math.max(curDayIdx, 0), trip.itinerary.length - 1);
}

function hasRealToday() {
    return getTodayDayIndex() >= 0;
}

function isTodayDayIndex(i) {
    const realToday = getTodayDayIndex();
    if (realToday >= 0) return realToday === i;
    return !trip.startDate && getDashboardDayIndex() === i;
}

const GENERIC_DAY_TITLES = new Set(['', '新的一天', '開啟旅程']);

function displayDayTitle(title) {
    const text = (title || '').trim();
    return GENERIC_DAY_TITLES.has(text) ? '' : text;
}

function getTripSubtitle() {
    if (!trip.startDate) return '開始規劃！';
    const start = new Date(trip.startDate + 'T12:00:00');
    const today = new Date();
    const todayNoon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
    const diffDays = Math.round((todayNoon - start) / 86400000);
    if (diffDays < 0) return `還有 ${-diffDays} 天出發`;
    if (diffDays >= trip.itinerary.length) return '旅程已結束';
    if (isTodayDayIndex(diffDays)) return `今日 · 第 ${diffDays + 1} 天`;
    return `旅程中 · 第 ${diffDays + 1} 天`;
}

function updateHeaderSubtitle() {
    const el = document.getElementById('header-subtitle');
    if (el) el.textContent = getTripSubtitle();
}

function scrollToTodayCard() {
    const idx = getDashboardDayIndex();
    if (idx < 0) return;
    const container = document.getElementById('day-selector');
    const card = container?.children[idx];
    if (card) card.scrollIntoView({ inline: 'center', behavior: 'smooth' });
}

function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove('show'), 1800);
}

let saveToastTimer = null;
function notifySaved() {
    clearTimeout(saveToastTimer);
    saveToastTimer = setTimeout(() => showToast('已儲存'), 350);
}

async function copyBookingRef(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('已複製訂位編號');
    } catch (_) {
        await modalAlert('複製失敗', '請手動長按複製');
    }
}

function getUiPrefs() {
    try {
        return JSON.parse(localStorage.getItem(UI_PREFS_KEY) || '{}');
    } catch (_) {
        return {};
    }
}

function isTodayTabActive() {
    const el = document.getElementById('content-today');
    return el && !el.classList.contains('hidden');
}

function getActiveTab() {
    if (isTodayTabActive()) return 'today';
    if (!document.getElementById('content-tools').classList.contains('hidden')) return 'tools';
    return 'itinerary';
}

function saveUiPrefs() {
    const prefs = getUiPrefs();
    prefs.days = prefs.days || {};
    prefs.days[data.activeIdx] = curDayIdx;
    prefs.activeTab = getActiveTab();
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
}

async function restoreUiPrefs() {
    const prefs = getUiPrefs();
    if (prefs.days && prefs.days[data.activeIdx] != null) {
        const idx = prefs.days[data.activeIdx];
        if (idx >= 0 && idx < trip.itinerary.length) curDayIdx = idx;
    }
    if (prefs.activeTab === 'tools') await setTab('tools');
    else if (prefs.activeTab === 'itinerary') await setTab('itinerary');
    else await setTab('today');
}

function isDarkMode() {
    return localStorage.getItem(DARK_MODE_KEY) === '1';
}

function applyTheme() {
    const dark = isDarkMode();
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#1a1a2e' : '#FF85A1';
    const btn = document.getElementById('theme-toggle-btn');
    const icon = document.getElementById('theme-toggle-icon');
    if (btn) {
        btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
        btn.setAttribute('aria-label', dark ? '切換淺色模式' : '切換深色模式');
        btn.classList.toggle('is-active', dark);
    }
    if (icon) icon.className = dark ? 'fas fa-sun' : 'fas fa-moon';
}

function toggleDarkMode() {
    localStorage.setItem(DARK_MODE_KEY, isDarkMode() ? '0' : '1');
    applyTheme();
}

function onDarkModeToggle(checked) {
    localStorage.setItem(DARK_MODE_KEY, checked ? '1' : '0');
    applyTheme();
}

function closeLightbox() {
    const lb = document.getElementById('lightbox');
    lb.classList.remove('open');
    lightboxScale = 1;
    const img = document.getElementById('lightbox-img');
    if (img) img.style.transform = 'scale(1)';
}

function applyLightboxScale() {
    const img = document.getElementById('lightbox-img');
    if (img) img.style.transform = `scale(${lightboxScale})`;
}

function setupLightbox() {
    const lb = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    if (!lb || !img) return;

    lb.addEventListener('click', (e) => {
        if (e.target === lb || e.target.id === 'lightbox-viewport') closeLightbox();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lb.classList.contains('open')) closeLightbox();
    });

    lb.addEventListener('wheel', (e) => {
        if (!lb.classList.contains('open')) return;
        e.preventDefault();
        lightboxScale = Math.min(3, Math.max(0.5, lightboxScale + (e.deltaY < 0 ? 0.15 : -0.15)));
        applyLightboxScale();
    }, { passive: false });

    let pinchStart = 0;
    let scaleStart = 1;
    img.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            pinchStart = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY,
            );
            scaleStart = lightboxScale;
        }
    }, { passive: true });

    img.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 2) return;
        const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY,
        );
        lightboxScale = Math.min(3, Math.max(0.5, scaleStart * (dist / pinchStart)));
        applyLightboxScale();
    }, { passive: true });
}

function googleMapsUrl(query) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function appleMapsUrl(query) {
    return `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
}

function googleMapsDirectionsUrl(query) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}

function openExternalUrl(url) {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function openMapSearch(loc) {
    const q = (loc || '').trim();
    if (!q) return;
    openExternalUrl(googleMapsUrl(q));
}

function openMapDirections(loc) {
    const q = (loc || '').trim();
    if (!q) return;
    openExternalUrl(googleMapsDirectionsUrl(q));
}

function openAppleMap(loc) {
    const q = (loc || '').trim();
    if (!q) return;
    openExternalUrl(appleMapsUrl(q));
}

function cloneEventData(ev) {
    return migrateEvent(JSON.parse(JSON.stringify(ev)));
}

function cloneDayData(day) {
    const title = displayDayTitle(day.title);
    return {
        date: day.date,
        weekday: day.weekday,
        title: title ? `${title}（複製）` : '',
        img: day.img,
        budget: day.budget,
        events: day.events.map(cloneEventData),
    };
}

function moveEvent(dayIdx, eventIdx, delta) {
    if (!isEdit || travelMode) return;
    moveEventTo(dayIdx, eventIdx, eventIdx + delta);
}

function moveEventTo(dayIdx, fromIdx, toIdx) {
    if (!isEdit || travelMode) return;
    const events = trip.itinerary[dayIdx].events;
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= events.length || toIdx >= events.length) return;
    const [item] = events.splice(fromIdx, 1);
    events.splice(toIdx, 0, item);
    save();
    showToast('已調整順序');
    renderDay(dayIdx);
}

function goToToolsSection(sectionId) {
    setTab('tools');
    setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
}

function toggleToolsSettings() {
    const panel = document.getElementById('tools-settings-panel');
    const btn = document.getElementById('tools-settings-toggle');
    if (!panel || !btn) return;
    const open = panel.classList.toggle('hidden');
    const isOpen = !open;
    btn.classList.toggle('is-open', isOpen);
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function togglePinDoc(i) {
    if (!trip.docs[i]) return;
    const wasPinned = trip.pinnedDocIdx === i;
    trip.pinnedDocIdx = wasPinned ? null : i;
    save();
    renderDocs();
    if (typeof renderTodayQuickTools === 'function') renderTodayQuickTools();
    showToast(wasPinned ? '已取消釘選' : '已釘選文件');
}

async function openPinnedDoc() {
    const i = trip.pinnedDocIdx;
    if (i == null || !trip.docs[i]) {
        goToToolsSection('tools-docs-card');
        return;
    }
    const d = trip.docs[i];
    if (isPdfDoc(d)) await openDoc(d.url);
    else showBig(d.url);
}

async function copyEvent(dayIdx, eventIdx) {
    if (travelMode) return;
    const ev = trip.itinerary[dayIdx].events[eventIdx];
    trip.itinerary[dayIdx].events.splice(eventIdx + 1, 0, cloneEventData(ev));
    save();
    await renderDay(dayIdx);
    showToast('已複製景點');
}

async function copyCurrentDay() {
    if (travelMode || !isEdit) return;
    const day = trip.itinerary[curDayIdx];
    trip.itinerary.push(cloneDayData(day));
    save();
    renderDaySelector();
    await renderDay(trip.itinerary.length - 1);
    renderDaySelector();
    renderTodayOverview();
    showToast('已複製整天行程');
}

function goToToday() {
    const idx = getDashboardDayIndex();
    if (idx < 0) return;
    setTab('itinerary');
    renderDay(idx);
    scrollToTodayCard();
}

function goToTripScheduleSettings() {
    setTab('itinerary');
    if (!isEdit && !travelMode) {
        isEdit = true;
        syncEditChrome();
    }
    setTimeout(() => {
        const bar = document.getElementById('trip-schedule-bar');
        const input = document.getElementById('start-date-input');
        if (bar) bar.scrollIntoView({ behavior: 'smooth', block: 'center' });
        input?.focus({ preventScroll: true });
    }, 120);
}

let searchPanelOpen = false;

function syncTripScheduleChrome() {
    const bar = document.getElementById('trip-schedule-bar');
    const onItinerary = !document.getElementById('content-itinerary')?.classList.contains('hidden');
    const showBar = onItinerary && isEdit && !travelMode;
    if (bar) bar.classList.toggle('hidden', !showBar);
}

function closeSearchPanelIfOpen() {
    if (!searchPanelOpen) return;
    searchPanelOpen = false;
    document.getElementById('search-panel')?.classList.add('hidden');
    const btn = document.getElementById('search-toggle-btn');
    btn?.classList.remove('day-nav-search-active');
    btn?.setAttribute('aria-expanded', 'false');
}

function toggleSearchPanel() {
    searchPanelOpen = !searchPanelOpen;
    const panel = document.getElementById('search-panel');
    const btn = document.getElementById('search-toggle-btn');
    panel?.classList.toggle('hidden', !searchPanelOpen);
    btn?.classList.toggle('day-nav-search-active', searchPanelOpen);
    btn?.setAttribute('aria-expanded', searchPanelOpen ? 'true' : 'false');
    if (searchPanelOpen) document.getElementById('search-input')?.focus();
    else if (searchQuery) clearSearch();
}

function sortSearchHits(hits) {
    return [...hits].sort((a, b) => {
        if (a.dayIdx !== b.dayIdx) return a.dayIdx - b.dayIdx;
        const ta = parseEventTime(a.ev.time);
        const tb = parseEventTime(b.ev.time);
        if (ta == null && tb == null) return a.i - b.i;
        if (ta == null) return 1;
        if (tb == null) return -1;
        if (ta !== tb) return ta - tb;
        return a.i - b.i;
    });
}

function getAllSearchHits() {
    if (!searchQuery) return [];
    const hits = [];
    trip.itinerary.forEach((day, dayIdx) => {
        day.events.forEach((ev, eventIdx) => {
            if (eventMatchesSearch(ev)) hits.push({ dayIdx, eventIdx, ev, day, i: eventIdx });
        });
    });
    return sortSearchHits(hits);
}

function renderSearchResults() {
    const panel = document.getElementById('search-results');
    const clearBtn = document.getElementById('search-clear');
    if (!panel) return;
    if (!searchQuery) {
        panel.classList.add('hidden');
        panel.innerHTML = '';
        if (clearBtn) clearBtn.classList.add('hidden');
        return;
    }
    if (clearBtn) clearBtn.classList.remove('hidden');
    const hits = getAllSearchHits(searchQuery);
    if (hits.length === 0) {
        panel.innerHTML = `<p class="type-caption text-muted p-4 text-center">全旅程沒有符合的景點</p>`;
        panel.classList.remove('hidden');
        return;
    }
    panel.innerHTML = hits
        .slice(0, 20)
        .map(({ ev, i, dayIdx, day }) => {
            const label = formatBannerDayLabel(trip, day, dayIdx);
            return `<button type="button" class="search-hit" onclick="jumpToEvent(${dayIdx}, ${i})">
                <p class="type-body font-bold text-primary">${escapeHtml(ev.loc || '景點')}</p>
                <p class="type-micro text-muted mt-0.5">${escapeHtml(label)}${ev.time ? ` · ${escapeHtml(ev.time)}` : ''}</p>
            </button>`;
        })
        .join('');
    if (hits.length > 20) {
        panel.innerHTML += `<p class="type-micro text-muted p-3 text-center">還有 ${hits.length - 20} 筆結果，請縮小關鍵字</p>`;
    }
    panel.classList.remove('hidden');
}

function scrollToTimelineEvent(eventIdx) {
    const row = document.querySelector(`#timeline [data-event-idx="${eventIdx}"]`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function jumpToEvent(dayIdx, eventIdx) {
    if (searchQuery) clearSearch();
    setTab('itinerary');
    await renderDay(dayIdx);
    setTimeout(() => scrollToTimelineEvent(eventIdx), 120);
}

function clearSearch() {
    searchQuery = '';
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    renderSearchResults();
    renderDay(curDayIdx);
}

function renderTodayOverview() {
    if (typeof renderTravelDashboard === 'function') renderTravelDashboard();
}

function sumEventCosts(events) {
    return events.reduce((sum, ev) => {
        const n = Number(ev.cost);
        return sum + (Number.isNaN(n) || ev.cost === '' || ev.cost == null ? 0 : n);
    }, 0);
}

function safeExternalUrl(u) {
    if (!u || typeof u !== 'string') return '';
    const t = u.trim();
    if (!t) return '';
    if (/^https?:\/\//i.test(t)) return t;
    if (/^mailto:/i.test(t)) return t;
    return 'https://' + t.replace(/^\/+/, '');
}

function newImageId() {
    return crypto.randomUUID
        ? crypto.randomUUID()
        : 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

function isIdbRef(s) {
    return typeof s === 'string' && s.startsWith(IDB_REF_PREFIX);
}

function isDataUrl(s) {
    return typeof s === 'string' && s.startsWith('data:');
}

function idbRefToId(ref) {
    return ref.slice(IDB_REF_PREFIX.length);
}

function idbOpen() {
    return new Promise((resolve, reject) => {
        if (idbDb) return resolve(idbDb);
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(IDB_STORE);
        };
        req.onsuccess = () => {
            idbDb = req.result;
            resolve(idbDb);
        };
        req.onerror = () => reject(req.error);
    });
}

function idbPut(id, dataUrl) {
    return idbOpen().then(
        (db) =>
            new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).put(dataUrl, id);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            }),
    );
}

function idbGet(id) {
    return idbOpen().then(
        (db) =>
            new Promise((resolve, reject) => {
                const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(id);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            }),
    );
}

function idbDelete(id) {
    return idbOpen().then(
        (db) =>
            new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).delete(id);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            }),
    );
}

function idbClear() {
    return idbOpen().then(
        (db) =>
            new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).clear();
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            }),
    );
}

function idbListAll() {
    return idbOpen().then(
        (db) =>
            new Promise((resolve, reject) => {
                const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAllKeys();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            }),
    );
}

function collectUsedImageRefs(rootData) {
    const used = new Set();
    const add = (ref) => {
        if (isIdbRef(ref)) used.add(idbRefToId(ref));
    };
    for (const t of rootData.trips) {
        for (const day of t.itinerary) {
            add(day.img);
            for (const ev of day.events) add(ev.img);
        }
        for (const doc of t.docs) add(doc.url);
    }
    return used;
}

async function cleanupUnusedImages() {
    const used = collectUsedImageRefs(data);
    const allKeys = await idbListAll();
    const orphan = allKeys.filter((k) => !used.has(k));
    if (orphan.length === 0) {
        await modalAlert('清理完成', '沒有未使用的圖片。');
        return;
    }
    if (
        !(await modalConfirm(
            '清理未使用圖片',
            `將刪除 ${orphan.length} 張未被任何旅程引用的圖片，確定嗎？`,
            { danger: true, confirmText: '清理' },
        ))
    ) {
        return;
    }
    for (const id of orphan) {
        imageUrlCache.delete(IDB_REF_PREFIX + id);
        await idbDelete(id);
    }
    await updateStorageEstimate();
    showToast(`已清理 ${orphan.length} 張圖片`);
}

async function resolveImageUrl(ref) {
    if (!ref) return '';
    if (!isIdbRef(ref)) return ref;
    if (imageUrlCache.has(ref)) return imageUrlCache.get(ref);
    const data = await idbGet(idbRefToId(ref));
    if (!data) return '';
    imageUrlCache.set(ref, data);
    return data;
}

async function storeImage(dataUrl) {
    const id = newImageId();
    try {
        await idbPut(id, dataUrl);
    } catch (err) {
        await updateStorageEstimate();
        throw new Error('圖片儲存失敗，裝置空間可能已滿。請刪除部分圖片或旅程。');
    }
    const ref = IDB_REF_PREFIX + id;
    imageUrlCache.set(ref, dataUrl);
    return ref;
}

async function deleteImageRef(ref) {
    if (!isIdbRef(ref)) return;
    imageUrlCache.delete(ref);
    try {
        await idbDelete(idbRefToId(ref));
    } catch (_) {}
}

async function replaceImageRef(oldRef, dataUrl) {
    if (isIdbRef(oldRef)) await deleteImageRef(oldRef);
    return storeImage(dataUrl);
}

async function migrateDataUrlsToIdb(rootData) {
    let changed = false;
    for (const t of rootData.trips) {
        for (const day of t.itinerary) {
            if (isDataUrl(day.img)) {
                day.img = await storeImage(day.img);
                changed = true;
            }
            for (const ev of day.events) {
                if (isDataUrl(ev.img)) {
                    ev.img = await storeImage(ev.img);
                    changed = true;
                }
            }
        }
        for (const doc of t.docs) {
            if (isDataUrl(doc.url)) {
                doc.url = await storeImage(doc.url);
                changed = true;
            }
        }
    }
    return changed;
}

async function purgeTripImages(t) {
    for (const day of t.itinerary) {
        if (isIdbRef(day.img)) await deleteImageRef(day.img);
        for (const ev of day.events) {
            if (isIdbRef(ev.img)) await deleteImageRef(ev.img);
        }
    }
    for (const doc of t.docs) {
        if (isIdbRef(doc.url)) await deleteImageRef(doc.url);
    }
}

function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function showStorageWarning(msg) {
    const el = document.getElementById('storage-warning');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
}

function hideStorageWarning() {
    const el = document.getElementById('storage-warning');
    if (el) el.classList.add('hidden');
}

function storageTextByteSize(text) {
    if (!text) return 0;
    return new Blob([text]).size;
}

async function measureTripDataBytes() {
    let bytes = storageTextByteSize(localStorage.getItem(KEY));
    bytes += storageTextByteSize(localStorage.getItem(OLD_KEY));
    const used = collectUsedImageRefs(data);
    for (const id of used) {
        const img = await idbGet(id);
        if (img) bytes += storageTextByteSize(img);
    }
    return bytes;
}

async function updateStorageEstimate() {
    const infoEl = document.getElementById('storage-info');
    try {
        const tripBytes = await measureTripDataBytes();
        if (infoEl) {
            infoEl.textContent = `你嘅行程資料：約 ${formatBytes(tripBytes)}`;
        }
        let quota = 50 * 1024 * 1024;
        if (navigator.storage?.estimate) {
            const est = await navigator.storage.estimate();
            quota = est.quota || quota;
        }
        const pct = Math.round((tripBytes / quota) * 100);
        if (pct >= 85) {
            showStorageWarning(`行程資料已佔可用空間 ${pct}%，建議刪除部分圖片或旅程。`);
        } else if (pct >= 70) {
            showStorageWarning(`行程資料已佔可用空間 ${pct}%，上傳過多圖片可能無法儲存。`);
        } else {
            hideStorageWarning();
        }
    } catch (_) {
        if (infoEl) infoEl.textContent = '';
        hideStorageWarning();
    }
}

function addDaysFromIso(isoDateStr, n) {
    const d = new Date(isoDateStr + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d;
}

function formatISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}

function getWeatherDayIso(idx) {
    if (!trip.startDate || idx < 0 || idx >= trip.itinerary.length) return null;
    return formatISODate(addDaysFromIso(trip.startDate, idx));
}

function weatherIconHtml(code) {
    if (code === 0) return '<i class="fas fa-sun text-yellow-400"></i>';
    if (code <= 3) return '<i class="fas fa-cloud-sun text-gray-400"></i>';
    if (code <= 67) return '<i class="fas fa-cloud-showers-heavy text-blue-400"></i>';
    if (code <= 77) return '<i class="fas fa-snowflake text-blue-200"></i>';
    return '<i class="fas fa-bolt text-purple-400"></i>';
}

function weatherMoodLabel(code) {
    if (code == null) return '';
    if (code <= 1) return '適合出門';
    if (code <= 3) return '多雲';
    if (code >= 51 && code <= 67) return '記得帶傘';
    if (code >= 71 && code <= 77) return '留意寒冷';
    if (code >= 80) return '留意天氣';
    return '';
}

function getDayWeatherSnippet(dayIdx) {
    const daily = weatherForecastCache.daily;
    if (trip.startDate && daily?.time && dayIdx >= 0 && dayIdx < trip.itinerary.length) {
        const targetIso = getWeatherDayIso(dayIdx);
        if (targetIso) {
            const i = daily.time.indexOf(targetIso);
            if (i >= 0) {
                const max = Math.round(daily.temperature_2m_max[i]);
                const min = Math.round(daily.temperature_2m_min[i]);
                const temp = max === min ? `${max}°` : `${min}–${max}°`;
                return { temp, code: daily.weather_code[i] };
            }
        }
    }
    const cw = weatherForecastCache.current;
    if (cw) return { temp: `${Math.round(cw.temperature)}°`, code: cw.weathercode };
    return null;
}

function weatherDaySelectLabel(idx) {
    const d = trip.itinerary[idx];
    if (!d) return '';
    const lines = dayCardLines(trip, idx);
    const todayMark = isTodayDayIndex(idx) ? ' · 今日' : '';
    if (trip.startDate) return `${lines.line1} 週${lines.line2}${todayMark}`;
    return `${d.date} · ${d.weekday}${todayMark}`;
}

function renderWeatherDaySelect() {
    const sel = document.getElementById('weather-day-select');
    if (!sel || !trip.itinerary.length) return;
    if (weatherDayIdx < 0 || weatherDayIdx >= trip.itinerary.length) weatherDayIdx = curDayIdx;
    sel.innerHTML = trip.itinerary
        .map(
            (d, i) =>
                `<option value="${i}"${i === weatherDayIdx ? ' selected' : ''}>${escapeHtml(weatherDaySelectLabel(i))}</option>`,
        )
        .join('');
}

function onWeatherDaySelect(idx) {
    weatherDayIdx = idx;
    applyWeatherForDay();
}

function syncWeatherToDay(idx) {
    weatherDayIdx = idx;
    renderWeatherDaySelect();
    applyWeatherForDay();
}

function invalidateWeatherForecast() {
    weatherForecastCache = { city: '', ts: 0, place: '', daily: null, current: null };
}

function renderWeatherLocationSelect() {
    const sel = document.getElementById('weather-location-select');
    if (!sel) return;
    const cur = (trip.city || 'Tokyo').trim();
    if (!trip.city) trip.city = 'Tokyo';
    sel.innerHTML = weatherLocationOptionsHtml(cur);
    sel.value = getWeatherLocation(cur).id;
}

function onWeatherLocationSelect(cityId) {
    const loc = getWeatherLocation(cityId);
    trip.city = loc.id;
    invalidateWeatherForecast();
    debouncedSave();
    fetchWeather();
}

function renderWeatherUI() {
    renderWeatherDaySelect();
    renderWeatherLocationSelect();
    updateWeatherCoverageHint();
}

function updateWeatherCoverageHint() {
    const el = document.getElementById('weather-coverage-hint');
    if (!el) return;
    const suffix = trip.startDate ? '' : '（設出發日期後對準行程）';
    el.textContent = `預報涵蓋過去 ${WEATHER_PAST_DAYS} 日 + 未來 ${WEATHER_FORECAST_DAYS} 日${suffix}`;
}

function syncItineraryDatesFromStart() {
    if (!trip.startDate) return;
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    trip.itinerary.forEach((day, i) => {
        const dt = addDaysFromIso(trip.startDate, i);
        day.date = `Day ${i + 1}`;
        day.weekday = weekdays[dt.getDay()];
    });
}

function ensureItineraryDayCount(count) {
    const n = Math.max(1, Math.min(MAX_TRIP_DAYS, parseInt(count, 10) || 1));
    const defaultImg = 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=800';
    while (trip.itinerary.length < n) {
        const i = trip.itinerary.length;
        trip.itinerary.push({
            date: `Day ${i + 1}`,
            weekday: '-',
            title: '',
            img: defaultImg,
            budget: 0,
            events: [],
        });
    }
    syncItineraryDatesFromStart();
    if (curDayIdx >= trip.itinerary.length) curDayIdx = trip.itinerary.length - 1;
    return n;
}

function renderTripScheduleUI() {
    const sd = document.getElementById('start-date-input');
    const daysInput = document.getElementById('trip-days-input');
    const pillHint = document.getElementById('pill-hint');
    if (sd) sd.value = trip.startDate || '';
    if (daysInput) daysInput.value = String(trip.itinerary.length);
    if (pillHint) {
        if (trip.startDate) {
            pillHint.textContent = `已設定出發日期 · 共 ${trip.itinerary.length} 日`;
            pillHint.classList.remove('hidden');
        } else {
            pillHint.textContent = '設定出發日期以對準每日行程';
            pillHint.classList.remove('hidden');
        }
    }
    syncTripScheduleChrome();
}

function applyTripSchedule() {
    syncItineraryDatesFromStart();
    save();
    renderTripScheduleUI();
    renderDaySelector();
    renderWeatherDaySelect();
    updateWeatherCoverageHint();
    renderDay(curDayIdx);
    updateHeaderSubtitle();
    scrollToTodayCard();
    renderTodayOverview();
}

function onStartDateChange(v) {
    trip.startDate = v || '';
    const daysInput = document.getElementById('trip-days-input');
    if (daysInput) ensureItineraryDayCount(daysInput.value);
    else syncItineraryDatesFromStart();
    invalidateWeatherForecast();
    applyTripSchedule();
    fetchWeather();
}

async function onTripDaysChange(v) {
    const requested = Math.max(1, Math.min(MAX_TRIP_DAYS, parseInt(v, 10) || 1));
    const daysInput = document.getElementById('trip-days-input');
    if (requested < trip.itinerary.length) {
        if (daysInput) daysInput.value = String(trip.itinerary.length);
        await modalAlert('暫不支援減少天數', '目前只可以加天數，唔可以減少。');
        return;
    }
    ensureItineraryDayCount(requested);
    if (daysInput) daysInput.value = String(trip.itinerary.length);
    invalidateWeatherForecast();
    applyTripSchedule();
    fetchWeather();
}

function applyWeatherForDay(offlineNote = '') {
    const loc = getWeatherLocation(trip.city);
    if (!loc.id) {
        setWeatherUI({ temp: '--°C', detail: '請選擇地點', isError: true });
        return;
    }

    const place = weatherForecastCache.place || loc.label;
    const day = trip.itinerary[weatherDayIdx];

    if (!trip.startDate) {
        const cw = weatherForecastCache.current;
        if (cw) {
            const note = day ? `${day.date} · ` : '';
            setWeatherUI({
                temp: `${Math.round(cw.temperature)}°C`,
                detail: `${note}${place}（設出發日期可睇每日預報）${offlineNote}`,
                code: cw.weathercode,
            });
        } else {
            setWeatherUI({ temp: '--°C', detail: '請設定出發日期' + offlineNote, isError: true });
        }
        renderTodayOverview();
        return;
    }

    const daily = weatherForecastCache.daily;
    const targetIso = getWeatherDayIso(weatherDayIdx);
    if (!daily?.time || !targetIso) {
        setWeatherUI({ temp: '--°C', detail: '載入中…', isError: true });
        return;
    }

    const i = daily.time.indexOf(targetIso);
    if (i < 0) {
        setWeatherUI({ temp: '--°C', detail: `${weatherDaySelectLabel(weatherDayIdx)} 超出預報範圍`, isError: true });
        return;
    }

    const max = Math.round(daily.temperature_2m_max[i]);
    const min = Math.round(daily.temperature_2m_min[i]);
    const code = daily.weather_code[i];
    const temp = max === min ? `${max}°C` : `${min}–${max}°C`;
    setWeatherUI({
        temp,
        detail: `${weatherDaySelectLabel(weatherDayIdx)} · ${place}${offlineNote}`,
        code,
    });
    updateWeatherCoverageHint();
    renderTodayOverview();
}

function formatBannerDayLabel(trip, day, idx) {
    if (trip.startDate) {
        const d = addDaysFromIso(trip.startDate, idx);
        const w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}/${m}/${dd} · 週${w}`;
    }
    return `${day.date} · ${day.weekday}`;
}

function formatBannerDateHero(trip, day, idx) {
    const isToday = isTodayDayIndex(idx);
    if (trip.startDate) {
        const d = addDaysFromIso(trip.startDate, idx);
        const w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const dd = d.getDate();
        return {
            main: `${m}/${dd}`,
            sub: `週${w} · ${y}`,
            isToday,
        };
    }
    return {
        main: day.date || `第 ${idx + 1} 日`,
        sub: day.weekday || '',
        isToday,
    };
}

function updateDayBannerDate(idx) {
    const day = trip.itinerary[idx];
    if (!day) return;
    const hero = formatBannerDateHero(trip, day, idx);
    const mainEl = document.getElementById('day-banner-date-main');
    const subEl = document.getElementById('day-banner-date-sub');
    const todayMark = document.getElementById('day-banner-today-mark');
    if (mainEl) mainEl.textContent = hero.main;
    if (subEl) {
        subEl.textContent = hero.sub;
        subEl.classList.toggle('hidden', !hero.sub);
    }
    if (todayMark) todayMark.classList.toggle('hidden', !hero.isToday);
}

function dayCardLines(trip, i) {
    const d = trip.itinerary[i];
    if (trip.startDate) {
        const dt = addDaysFromIso(trip.startDate, i);
        const w = ['日', '一', '二', '三', '四', '五', '六'][dt.getDay()];
        return { line1: `${dt.getMonth() + 1}/${dt.getDate()}`, line2: w, sub: d.date };
    }
    return { line1: d.date, line2: d.weekday, sub: '' };
}

const defaultTrip = (name = '我的旅行', city = 'Tokyo') => ({
    name,
    city,
    localCurrency: 'JPY',
    homeCurrency: 'HKD',
    rate: null,
    ratePair: null,
    startDate: '',
    tripBudget: null,
    itinerary: [{
        date: 'Day 1',
        weekday: '一',
        title: '',
        img: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=800',
        budget: 0,
        events: [],
    }],
    checklist: [{ task: '檢查護照', done: false }],
    docs: [],
    pinnedDocIdx: null,
});

const EVENT_STATUS_VALUES = ['pending', 'booked', 'done'];
window.EVENT_STATUS_VALUES = EVENT_STATUS_VALUES;

function normalizeEventStatus(s) {
    if (s === 'optional') return 'pending';
    return EVENT_STATUS_VALUES.includes(s) ? s : 'pending';
}

function migrateEvent(ev) {
    return {
        loc: ev.loc != null ? ev.loc : '景點',
        time: ev.time != null ? ev.time : '12:00',
        remark: ev.remark != null ? ev.remark : '',
        status: normalizeEventStatus(ev.status),
        img: ev.img || '',
        link: ev.link != null ? ev.link : '',
        bookingRef: ev.bookingRef != null ? ev.bookingRef : '',
        cost: ev.cost != null && ev.cost !== '' ? ev.cost : '',
        tag: ev.tag != null ? ev.tag : '',
    };
}

function migrateTrip(t) {
    const trip = {
        name: t.name || '旅程',
        city: getWeatherLocation(t.city || 'Tokyo').id,
        localCurrency: normalizeCurrency(t.localCurrency) || 'JPY',
        homeCurrency: normalizeCurrency(t.homeCurrency) || 'HKD',
        rate:
            t.rate != null && t.rate !== '' && !Number.isNaN(Number(t.rate)) ? Number(t.rate) : null,
        startDate: t.startDate || '',
        tripBudget: t.tripBudget != null && t.tripBudget !== '' ? Number(t.tripBudget) : null,
        itinerary: Array.isArray(t.itinerary) ? t.itinerary : [],
        checklist: Array.isArray(t.checklist) ? t.checklist : [],
        docs: Array.isArray(t.docs) ? t.docs : [],
        pinnedDocIdx:
            t.pinnedDocIdx != null && !Number.isNaN(Number(t.pinnedDocIdx)) ? Number(t.pinnedDocIdx) : null,
    };
    if (t.ratePair?.local && t.ratePair?.home) {
        trip.ratePair = {
            local: normalizeCurrency(t.ratePair.local),
            home: normalizeCurrency(t.ratePair.home),
        };
    } else if (trip.rate != null) {
        trip.ratePair = { local: trip.localCurrency, home: trip.homeCurrency };
    } else {
        trip.ratePair = null;
    }
    if (
        trip.ratePair &&
        (trip.ratePair.local !== trip.localCurrency || trip.ratePair.home !== trip.homeCurrency)
    ) {
        trip.rate = null;
        trip.ratePair = null;
    }
    trip.itinerary = trip.itinerary.map((day) => ({
        date: day.date != null ? day.date : 'Day',
        weekday: day.weekday != null ? day.weekday : '-',
        title: displayDayTitle(day.title != null ? day.title : ''),
        img: day.img || '',
        budget: day.budget != null ? day.budget : 0,
        events: Array.isArray(day.events) ? day.events.map(migrateEvent) : [],
    }));
    if (trip.itinerary.length === 0) {
        trip.itinerary = defaultTrip().itinerary;
    }
    trip.checklist = trip.checklist.map((c) => ({
        task: c.task != null ? c.task : '',
        done: !!c.done,
    }));
    if (trip.checklist.length === 0) {
        trip.checklist = [{ task: '檢查護照', done: false }];
    }
    trip.docs = trip.docs.map(migrateDoc);
    if (trip.pinnedDocIdx != null && (trip.pinnedDocIdx < 0 || trip.pinnedDocIdx >= trip.docs.length)) {
        trip.pinnedDocIdx = null;
    }
    return trip;
}

function migrateDoc(d) {
    if (typeof d === 'string') {
        return { url: d, label: '', mimeType: String(d).startsWith('data:application/pdf') ? 'application/pdf' : 'image/*' };
    }
    const doc = {
        url: d.url || '',
        label: d.label != null ? d.label : '',
        mimeType: d.mimeType || '',
    };
    if (!doc.mimeType) {
        if (String(doc.url).startsWith('data:application/pdf')) doc.mimeType = 'application/pdf';
        else doc.mimeType = 'image/*';
    }
    return doc;
}

function isPdfDoc(d) {
    return d.mimeType === 'application/pdf' || String(d.url || '').startsWith('data:application/pdf');
}

function migrateRoot(raw) {
    if (!raw) return { version: 6, activeIdx: 0, trips: [defaultTrip()] };
    let o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (o.version === 6 && Array.isArray(o.trips)) {
        return {
            version: 6,
            activeIdx: Math.max(0, Math.min(o.activeIdx || 0, o.trips.length - 1)),
            trips: o.trips.map(migrateTrip),
        };
    }
    const trips = Array.isArray(o.trips) ? o.trips.map(migrateTrip) : [migrateTrip(defaultTrip())];
    return {
        version: 6,
        activeIdx: Math.max(0, Math.min(o.activeIdx || 0, trips.length - 1)),
        trips,
    };
}

function loadStorage() {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
        const old = localStorage.getItem(OLD_KEY);
        if (old) {
            const migrated = migrateRoot(old);
            localStorage.setItem(KEY, JSON.stringify(migrated));
            raw = JSON.stringify(migrated);
        }
    }
    return migrateRoot(raw || null);
}

let data = loadStorage();
let trip = data.trips[data.activeIdx];

let saveTimer = null;
let renderDayTimer = null;
let skipFlushSave = false;
const SAVE_DEBOUNCE_MS = 400;

function save() {
    data.trips[data.activeIdx] = trip;
    data.version = 6;
    try {
        localStorage.setItem(KEY, JSON.stringify(data));
    } catch (err) {
        if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
            showStorageWarning('localStorage 已滿，請刪除部分旅程或圖片。');
        }
        throw err;
    }
    updateStorageEstimate();
}

function debouncedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        try {
            save();
            notifySaved();
        } catch (_) {}
    }, SAVE_DEBOUNCE_MS);
}

function flushSave() {
    if (skipFlushSave) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
        save();
    } catch (_) {}
}

function persistTripMetaInputs() {
    const sd = document.getElementById('start-date-input');
    const lc = document.getElementById('local-currency-select');
    const hc = document.getElementById('home-currency-select');
    if (sd) trip.startDate = sd.value || '';
    if (lc) trip.localCurrency = normalizeCurrency(lc.value) || 'JPY';
    if (hc) trip.homeCurrency = normalizeCurrency(hc.value) || 'HKD';
}

function onSearchInput(v) {
    searchQuery = (v || '').trim().toLowerCase();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        renderSearchResults();
        renderDay(curDayIdx);
    }, 250);
}

function toggleTravelMode() {
    onTravelModeToggle(!travelMode);
}

function onTravelModeToggle(checked) {
    if (isEdit) {
        persistTripMetaInputs();
        flushSave();
    }
    travelMode = !!checked;
    localStorage.setItem(TRAVEL_MODE_KEY, travelMode ? '1' : '0');
    if (travelMode) {
        isEdit = false;
        setTab('today');
    }
    syncEditChrome();
    renderTripSelector();
    renderTripHeader();
    renderDaySelector();
    renderDay(curDayIdx);
    renderCityUI();
    renderCurrencyUI();
    renderDocs();
    renderCheck();
    updateFabVisibility();
    syncTravelLayout();
}

function eventMatchesSearch(ev) {
    if (!searchQuery) return true;
    const hay = [ev.loc, ev.remark, ev.time, ev.bookingRef, ev.tag, String(ev.cost || '')]
        .join(' ')
        .toLowerCase();
    return hay.includes(searchQuery);
}

function parseEventTime(t) {
    const m = String(t || '')
        .trim()
        .replace(/：/g, ':')
        .match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
}

function sortEventEntries(entries) {
    return [...entries].sort((a, b) => {
        const ta = parseEventTime(a.ev.time);
        const tb = parseEventTime(b.ev.time);
        if (ta == null && tb == null) return a.i - b.i;
        if (ta == null) return 1;
        if (tb == null) return -1;
        if (ta !== tb) return ta - tb;
        return a.i - b.i;
    });
}

function sortDayEventsInPlace(day) {
    const sorted = sortEventEntries(day.events.map((ev, i) => ({ ev, i })));
    day.events = sorted.map(({ ev }) => ev);
}

function debouncedRenderDay() {
    clearTimeout(renderDayTimer);
    renderDayTimer = setTimeout(() => renderDay(curDayIdx), 300);
}

function syncItineraryChromeOffset() {
    const onItinerary = !document.getElementById('content-itinerary')?.classList.contains('hidden');
    if (!onItinerary) return;
    const stickyBar = document.getElementById('itinerary-sticky-bar');
    const chromeH = stickyBar?.offsetHeight || 0;
    document.documentElement.style.setProperty(
        '--itinerary-chrome-offset',
        `calc(var(--header-offset) + ${chromeH}px + 0.35rem)`,
    );
}

function syncEditChrome() {
    const templates = document.getElementById('check-templates');
    const onItinerary = !document.getElementById('content-itinerary').classList.contains('hidden');
    const editBtn = document.getElementById('itinerary-edit-btn');
    const showEditBtn = onItinerary && !travelMode;
    if (editBtn) {
        editBtn.classList.toggle('hidden', !showEditBtn);
        if (showEditBtn) {
            editBtn.classList.toggle('day-nav-edit-active', isEdit);
            editBtn.setAttribute('aria-label', isEdit ? '完成編輯' : '編輯行程');
            editBtn.innerHTML = isEdit
                ? '<i class="fas fa-check" aria-hidden="true"></i>'
                : '<i class="fas fa-pen" aria-hidden="true"></i>';
        }
    }

    document.getElementById('del-trip-menu-btn')?.classList.toggle('hidden', !isEdit || travelMode);
    document.querySelectorAll('#edit-controls, #btn-upload-doc, #btn-add-check').forEach((el) => {
        el.classList.toggle('hidden', !isEdit || travelMode);
    });
    if (templates) templates.classList.toggle('hidden', !isEdit || travelMode);
    const planningEdit = isEdit && !travelMode;
    const banner = document.getElementById('day-banner');
    if (banner) {
        banner.classList.toggle('day-banner-hidden', planningEdit);
        banner.classList.toggle('day-banner-date-only', !planningEdit);
        banner.classList.remove('day-banner-photo-mode', 'day-banner-compact');
    }
    document.getElementById('main-day-card')?.classList.toggle('main-day-card-edit', planningEdit);
    document.getElementById('main-day-card')?.classList.toggle('main-day-card-browse', !planningEdit);
    document.getElementById('search-toggle-btn')?.classList.toggle('hidden', planningEdit);
    document.getElementById('itinerary-sticky-bar')?.classList.toggle('itinerary-sticky-bar-edit', planningEdit);
    if (planningEdit) closeSearchPanelIfOpen();
    const daySel = document.getElementById('day-selector');
    const showPills = onItinerary && !travelMode && trip.itinerary.length > 0;
    daySel?.classList.toggle('hidden', !showPills);
    syncTripScheduleChrome();
    syncTravelLayout();
    requestAnimationFrame(() => syncItineraryChromeOffset());
}

async function exitEditForTabSwitch(targetTab) {
    if (targetTab === 'itinerary' || !isEdit || travelMode) return;
    persistTripMetaInputs();
    isEdit = false;
    trip.itinerary.forEach(sortDayEventsInPlace);
    flushSave();
    closeSearchPanelIfOpen();
    renderDaySelector();
    await renderDay(curDayIdx);
    renderCityUI();
    renderDocs();
    renderCheck();
    updateFabVisibility();
}

function syncStatusBanners() {
    const stack = document.getElementById('status-banner-stack');
    if (!stack) return;
    const items = [];
    if (swUpdatePending) {
        items.push(
            `<div class="status-banner-item status-banner-update"><span>有新版本可用</span><button type="button" onclick="applySwUpdate()">立即更新</button></div>`,
        );
    }
    if (!navigator.onLine) {
        items.push(
            `<div class="status-banner-item status-banner-offline">目前離線 · 行程與圖片仍可瀏覽；天氣更新需連線</div>`,
        );
    }
    if (!items.length) {
        stack.classList.add('hidden');
        stack.innerHTML = '';
        return;
    }
    stack.innerHTML = items.join('');
    stack.classList.remove('hidden');
}

function updateOnlineStatus() {
    syncStatusBanners();
}

function showSwUpdateBanner() {
    swUpdatePending = true;
    syncStatusBanners();
}

function applySwUpdate() {
    navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    });
}

function hideAppBoot() {
    const el = document.getElementById('app-boot');
    if (el) el.classList.add('hidden');
}

function setupSwUpdate() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (swRefreshing) return;
        swRefreshing = true;
        location.reload();
    });

    const registerSw = () => {
        navigator.serviceWorker
            .register('./sw.js', { scope: './' })
            .then((reg) => {
                if (reg.waiting && navigator.serviceWorker.controller) showSwUpdateBanner();

                reg.addEventListener('updatefound', () => {
                    const worker = reg.installing;
                    if (!worker) return;
                    worker.addEventListener('statechange', () => {
                        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                            showSwUpdateBanner();
                        }
                    });
                });

                setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
            })
            .catch(() => {});
    };

    window.addEventListener('load', () => {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(registerSw, { timeout: 2500 });
        } else {
            setTimeout(registerSw, 1200);
        }
    });
}

function setupPwaInstallHint() {
    const hint = document.getElementById('pwa-install-hint');
    if (!hint) return;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        hint.classList.remove('hidden');
    });
}

async function init() {
    applyTheme();
    await restoreUiPrefs();
    if (travelMode) await setTab('today');
    updateOnlineStatus();
    syncEditChrome();
    renderTripSelector();
    renderDaySelector();
    await renderDay(curDayIdx);
    renderCityUI();
    renderTripScheduleUI();
    renderCurrencyUI();
    renderDaySelector();
    await fetchWeather();
    await fetchRate();
    updateFabVisibility();
    await renderDocs();
    renderCheck();
    await updateStorageEstimate();
    updateHeaderSubtitle();
    scrollToTodayCard();
    renderTripHeader();
    renderTodayOverview();
    renderSearchResults();
    if (typeof setupUiUx === 'function') setupUiUx();
    if (typeof setupReminders === 'function') setupReminders();
    syncTravelLayout();
    if (typeof setupOnboarding === 'function') setupOnboarding();
    if (!window._itineraryChromeResizeBound) {
        window._itineraryChromeResizeBound = true;
        let itineraryChromeResizeTimer = null;
        window.addEventListener(
            'resize',
            () => {
                clearTimeout(itineraryChromeResizeTimer);
                itineraryChromeResizeTimer = setTimeout(syncItineraryChromeOffset, 100);
            },
            { passive: true },
        );
    }
    syncItineraryChromeOffset();
}

async function bootstrap() {
    try {
        if (await migrateDataUrlsToIdb(data)) save();
    } catch (err) {
        showStorageWarning('舊圖片遷移失敗：' + (err.message || String(err)));
    }
    try {
        await init();
    } finally {
        hideAppBoot();
    }
}

function formatRateValue(n) {
    const v = Number(n);
    if (Number.isNaN(v) || v <= 0) return '--';
    let s;
    if (v >= 100) s = v.toFixed(2);
    else if (v >= 1) s = v.toFixed(4);
    else s = v.toFixed(6);
    return s.replace(/\.?0+$/, '') || s;
}

function rateMatchesTripCurrencies() {
    const local = tripLocalCurrency();
    const home = tripHomeCurrency();
    return trip.ratePair?.local === local && trip.ratePair?.home === home;
}

function applyRateToInputs() {
    const rateLine = document.getElementById('rate-line');
    if (!rateLine) return;
    const local = tripLocalCurrency();
    const home = tripHomeCurrency();
    if (!rateMatchesTripCurrencies() || trip.rate == null || Number.isNaN(Number(trip.rate))) {
        rateLine.textContent = `1 ${local} = -- ${home}`;
        return;
    }
    rateLine.textContent = `1 ${local} = ${formatRateValue(trip.rate)} ${home}`;
}

function renderTripSelector() {
    if (typeof renderTripPicker === 'function') renderTripPicker();
    applyRateToInputs();
}

function renderDayChipBody(d, i, lines) {
    const cost = sumEventCosts(d.events);
    const costHtml = cost > 0
        ? `<span class="day-card-cost">${escapeHtml(formatPillAmount(cost))}</span>`
        : '';
    const sub = lines.line2 && lines.line2 !== '-'
        ? `<span class="type-day-sub">${escapeHtml(lines.line2)}</span>`
        : '';
    const dateRow = `<span class="day-chip-top">
                <span class="type-day-label">${escapeHtml(lines.line1)}</span>
                ${sub}
               </span>`;
    return `${dateRow}${costHtml}`;
}

function renderDaySelector() {
    const container = document.getElementById('day-selector');
    const noStart = !trip.startDate ? 'no-start-date' : '';
    container.innerHTML = trip.itinerary
        .map((d, i) => {
            const lines = dayCardLines(trip, i);
            return `
        <div class="day-card-wrap relative flex-shrink-0 group ${noStart}">
            <button type="button" onclick="renderDay(${i})" class="day-card day-chip ${i === curDayIdx ? 'active' : ''}">
                ${renderDayChipBody(d, i, lines)}
            </button>
        </div>`;
        })
        .join('');
    requestAnimationFrame(() => syncItineraryChromeOffset());
}

function renderCityUI() {
    renderWeatherLocationSelect();
    renderTripScheduleUI();
}

function renderCurrencyUI() {
    const local = tripLocalCurrency();
    const home = tripHomeCurrency();
    renderCurrencySelect(document.getElementById('local-currency-select'), local);
    renderCurrencySelect(document.getElementById('home-currency-select'), home);
    const currLocal = document.getElementById('curr-local');
    const currHome = document.getElementById('curr-home');
    if (currLocal) currLocal.placeholder = local;
    if (currHome) currHome.placeholder = home;
    applyRateToInputs();
    renderDaySelector();
}

function switchTrip(idx) {
    persistTripMetaInputs();
    flushSave();
    data.activeIdx = parseInt(idx, 10);
    trip = data.trips[data.activeIdx];
    const prefs = getUiPrefs();
    curDayIdx =
        prefs.days && prefs.days[data.activeIdx] != null && prefs.days[data.activeIdx] < trip.itinerary.length
            ? prefs.days[data.activeIdx]
            : 0;
    save();
    invalidateWeatherForecast();
    rateCache = { local: '', home: '', ts: 0 };
    init();
}

async function createNewTrip() {
    const n = await modalPrompt('新增旅程', '新旅程', '旅程名稱');
    if (n && n.trim()) {
        data.trips.push(defaultTrip(n.trim()));
        switchTrip(data.trips.length - 1);
    }
}

async function editTripName() {
    if (travelMode) return;
    const newName = await modalPrompt('修改旅程名稱', trip.name, '旅程名稱');
    if (newName && newName.trim() !== '') {
        trip.name = newName.trim();
        save();
        renderTripSelector();
        renderTripHeader();
    }
}

async function deleteCurrentTrip() {
    if (travelMode) return;
    if (data.trips.length <= 1) {
        await modalAlert('無法刪除', '至少需要保留一個旅程！');
        return;
    }
    if (await modalConfirm('刪除旅程', `確定要刪除「${trip.name}」嗎？`, { danger: true, confirmText: '刪除' })) {
        await purgeTripImages(trip);
        data.trips.splice(data.activeIdx, 1);
        data.activeIdx = 0;
        trip = data.trips[data.activeIdx];
        curDayIdx = 0;
        localStorage.setItem(KEY, JSON.stringify(data));
        await init();
    }
}

async function toggleEdit() {
    if (travelMode) {
        await modalAlert('無法編輯', '請先撳「出門中」關閉出門模式');
        return;
    }
    if (isEdit) persistTripMetaInputs();
    isEdit = !isEdit;
    if (isEdit) closeSearchPanelIfOpen();
    syncEditChrome();
    if (!isEdit) {
        trip.itinerary.forEach(sortDayEventsInPlace);
        flushSave();
        fetchWeather();
    }
    renderDaySelector();
    await renderDay(curDayIdx);
    renderCityUI();
    renderCurrencyUI();
    renderDocs();
    renderCheck();
    updateFabVisibility();
    updateHeaderSubtitle();
    renderTripHeader();
}

async function quickAddEvent() {
    if (travelMode) return;
    if (!isEdit) {
        isEdit = true;
        closeSearchPanelIfOpen();
        syncEditChrome();
        renderCityUI();
        renderDaySelector();
        renderDocs();
        renderCheck();
        updateFabVisibility();
        await renderDay(curDayIdx);
    }
    addEvent();
}

function updateFabVisibility() {
    const fab = document.getElementById('fab-quick-add');
    const onIt = !document.getElementById('content-itinerary').classList.contains('hidden');
    fab.classList.toggle('hidden', travelMode || !onIt || isEdit);
}

function setWeatherUI({ temp, detail = '', code = null, isError = false }) {
    const display = document.getElementById('weather-display');
    const detailEl = document.getElementById('weather-detail');
    const icon = document.getElementById('weather-icon');
    if (display) display.innerText = temp;
    if (detailEl) {
        detailEl.textContent = detail;
        detailEl.classList.toggle('hidden', !detail);
    }
    if (!icon) return;
    if (isError) {
        icon.innerHTML = '<i class="fas fa-cloud text-gray-300"></i>';
    } else if (code != null) {
        updateWeatherIcon(code);
    }
}

function hasWeatherForecastCache(city) {
    return weatherForecastCache.city === city && weatherForecastCache.ts > 0;
}

async function refreshWeather(force = false) {
    if (force) {
        invalidateWeatherForecast();
        if (navigator.onLine && (trip.city || '').trim()) showToast('正在更新天氣…');
    }
    await fetchWeather(force);
}

async function fetchWeather(force = false) {
    const loader = document.getElementById('weather-loading');
    const loc = getWeatherLocation(trip.city);
    const cityKey = loc.id;

    renderWeatherUI();

    if (!cityKey) {
        setWeatherUI({ temp: '--°C', detail: '請選擇地點', isError: true });
        return;
    }

    const now = Date.now();
    const cacheFresh =
        !force && hasWeatherForecastCache(cityKey) && now - weatherForecastCache.ts < WEATHER_TTL_MS;

    if (!navigator.onLine) {
        if (hasWeatherForecastCache(cityKey)) {
            applyWeatherForDay(' · 離線快取');
        } else {
            setWeatherUI({ temp: '--°C', detail: '離線，無法更新天氣', isError: true });
        }
        return;
    }

    if (cacheFresh) {
        applyWeatherForDay();
        return;
    }

    if (loader) loader.style.display = 'inline';
    try {
        let latitude;
        let longitude;
        let place = loc.label;

        if (loc.lat != null && loc.lon != null) {
            latitude = loc.lat;
            longitude = loc.lon;
        } else {
            const geoRes = await fetch(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityKey)}&count=1&language=en&format=json`,
            );
            if (!geoRes.ok) throw new Error('地區查詢失敗');
            const geoData = await geoRes.json();
            if (!geoData.results?.length) {
                setWeatherUI({ temp: '--°C', detail: `找不到「${loc.label}」`, isError: true });
                return;
            }
            latitude = geoData.results[0].latitude;
            longitude = geoData.results[0].longitude;
            const { name, country } = geoData.results[0];
            place = country ? `${name}, ${country}` : name;
        }

        let forecastUrl =
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&timezone=auto` +
            '&daily=weather_code,temperature_2m_max,temperature_2m_min';
        if (trip.startDate && trip.itinerary.length) {
            forecastUrl += `&forecast_days=${WEATHER_FORECAST_DAYS}&past_days=${WEATHER_PAST_DAYS}`;
        } else {
            forecastUrl += '&current_weather=true&forecast_days=1';
        }

        const weatherRes = await fetch(forecastUrl);
        const weatherData = await weatherRes.json();
        if (!weatherRes.ok || weatherData.error) {
            throw new Error(weatherData.reason || '天氣資料失敗');
        }

        weatherForecastCache = {
            city: cityKey,
            ts: now,
            place,
            daily: weatherData.daily || null,
            current: weatherData.current_weather || null,
        };
        applyWeatherForDay();
    } catch (err) {
        if (hasWeatherForecastCache(cityKey)) {
            applyWeatherForDay(' · 更新失敗・快取');
        } else {
            const msg = err?.message || '';
            const detail = !navigator.onLine
                ? '離線，無法更新天氣'
                : msg.includes('out of allowed range') || msg.includes('Parameter')
                  ? '行程日期超出預報範圍'
                  : msg && msg !== '天氣資料失敗'
                    ? msg
                    : '無法取得天氣，請稍後再試';
            setWeatherUI({ temp: '--°C', detail, isError: true });
        }
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function updateWeatherIcon(code) {
    const icon = document.getElementById('weather-icon');
    if (icon) icon.innerHTML = weatherIconHtml(code);
}

function setEventStatus(dayIdx, eventIdx, status) {
    trip.itinerary[dayIdx].events[eventIdx].status = normalizeEventStatus(status);
    save();
    notifySaved();
    if (typeof closeEventStatusPicker === 'function') closeEventStatusPicker();
    if (typeof refreshEventEditSheetIfOpen === 'function') refreshEventEditSheetIfOpen(dayIdx, eventIdx);
    renderDay(dayIdx);
    renderDaySelector();
    renderTodayOverview();
}
window.setEventStatus = setEventStatus;

async function renderDay(idx) {
    const editPicker = document.getElementById('event-edit-picker');
    if (
        editPicker &&
        !editPicker.classList.contains('hidden') &&
        window._eventEditDayIdx != null &&
        window._eventEditDayIdx !== idx &&
        typeof closeEventEditSheet === 'function'
    ) {
        closeEventEditSheet({ silent: true });
    }
    curDayIdx = idx;
    const day = trip.itinerary[idx];
    const dayImgUrl = await resolveImageUrl(day.img);
    document.getElementById('day-img').src = dayImgUrl || day.img;
    document.getElementById('day-img').alt = day.title || '';
    document.getElementById('day-label').innerText = formatBannerDayLabel(trip, day, idx);
    updateDayBannerDate(idx);

    const tBox = document.getElementById('day-title-box');
    const titleDisplay = document.getElementById('day-title-display');
    const titlePanel = document.getElementById('day-title-edit-panel');
    const titleInput = document.getElementById('day-title-input');
    const editingDay = isEdit && !travelMode;
    const titleText = displayDayTitle(day.title);
    tBox.innerHTML = '';
    if (titleDisplay) {
        if (!editingDay && titleText) {
            titleDisplay.textContent = titleText;
            titleDisplay.classList.remove('hidden');
        } else {
            titleDisplay.textContent = '';
            titleDisplay.classList.add('hidden');
        }
    }
    if (editingDay) {
        titlePanel?.classList.remove('hidden');
        if (titleInput) {
            titleInput.value = titleText;
            titleInput.oninput = () => {
                trip.itinerary[idx].title = titleInput.value;
                debouncedSave();
                if (typeof syncDashboardDayTitle === 'function') syncDashboardDayTitle(titleInput.value);
            };
        }
    } else {
        titlePanel?.classList.add('hidden');
    }

    const timeline = document.getElementById('timeline');
    timeline.innerHTML = '<div class="timeline-line"></div>';
    const filtered = day.events.map((ev, i) => ({ ev, i })).filter(({ ev }) => eventMatchesSearch(ev));
    const entries = isEdit && !travelMode ? filtered : sortEventEntries(filtered);
    if (entries.length === 0 && day.events.length > 0) {
        timeline.innerHTML += `<p class="pl-14 type-body text-muted">沒有符合「${escapeHtml(searchQuery)}」的景點</p>`;
    } else if (entries.length === 0 && day.events.length === 0) {
        const cta = !travelMode
            ? `<button type="button" class="timeline-empty-state-cta" onclick="quickAddEvent()"><i class="fas fa-plus mr-1"></i>加第一個景點</button>`
            : '';
        timeline.innerHTML += `
            <div class="timeline-empty-state">
                <i class="fas fa-map-marker-alt timeline-empty-state-icon" aria-hidden="true"></i>
                <p class="timeline-empty-state-title">呢日未有景點</p>
                <p class="timeline-empty-state-hint">${travelMode ? '今日可以休息下' : '撳下面掣開始規劃'}</p>
                ${cta}
            </div>`;
    }
    const eventRows = await Promise.all(
        entries.map(async ({ ev, i }) => ({
            ev,
            i,
            imgUrl: ev.img ? await resolveImageUrl(ev.img) : '',
        })),
    );
    eventRows.forEach(({ ev, i, imgUrl }) => {
        const statusUI = renderEventStatusUI(idx, i, ev);
        const metaBits = [];
        if (ev.tag) metaBits.push(escapeHtml(ev.tag));
        if (ev.cost !== '' && ev.cost != null && !Number.isNaN(Number(ev.cost))) {
            metaBits.push(escapeHtml(formatAmount(ev.cost)));
        }
        const metaLine = metaBits.length ? `<p class="timeline-event-meta">${metaBits.join(' · ')}</p>` : '';
        const bookLine = ev.bookingRef
            ? `<p class="timeline-event-book">訂位 ${escapeHtml(ev.bookingRef)} <button type="button" onclick='event.stopPropagation();copyBookingRef(${JSON.stringify(ev.bookingRef)})' class="chip-copy">複製</button></p>`
            : '';
        const remarkLine = ev.remark ? `<p class="timeline-event-remark">${escapeHtml(ev.remark)}</p>` : '';
        const mapLine = !isEdit ? renderMapActionsUI(ev.loc, ev.link) : '';
        const imgThumb =
            ev.img && !isEdit
                ? `<button type="button" class="timeline-event-thumb" onclick='event.stopPropagation();showBig(${JSON.stringify(ev.img)})'><img src="${escapeAttr(imgUrl || ev.img)}" alt=""></button>`
                : '';
        const reorderBtns =
            isEdit && !travelMode
                ? `<div class="event-reorder shrink-0" onclick="event.stopPropagation()">
                    <div class="event-reorder-moves">
                        <button type="button" onclick="moveEvent(${idx}, ${i}, -1)" ${i === 0 ? 'disabled' : ''} aria-label="上移景點"><i class="fas fa-chevron-up"></i></button>
                        <button type="button" onclick="moveEvent(${idx}, ${i}, 1)" ${i === day.events.length - 1 ? 'disabled' : ''} aria-label="下移景點"><i class="fas fa-chevron-down"></i></button>
                    </div>
                   </div>`
                : '';

        if (isEdit && !travelMode) {
            const editImgInd = ev.img
                ? `<button type="button" class="timeline-event-edit-img" onclick='event.stopPropagation();showBig(${JSON.stringify(ev.img)})' aria-label="查看圖片"><img src="${escapeAttr(imgUrl || ev.img)}" alt=""></button>`
                : '';
            timeline.innerHTML += `
            <div class="relative pl-14 animate-fade-in timeline-event" data-event-idx="${i}">
                <div class="timeline-dot"></div>
                <div class="timeline-event-edit-row">
                    <div class="timeline-event-edit-primary">
                        ${reorderBtns}
                        <button type="button" class="timeline-event-edit-main" onclick="openEventEditSheet(${idx}, ${i})">
                            <span class="timeline-event-time">${escapeHtml(ev.time || '--:--')}</span>
                            <span class="timeline-event-loc truncate">${escapeHtml(ev.loc || '景點')}</span>
                        </button>
                        ${statusUI ? `<span class="timeline-event-edit-status">${statusUI}</span>` : ''}
                        <div class="timeline-event-edit-actions">
                            ${editImgInd}
                            <button type="button" class="timeline-event-edit-del" onclick="event.stopPropagation();removeEvent(${idx}, ${i})" aria-label="刪除景點"><i class="fas fa-trash-alt"></i></button>
                            <button type="button" class="timeline-event-edit-hint" onclick="openEventEditSheet(${idx}, ${i})" aria-label="編輯景點"><i class="fas fa-pen"></i></button>
                        </div>
                    </div>
                </div>
            </div>`;
            return;
        }

        timeline.innerHTML += `
            <div class="relative pl-14 animate-fade-in timeline-event" data-event-idx="${i}">
                <div class="timeline-dot"></div>
                <div class="timeline-event-head">
                    <span class="timeline-event-time">${escapeHtml(ev.time || '--:--')}</span>
                    ${statusUI}
                </div>
                <h3 class="timeline-event-loc">${escapeHtml(ev.loc || '景點')}</h3>
                ${metaLine}
                ${bookLine}
                ${remarkLine}
                <div class="timeline-event-foot">${mapLine}${imgThumb}</div>
            </div>`;
    });
    document.querySelectorAll('.day-card').forEach((el, i) => el.classList.toggle('active', i === idx));
    updateHeaderSubtitle();
    renderTodayOverview();
    if (idx !== lastRenderedDayIdx) {
        const daySel = document.getElementById('day-selector');
        const dayCard = daySel?.children[idx];
        if (dayCard) dayCard.scrollIntoView({ inline: 'center', behavior: 'smooth' });
        lastRenderedDayIdx = idx;
    }
    syncWeatherToDay(idx);
    saveUiPrefs();
}

function convertDecimals(code) {
    const c = normalizeCurrency(code);
    if (c === 'JPY' || c === 'KRW' || c === 'VND' || c === 'IDR') return 0;
    if (c === 'TWD' || c === 'THB' || c === 'INR') return 1;
    return 2;
}

function formatConvertedAmount(amount, code) {
    const d = convertDecimals(code);
    if (d === 0) return String(Math.round(amount));
    return amount.toFixed(d);
}

function convert(type) {
    const l = document.getElementById('curr-local');
    const h = document.getElementById('curr-home');
    if (!rateMatchesTripCurrencies()) return;
    const r = Number(trip.rate);
    if (!r || Number.isNaN(r)) return;
    const local = tripLocalCurrency();
    const home = tripHomeCurrency();
    if (type === 'local') {
        const v = parseFloat(l.value);
        h.value = Number.isNaN(v) || l.value === '' ? '' : formatConvertedAmount(v * r, home);
    } else {
        const v = parseFloat(h.value);
        l.value = Number.isNaN(v) || h.value === '' ? '' : formatConvertedAmount(v / r, local);
    }
}

function setRateUI(detail = '') {
    const detailEl = document.getElementById('rate-detail');
    if (detailEl) {
        detailEl.textContent = detail;
        detailEl.classList.toggle('hidden', !detail);
    }
}

function hasRateCache(local, home) {
    return rateCache.local === local && rateCache.home === home && rateCache.ts > 0;
}

async function refreshRate(force = false) {
    if (force) {
        rateCache = { local: '', home: '', ts: 0 };
        if (navigator.onLine) showToast('正在更新匯率…');
    }
    await fetchRate(force);
}

async function fetchRateFromFrankfurter(local, home) {
    const res = await fetch(
        `https://api.frankfurter.dev/v1/latest?from=${encodeURIComponent(local)}&to=${encodeURIComponent(home)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rate = data?.rates?.[home];
    if (rate == null || Number.isNaN(Number(rate))) return null;
    return { rate: Number(rate), label: data.date ? `ECB · ${data.date}` : 'ECB' };
}

async function fetchRateFromOpenErApi(local, home) {
    const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(local)}`);
    if (!res.ok) throw new Error('匯率查詢失敗');
    const data = await res.json();
    if (data.result !== 'success') throw new Error('匯率查詢失敗');
    const rate = data?.rates?.[home];
    if (rate == null || Number.isNaN(Number(rate))) {
        throw new Error(`不支援 ${local} → ${home}`);
    }
    const date = data.time_last_update_utc ? String(data.time_last_update_utc).slice(0, 10) : '';
    return { rate: Number(rate), label: date ? `參考匯率 · ${date}` : '參考匯率' };
}

async function fetchRatePair(local, home) {
    const ecb = await fetchRateFromFrankfurter(local, home);
    if (ecb) return ecb;
    return fetchRateFromOpenErApi(local, home);
}

async function fetchRate(force = false) {
    const loader = document.getElementById('rate-loading');
    const local = tripLocalCurrency();
    const home = tripHomeCurrency();

    if (!local || !home) {
        setRateUI('請設定貨幣');
        return;
    }

    if (local === home) {
        trip.rate = 1;
        trip.ratePair = { local, home };
        applyRateToInputs();
        setRateUI('');
        save();
        rateCache = { local, home, ts: Date.now() };
        const l = document.getElementById('curr-local');
        if (l?.value) convert('local');
        return;
    }

    const now = Date.now();
    const cacheFresh = !force && hasRateCache(local, home) && now - rateCache.ts < RATE_TTL_MS;

    if (!navigator.onLine) {
        applyRateToInputs();
        setRateUI(rateMatchesTripCurrencies() ? '離線・顯示快取' : '離線，無法更新匯率');
        return;
    }

    if (cacheFresh) {
        applyRateToInputs();
        setRateUI('');
        return;
    }

    if (loader) loader.style.display = 'inline';
    try {
        const { rate, label } = await fetchRatePair(local, home);
        trip.rate = rate;
        trip.ratePair = { local, home };
        rateCache = { local, home, ts: now };
        applyRateToInputs();
        setRateUI(label);
        save();
        const l = document.getElementById('curr-local');
        if (l?.value) convert('local');
    } catch (err) {
        applyRateToInputs();
        if (rateMatchesTripCurrencies()) {
            setRateUI('更新失敗・顯示快取');
        } else {
            setRateUI(err.message?.startsWith('不支援') ? err.message : navigator.onLine ? '無法取得匯率，請稍後再試' : '離線，無法更新匯率');
        }
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function applyCheckTemplate(key) {
    if (travelMode) return;
    const items = CHECK_TEMPLATES[key];
    if (!items) return;
    items.forEach((t) => trip.checklist.push({ task: t, done: false }));
    save();
    renderCheck();
}

function renderCheck() {
    const done = trip.checklist.filter((c) => c.done).length;
    const total = trip.checklist.length;
    const wrap = document.getElementById('check-progress-wrap');
    const text = document.getElementById('check-progress-text');
    const fill = document.getElementById('check-progress-fill');
    if (wrap && text && fill) {
        if (total > 0) {
            wrap.classList.remove('hidden');
            const pct = Math.round((done / total) * 100);
            text.textContent = done === total ? `已準備好！${done}/${total}` : `已完成 ${done}/${total}`;
            fill.style.width = pct + '%';
            fill.className = 'progress-fill' + (done === total ? '' : '');
        } else {
            wrap.classList.add('hidden');
        }
    }
    document.getElementById('check-list').innerHTML =
        trip.checklist.length === 0
            ? '<div class="empty-state"><i class="fas fa-suitcase"></i><p class="type-caption font-heavy">行李清單是空的</p></div>'
            : trip.checklist
                  .map(
                      (c, i) => `
        <div class="flex items-center gap-3 bg-white p-4 rounded-2xl border border-pink-50">
            <input type="checkbox" ${c.done ? 'checked' : ''} onchange="trip.checklist[${i}].done=this.checked;save();renderCheck()" class="w-5 h-5 accent-pink-400">
            <span class="type-caption font-heavy ${c.done ? 'line-through opacity-30' : ''}">${escapeHtml(c.task)}</span>
            ${isEdit && !travelMode ? `<button type="button" onclick="trip.checklist.splice(${i},1);save();renderCheck()" class="ml-auto text-red-200" aria-label="刪除此項目"><i class="fas fa-trash-alt"></i></button>` : ''}
        </div>`,
                  )
                  .join('');
}

async function renderDocs() {
    const rows = await Promise.all(
        trip.docs.map(async (d, i) => ({
            d,
            i,
            url: (await resolveImageUrl(d.url)) || d.url,
        })),
    );
    document.getElementById('doc-list').innerHTML =
        rows
            .map(({ d, i, url }) => {
                if (isPdfDoc(d)) {
                    return `
        <div class="relative">
            <button type="button" onclick='openDoc(${JSON.stringify(d.url)})' class="doc-pdf-card w-full aspect-square rounded-3xl border-2 border-white shadow-md flex flex-col items-center justify-center gap-2 active:scale-[0.98] transition-transform">
                <i class="fas fa-file-pdf text-4xl text-red-400"></i>
                <span class="type-micro font-heavy text-white/90">PDF</span>
            </button>
            ${d.label ? `<span class="absolute bottom-2 left-2 right-2 type-micro font-heavy text-white drop-shadow-md truncate px-1 pointer-events-none">${escapeHtml(d.label)}</span>` : ''}
            <button type="button" onclick="togglePinDoc(${i})" class="doc-pin-btn${trip.pinnedDocIdx === i ? ' is-pinned' : ''}" aria-label="${trip.pinnedDocIdx === i ? '取消釘選' : '釘選到今日'}"><i class="fas fa-thumbtack"></i></button>
            ${isEdit && !travelMode ? `<button type="button" onclick="removeDoc(${i})" class="absolute -top-1 -right-1 bg-red-400 text-white w-6 h-6 rounded-full type-micro border-2 border-white shadow" aria-label="刪除文件"><i class="fas fa-times"></i></button>` : ''}
        </div>`;
                }
                return `
        <div class="relative">
            <img src="${escapeAttr(url)}" alt="${escapeAttr(d.label || '文件')}" class="w-full aspect-square object-cover rounded-3xl border-2 border-white shadow-md" onclick='showBig(${JSON.stringify(d.url)})'>
            ${d.label ? `<span class="absolute bottom-2 left-2 right-2 type-micro font-heavy text-white drop-shadow-md truncate px-1">${escapeHtml(d.label)}</span>` : ''}
            <button type="button" onclick="togglePinDoc(${i})" class="doc-pin-btn${trip.pinnedDocIdx === i ? ' is-pinned' : ''}" aria-label="${trip.pinnedDocIdx === i ? '取消釘選' : '釘選到今日'}"><i class="fas fa-thumbtack"></i></button>
            ${isEdit && !travelMode ? `<button type="button" onclick="removeDoc(${i})" class="absolute -top-1 -right-1 bg-red-400 text-white w-6 h-6 rounded-full type-micro border-2 border-white shadow" aria-label="刪除文件"><i class="fas fa-times"></i></button>` : ''}
        </div>`;
            })
            .join('') || '<p class="col-span-2 text-center type-caption text-muted py-10 font-heavy">尚無文件（可上傳圖片或 PDF）</p>';
}

async function openDoc(ref) {
    const url = await resolveImageUrl(ref);
    if (!url) {
        await modalAlert('無法開啟', '找不到文件');
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
}

async function removeDoc(i) {
    const d = trip.docs[i];
    if (isIdbRef(d.url)) await deleteImageRef(d.url);
    trip.docs.splice(i, 1);
    if (trip.pinnedDocIdx === i) trip.pinnedDocIdx = null;
    else if (trip.pinnedDocIdx != null && trip.pinnedDocIdx > i) trip.pinnedDocIdx -= 1;
    save();
    await renderDocs();
    if (typeof renderTodayQuickTools === 'function') renderTodayQuickTools();
}

async function removeEvent(dayIdx, eventIdx) {
    const ev = trip.itinerary[dayIdx].events[eventIdx];
    const name = ev.loc || '此景點';
    if (!(await modalConfirm('刪除景點', `確定刪除「${name}」？`, { danger: true, confirmText: '刪除' }))) return;
    if (isIdbRef(ev.img)) await deleteImageRef(ev.img);
    trip.itinerary[dayIdx].events.splice(eventIdx, 1);
    save();
    if (typeof closeEventEditSheet === 'function') closeEventEditSheet({ silent: true });
    await renderDay(dayIdx);
    renderDaySelector();
    renderSearchResults();
    syncTripScheduleChrome();
}

function triggerFile(id) {
    document.getElementById(id).click();
}

async function showBig(s) {
    const url = await resolveImageUrl(s);
    lightboxScale = 1;
    const img = document.getElementById('lightbox-img');
    img.src = url || s;
    img.style.transform = 'scale(1)';
    document.getElementById('lightbox').classList.add('open');
}

function readFileAsDataUrl(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onerror = () => rej(new Error('讀取檔案失敗'));
        r.onload = () => res(r.result);
        r.readAsDataURL(file);
    });
}

async function compress(file) {
    if (!file.type.startsWith('image/')) {
        throw new Error('請選擇圖片檔案');
    }
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onerror = () => rej(new Error('讀取檔案失敗'));
        r.readAsDataURL(file);
        r.onload = (e) => {
            const img = new Image();
            img.onerror = () => rej(new Error('圖片格式不支援'));
            img.src = e.target.result;
            img.onload = () => {
                const c = document.createElement('canvas');
                const ctx = c.getContext('2d');
                const max = 800;
                let w = img.width;
                let h = img.height;
                if (w > max) {
                    h *= max / w;
                    w = max;
                }
                c.width = w;
                c.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                res(c.toDataURL('image/jpeg', 0.6));
            };
        };
    });
}

document.getElementById('lib-file-input').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
    const isImage = f.type.startsWith('image/');
    if (!isPdf && !isImage) {
        await modalAlert('格式不支援', '請上傳圖片或 PDF');
        return;
    }
    if (isPdf && f.size > 8 * 1024 * 1024) {
        await modalAlert('檔案過大', 'PDF 請小於 8MB');
        return;
    }
    const label = await modalPrompt('文件標籤', isPdf ? 'PDF 文件' : '文件', '例：護照、機票');
    if (label === null) return;
    try {
        const dataUrl = isPdf ? await readFileAsDataUrl(f) : await compress(f);
        const ref = await storeImage(dataUrl);
        trip.docs.push({
            url: ref,
            label: label.trim() !== '' ? label.trim() : isPdf ? 'PDF' : '文件',
            mimeType: isPdf ? 'application/pdf' : f.type || 'image/*',
        });
        save();
        await renderDocs();
    } catch (err) {
        await modalAlert('上傳失敗', err.message || '上傳失敗');
    }
};

document.getElementById('banner-img-input').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
        const day = trip.itinerary[curDayIdx];
        day.img = await replaceImageRef(day.img, await compress(f));
        save();
        await renderDay(curDayIdx);
    } catch (err) {
        await modalAlert('上傳失敗', err.message || '上傳失敗');
    }
};

document.getElementById('event-img-input').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f || curEventIdx == null) return;
    try {
        const ev = trip.itinerary[curDayIdx].events[curEventIdx];
        ev.img = await replaceImageRef(ev.img, await compress(f));
        save();
        if (typeof refreshEventEditSheetIfOpen === 'function') refreshEventEditSheetIfOpen(curDayIdx, curEventIdx);
        await renderDay(curDayIdx);
    } catch (err) {
        await modalAlert('上傳失敗', err.message || '上傳失敗');
    }
};

function addDay() {
    trip.itinerary.push({
        date: `Day ${trip.itinerary.length + 1}`,
        weekday: '-',
        title: '',
        img: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=800',
        budget: 0,
        events: [],
    });
    invalidateWeatherForecast();
    save();
    renderTripScheduleUI();
    renderDaySelector();
    renderDay(trip.itinerary.length - 1);
    renderDaySelector();
    fetchWeather();
}

async function delDay(i) {
    const dayLabel = trip.startDate ? formatBannerDayLabel(trip, trip.itinerary[i], i) : trip.itinerary[i].date;
    if (!(await modalConfirm('刪除此天', `確定刪除「${dayLabel}」？景點與圖片將一併移除。`, { danger: true, confirmText: '刪除' }))) return;
    const day = trip.itinerary[i];
    if (isIdbRef(day.img)) await deleteImageRef(day.img);
    for (const ev of day.events) {
        if (isIdbRef(ev.img)) await deleteImageRef(ev.img);
    }
    trip.itinerary.splice(i, 1);
    const nextIdx = Math.min(i, trip.itinerary.length - 1);
    invalidateWeatherForecast();
    save();
    renderTripScheduleUI();
    renderDaySelector();
    await renderDay(nextIdx);
    fetchWeather();
    renderDaySelector();
}

function addEvent() {
    const newIdx = trip.itinerary[curDayIdx].events.length;
    trip.itinerary[curDayIdx].events.push({
        loc: '新景點／地點',
        time: '12:00',
        remark: '',
        status: 'pending',
        img: '',
        link: '',
        bookingRef: '',
        cost: '',
        tag: '',
    });
    if (typeof expandEventEdit === 'function') expandEventEdit(curDayIdx, newIdx);
    save();
    renderDay(curDayIdx);
}

async function addCheck() {
    const t = await modalPrompt('新增行李項目', '', '清單項目');
    if (t && t.trim()) {
        trip.checklist.push({ task: t.trim(), done: false });
        save();
        renderCheck();
    }
}

async function setTab(t) {
    if (t !== 'tools' && typeof closeToolsAdvancedMenu === 'function') closeToolsAdvancedMenu();
    if (t !== 'itinerary' && typeof closeEventEditSheet === 'function') closeEventEditSheet({ silent: true });
    await exitEditForTabSwitch(t);
    const panelIds = ['content-today', 'content-itinerary', 'content-tools'];
    const activeId = t === 'today' ? 'content-today' : t === 'tools' ? 'content-tools' : 'content-itinerary';
    panelIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add('hidden');
        el.classList.remove('tab-panel-enter');
    });
    const activePanel = document.getElementById(activeId);
    if (activePanel) {
        activePanel.classList.remove('hidden');
        void activePanel.offsetWidth;
        activePanel.classList.add('tab-panel-enter');
    }
    const navBase = 'flex-1 py-3 flex flex-col items-center gap-0.5 rounded-[2rem]';
    document.getElementById('nav-itinerary').className = `${navBase} ${t === 'itinerary' ? 'nav-tab-active' : 'text-muted'}`;
    document.getElementById('nav-tools').className = `${navBase} ${t === 'tools' ? 'nav-tab-active' : 'text-muted'}`;
    document.getElementById('nav-today').className = `${navBase} ${t === 'today' ? 'nav-tab-active' : 'text-muted'}`;
    updateFabVisibility();
    syncEditChrome();
    if (typeof syncToolsLayout === 'function') syncToolsLayout();
    if (t === 'today' && typeof renderTravelDashboard === 'function') renderTravelDashboard();
    else if (typeof stopDashboardCountdownTimer === 'function') stopDashboardCountdownTimer();
    saveUiPrefs();
}

async function resetAll() {
    if (await modalConfirm('重設所有數據', '確定清除所有旅程嗎？此操作無法復原。', { danger: true, confirmText: '清除' })) {
        skipFlushSave = true;
        clearTimeout(saveTimer);
        saveTimer = null;
        await idbClear();
        imageUrlCache.clear();
        localStorage.removeItem(KEY);
        localStorage.removeItem(OLD_KEY);
        location.reload();
    }
}

window.addEventListener('beforeunload', flushSave);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
});
window.addEventListener('online', () => {
    updateOnlineStatus();
    fetchWeather();
    fetchRate();
});
window.addEventListener('offline', () => {
    updateOnlineStatus();
    fetchWeather();
    fetchRate();
});

setupModal();
setupLightbox();
applyTheme();
setupSwUpdate();
setupPwaInstallHint();
window.onload = bootstrap;
