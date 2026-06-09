/* 示範行程資料 — 東京 5 日 */

function demoStartDate(todayDayIndex = 1) {
    const d = new Date();
    d.setDate(d.getDate() - todayDayIndex);
    return d.toISOString().slice(0, 10);
}

function demoEvent(loc, time, opts = {}) {
    return {
        loc,
        time,
        remark: opts.remark || '',
        status: ['booked', 'done'].includes(opts.status) ? opts.status : 'pending',
        img: '',
        link: opts.link || '',
        bookingRef: opts.bookingRef || '',
        cost: opts.cost != null && opts.cost !== '' ? opts.cost : '',
        tag: opts.tag || '',
    };
}

function buildTokyoDemoTrip() {
    const weekdays = ['一', '二', '三', '四', '五'];
    const imgs = [
        'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=800',
        'https://images.unsplash.com/photo-1542051841853-5f90071e7989?w=800',
        'https://images.unsplash.com/photo-1493976040374-85c8e912f636?w=800',
        'https://images.unsplash.com/photo-1513407030342-c516a8136e06?w=800',
        'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800',
    ];
    const plan = [
        {
            title: '抵達・淺草',
            events: [
                demoEvent('成田機場 NRT', '11:30', {
                    tag: '交通',
                    remark: 'NEX 成田特快 → 上野，約 1 小時',
                    cost: 3070,
                    status: 'booked',
                    bookingRef: 'NEX-8842',
                }),
                demoEvent('淺草寺', '14:00', {
                    tag: '景點',
                    remark: '雷門打卡，主殿免費參拜',
                    link: 'https://www.google.com/maps/search/?api=1&query=淺草寺',
                }),
                demoEvent('仲見世通', '16:00', {
                    tag: '美食',
                    remark: '人形燒、炸饅頭',
                    cost: 1500,
                }),
                demoEvent('晴空塔', '18:30', {
                    tag: '夜景',
                    remark: '展望台門票已訂',
                    cost: 2100,
                    status: 'booked',
                    bookingRef: 'SKY-2406',
                    link: 'https://www.google.com/maps/search/?api=1&query=東京晴空塔',
                }),
            ],
        },
        {
            title: '原宿・澀谷',
            events: [
                demoEvent('明治神宮', '10:00', {
                    tag: '景點',
                    remark: '早少少去，人少啲',
                    link: 'https://www.google.com/maps/search/?api=1&query=明治神宮',
                }),
                demoEvent('表參道', '12:30', {
                    tag: '美食',
                    remark: 'Afternoon tea / 輕食',
                    cost: 2800,
                }),
                demoEvent('澀谷十字路口', '15:00', {
                    tag: '打卡',
                    remark: 'Scramble crossing 經典位',
                    link: 'https://www.google.com/maps/search/?api=1&query=澀谷十字路口',
                }),
                demoEvent('Shibuya Sky', '17:30', {
                    tag: '夜景',
                    cost: 2200,
                    status: 'booked',
                    bookingRef: 'SS-1830',
                    link: 'https://www.google.com/maps/search/?api=1&query=Shibuya+Sky',
                }),
            ],
        },
        {
            title: '上野・秋葉原',
            events: [
                demoEvent('上野公園', '10:00', { tag: '景點', remark: '晨運散步' }),
                demoEvent('國立科學博物館', '11:30', {
                    tag: '景點',
                    cost: 630,
                    remark: '日本館 + 全球館',
                }),
                demoEvent('阿美橫丁', '13:30', { tag: '美食', cost: 1200, remark: '平價小吃' }),
                demoEvent('秋葉原', '15:00', {
                    tag: '購物',
                    remark: '電器街、動漫周邊',
                    link: 'https://www.google.com/maps/search/?api=1&query=秋葉原',
                }),
            ],
        },
        {
            title: '新宿・東京鐵塔',
            events: [
                demoEvent('新宿御苑', '10:00', { tag: '景點', cost: 500, remark: '溫室 + 日式庭園' }),
                demoEvent('新宿午餐', '12:30', { tag: '美食', cost: 1800 }),
                demoEvent('東京鐵塔', '17:00', {
                    tag: '夜景',
                    cost: 1200,
                    status: 'booked',
                    bookingRef: 'TT-1700',
                    link: 'https://www.google.com/maps/search/?api=1&query=東京鐵塔',
                }),
                demoEvent('六本木之丘', '20:00', {
                    tag: '夜景',
                    remark: '夜景同鐵塔二揀一',
                    cost: 2000,
                }),
            ],
        },
        {
            title: '返程前掃貨',
            events: [
                demoEvent('銀座', '11:00', { tag: '購物', remark: '伴手禮、百貨' }),
                demoEvent('羽田機場 HND', '15:30', {
                    tag: '交通',
                    remark: '建議提前 3 小時到',
                    status: 'booked',
                    bookingRef: 'CX-521',
                }),
            ],
        },
    ];

    const tripData = defaultTrip('東京 5 日', 'Tokyo');
    tripData.startDate = demoStartDate(1);
    tripData.rate = null;
    tripData.ratePair = null;
    tripData.localCurrency = 'JPY';
    tripData.homeCurrency = 'HKD';
    tripData.itinerary = plan.map((d, i) => ({
        date: `Day ${i + 1}`,
        weekday: weekdays[i],
        title: d.title,
        img: imgs[i],
        budget: 0,
        events: d.events,
    }));
    tripData.checklist = [
        { task: '檢查護照', done: true },
        { task: '列印酒店確認信', done: true },
        { task: 'Suica／IC 卡', done: false },
        { task: '行動電源 + 轉換插', done: false },
        { task: '旅遊保險', done: true },
        { task: '下載離線地圖', done: false },
    ];
    return tripData;
}

async function loadDemoTrip() {
    const ok = await modalConfirm(
        '載入示範行程',
        '會取代目前旅程嘅所有內容（景點、預算、清單等），確定？',
        { confirmText: '載入' },
    );
    if (!ok) return;
    data.trips[data.activeIdx] = migrateTrip(buildTokyoDemoTrip());
    trip = data.trips[data.activeIdx];
    const todayIdx = getTodayDayIndex();
    curDayIdx = todayIdx >= 0 ? todayIdx : 1;
    save();
    await init();
    showToast('已載入東京示範行程');
}
