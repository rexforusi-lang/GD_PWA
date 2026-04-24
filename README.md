# DriveFetch PWA V1_0

DriveFetch 是可部署於 GitHub Pages 的單頁 PWA，用於掃描 Google Drive 共用連結，並透過 Google Drive 官方 API 與使用者授權，把可下載檔案打包成 ZIP。

## 合規與安全聲明

本專案不提供、也不包含繞過 Zscaler、公司 Proxy、DLP、防火牆、學校或企業資安政策的功能。若環境阻擋 Google Drive / Google API，請由 IT 以正式流程核准放行必要網域或改用核准的檔案交換平台。

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

## 部署到 GitHub Pages

1. 建立 GitHub repository。
2. 將本資料夾內所有檔案上傳到 repo 根目錄。
3. 到 Settings → Pages。
4. Source 選擇 Deploy from a branch。
5. Branch 選 main / root。
6. 等待 Pages 網址產生。

## Google Cloud 設定

1. 前往 Google Cloud Console。
2. 建立或選擇一個 Project。
3. 啟用 Google Drive API。
4. 建立 OAuth 2.0 Client ID。
5. Application type 選 Web application。
6. Authorized JavaScript origins 加入你的 GitHub Pages 網址，例如：
   - https://yourname.github.io
   - https://yourname.github.io/repository-name
7. 將 Client ID 貼到 PWA 設定頁。

可選：建立 API Key 供公開分享資料夾模式使用。請務必限制 HTTP referrer 與只允許 Google Drive API。

## 支援功能

- 解析 Google Drive folder / file 連結。
- 支援 docs.google.com 的 Document / Spreadsheet / Presentation / Drawing / Forms ID 解析。
- 遞迴掃描資料夾。
- 支援 Google Drive resourcekey 連結。
- Google Workspace 原生檔案匯出為 Office 或 PDF。
- 在瀏覽器端產生 ZIP，不需要後端伺服器。
- PWA manifest 與 Service Worker 快取。
- version.json 自動更新檢查。
- iOS mobile-first app shell，含 safe-area 與固定底部導覽。

## 限制

- PWA 無法繞過公司或學校網路阻擋。
- 大型資料夾會受手機/瀏覽器記憶體限制影響。
- Google Workspace 匯出限制與 Drive API 配額仍然適用。
- 非可下載或權限不足檔案會略過。
