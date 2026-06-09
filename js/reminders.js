/* 本機提醒 — 使用 Notification API（非伺服器 Push） */

const REMINDERS_KEY = 'TRAVEL_APP_REMINDERS_LOG';
const EVENT_REMINDERS_KEY = 'TRAVEL_EVENT_REMINDERS';

function getReminderSettings() {
    try {
        return JSON.parse(localStorage.getItem('TRAVEL_APP_REMINDER_SETTINGS') || '{}');
    } catch (_) {
        return {};
    }
}

function saveReminderSettings(s) {
    localStorage.setItem('TRAVEL_APP_REMINDER_SETTINGS', JSON.stringify(s));
}

function getDefaultReminderSettings() {
    return { enabled: false, departure: true, morningHour: 8 };
}

function loadReminderSettings() {
    const defaults = getDefaultReminderSettings();
    const saved = getReminderSettings();
    return { ...defaults, ...saved };
}

function syncReminderUI() {
    const s = loadReminderSettings();
    const en = document.getElementById('reminder-enabled');
    const dep = document.getElementById('reminder-departure');
    const hour = document.getElementById('reminder-hour');
    if (en) en.checked = !!s.enabled;
    if (dep) dep.checked = s.departure !== false;
    if (hour) hour.value = String(s.morningHour ?? 8);
}

function onReminderSettingsChange() {
    const s = {
        enabled: !!document.getElementById('reminder-enabled')?.checked,
        departure: !!document.getElementById('reminder-departure')?.checked,
        morningHour: parseInt(document.getElementById('reminder-hour')?.value || '8', 10),
    };
    saveReminderSettings(s);
    if (s.enabled) requestReminderPermission();
}

function getReminderLog() {
    try {
        return JSON.parse(localStorage.getItem(REMINDERS_KEY) || '{}');
    } catch (_) {
        return {};
    }
}

function markReminderSent(key) {
    const log = getReminderLog();
    log[key] = Date.now();
    localStorage.setItem(REMINDERS_KEY, JSON.stringify(log));
}

function wasReminderSentToday(key) {
    const ts = getReminderLog()[key];
    if (!ts) return false;
    const d = new Date(ts);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

async function requestReminderPermission() {
    if (!('Notification' in window)) {
        await modalAlert('不支援提醒', '此瀏覽器不支援通知功能');
        const en = document.getElementById('reminder-enabled');
        if (en) en.checked = false;
        saveReminderSettings({ ...loadReminderSettings(), enabled: false });
        return false;
    }
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') {
        await modalAlert('通知已封鎖', '請在瀏覽器／系統設定中允許通知');
        return false;
    }
    const result = await Notification.requestPermission();
    if (result !== 'granted') {
        const en = document.getElementById('reminder-enabled');
        if (en) en.checked = false;
        saveReminderSettings({ ...loadReminderSettings(), enabled: false });
        return false;
    }
    showToast('已開啟提醒');
    return true;
}

function fireNotification(title, body, tag) {
    if (Notification.permission !== 'granted') return;
    try {
        new Notification(title, { body, tag, icon: './icons/icon-192.png' });
    } catch (_) {}
}

function getEventReminders() {
    try {
        return JSON.parse(localStorage.getItem(EVENT_REMINDERS_KEY) || '{}');
    } catch (_) {
        return {};
    }
}

function saveEventReminders(r) {
    localStorage.setItem(EVENT_REMINDERS_KEY, JSON.stringify(r));
}

async function scheduleEventReminder(dayIdx, eventIdx) {
    const ev = trip.itinerary[dayIdx]?.events[eventIdx];
    if (!ev) return;
    if (parseEventTime(ev.time) == null) {
        showToast('請先設定景點時間');
        return;
    }
    const ok = await requestReminderPermission();
    if (!ok) return;
    const key = `${data.activeIdx}-${dayIdx}-${eventIdx}`;
    const reminders = getEventReminders();
    reminders[key] = { minutesBefore: 30, loc: ev.loc, time: ev.time };
    saveEventReminders(reminders);
    showToast('會喺 30 分鐘前提醒你');
}

function checkEventReminders() {
    if (Notification.permission !== 'granted' || !trip) return;
    const reminders = getEventReminders();
    const todayIdx = typeof getDashboardDayIndex === 'function' ? getDashboardDayIndex() : getTodayDayIndex();
    if (todayIdx < 0) return;
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();

    Object.entries(reminders).forEach(([key, r]) => {
        const parts = key.split('-').map((n) => parseInt(n, 10));
        if (parts.length < 3) return;
        const [tripIdx, dayIdx, eventIdx] = parts;
        if (tripIdx !== data.activeIdx || dayIdx !== todayIdx) return;
        const ev = trip.itinerary[dayIdx]?.events[eventIdx];
        if (!ev) return;
        const eventMins = parseEventTime(ev.time);
        if (eventMins == null) return;
        const lead = r.minutesBefore || 30;
        const remindAt = eventMins - lead;
        const notifyKey = `evremind-${key}`;
        if (nowMins >= remindAt && nowMins < eventMins && !wasReminderSentToday(notifyKey)) {
            const minsLeft = eventMins - nowMins;
            fireNotification(
                '即將出發',
                `${r.loc || ev.loc || '景點'} · ${ev.time}（仲有約 ${minsLeft} 分鐘）`,
                notifyKey,
            );
            markReminderSent(notifyKey);
        }
    });
}

function checkReminders() {
    checkEventReminders();
    const s = loadReminderSettings();
    if (!s.enabled || Notification.permission !== 'granted' || !trip) return;

    const tripKey = `trip-${data.activeIdx}`;

    if (s.departure && trip.startDate) {
        const start = new Date(trip.startDate + 'T12:00:00');
        const today = new Date();
        const todayNoon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
        const diff = Math.round((start - todayNoon) / 86400000);
        if (diff === 1) {
            const key = `${tripKey}-depart-1`;
            if (!wasReminderSentToday(key)) {
                fireNotification('明天出發！', `「${trip.name}」明天開始，記得檢查行李清單。`, key);
                markReminderSent(key);
            }
        }
        if (diff === 0) {
            const key = `${tripKey}-depart-0`;
            if (!wasReminderSentToday(key)) {
                fireNotification('今日出發！', `「${trip.name}」今天出發，旅途愉快！`, key);
                markReminderSent(key);
            }
        }
    }

    const todayIdx = getTodayDayIndex();
    const hour = new Date().getHours();
    const morningHour = s.morningHour ?? 8;
    if (todayIdx >= 0 && hour === morningHour) {
        const key = `${tripKey}-morning-${todayIdx}`;
        if (!wasReminderSentToday(key)) {
            const day = trip.itinerary[todayIdx];
            const count = day.events.length;
            const body =
                count > 0
                    ? `${formatBannerDayLabel(trip, day, todayIdx)} · ${day.title}，共 ${count} 個景點`
                    : `${formatBannerDayLabel(trip, day, todayIdx)} · 今日未有景點安排`;
            fireNotification('今日行程', body, key);
            markReminderSent(key);
        }
    }
}

function setupReminders() {
    syncReminderUI();
    checkReminders();
    setInterval(checkReminders, 60 * 1000);
}
