# 專屬你的旅行筆記

離線也能使用的旅行行程規劃 Web App。支援多旅程管理、每日景點、預算、匯率換算、行李清單、重要文件，並可安裝到手機主畫面（PWA）。

## 功能

### 行程規劃
- 按日管理景點、時間、備註、訂位編號、連結、標籤、預估花費
- 多旅程建立、切換、重新命名
- 出發日期自動計算每日日期
- 今日總覽、全旅程搜尋
- 地圖／導航一鍵開啟（Google Maps、Apple 地圖）
- 編輯模式：複製景點／整天、▲▼ 排序、刪除二次確認

### 預算與匯率
- 每日預算、行程上限、景點預估花費加總與進度條
- 每個旅程可自訂目的地／本國貨幣與匯率

### 工具
- 天氣（Open-Meteo，點擊刷新）
- 行李清單模板與進度條
- 重要文件：**圖片 + PDF**（護照、機票等）
- 旅行模式（僅瀏覽）
- 深色模式

### 分享與列印
- **分享全程／今日／當天**純文字（Web Share API 或複製剪貼簿）
- **列印／另存 PDF**：開啟列印友好版面，可用瀏覽器「另存為 PDF」
- **分享備份檔**：一鍵分享完整 JSON 到 AirDrop、iCloud Drive、WhatsApp 等

### 出發提醒
- 本機通知（Notification API）：出發前一日、出發當日、行程中每日早上
- 需允許瀏覽器通知；**非**伺服器 Web Push（App 關閉後 iOS 可能無法觸發）

### 備份
- **完整匯出**：JSON 內嵌 base64 圖片，可跨裝置還原
- **輕量匯出**：僅 `idb:` 引用，檔案小
- **匯入（取代）**：清除現有資料後還原
- **匯入（合併）**：將備份中的旅程追加到現有列表
- **清理未使用圖片**：刪除 IndexedDB 中無引用的圖片

### PWA 離線
- 樣式、字型、圖示均已**本地化**（無需 CDN 即可顯示介面）
- Service Worker 快取；有新版本時提示「立即更新」
- 曾連線開啟後可離線瀏覽行程

## 專案結構

```
JP/
├── index.html
├── styles.css
├── app.js                    # 核心邏輯（儲存、渲染、天氣…）
├── js/
│   ├── share-print.js        # 分享文字、列印、分享備份
│   └── reminders.js          # 本機出發提醒
├── sw.js
├── manifest.webmanifest
├── vendor/
│   ├── tailwind.css          # 預編譯 Tailwind（勿手改）
│   ├── fonts/                # Noto Sans TC
│   └── fontawesome/          # Font Awesome 6.4
├── icons/
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
├── tailwind-src.css          # Tailwind 原始檔
├── tailwind.config.js
└── README.md
```

## 本地執行

需要透過 HTTP 伺服器開啟（PWA 與 Service Worker 不支援 `file://`）：

```bash
cd JP
python3 -m http.server 8080
```

瀏覽器開啟：<http://localhost:8080>

## 重新編譯 Tailwind（可選）

修改 `index.html` 或 `app.js` 中的 Tailwind class 後：

```bash
npm install
npm run build:css
```

## 安裝到手機

1. 用 Safari（iOS）或 Chrome（Android）開啟網址
2. 至少連線開啟一次，讓資源完成快取
3. 選擇「加入主畫面」或「安裝 App」

## 資料儲存

| 類型 | 位置 | 說明 |
|------|------|------|
| 行程 JSON | `localStorage`（`TRAVEL_V6_STORAGE`） | 文字資料、圖片引用 |
| 圖片 | IndexedDB（`TRAVEL_APP_IMAGES`） | 封面、景點圖、文件 |
| UI 偏好 | `localStorage`（`TRAVEL_APP_UI_PREFS`） | 上次 tab、day |
| 深色模式 | `localStorage`（`TRAVEL_APP_DARK_MODE`） | 開／關 |
| 旅行模式 | `localStorage`（`TRAVEL_APP_TRAVEL_MODE`） | 開／關 |
| 提醒設定 | `localStorage`（`TRAVEL_APP_REMINDER_SETTINGS`） | 開關、時段 |

建議定期在「工具清單 → 完整匯出」或「分享備份檔」備份 JSON。

### 跨裝置「同步」建議

本 App 無雲端帳號。跨手機／電腦同步方式：

1. **分享備份檔** → 存到 iCloud Drive / Google Drive
2. 在新裝置開啟 App → **匯入（取代）** 或 **匯入（合併）**

## 備份格式

```json
{
  "version": 6,
  "activeIdx": 0,
  "trips": [
    {
      "name": "我的旅行",
      "city": "Tokyo",
      "localCurrency": "JPY",
      "homeCurrency": "HKD",
      "rate": 0.052,
      "startDate": "",
      "tripBudget": null,
      "itinerary": [],
      "checklist": [],
      "docs": [{ "url": "idb:…", "label": "護照", "mimeType": "image/jpeg" }]
    }
  ]
}
```

完整匯出時圖片／PDF 為 base64；輕量匯出為 `idb:uuid`；匯入後會自動遷移至 IndexedDB。PDF 上限 8MB。

## 部署

可部署到任何靜態主機（需 **HTTPS** 才能完整使用 PWA）：

- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages

將 `JP/` 資料夾內所有檔案（含 `vendor/`）上傳至網站根目錄即可。

## 離線限制

- 天氣更新需要網絡
- 未快取過的 Unsplash 預設封面可能無法顯示
- 輕量備份不含圖片本體，跨裝置還原請用完整匯出
- 本機提醒需瀏覽器允許通知；背景／關閉 App 後不保證觸發（尤其 iOS）

## 技術棧

- 純 HTML / CSS / JavaScript
- Tailwind CSS 3（預編譯至 `vendor/tailwind.css`）
- Font Awesome 6、Noto Sans TC（本地）
- Open-Meteo API（天氣）
- localStorage + IndexedDB
