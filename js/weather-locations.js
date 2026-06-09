/* 天氣地點 — 預設座標接 Open-Meteo */

const WEATHER_LOCATIONS = [
    { id: 'Tokyo', label: '東京', group: '日本', lat: 35.6895, lon: 139.6917 },
    { id: 'Osaka', label: '大阪', group: '日本', lat: 34.6937, lon: 135.5023 },
    { id: 'Kyoto', label: '京都', group: '日本', lat: 35.0116, lon: 135.7681 },
    { id: 'Sapporo', label: '札幌', group: '日本', lat: 43.0618, lon: 141.3545 },
    { id: 'Fukuoka', label: '福岡', group: '日本', lat: 33.5904, lon: 130.4017 },
    { id: 'Naha', label: '那霸', group: '日本', lat: 26.2124, lon: 127.6792 },
    { id: 'Taipei', label: '台北', group: '台港澳韓', lat: 25.033, lon: 121.5654 },
    { id: 'Hong Kong', label: '香港', group: '台港澳韓', lat: 22.3193, lon: 114.1694 },
    { id: 'Seoul', label: '首爾', group: '台港澳韓', lat: 37.5665, lon: 126.978 },
    { id: 'Bangkok', label: '曼谷', group: '東南亞', lat: 13.7563, lon: 100.5018 },
    { id: 'Singapore', label: '新加坡', group: '東南亞', lat: 1.3521, lon: 103.8198 },
    { id: 'Kuala Lumpur', label: '吉隆坡', group: '東南亞', lat: 3.139, lon: 101.6869 },
    { id: 'Shanghai', label: '上海', group: '中國', lat: 31.2304, lon: 121.4737 },
    { id: 'Beijing', label: '北京', group: '中國', lat: 39.9042, lon: 116.4074 },
    { id: 'Paris', label: '巴黎', group: '歐美澳', lat: 48.8566, lon: 2.3522 },
    { id: 'London', label: '倫敦', group: '歐美澳', lat: 51.5074, lon: -0.1278 },
    { id: 'New York', label: '紐約', group: '歐美澳', lat: 40.7128, lon: -74.006 },
    { id: 'Los Angeles', label: '洛杉磯', group: '歐美澳', lat: 34.0522, lon: -118.2437 },
    { id: 'Sydney', label: '悉尼', group: '歐美澳', lat: -33.8688, lon: 151.2093 },
];

function getWeatherLocation(cityId) {
    const id = String(cityId || 'Tokyo').trim();
    let found = WEATHER_LOCATIONS.find((l) => l.id === id);
    if (!found) found = WEATHER_LOCATIONS.find((l) => l.id.toLowerCase() === id.toLowerCase());
    if (found) return found;
    return { id, label: id, group: '', lat: null, lon: null };
}

function weatherLocationOptionsHtml(selectedId) {
    const cur = String(selectedId || 'Tokyo').trim();
    const groups = [...new Set(WEATHER_LOCATIONS.map((l) => l.group))];
    let html = '';
    if (cur && !WEATHER_LOCATIONS.some((l) => l.id === cur)) {
        html += `<option value="${cur}" selected>${cur}</option>`;
    }
    for (const g of groups) {
        html += `<optgroup label="${g}">`;
        for (const loc of WEATHER_LOCATIONS.filter((l) => l.group === g)) {
            const sel = loc.id === cur ? ' selected' : '';
            html += `<option value="${loc.id}"${sel}>${loc.label}</option>`;
        }
        html += '</optgroup>';
    }
    return html;
}
