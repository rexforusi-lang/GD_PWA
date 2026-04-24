# DriveFetch PWA V1_1

DriveFetch 是可部署於 GitHub Pages 的單頁 PWA，用於處理 Google Drive 共用連結。V1_1 新增「免 API 單一檔案直連模式」，並保留 V1_0 的 OAuth / Drive API 資料夾掃描、遞迴下載與 ZIP 打包功能。

## 合規與安全聲明

本專案不提供、也不包含繞過 Zscaler、公司 Proxy、DLP、防火牆、學校或企業資安政策的功能。若環境阻擋 Google Drive / Google API / Google Docs 匯出連結，請由 IT 以正式流程核准放行必要網域或改用核准的檔案交換平台。

「免 API 直連」只會開啟 Google 官方下載或匯出網址，不會繞過分享權限、下載限制或網路控管。

## V1_1 更新重點

- 新增無 API 單一檔案直連模式。
- 未填 OAuth Client ID / API Key 時，單一檔案連結會自動建立 Google 原生下載 / 匯出連結。
- 資料夾連結在免 API 模式下會明確提示：無法可靠列出檔案，需使用 Drive API。
- 新增「單檔直連」按鈕。
- 支援直接辨識 Drive file、Drive folder、Docs、Sheets、Slides、Drawings、Forms 連結。
- 保留 OAuth / API 模式的資料夾遞迴掃描與 ZIP 打包。

## 檔案結構

所有檔案皆位於同一層，適合直接上傳到 GitHub repo root：

- index.html
- style.css
- app.js
- manifest.json
- service-worker.js
- version.json
- update-config.js
- icon.svg
- README.md

## 使用方式

### A. 單一檔案：免 API 模式

1. 部署到 GitHub Pages。
2. 開啟 PWA。
3. 貼上 Google Drive 單一檔案或 Google Docs / Sheets / Slides 連結。
4. 按「分析 / 掃描」。
5. 按「單檔直連」。

限制：此模式無法讀取資料夾目錄、無法批次打包 ZIP，也無法保證可跨過大型檔案確認頁或公司網路控管。

### B. 資料夾 / 批次 ZIP：OAuth / Drive API 模式

1. 前往 Google Cloud Console。
2. 建立或選擇一個 Project。
3. 啟用 Google Drive API。
4. 建立 OAuth 2.0 Client ID。
5. Application type 選 Web application。
6. Authorized JavaScript origins 加入你的 GitHub Pages 網址，例如：
   - https://yourname.github.io
   - https://yourname.github.io/repository-name
7. 將 Client ID 貼到 PWA 設定頁。
8. 回到下載頁登入 Google、貼上資料夾連結、掃描並下載 ZIP。

可選：建立 API Key 供公開分享資料夾模式使用。請務必限制 HTTP referrer 與只允許 Google Drive API。

## 支援功能

- 單一檔案免 API 直連。
- Google Docs / Sheets / Slides 免 API 匯出連結。
- 解析 Google Drive folder / file 連結。
- 支援 docs.google.com 的 Document / Spreadsheet / Presentation / Drawing / Forms ID 解析。
- OAuth / API 模式可遞迴掃描資料夾。
- 支援 Google Drive resourcekey 連結。
- Google Workspace 原生檔案匯出為 Office 或 PDF。
- 在瀏覽器端產生 ZIP，不需要後端伺服器。
- PWA manifest 與 Service Worker 快取。
- version.json 自動更新檢查。
- iOS mobile-first app shell，含 safe-area 與固定底部導覽。

## 限制

- PWA 無法繞過公司或學校網路阻擋。
- 免 API 模式不適合資料夾、批次下載或 ZIP 打包。
- 大型資料夾會受手機/瀏覽器記憶體限制影響。
- Google Workspace 匯出限制與 Drive API 配額仍然適用。
- 非可下載或權限不足檔案會略過。
