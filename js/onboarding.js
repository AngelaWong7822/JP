/* 新手引導 — 3 步 + 東京 5 日模板 */

const ONBOARDING_KEY = 'TRAVEL_ONBOARDING_DONE';
let onboardingStep = 0;
let onboardingShowTimer = null;

function needsOnboarding() {
    if (localStorage.getItem(ONBOARDING_KEY) === '1') return false;
    if (data.trips.length > 1) return false;
    const t = data.trips[0];
    const day = t.itinerary[0];
    if (!day) return false;
    const defaultName = t.name === '我的旅行' || t.name === '旅程';
    return defaultName && !t.startDate && t.itinerary.length === 1 && day.events.length === 0;
}

function finishOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, '1');
    if (onboardingShowTimer) {
        clearTimeout(onboardingShowTimer);
        onboardingShowTimer = null;
    }
    const el = document.getElementById('onboarding');
    if (el) {
        el.classList.remove('is-open');
        el.setAttribute('aria-hidden', 'true');
    }
}

function skipOnboarding() {
    finishOnboarding();
}

function renderOnboardingStep() {
    const body = document.getElementById('onboarding-body');
    const dots = document.getElementById('onboarding-dots');
    const backBtn = document.getElementById('onboarding-back');
    const nextBtn = document.getElementById('onboarding-next');
    if (!body || !nextBtn) return;

    if (dots) {
        dots.innerHTML = [0, 1, 2]
            .map((i) => `<span class="onboarding-dot${i === onboardingStep ? ' active' : ''}"></span>`)
            .join('');
    }
    if (backBtn) backBtn.classList.toggle('hidden', onboardingStep === 0);

    if (onboardingStep === 0) {
        body.innerHTML = `
            <h2 class="type-title text-primary mb-1">歡迎！開始規劃旅程</h2>
            <p class="type-caption text-secondary mb-4">第一步：幫旅程改個名同設定城市（天氣用）</p>
            <label class="onboarding-field">
                <span class="type-micro text-muted">旅程名稱</span>
                <input type="text" id="onboarding-name" value="${escapeAttr(trip.name)}" class="field-input w-full mt-1" placeholder="例：東京 5 日">
            </label>
            <label class="onboarding-field mt-3">
                <span class="type-micro text-muted">目的地（天氣）</span>
                <select id="onboarding-city" class="field-input w-full mt-1 bg-surface-muted rounded-xl px-2 py-2 border border-default">${weatherLocationOptionsHtml(trip.city || 'Tokyo')}</select>
            </label>
            <button type="button" class="onboarding-template-btn mt-4" onclick="applyTokyoTemplateFromOnboarding()">
                <i class="fas fa-bolt text-accent mr-1"></i>一鍵用「東京 5 日」模板
            </button>`;
        nextBtn.textContent = '下一步';
    } else if (onboardingStep === 1) {
        body.innerHTML = `
            <h2 class="type-title text-primary mb-1">設定出發日期</h2>
            <p class="type-caption text-secondary mb-4">填咗就可以自動對準「今日」；唔肯定可以跳過</p>
            <label class="onboarding-field">
                <span class="type-micro text-muted">出發日期</span>
                <input type="date" id="onboarding-start" value="${escapeAttr(trip.startDate || '')}" class="field-input w-full mt-1 bg-surface-muted rounded-xl px-2 py-2 border border-default">
            </label>`;
        nextBtn.textContent = '下一步';
    } else {
        body.innerHTML = `
            <h2 class="type-title text-primary mb-1">加第一個景點</h2>
            <p class="type-caption text-secondary mb-4">行程頁撳「編輯」就可以隨時加景點；或者而家開始</p>
            <button type="button" class="btn-primary-sm w-full py-3 mb-2" onclick="onboardingAddFirstEvent()">+ 加第一個景點</button>
            <button type="button" class="btn-ghost-sm w-full py-3" onclick="finishOnboardingFromStep3()">稍後再加</button>`;
        nextBtn.textContent = '完成';
    }
}

function onboardingBack() {
    if (onboardingStep > 0) {
        onboardingStep -= 1;
        renderOnboardingStep();
    }
}

function onboardingNext() {
    if (onboardingStep === 0) {
        const name = document.getElementById('onboarding-name')?.value?.trim();
        const city = document.getElementById('onboarding-city')?.value?.trim();
        if (name) trip.name = name;
        if (city) trip.city = getWeatherLocation(city).id;
        save();
        renderTripHeader();
        renderCityUI();
        onboardingStep = 1;
        renderOnboardingStep();
        return;
    }
    if (onboardingStep === 1) {
        const sd = document.getElementById('onboarding-start')?.value || '';
        trip.startDate = sd;
        if (sd) syncItineraryDatesFromStart();
        save();
        if (typeof renderTripScheduleUI === 'function') renderTripScheduleUI();
        renderDaySelector();
        updateHeaderSubtitle();
        renderTodayOverview();
        onboardingStep = 2;
        renderOnboardingStep();
        return;
    }
    finishOnboardingFromStep3();
}

async function applyTokyoTemplateFromOnboarding() {
    const tpl = buildTokyoDemoTrip();
    data.trips[0] = migrateTrip(tpl);
    trip = data.trips[0];
    curDayIdx = 0;
    save();
    finishOnboarding();
    await init();
    showToast('已套用東京 5 日模板');
}

async function onboardingAddFirstEvent() {
    finishOnboarding();
    if (!isEdit) toggleEdit();
    addEvent();
    setTab('itinerary');
}

function finishOnboardingFromStep3() {
    finishOnboarding();
    showToast('開始規劃啦！撳「編輯」加景點');
}

function showOnboarding() {
    if (localStorage.getItem(ONBOARDING_KEY) === '1') return;
    const el = document.getElementById('onboarding');
    if (!el) return;
    onboardingStep = 0;
    renderOnboardingStep();
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
}

function setupOnboarding() {
    if (!needsOnboarding()) return;
    if (onboardingShowTimer) clearTimeout(onboardingShowTimer);
    onboardingShowTimer = setTimeout(() => {
        onboardingShowTimer = null;
        showOnboarding();
    }, 400);
}
