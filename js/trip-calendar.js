/* 行程日期範圍月曆 — 依賴 app.js 全域狀態與工具函式 */

let _tripDatePick = { viewYear: 0, viewMonth: 0, start: '', end: '' };

const TRIP_CAL_WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function formatShortDateIso(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${m}/${d}/${y}`;
}

function openTripDatePicker() {
    const start = trip.startDate || '';
    const end = start ? getTripEndDateIso() : '';
    const viewDate = start ? new Date(start + 'T12:00:00') : new Date();
    _tripDatePick = {
        viewYear: viewDate.getFullYear(),
        viewMonth: viewDate.getMonth(),
        start,
        end,
    };
    document.getElementById('trip-date-picker')?.classList.remove('hidden');
    renderTripDateCalendar();
}

function closeTripDatePicker() {
    document.getElementById('trip-date-picker')?.classList.add('hidden');
}

function shiftTripDateMonth(delta) {
    const d = new Date(_tripDatePick.viewYear, _tripDatePick.viewMonth + delta, 1);
    _tripDatePick.viewYear = d.getFullYear();
    _tripDatePick.viewMonth = d.getMonth();
    renderTripDateCalendar();
}

function pickTripCalendarDay(iso) {
    const { start, end } = _tripDatePick;
    if (!start || (start && end)) {
        _tripDatePick.start = iso;
        _tripDatePick.end = '';
    } else if (iso < start) {
        _tripDatePick.start = iso;
        _tripDatePick.end = '';
    } else {
        const days = daysBetweenInclusive(start, iso);
        if (days > MAX_TRIP_DAYS) {
            modalAlert('行程太長', `最多 ${MAX_TRIP_DAYS} 日`);
            return;
        }
        _tripDatePick.end = iso;
    }
    renderTripDateCalendar();
}

function renderTripDateCalendar() {
    const cal = document.getElementById('trip-date-picker-cal');
    if (!cal) return;
    const { viewYear, viewMonth, start, end } = _tripDatePick;
    const firstDow = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    let grid = '';
    for (let i = 0; i < firstDow; i++) grid += '<span class="trip-date-cal-pad" aria-hidden="true"></span>';
    for (let day = 1; day <= daysInMonth; day++) {
        const iso = formatISODate(new Date(viewYear, viewMonth, day));
        let cls = 'trip-date-cal-day';
        if (start && iso === start) cls += start === end ? ' is-single' : ' is-start';
        else if (end && iso === end) cls += ' is-end';
        else if (start && end && iso > start && iso < end) cls += ' in-range';
        grid += `<button type="button" class="${cls}" onclick="pickTripCalendarDay('${iso}')">${day}</button>`;
    }

    cal.innerHTML = `
        <div class="trip-date-cal-head">
            <button type="button" class="trip-date-cal-nav" onclick="shiftTripDateMonth(-1)" aria-label="上個月"><i class="fas fa-chevron-left" aria-hidden="true"></i></button>
            <span class="trip-date-cal-title">${viewYear}年${viewMonth + 1}月</span>
            <button type="button" class="trip-date-cal-nav" onclick="shiftTripDateMonth(1)" aria-label="下個月"><i class="fas fa-chevron-right" aria-hidden="true"></i></button>
        </div>
        <div class="trip-date-cal-weekdays">${TRIP_CAL_WEEKDAYS.map((w) => `<span>${w}</span>`).join('')}</div>
        <div class="trip-date-cal-grid">${grid}</div>`;

    const hint = document.getElementById('trip-date-picker-hint');
    if (!hint) return;
    if (!start) hint.textContent = '先選出發日期';
    else if (!end) hint.textContent = `出發 ${formatShortDateIso(start)} · 再選結束日期`;
    else hint.textContent = `${formatShortDateIso(start)} – ${formatShortDateIso(end)} · 共 ${daysBetweenInclusive(start, end)} 日`;
}

function clearTripDateRangeDraft() {
    _tripDatePick.start = '';
    _tripDatePick.end = '';
    renderTripDateCalendar();
}

async function confirmTripDateRange() {
    const { start, end } = _tripDatePick;
    if (!start && !end) {
        trip.startDate = '';
        closeTripDatePicker();
        applyTripSchedule();
        return;
    }
    if (!start || !end) {
        await modalAlert('請選日期', !start ? '請選出發日期' : '請選結束日期');
        return;
    }
    const prevStart = trip.startDate;
    trip.startDate = start;
    const days = daysBetweenInclusive(start, end);
    const ok = await setItineraryDayCount(days);
    if (!ok) {
        trip.startDate = prevStart;
        _tripDatePick.start = trip.startDate || '';
        _tripDatePick.end = trip.startDate ? getTripEndDateIso() : '';
        renderTripDateCalendar();
        renderTripScheduleUI();
        return;
    }
    closeTripDatePicker();
    invalidateWeatherForecast();
    applyTripSchedule();
    fetchWeather();
}
