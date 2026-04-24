# DriveFetch PWA V1_2

DriveFetch 是可部署於 GitHub Pages 的單頁 PWA，用於處理 Google Drive 共用連結。V1_2 新增「每包約 1GB 的分割 ZIP 下載連結」，並保留 V1_1 的免 API 單一檔案直連模式與 OAuth / Drive API 資料夾掃描功能。

## 合規與安全聲明

本專案不提供、也不包含繞過 Zscaler、公司 Proxy、DLP、防火牆、學校或企業資安政策的功能。若環境阻擋 Google Drive / Google API / Google Docs 匯出連結，請由 IT 以正式流程核准放行必要網域或改用核准的檔案交換平台。

「免 API 直連」只會開啟 Google 官方下載或匯出網址，不會繞過分享權限、下載限制或網路控管。

## V1_2 更新重點

- 新增每包約 1GB 的分割 ZIP 建立流程。
- 新增「分割檔下載」區塊，產生每個分割包的下載連結。
- 每個分割包都是可獨立解壓的 ZIP，不需要額外合併工具。
- 單一檔案超過 1GB 時，會獨立成一包並標示超過限制。
- 保留無 API 單一檔案直連模式。
- 保留 OAuth / Drive API 模式的資料夾遞迴掃描、Google Workspace 匯出與批次下載。
- 更新 Service Worker 快取版本與 version.json。

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

### B. 資料夾 / 批次分割 ZIP：OAuth / Drive API 模式

1. 前往 Google Cloud Console。
2. 建立或選擇一個 Project。
3. 啟用 Google Drive API。
4. 建立 OAuth 2.0 Client ID。
5. Application type 選 Web application。
6. Authorized JavaScript origins 加入你的 GitHub Pages 網址，例如：
   - https://yourname.github.io
   - https://yourname.github.io/repository-name
7. 將 Client ID 貼到 PWA 設定頁。
8. 回到下載頁登入 Google、貼上資料夾連結、掃描。
9. 按「建立 1GB 分割檔」。
10. 在「分割檔下載」區塊逐一點擊下載連結。

可選：建立 API Key 供公開分享資料夾模式使用。請務必限制 HTTP referrer 與只允許 Google Drive API。

## 分割 ZIP 設計說明

- 分割邏輯是「多個獨立 ZIP」，不是傳統 `.zip.001` 連續分卷。
- 每包目標上限約 1GB，實際大小會因 ZIP header 與單檔大小略有差異。
- 單一檔案如果本身超過 1GB，該檔會獨立成一個 ZIP 包，因此該包仍可能大於 1GB。
- 下載連結使用瀏覽器 Object URL，重新整理頁面後會失效，需要重新建立。
- 手機 Safari / iOS PWA 對大型 Blob 可能有記憶體限制；建議大型資料夾分批處理。

## 支援功能

- 單一檔案免 API 直連。
- Google Docs / Sheets / Slides 免 API 匯出連結。
- 解析 Google Drive folder / file 連結。
- 支援 docs.google.com 的 Document / Spreadsheet / Presentation / Drawing / Forms ID 解析。
- OAuth / API 模式可遞迴掃描資料夾。
- 支援 Google Drive resourcekey 連結。
- Google Workspace 原生檔案匯出為 Office 或 PDF。
- 在瀏覽器端產生多個分割 ZIP，不需要後端伺服器。
- PWA manifest 與 Service Worker 快取。
- version.json 自動更新檢查。
- iOS mobile-first app shell，含 safe-area 與固定底部導覽。

## 限制

- PWA 無法繞過公司或學校網路阻擋。
- 免 API 模式不適合資料夾、批次下載或 ZIP 打包。
- 大型資料夾會受手機/瀏覽器記憶體限制影響。
- Google Workspace 匯出限制與 Drive API 配額仍然適用。
- 非可下載或權限不足檔案會略過。
