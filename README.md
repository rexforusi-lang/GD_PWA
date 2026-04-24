# DriveFetch PWA V1_4

DriveFetch 是可部署於 GitHub Pages 的單頁 PWA，用於處理 Google Drive 共用連結。V1_4 加入「檔案勾選下載」與「100 檔 / 1GB 分包規則」：掃描資料夾後，使用者可勾選要下載的檔案；建立 ZIP 時每包最多 100 個檔案，若未滿 100 個但累計超過約 1GB，會優先以 1GB 分包。

## 合規與安全聲明

本專案不提供、也不包含繞過 Zscaler、公司 Proxy、DLP、防火牆、學校或企業資安政策的功能。若環境阻擋 Google Drive / Google API / Google Docs 匯出連結，請由 IT 以正式流程核准放行必要網域或改用核准的檔案交換平台。

「免 API 直連」只會開啟 Google 官方下載或匯出網址，不會繞過分享權限、下載限制或網路控管。

## V1_4 更新重點

- 掃描資料夾後，檔案清單改為可勾選。
- 新增全選、全不選、反選。
- 預設全選掃描到的所有可下載檔案。
- ZIP 建立改為依「已勾選檔案」處理。
- 分包規則改為：每包最多 100 個檔案；若累計大小超過約 1GB，則先以 1GB 分包。
- 保留低記憶體逐包建立流程：一次只保留一個 Blob ZIP 下載連結。
- 改善 OAuth 流程：授權按鈕會等待 token 回傳；API 請求前會檢查 token 時效。
- 改善 Drive API 401：下載或掃描時若遇到 access token 過期 / 無效，會重新取得 token 並重試一次。
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
9. 在掃描結果勾選要下載的檔案。
10. 按「建立第 1 包」。
11. 下載該分割 ZIP。
12. 確認下載完成後，按「標記已下載」或直接按「釋放暫存」。
13. 暫存釋放後，按「建立第 2 包」，重複直到全部完成。

可選：建立 API Key 供公開分享資料夾模式使用。請務必限制 HTTP referrer 與只允許 Google Drive API。

## 分割 ZIP 設計說明

- 分割邏輯是「多個獨立 ZIP」，不是傳統 `.zip.001` 連續分卷。
- 每包最多 100 個檔案。
- 若未滿 100 個檔案但累計大小超過約 1GB，會優先以 1GB 分包。
- 單一檔案如果本身超過 1GB，該檔會獨立成一個 ZIP 包，因此該包仍可能大於 1GB。
- 下載連結使用瀏覽器 Object URL，重新整理頁面後會失效，需要重新建立。
- V1_4 會要求先釋放目前分割檔暫存，再建立下一包，避免同時保留多個大型 Blob。
- PWA 只能釋放瀏覽器暫存，不能刪除使用者已下載到 iPhone「檔案」App 或電腦 Downloads 資料夾的檔案。

## 401 改善說明

V1_4 針對 `Drive API 401: Request had invalid authentication credentials` 做了兩層改善：

1. 授權流程改成等待 Google Identity Services 回傳 access token 後才繼續。
2. Drive API 請求前會檢查 token 是否接近過期；若 API 仍回傳 401，會重新取得 token 並重試一次。

若重試後仍 401，通常代表帳號權限不足、OAuth Client ID 設定錯誤、Google Cloud 專案未啟用 Drive API、或網路 / 企業代理阻擋 Google OAuth / Google API。

## 支援功能

- 單一檔案免 API 直連。
- Google Docs / Sheets / Slides 免 API 匯出連結。
- 解析 Google Drive folder / file 連結。
- 支援 docs.google.com 的 Document / Spreadsheet / Presentation / Drawing / Forms ID 解析。
- OAuth / API 模式可遞迴掃描資料夾。
- 支援 Google Drive resourcekey 連結。
- Google Workspace 原生檔案匯出為 Office 或 PDF。
- 在瀏覽器端逐包產生分割 ZIP，不需要後端伺服器。
- PWA manifest 與 Service Worker 快取。
- version.json 自動更新檢查。
- iOS mobile-first app shell，含 safe-area 與固定底部導覽。

## 限制

- PWA 無法繞過公司或學校網路阻擋。
- 免 API 模式不適合資料夾、批次下載或 ZIP 打包。
- 大型資料夾會受手機/瀏覽器記憶體限制影響。
- Google Workspace 匯出限制與 Drive API 配額仍然適用。
- 非可下載或權限不足檔案會略過。
