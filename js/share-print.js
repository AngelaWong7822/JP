/* 分享與列印 — 依賴 app.js 全域狀態與工具函式 */

function formatDayEventsText(t, day, dayIdx) {
    const header = `${formatBannerDayLabel(t, day, dayIdx)} · ${day.title}`;
    const events = sortEventEntries(day.events.map((ev, i) => ({ ev, i })));
    if (events.length === 0) return `${header}\n（未有景點）`;
    const lines = events.map(({ ev }) => {
        let line = `${ev.time || '--:--'}  ${ev.loc || '景點'}`;
        if (ev.bookingRef) line += ` [${ev.bookingRef}]`;
        if (ev.remark) line += `\n    ${ev.remark}`;
        return line;
    });
    return `${header}\n${lines.join('\n')}`;
}

function formatTripText(t) {
    const parts = [`📋 ${t.name}`];
    if (t.city) parts.push(`📍 ${t.city}`);
    if (t.startDate) parts.push(`📅 出發：${t.startDate}`);
    parts.push('');
    t.itinerary.forEach((day, idx) => {
        parts.push(formatDayEventsText(t, day, idx));
        parts.push('');
    });
    const checklist = getTripChecklist(t);
    if (checklist.length) {
        const done = checklist.filter((c) => c.done).length;
        parts.push(`🧳 行李清單（${done}/${checklist.length}）`);
        checklist.forEach((c) => {
            parts.push(`${c.done ? '☑' : '☐'} ${c.task}`);
        });
    }
    return parts.join('\n').trim();
}

async function sharePlainText(title, text) {
    if (navigator.share) {
        try {
            await navigator.share({ title, text });
            showToast('已分享');
            return;
        } catch (err) {
            if (err?.name === 'AbortError') return;
        }
    }
    try {
        await navigator.clipboard.writeText(text);
        showToast('已複製到剪貼簿');
    } catch (_) {
        await modalAlert('分享失敗', '請手動複製內容');
    }
}

function shareCurrentTrip() {
    sharePlainText(trip.name, formatTripText(trip));
}

function getTripChecklist(t) {
    if (!t || !Array.isArray(t.checklist)) return [];
    return t.checklist.map((c) => ({
        task: c?.task != null ? String(c.task) : c?.text != null ? String(c.text) : '',
        done: !!c?.done,
    }));
}

function buildChecklistPrintSection(t) {
    const items = getTripChecklist(t);
    if (!items.length) {
        return '<section class="day checklist"><h2>行李清單</h2><p class="muted">尚無項目</p></section>';
    }
    const done = items.filter((c) => c.done).length;
    const rows = items
        .map(
            (c) =>
                `<li class="check-item${c.done ? ' check-done' : ''}"><span class="check-box" aria-hidden="true">${c.done ? '☑' : '☐'}</span><span>${escapeHtml(c.task || '（未命名）')}</span></li>`,
        )
        .join('');
    return `<section class="day checklist" id="print-checklist"><h2>行李清單 <span class="tag">${done}/${items.length} 已完成</span></h2><ul class="checklist-list">${rows}</ul></section>`;
}

function buildPrintHtml(t) {
    const days = t.itinerary
        .map((day, idx) => {
            const events = sortEventEntries(day.events.map((ev, i) => ({ ev, i })));
            const eventHtml =
                events.length === 0
                    ? '<p class="muted">未有景點</p>'
                    : events
                          .map(({ ev }) => {
                              const bits = [
                                  ev.time ? `<strong>${escapeHtml(ev.time)}</strong>` : '',
                                  escapeHtml(ev.loc || '景點'),
                                  ev.bookingRef ? `<span class="tag">訂位 ${escapeHtml(ev.bookingRef)}</span>` : '',
                                  ev.cost !== '' && ev.cost != null && !Number.isNaN(Number(ev.cost))
                                      ? `<span class="tag">${escapeHtml(formatAmount(ev.cost))}</span>`
                                      : '',
                              ]
                                  .filter(Boolean)
                                  .join(' · ');
                              const remark = ev.remark ? `<p class="remark">${escapeHtml(ev.remark)}</p>` : '';
                              return `<li>${bits}${remark}</li>`;
                          })
                          .join('');
            return `<section class="day"><h2>${escapeHtml(formatBannerDayLabel(t, day, idx))} — ${escapeHtml(day.title)}</h2><ul>${eventHtml}</ul></section>`;
        })
        .join('');
    const checklist = buildChecklistPrintSection(t);
    return `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><title>${escapeHtml(t.name)}</title>
<style>
body{font-family:'Noto Sans TC',sans-serif;color:#2D3436;padding:24px;max-width:720px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px} .meta{color:#666;font-size:13px;margin-bottom:20px}
.day{margin-bottom:20px;page-break-inside:avoid} h2{font-size:15px;border-bottom:2px solid #FF85A1;padding-bottom:4px}
ul{list-style:none;padding:0;margin:8px 0 0} li{margin:8px 0;font-size:13px;line-height:1.5}
.remark{color:#666;font-size:12px;margin:4px 0 0} .tag{color:#FF85A1;font-size:11px} .muted{color:#999}
.checklist{margin-bottom:24px}
.checklist-list li.check-item{display:flex;gap:8px;align-items:flex-start;margin:6px 0}
.check-done{opacity:.55;text-decoration:line-through}
.check-box{flex-shrink:0;font-size:14px;line-height:1.4}
@media print{
body{padding:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.checklist{page-break-inside:avoid}
.day{page-break-inside:avoid}
}
</style></head><body>
<h1>${escapeHtml(t.name)}</h1>
<p class="meta">${escapeHtml(t.city || '')}${t.startDate ? ` · 出發 ${escapeHtml(t.startDate)}` : ''}</p>
${checklist}
${days}
<p class="muted" style="margin-top:24px;font-size:11px">由「旅行筆記」匯出 · ${new Date().toLocaleString('zh-TW')}</p>
</body></html>`;
}

function printCurrentTrip() {
    if (typeof flushSave === 'function') flushSave();
    const overlay = document.getElementById('print-preview');
    const frame = document.getElementById('print-preview-frame');
    if (!overlay || !frame) return;
    const title = document.querySelector('.print-preview-title');
    if (title) title.textContent = trip.name || '行程預覽';
    overlay.classList.remove('hidden');
    frame.srcdoc = buildPrintHtml(trip);
}

function closePrintPreview() {
    const frame = document.getElementById('print-preview-frame');
    if (frame) frame.removeAttribute('srcdoc');
    document.getElementById('print-preview')?.classList.add('hidden');
}

function runPrintPreview() {
    if (typeof flushSave === 'function') flushSave();
    const html = buildPrintHtml(trip);
    const w = window.open('', '_blank');
    if (!w) {
        const frame = document.getElementById('print-preview-frame');
        try {
            frame?.contentWindow?.focus();
            frame?.contentWindow?.print();
        } catch (_) {
            modalAlert('無法列印', '請允許彈出視窗後再試');
        }
        return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
        try {
            w.print();
        } catch (_) {
            modalAlert('無法列印', '請稍後再試');
        }
    }, 350);
}
