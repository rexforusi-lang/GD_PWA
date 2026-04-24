/* DriveFetch PWA V1_4
 * 合規設計：僅透過 Google Drive API、公開權限與使用者 OAuth 授權下載。
 * 不包含繞過 Zscaler / Proxy / DLP / 公司資安控管的能力。
 */

const APP_VERSION = 'V1_4';
const MIME_FOLDER = 'application/vnd.google-apps.folder';
const MIME_SHORTCUT = 'application/vnd.google-apps.shortcut';
const GOOGLE_MIME_PREFIX = 'application/vnd.google-apps.';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const SPLIT_ZIP_LIMIT_BYTES = 1024 * 1024 * 1024;
const SPLIT_ZIP_LIMIT_LABEL = '1GB';
const MAX_FILES_PER_PART = 100;
const TOKEN_REFRESH_BUFFER_MS = 3 * 60 * 1000;

const EXPORT_PROFILES = {
  office: {
    'application/vnd.google-apps.document': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' },
    'application/vnd.google-apps.spreadsheet': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
    'application/vnd.google-apps.presentation': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx' },
    'application/vnd.google-apps.drawing': { mime: 'image/png', ext: 'png' },
    'application/vnd.google-apps.script': { mime: 'application/vnd.google-apps.script+json', ext: 'json' },
  },
  pdf: {
    'application/vnd.google-apps.document': { mime: 'application/pdf', ext: 'pdf' },
    'application/vnd.google-apps.spreadsheet': { mime: 'application/pdf', ext: 'pdf' },
    'application/vnd.google-apps.presentation': { mime: 'application/pdf', ext: 'pdf' },
    'application/vnd.google-apps.drawing': { mime: 'image/png', ext: 'png' },
    'application/vnd.google-apps.script': { mime: 'application/vnd.google-apps.script+json', ext: 'json' },
  }
};

const state = {
  token: '',
  tokenExpiresAt: 0,
  tokenClient: null,
  pendingTokenRequest: null,
  files: [],
  selectedFileIds: new Set(),
  folders: 0,
  skipped: [],
  resourceKeys: new Map(),
  parts: [],
  buildSession: null,
  directTarget: null,
  settings: {
    clientId: '',
    apiKey: '',
    zipPrefix: 'DriveFetch',
    exportProfile: 'office',
    theme: 'dark'
  },
  busy: false
};

const $ = (id) => document.getElementById(id);

const elements = {
  versionBadge: $('versionBadge'),
  themeToggle: $('themeToggle'),
  authState: $('authState'),
  driveUrl: $('driveUrl'),
  loginBtn: $('loginBtn'),
  scanBtn: $('scanBtn'),
  zipBtn: $('zipBtn'),
  directDownloadBtn: $('directDownloadBtn'),
  clearBtn: $('clearBtn'),
  clientId: $('clientId'),
  apiKey: $('apiKey'),
  zipPrefix: $('zipPrefix'),
  exportProfile: $('exportProfile'),
  saveSettingsBtn: $('saveSettingsBtn'),
  testAuthBtn: $('testAuthBtn'),
  checkUpdateBtn: $('checkUpdateBtn'),
  updateStatus: $('updateStatus'),
  statFiles: $('statFiles'),
  statFolders: $('statFolders'),
  statSize: $('statSize'),
  statSkipped: $('statSkipped'),
  progressLabel: $('progressLabel'),
  progressPct: $('progressPct'),
  progressBar: $('progressBar'),
  fileList: $('fileList'),
  listHint: $('listHint'),
  splitHint: $('splitHint'),
  partList: $('partList'),
  splitSizeLabel: $('splitSizeLabel'),
  selectedSummary: $('selectedSummary'),
  selectAllBtn: $('selectAllBtn'),
  selectNoneBtn: $('selectNoneBtn'),
  invertSelectionBtn: $('invertSelectionBtn'),
  clearTempBtn: $('clearTempBtn'),
  logBox: $('logBox'),
};

window.addEventListener('DOMContentLoaded', init);

function init() {
  loadSettings();
  applyTheme();
  bindEvents();
  elements.versionBadge.textContent = APP_VERSION;
  renderStats();
  renderPartLinks();
  log('DriveFetch V1_4 已啟動。批次下載採勾選清單與 100 檔 / 1GB 逐包建立流程。');
  registerServiceWorker();
  setTimeout(checkForUpdatesSilent, 1200);
}

function bindEvents() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.target));
  });
  elements.themeToggle.addEventListener('click', toggleTheme);
  elements.saveSettingsBtn.addEventListener('click', saveSettings);
  elements.loginBtn.addEventListener('click', authorize);
  elements.testAuthBtn.addEventListener('click', authorize);
  elements.scanBtn.addEventListener('click', scanCurrentUrl);
  elements.zipBtn.addEventListener('click', downloadZip);
  elements.directDownloadBtn.addEventListener('click', downloadDirectFile);
  elements.clearTempBtn?.addEventListener('click', releaseAllPartUrls);
  elements.partList?.addEventListener('click', handlePartAction);
  elements.fileList?.addEventListener('change', handleFileSelectionChange);
  elements.selectAllBtn?.addEventListener('click', () => setAllSelections(true));
  elements.selectNoneBtn?.addEventListener('click', () => setAllSelections(false));
  elements.invertSelectionBtn?.addEventListener('click', invertSelections);
  elements.clearBtn.addEventListener('click', resetResults);
  elements.checkUpdateBtn.addEventListener('click', checkForUpdatesManual);
}

function switchView(targetId) {
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === targetId));
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.target === targetId));
}

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem('drivefetch-settings') || '{}');
    state.settings = { ...state.settings, ...stored };
  } catch (_) {}
  elements.clientId.value = state.settings.clientId || '';
  elements.apiKey.value = state.settings.apiKey || '';
  elements.zipPrefix.value = state.settings.zipPrefix || 'DriveFetch';
  elements.exportProfile.value = state.settings.exportProfile || 'office';
}

function saveSettings() {
  state.settings.clientId = elements.clientId.value.trim();
  state.settings.apiKey = elements.apiKey.value.trim();
  state.settings.zipPrefix = sanitizeName(elements.zipPrefix.value.trim() || 'DriveFetch');
  state.settings.exportProfile = elements.exportProfile.value || 'office';
  localStorage.setItem('drivefetch-settings', JSON.stringify(state.settings));
  state.tokenClient = null;
  updateAuthBadge();
  log('設定已儲存。');
}

function toggleTheme() {
  state.settings.theme = state.settings.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('drivefetch-settings', JSON.stringify(state.settings));
  applyTheme();
}

function applyTheme() {
  document.documentElement.classList.toggle('light-mode', state.settings.theme === 'light');
}

function updateAuthBadge() {
  const hasToken = Boolean(state.token && Date.now() < state.tokenExpiresAt - 60000);
  elements.authState.classList.toggle('ready', hasToken);
  elements.authState.classList.toggle('partial', !hasToken && Boolean(state.settings.apiKey));
  elements.authState.textContent = hasToken ? '已授權' : (state.settings.apiKey ? '公開模式' : '未授權');
}

function waitForGoogleIdentity(timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error('Google Identity Services 載入失敗。請確認網路允許 accounts.google.com。'));
      }
    }, 100);
  });
}

async function authorize() {
  try {
    await requestAccessToken('consent');
    return true;
  } catch (error) {
    log(error.message, 'error');
    alert(error.message);
    return false;
  }
}

async function getTokenClient() {
  saveSettings();
  if (!state.settings.clientId) {
    throw new Error('請先到設定頁填入 OAuth Web Client ID。');
  }
  await waitForGoogleIdentity();
  if (!state.tokenClient) {
    state.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: state.settings.clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => handleTokenResponse(response)
    });
  }
  return state.tokenClient;
}

function handleTokenResponse(response) {
  const pending = state.pendingTokenRequest;
  state.pendingTokenRequest = null;

  if (response?.error) {
    const message = `OAuth 授權失敗：${response.error}`;
    if (pending) pending.reject(new Error(message));
    else log(message, 'error');
    return;
  }

  state.token = response?.access_token || '';
  const expiresIn = Number(response?.expires_in || 3600);
  state.tokenExpiresAt = Date.now() + expiresIn * 1000;
  updateAuthBadge();
  log(`Google Drive read-only 授權成功，有效時間約 ${Math.round(expiresIn / 60)} 分鐘。`);
  if (pending) pending.resolve(true);
}

async function requestAccessToken(prompt = '') {
  if (state.pendingTokenRequest?.promise) {
    try { await state.pendingTokenRequest.promise; } catch (_) {}
  }

  const client = await getTokenClient();
  let timeoutId;
  const request = {};
  const promise = new Promise((resolve, reject) => {
    request.resolve = (value) => { window.clearTimeout(timeoutId); resolve(value); };
    request.reject = (error) => { window.clearTimeout(timeoutId); reject(error); };
  });

  request.promise = promise;
  timeoutId = window.setTimeout(() => {
    if (state.pendingTokenRequest === request) {
      state.pendingTokenRequest = null;
      request.reject(new Error('OAuth 授權逾時，請重新按「登入 Google」。'));
    }
  }, 45000);

  state.pendingTokenRequest = request;
  client.requestAccessToken({ prompt });
  return promise;
}

function hasFreshToken(bufferMs = TOKEN_REFRESH_BUFFER_MS) {
  return Boolean(state.token && Date.now() < state.tokenExpiresAt - bufferMs);
}

async function ensureAccess() {
  if (hasFreshToken()) return true;
  if (state.settings.clientId) {
    await requestAccessToken(state.token ? '' : 'consent');
    return hasFreshToken(0);
  }
  if (state.settings.apiKey) return true;
  return authorize();
}

async function ensureFreshTokenForRequest() {
  if (!state.settings.clientId) return false;
  if (hasFreshToken()) return true;
  await requestAccessToken(state.token ? '' : 'consent');
  return hasFreshToken(0);
}

async function scanCurrentUrl() {
  if (state.busy) return;
  const url = elements.driveUrl.value.trim();
  if (!url) {
    alert('請先貼上 Google Drive 共用網址。');
    return;
  }
  resetResults(false);

  let target;
  try {
    target = extractDriveTarget(url);
    if (!target?.id) throw new Error('無法解析此連結，請確認是否為 Google Drive / Docs / Sheets / Slides 共用網址。');
  } catch (error) {
    setProgress(0, '解析失敗');
    log(`解析失敗：${error.message}`, 'error');
    alert(error.message);
    return;
  }

  const hasApiPath = Boolean(state.token || state.settings.apiKey || state.settings.clientId);
  if (!hasApiPath) {
    prepareDirectMode(target);
    return;
  }

  const accessOk = await ensureAccess();
  if (!accessOk) return;

  try {
    setBusy(true, '掃描中...');
    if (target.resourceKey) state.resourceKeys.set(target.id, target.resourceKey);
    log(`開始掃描：${target.id}`);
    const meta = await getFileMeta(target.id, target.resourceKey);
    await walkDriveItem(meta, '', target.resourceKey);
    state.selectedFileIds = new Set(state.files.map((file) => file.uid));
    renderStats();
    renderFileList();
    setProgress(100, `掃描完成：${state.files.length} 個檔案，已預設全選，可依 100 檔 / ${SPLIT_ZIP_LIMIT_LABEL} 規則逐包建立 ZIP`);
    elements.zipBtn.disabled = state.files.length === 0;
    updateZipButtonLabel();
    if (state.files.length === 0) log('沒有可下載的檔案。請確認分享權限與授權帳號。', 'warn');
  } catch (error) {
    setProgress(0, '掃描失敗');
    log(`掃描失敗：${error.message}`, 'error');
    alert(error.message);
  } finally {
    setBusy(false);
  }
}

async function walkDriveItem(item, parentPath = '', inheritedResourceKey = '') {
  const resourceKey = item.resourceKey || inheritedResourceKey || '';
  if (resourceKey) state.resourceKeys.set(item.id, resourceKey);

  if (item.mimeType === MIME_SHORTCUT && item.shortcutDetails?.targetId) {
    const targetId = item.shortcutDetails.targetId;
    const targetResourceKey = item.shortcutDetails.targetResourceKey || '';
    if (targetResourceKey) state.resourceKeys.set(targetId, targetResourceKey);
    const target = await getFileMeta(targetId, targetResourceKey);
    await walkDriveItem(target, parentPath, targetResourceKey);
    return;
  }

  if (item.mimeType === MIME_FOLDER) {
    state.folders += 1;
    const folderPath = `${parentPath}${sanitizeName(item.name)}/`;
    const children = await listFolderChildren(item.id, resourceKey);
    for (const child of children) {
      await walkDriveItem(child, folderPath, child.resourceKey || resourceKey);
    }
    renderStats();
    return;
  }

  if (item.capabilities && item.capabilities.canDownload === false) {
    state.skipped.push({ name: item.name, reason: '權限禁止下載' });
    return;
  }

  const exportInfo = getExportInfo(item);
  if (item.mimeType.startsWith(GOOGLE_MIME_PREFIX) && !exportInfo) {
    state.skipped.push({ name: item.name, reason: `Google 原生格式不支援匯出：${item.mimeType}` });
    return;
  }

  const finalName = ensureExtension(sanitizeName(item.name), exportInfo?.ext);
  const zipPath = uniqueZipPath(`${parentPath}${finalName}`);
  const uid = `${item.id}::${zipPath}`;
  state.files.push({
    uid,
    id: item.id,
    name: item.name,
    zipPath,
    mimeType: item.mimeType,
    size: Number(item.size || 0),
    resourceKey,
    exportInfo,
    modifiedTime: item.modifiedTime || ''
  });
}

function getExportInfo(item) {
  if (!item.mimeType.startsWith(GOOGLE_MIME_PREFIX)) return null;
  const profile = EXPORT_PROFILES[state.settings.exportProfile] || EXPORT_PROFILES.office;
  return profile[item.mimeType] || null;
}

async function getFileMeta(fileId, resourceKey = '') {
  const fields = 'id,name,mimeType,size,modifiedTime,resourceKey,capabilities/canDownload,shortcutDetails/targetId,shortcutDetails/targetMimeType,shortcutDetails/targetResourceKey';
  const url = buildDriveUrl(`/files/${encodeURIComponent(fileId)}`, { fields, supportsAllDrives: 'true' });
  const res = await driveFetch(url, { resourceKey, itemId: fileId });
  return res.json();
}

async function listFolderChildren(folderId, resourceKey = '') {
  const all = [];
  let pageToken = '';
  do {
    const q = `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`;
    const fields = 'nextPageToken,files(id,name,mimeType,size,modifiedTime,resourceKey,capabilities/canDownload,shortcutDetails/targetId,shortcutDetails/targetMimeType,shortcutDetails/targetResourceKey)';
    const params = {
      q,
      fields,
      pageSize: '1000',
      orderBy: 'folder,name_natural',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true'
    };
    if (pageToken) params.pageToken = pageToken;
    const url = buildDriveUrl('/files', params);
    const res = await driveFetch(url, { resourceKey, itemId: folderId });
    const data = await res.json();
    all.push(...(data.files || []));
    pageToken = data.nextPageToken || '';
    setProgress(null, `掃描中：${all.length} 個項目已讀取`);
  } while (pageToken);
  return all;
}

function buildDriveUrl(path, params = {}) {
  const url = new URL(`https://www.googleapis.com/drive/v3${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  if (!state.token && state.settings.apiKey) url.searchParams.set('key', state.settings.apiKey);
  return url.toString();
}

async function driveFetch(url, options = {}) {
  const requestUrl = String(url);
  if (state.settings.clientId && !options.skipAuth) {
    try {
      await ensureFreshTokenForRequest();
    } catch (error) {
      log(`授權更新失敗：${error.message}`, 'warn');
    }
  }

  const headers = new Headers(options.headers || {});
  if (state.token) headers.set('Authorization', `Bearer ${state.token}`);
  const rkHeader = buildResourceKeyHeader(options.itemId, options.resourceKey);
  if (rkHeader) headers.set('X-Goog-Drive-Resource-Keys', rkHeader);

  const fetchOptions = { ...options, headers };
  delete fetchOptions.retry401;
  delete fetchOptions.skipAuth;
  delete fetchOptions.resourceKey;
  delete fetchOptions.itemId;

  let res = await fetch(requestUrl, fetchOptions);

  if (res.status === 401 && options.retry401 !== false && state.settings.clientId) {
    log('Drive API 回傳 401，可能是 access token 過期或被撤銷；正在重新授權並重試一次。', 'warn');
    state.token = '';
    state.tokenExpiresAt = 0;
    updateAuthBadge();
    await requestAccessToken('');

    const retryHeaders = new Headers(options.headers || {});
    if (state.token) retryHeaders.set('Authorization', `Bearer ${state.token}`);
    if (rkHeader) retryHeaders.set('X-Goog-Drive-Resource-Keys', rkHeader);
    res = await fetch(requestUrl, { ...fetchOptions, headers: retryHeaders });
  }

  if (!res.ok) {
    let detail = '';
    try {
      const err = await res.json();
      detail = err?.error?.message || JSON.stringify(err);
    } catch (_) {
      detail = await res.text().catch(() => '');
    }
    throw new Error(`Drive API ${res.status}：${detail || res.statusText}`);
  }
  return res;
}

function buildResourceKeyHeader(itemId, resourceKey) {
  const pairs = [];
  const addPair = (id, key) => {
    if (id && key) pairs.push(`${id}/${key}`);
  };
  addPair(itemId, resourceKey);
  state.resourceKeys.forEach((key, id) => addPair(id, key));
  return Array.from(new Set(pairs)).join(',');
}

async function downloadZip() {
  if (state.busy || !state.files.length) return;
  const selectedFiles = getSelectedFiles();
  if (!selectedFiles.length) {
    alert('請至少勾選 1 個要下載的檔案。');
    return;
  }

  const accessOk = await ensureAccess();
  if (!accessOk) return;

  if (!state.buildSession) {
    const estimatedSize = selectedFiles.reduce((sum, file) => sum + (file.size || 0), 0);
    const estimatedParts = estimatePartCount(selectedFiles);
    const ok = confirm(`V1_4 將依目前勾選的檔案建立 ZIP：\n\n規則：每包最多 ${MAX_FILES_PER_PART} 個檔案；若未滿 ${MAX_FILES_PER_PART} 個但累計超過 ${SPLIT_ZIP_LIMIT_LABEL}，會先以 ${SPLIT_ZIP_LIMIT_LABEL} 分包。\n\n已勾選：${selectedFiles.length} / ${state.files.length} 個檔案\n可估大小：${formatBytes(estimatedSize)}\n預估分割包：${estimatedParts} 包\n\n是否開始？`);
    if (!ok) return;
    clearPartLinks();
    state.buildSession = createBuildSession(selectedFiles);
    renderPartLinks();
    setSelectionControlsDisabled(true);
  }

  const activeParts = getActiveBlobParts();
  if (activeParts.length) {
    alert('目前仍有分割 ZIP 暫存在瀏覽器記憶體中。請先下載並按「釋放暫存」後，再建立下一包。');
    log('為避免 iOS / 瀏覽器記憶體過高，請先釋放目前分割檔暫存後再建立下一包。', 'warn');
    return;
  }

  const session = state.buildSession;
  if (session.done || session.cursor >= session.files.length) {
    session.done = true;
    updateZipButtonLabel();
    setProgress(100, '所有分割檔已建立完成');
    log('所有勾選檔案已處理完成。若分割檔已下載，請確認暫存均已釋放。');
    return;
  }

  try {
    setBusy(true, `建立第 ${session.partIndex} 包...`);

    let zip = new SimpleZip();
    let currentFiles = [];
    let currentBytes = 0;
    let overLimit = false;

    while (session.cursor < session.files.length) {
      const file = session.files[session.cursor];
      const estimatedSize = Number(file.size || 0);

      if (currentFiles.length >= MAX_FILES_PER_PART) break;
      if (currentFiles.length && estimatedSize && currentBytes + estimatedSize > SPLIT_ZIP_LIMIT_BYTES) break;

      const progressBase = Math.round((session.cursor / session.files.length) * 90);
      setProgress(progressBase, `第 ${session.partIndex} 包下載中：${file.zipPath}`);

      try {
        const blob = await fetchFileBlob(file);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const incomingSize = bytes.byteLength;

        if (currentFiles.length && currentBytes + incomingSize > SPLIT_ZIP_LIMIT_BYTES && !estimatedSize) {
          log(`檔案實際大小會使本包超過 ${SPLIT_ZIP_LIMIT_LABEL}；此檔將延後到下一包重新下載：${file.zipPath}`, 'warn');
          break;
        }

        if (currentFiles.length && currentBytes + incomingSize > SPLIT_ZIP_LIMIT_BYTES) {
          log(`檔案實際大小使本包略超過 ${SPLIT_ZIP_LIMIT_LABEL}：${file.zipPath}`, 'warn');
        }

        zip.addFile(file.zipPath, bytes, file.modifiedTime);
        currentFiles.push({ ...file, actualSize: incomingSize });
        currentBytes += incomingSize;
        session.cursor += 1;
        session.completed += 1;
        log(`已加入第 ${session.partIndex} 包：${file.zipPath}｜${formatBytes(incomingSize)}｜本包 ${currentFiles.length}/${MAX_FILES_PER_PART} 檔`);

        if (incomingSize > SPLIT_ZIP_LIMIT_BYTES) {
          overLimit = true;
          break;
        }

        if (currentFiles.length >= MAX_FILES_PER_PART || currentBytes >= SPLIT_ZIP_LIMIT_BYTES * 0.96) break;
      } catch (error) {
        state.skipped.push({ name: file.name, reason: `下載失敗：${error.message}` });
        session.cursor += 1;
        session.completed += 1;
        log(`下載失敗：${file.zipPath}｜${error.message}`, 'error');
      }

      renderStats();
      if (currentFiles.length >= MAX_FILES_PER_PART || currentBytes >= SPLIT_ZIP_LIMIT_BYTES * 0.96) break;
    }

    if (!currentFiles.length) {
      if (session.cursor >= session.files.length) {
        session.done = true;
        setProgress(100, '所有檔案已處理完成');
        log('所有勾選檔案已處理完成，但最後沒有成功加入新檔案。請查看略過或錯誤紀錄。', 'warn');
      } else {
        setProgress(null, '本包沒有成功加入檔案');
        log('本包沒有成功加入檔案，請再試一次或查看錯誤紀錄。', 'warn');
      }
      updateZipButtonLabel();
      return;
    }

    setProgress(Math.round((session.cursor / session.files.length) * 95), `封裝第 ${session.partIndex} 包...`);
    const zipBlob = zip.toBlob();
    const fileName = `${session.baseName}_${session.timestamp}_part${String(session.partIndex).padStart(3, '0')}.zip`;
    const url = URL.createObjectURL(zipBlob);
    const part = {
      index: session.partIndex,
      fileName,
      url,
      size: zipBlob.size,
      count: currentFiles.length,
      overLimit,
      files: currentFiles.map((file) => file.zipPath),
      status: 'ready',
      createdAt: new Date().toISOString()
    };
    state.parts.push(part);
    log(`已建立第 ${session.partIndex} 包：${fileName}｜${formatBytes(zipBlob.size)}｜${currentFiles.length} 個檔案${overLimit ? '｜單檔超過 1GB' : ''}`);

    session.partIndex += 1;
    if (session.cursor >= session.files.length) session.done = true;

    renderPartLinks();
    updateZipButtonLabel();
    const pct = session.done ? 100 : Math.max(1, Math.round((session.cursor / session.files.length) * 100));
    setProgress(pct, session.done ? '最後一包已建立，請下載後釋放暫存' : `第 ${part.index} 包已建立，請下載並釋放暫存後建立下一包`);
  } catch (error) {
    log(`分割 ZIP 建立失敗：${error.message}`, 'error');
    alert(error.message);
  } finally {
    setBusy(false);
  }
}

function createBuildSession(files) {
  return {
    files: files.map((file) => ({ ...file })),
    cursor: 0,
    completed: 0,
    partIndex: 1,
    timestamp: formatTimestamp(new Date()),
    baseName: sanitizeName(state.settings.zipPrefix || 'DriveFetch'),
    done: false
  };
}

function getSelectedFiles() {
  return state.files.filter((file) => state.selectedFileIds.has(file.uid));
}

function estimatePartCount(files) {
  if (!files.length) return 0;
  let parts = 1;
  let count = 0;
  let bytes = 0;
  for (const file of files) {
    const size = Number(file.size || 0);
    const wouldExceedCount = count >= MAX_FILES_PER_PART;
    const wouldExceedBytes = count > 0 && size && bytes + size > SPLIT_ZIP_LIMIT_BYTES;
    if (wouldExceedCount || wouldExceedBytes) {
      parts += 1;
      count = 0;
      bytes = 0;
    }
    count += 1;
    bytes += size;
    if (size > SPLIT_ZIP_LIMIT_BYTES) {
      parts += 1;
      count = 0;
      bytes = 0;
    }
  }
  return Math.max(1, parts - (count === 0 ? 1 : 0));
}

function getActiveBlobParts() {
  return state.parts.filter((part) => part?.url && part.status !== 'released');
}

function updateZipButtonLabel() {
  if (!elements.zipBtn) return;
  const selectedCount = getSelectedFiles().length;
  if (!state.files.length || (!state.buildSession && !selectedCount)) {
    elements.zipBtn.textContent = '建立第 1 包';
    elements.zipBtn.disabled = true;
    return;
  }
  const session = state.buildSession;
  if (!session) {
    elements.zipBtn.textContent = '建立第 1 包';
    elements.zipBtn.disabled = Boolean(state.busy || !selectedCount);
    return;
  }
  if (session.done || session.cursor >= session.files.length) {
    elements.zipBtn.textContent = '全部完成';
    elements.zipBtn.disabled = true;
    return;
  }
  elements.zipBtn.textContent = `建立第 ${session.partIndex} 包`;
  elements.zipBtn.disabled = Boolean(state.busy || getActiveBlobParts().length);
}

function handlePartAction(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const index = Number(target.dataset.index || 0);
  if (!index) return;

  if (action === 'download-part') {
    window.setTimeout(() => markPartDownloaded(index, true), 300);
    return;
  }
  if (action === 'mark-downloaded') {
    markPartDownloaded(index, false);
    return;
  }
  if (action === 'release-part') {
    releasePartUrl(index);
  }
}

function markPartDownloaded(index, triggeredByDownload) {
  const part = state.parts.find((item) => item.index === index);
  if (!part || part.status === 'released') return;
  part.status = 'downloaded';
  part.downloadedAt = new Date().toISOString();
  renderPartLinks();
  log(`${triggeredByDownload ? '已觸發下載' : '已標記下載完成'}：${part.fileName}`);
}

function releasePartUrl(index) {
  const part = state.parts.find((item) => item.index === index);
  if (!part || part.status === 'released') return;
  if (part.status !== 'downloaded') {
    const ok = confirm(`「${part.fileName}」尚未標記為下載完成。

釋放暫存後，這個下載連結會失效；若還需要下載，必須重新掃描並重新建立。是否仍要釋放？`);
    if (!ok) return;
  }
  if (part.url) URL.revokeObjectURL(part.url);
  part.url = '';
  part.status = 'released';
  part.releasedAt = new Date().toISOString();
  renderPartLinks();
  updateZipButtonLabel();
  log(`已釋放暫存：${part.fileName}`);
}

function releaseAllPartUrls() {
  const active = getActiveBlobParts();
  if (!active.length) {
    log('目前沒有需要釋放的分割檔暫存。');
    return;
  }
  const notDownloaded = active.filter((part) => part.status !== 'downloaded');
  if (notDownloaded.length) {
    const ok = confirm(`仍有 ${notDownloaded.length} 個分割檔尚未標記下載完成。

釋放後下載連結會失效；若還需要下載，必須重新掃描並重新建立。是否仍要全部釋放？`);
    if (!ok) return;
  }
  active.forEach((part) => {
    if (part.url) URL.revokeObjectURL(part.url);
    part.url = '';
    part.status = 'released';
    part.releasedAt = new Date().toISOString();
  });
  renderPartLinks();
  updateZipButtonLabel();
  log(`已釋放 ${active.length} 個分割檔暫存。`);
}

async function fetchFileBlob(file) {
  let url;
  if (file.exportInfo) {
    url = buildDriveUrl(`/files/${encodeURIComponent(file.id)}/export`, {
      mimeType: file.exportInfo.mime,
      supportsAllDrives: 'true'
    });
  } else {
    url = buildDriveUrl(`/files/${encodeURIComponent(file.id)}`, {
      alt: 'media',
      supportsAllDrives: 'true'
    });
  }
  const res = await driveFetch(url, { resourceKey: file.resourceKey, itemId: file.id });
  return res.blob();
}

function extractDriveTarget(input) {
  let text = input.trim();
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  const url = new URL(text);
  const host = url.hostname.replace(/^www\./i, '');
  const pathname = url.pathname;
  const params = url.searchParams;
  const resourceKey = params.get('resourcekey') || params.get('resourceKey') || '';

  const make = (id, kind, service = 'drive') => ({ id, kind, service, resourceKey, originalUrl: url.toString() });
  const folderMatch = pathname.match(/\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/) || pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch?.[1]) return make(folderMatch[1], 'folder', 'drive');

  const fileMatch = pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch?.[1]) return make(fileMatch[1], 'file', 'drive');

  const workspaceMatch = pathname.match(/\/(document|spreadsheets|presentation|drawings|forms)\/d\/([a-zA-Z0-9_-]+)/);
  if (workspaceMatch?.[2]) {
    const service = workspaceMatch[1];
    const kindMap = { document: 'document', spreadsheets: 'spreadsheet', presentation: 'presentation', drawings: 'drawing', forms: 'form' };
    return make(workspaceMatch[2], kindMap[service] || 'workspace', service);
  }

  const idParam = params.get('id');
  if (idParam) {
    const kind = pathname.includes('/folders') ? 'folder' : 'file';
    return make(idParam, kind, host.includes('docs.google.com') ? 'docs' : 'drive');
  }

  throw new Error('找不到 Drive 檔案或資料夾 ID。');
}

function prepareDirectMode(target) {
  state.directTarget = target;
  renderStats();
  renderDirectTarget(target);

  if (target.kind === 'folder') {
    elements.directDownloadBtn.disabled = true;
    elements.zipBtn.disabled = true;
    setProgress(0, '資料夾需 API / OAuth 才能列出檔案');
    log('此連結是 Google Drive 資料夾。免 API 模式無法可靠列出資料夾內所有檔案；請到設定填入 OAuth Client ID 後再掃描。', 'warn');
    return;
  }

  const directUrl = buildDirectDownloadUrl(target);
  if (!directUrl) {
    elements.directDownloadBtn.disabled = true;
    setProgress(0, '此類型不支援免 API 直連下載');
    log('此類型無法使用免 API 直連下載。請改用 OAuth / Drive API 模式。', 'warn');
    return;
  }

  elements.directDownloadBtn.disabled = false;
  elements.zipBtn.disabled = true;
  setProgress(100, '已建立單一檔案直連');
  log('已建立免 API 單一檔案直連。此模式只會開啟 Google 原生下載/匯出連結，不會繞過網路控管或權限限制。');
}

function buildDirectDownloadUrl(target) {
  const id = encodeURIComponent(target.id);
  const rk = target.resourceKey ? `&resourcekey=${encodeURIComponent(target.resourceKey)}` : '';
  const pdfMode = state.settings.exportProfile === 'pdf';

  switch (target.kind) {
    case 'file':
      return `https://drive.google.com/uc?export=download&id=${id}${rk}`;
    case 'document':
      return `https://docs.google.com/document/d/${id}/export?format=${pdfMode ? 'pdf' : 'docx'}`;
    case 'spreadsheet':
      return `https://docs.google.com/spreadsheets/d/${id}/export?format=${pdfMode ? 'pdf' : 'xlsx'}`;
    case 'presentation':
      return `https://docs.google.com/presentation/d/${id}/export/${pdfMode ? 'pdf' : 'pptx'}`;
    case 'drawing':
      return `https://docs.google.com/drawings/d/${id}/export/png`;
    default:
      return '';
  }
}

function downloadDirectFile() {
  const url = elements.driveUrl.value.trim();
  if (!state.directTarget) {
    try {
      const target = extractDriveTarget(url);
      prepareDirectMode(target);
    } catch (error) {
      alert(error.message);
      log(`直連建立失敗：${error.message}`, 'error');
      return;
    }
  }

  const directUrl = buildDirectDownloadUrl(state.directTarget);
  if (!directUrl) {
    alert('此連結無法使用免 API 直連下載。資料夾與部分 Google 服務需使用 OAuth / Drive API。');
    return;
  }

  const opened = window.open(directUrl, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.href = directUrl;
  log('已開啟 Google 原生下載 / 匯出連結。若被公司網路或權限阻擋，需由 IT 或檔案擁有者處理。');
}

function renderDirectTarget(target) {
  elements.fileList.innerHTML = '';
  const directUrl = buildDirectDownloadUrl(target);
  const typeLabel = getTargetTypeLabel(target.kind);
  const row = document.createElement('div');
  row.className = 'file-item direct-item';
  row.innerHTML = `
    <div class="file-type">${escapeHtml(typeLabel.slice(0, 4).toUpperCase())}</div>
    <div class="file-main">
      <div class="file-name">${escapeHtml(typeLabel)}：${escapeHtml(target.id)}</div>
      <div class="file-path">${target.kind === 'folder' ? '資料夾清單需 Drive API；免 API 模式無法批次列出。' : '免 API 模式會開啟 Google 原生下載 / 匯出連結。'}</div>
    </div>
    <div class="file-size">${directUrl ? '直連' : '需 API'}</div>
  `;
  elements.fileList.appendChild(row);
  elements.listHint.textContent = target.kind === 'folder'
    ? '已辨識為資料夾。若要搜尋內部有幾個檔案並批次下載，必須使用 OAuth / Drive API。'
    : '已辨識為單一檔案。可使用「單檔直連」由瀏覽器開啟 Google 下載頁。';
}

function getTargetTypeLabel(kind) {
  return ({
    folder: '資料夾',
    file: '檔案',
    document: 'Google Docs',
    spreadsheet: 'Google Sheets',
    presentation: 'Google Slides',
    drawing: 'Google Drawing',
    form: 'Google Forms'
  })[kind] || 'Drive 項目';
}

function renderStats() {
  const selectedFiles = getSelectedFiles();
  const totalSize = selectedFiles.length ? selectedFiles.reduce((sum, file) => sum + (file.size || 0), 0) : state.files.reduce((sum, file) => sum + (file.size || 0), 0);
  const directFileCount = state.directTarget && state.directTarget.kind !== 'folder' ? 1 : 0;
  const directFolderCount = state.directTarget && state.directTarget.kind === 'folder' ? 1 : 0;
  elements.statFiles.textContent = String(state.files.length || directFileCount);
  elements.statFolders.textContent = String(state.folders || directFolderCount);
  elements.statSize.textContent = formatBytes(totalSize);
  elements.statSkipped.textContent = String(state.skipped.length);
  updateSelectionSummary();
  updateAuthBadge();
}

function renderFileList() {
  elements.fileList.innerHTML = '';
  if (!state.files.length) {
    elements.listHint.textContent = state.skipped.length ? '沒有可下載檔案；請查看執行紀錄。' : '掃描後會列出將被打包下載的檔案。';
    updateSelectionSummary();
    return;
  }
  elements.listHint.textContent = `共 ${state.files.length} 個檔案，已預設全選；可取消不需要下載的檔案。打包規則：每包最多 ${MAX_FILES_PER_PART} 檔，若超過 ${SPLIT_ZIP_LIMIT_LABEL} 則優先分包。`;
  const frag = document.createDocumentFragment();
  state.files.forEach((file, index) => {
    const row = document.createElement('label');
    row.className = 'file-item selectable-file';
    const type = file.exportInfo ? file.exportInfo.ext : guessType(file.name, file.mimeType);
    const checked = state.selectedFileIds.has(file.uid) ? 'checked' : '';
    row.innerHTML = `
      <input class="file-check" type="checkbox" data-uid="${escapeHtml(file.uid)}" ${checked} aria-label="選擇 ${escapeHtml(file.name)}" />
      <div class="file-type">${escapeHtml(type.slice(0, 4).toUpperCase())}</div>
      <div class="file-main">
        <div class="file-name">${escapeHtml(file.name)}</div>
        <div class="file-path">${index + 1}. ${escapeHtml(file.zipPath)}</div>
      </div>
      <div class="file-size">${file.size ? formatBytes(file.size) : (file.exportInfo ? '匯出' : '未知')}</div>
    `;
    frag.appendChild(row);
  });
  elements.fileList.appendChild(frag);
  updateSelectionSummary();
}

function handleFileSelectionChange(event) {
  const input = event.target.closest('.file-check');
  if (!input || state.buildSession) return;
  const uid = input.dataset.uid || '';
  if (!uid) return;
  if (input.checked) state.selectedFileIds.add(uid);
  else state.selectedFileIds.delete(uid);
  updateSelectionSummary();
  renderStats();
  updateZipButtonLabel();
}

function setAllSelections(selected) {
  if (state.buildSession) {
    alert('分割檔建立流程已開始，為避免檔案清單不一致，請先清除結果後再重新勾選。');
    return;
  }
  state.selectedFileIds = selected ? new Set(state.files.map((file) => file.uid)) : new Set();
  renderFileList();
  renderStats();
  updateZipButtonLabel();
}

function invertSelections() {
  if (state.buildSession) {
    alert('分割檔建立流程已開始，為避免檔案清單不一致，請先清除結果後再重新勾選。');
    return;
  }
  const next = new Set();
  state.files.forEach((file) => {
    if (!state.selectedFileIds.has(file.uid)) next.add(file.uid);
  });
  state.selectedFileIds = next;
  renderFileList();
  renderStats();
  updateZipButtonLabel();
}

function setSelectionControlsDisabled(disabled) {
  [elements.selectAllBtn, elements.selectNoneBtn, elements.invertSelectionBtn].forEach((btn) => { if (btn) btn.disabled = disabled; });
  elements.fileList?.querySelectorAll('.file-check').forEach((input) => { input.disabled = disabled; });
}

function updateSelectionSummary() {
  if (!elements.selectedSummary) return;
  if (!state.files.length) {
    elements.selectedSummary.textContent = '尚未掃描';
    return;
  }
  const selectedFiles = getSelectedFiles();
  const selectedSize = selectedFiles.reduce((sum, file) => sum + (file.size || 0), 0);
  const estimatedParts = estimatePartCount(selectedFiles);
  elements.selectedSummary.textContent = `已勾選 ${selectedFiles.length} / ${state.files.length} 個｜估計 ${formatBytes(selectedSize)}｜預估 ${estimatedParts} 包`;
}

function clearPartLinks() {
  if (Array.isArray(state.parts)) {
    state.parts.forEach((part) => {
      if (part?.url) URL.revokeObjectURL(part.url);
    });
  }
  state.parts = [];
}

function renderPartLinks() {
  if (!elements.partList || !elements.splitHint) return;
  elements.partList.innerHTML = '';
  const activeCount = getActiveBlobParts().length;
  if (elements.clearTempBtn) elements.clearTempBtn.disabled = activeCount === 0;

  if (!state.parts.length) {
    elements.splitHint.textContent = `建立後會在此產生目前分割 ZIP 的下載連結。規則：每包最多 ${MAX_FILES_PER_PART} 檔，且目標不超過 ${SPLIT_ZIP_LIMIT_LABEL}；下載後請釋放暫存。`;
    return;
  }

  const session = state.buildSession;
  const doneText = session?.done ? '全部分割檔已建立完成。' : '釋放暫存後可建立下一包。';
  elements.splitHint.textContent = `已建立 ${state.parts.length} 個分割檔，目前 ${activeCount} 個仍佔用瀏覽器暫存。${doneText}`;

  const frag = document.createDocumentFragment();
  state.parts.forEach((part) => {
    const row = document.createElement('div');
    row.className = `part-item${part.overLimit ? ' over-limit' : ''}${part.status === 'released' ? ' released' : ''}`;
    const preview = (part.files || []).slice(0, 3).map((name) => escapeHtml(name)).join('<br>');
    const more = part.files && part.files.length > 3 ? `<br>另有 ${part.files.length - 3} 個檔案...` : '';
    const statusLabel = getPartStatusLabel(part);
    const downloadAction = part.url
      ? `<a class="download-link" href="${part.url}" download="${escapeHtml(part.fileName)}" data-action="download-part" data-index="${part.index}">下載</a>`
      : `<span class="download-link disabled-link">已釋放</span>`;
    const markAction = part.url && part.status !== 'downloaded'
      ? `<button class="part-btn" data-action="mark-downloaded" data-index="${part.index}">標記已下載</button>`
      : '';
    const releaseAction = part.url
      ? `<button class="part-btn danger" data-action="release-part" data-index="${part.index}">釋放暫存</button>`
      : '';
    row.innerHTML = `
      <div class="part-index">${String(part.index).padStart(2, '0')}</div>
      <div class="part-main">
        <div class="part-name">${escapeHtml(part.fileName)}</div>
        <div class="part-meta">${formatBytes(part.size)}｜${part.count} 個檔案｜${statusLabel}${part.overLimit ? '｜單一檔案超過 1GB，已獨立成包' : ''}</div>
        <div class="part-files">${preview}${more}</div>
      </div>
      <div class="part-actions">
        ${downloadAction}
        ${markAction}
        ${releaseAction}
      </div>
    `;
    frag.appendChild(row);
  });
  elements.partList.appendChild(frag);
}

function getPartStatusLabel(part) {
  if (part.status === 'released') return '已釋放暫存';
  if (part.status === 'downloaded') return '已標記下載';
  return '待下載，暫存中';
}

function resetResults(clearInput = true) {
  clearPartLinks();
  state.files = [];
  state.selectedFileIds = new Set();
  state.folders = 0;
  state.skipped = [];
  state.directTarget = null;
  state.resourceKeys = new Map();
  state.parts = [];
  state.buildSession = null;
  if (clearInput) elements.driveUrl.value = '';
  elements.fileList.innerHTML = '';
  elements.zipBtn.disabled = true;
  elements.directDownloadBtn.disabled = true;
  renderPartLinks();
  setSelectionControlsDisabled(false);
  updateSelectionSummary();
  setProgress(0, '尚未開始');
  renderStats();
  updateZipButtonLabel();
  log('已清除結果。');
}

function setBusy(busy, label = '') {
  state.busy = busy;
  [elements.loginBtn, elements.scanBtn, elements.zipBtn, elements.directDownloadBtn, elements.saveSettingsBtn, elements.testAuthBtn].forEach((btn) => {
    if (!btn) return;
    if (btn === elements.zipBtn) btn.disabled = busy || !state.files.length || Boolean(getActiveBlobParts().length) || Boolean(state.buildSession?.done);
    else if (btn === elements.directDownloadBtn) btn.disabled = busy || !state.directTarget || !buildDirectDownloadUrl(state.directTarget);
    else btn.disabled = busy;
  });
  [elements.selectAllBtn, elements.selectNoneBtn, elements.invertSelectionBtn].forEach((btn) => { if (btn) btn.disabled = busy || Boolean(state.buildSession); });
  elements.fileList?.querySelectorAll('.file-check').forEach((input) => { input.disabled = busy || Boolean(state.buildSession); });
  if (elements.clearTempBtn) elements.clearTempBtn.disabled = busy || getActiveBlobParts().length === 0;
  updateZipButtonLabel();
  if (label) setProgress(null, label);
}

function setProgress(percent, label) {
  if (typeof percent === 'number') {
    const clamped = Math.max(0, Math.min(100, percent));
    elements.progressBar.style.width = `${clamped}%`;
    elements.progressPct.textContent = `${clamped}%`;
  }
  if (label) elements.progressLabel.textContent = label;
}

function log(message, level = 'info') {
  const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
  const prefix = level === 'error' ? '✖' : level === 'warn' ? '▲' : '•';
  elements.logBox.textContent = `[${time}] ${prefix} ${message}\n` + elements.logBox.textContent;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function sanitizeName(name) {
  return String(name || 'untitled')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || 'untitled';
}

function ensureExtension(name, ext) {
  if (!ext) return name;
  const suffix = `.${ext}`;
  return name.toLowerCase().endsWith(suffix.toLowerCase()) ? name : `${name}${suffix}`;
}

function uniqueZipPath(path) {
  const normalized = path.replace(/^\/+/, '') || 'file';
  const existing = new Set(state.files.map((file) => file.zipPath));
  if (!existing.has(normalized)) return normalized;
  const dot = normalized.lastIndexOf('.');
  const base = dot > -1 ? normalized.slice(0, dot) : normalized;
  const ext = dot > -1 ? normalized.slice(dot) : '';
  let i = 2;
  while (existing.has(`${base} (${i})${ext}`)) i += 1;
  return `${base} (${i})${ext}`;
}

function guessType(name, mime = '') {
  const ext = String(name).split('.').pop();
  if (ext && ext !== name && ext.length <= 5) return ext;
  if (mime.includes('image/')) return 'img';
  if (mime.includes('video/')) return 'vid';
  if (mime.includes('audio/')) return 'aud';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('zip') || mime.includes('compressed')) return 'zip';
  return 'file';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./service-worker.js');
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          log('偵測到新版快取，重新開啟 App 後套用。');
        }
      });
    });
  } catch (error) {
    log(`Service Worker 註冊失敗：${error.message}`, 'warn');
  }
}

async function checkForUpdatesSilent() {
  try { await checkForUpdates(false); } catch (_) {}
}

async function checkForUpdatesManual() {
  elements.updateStatus.textContent = '檢查中...';
  try { await checkForUpdates(true); } catch (error) { elements.updateStatus.textContent = `檢查失敗：${error.message}`; }
}

async function checkForUpdates(showResult) {
  const versionUrl = window.DRIVEFETCH_UPDATE?.versionUrl || './version.json';
  const response = await fetch(`${versionUrl}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`version.json ${response.status}`);
  const data = await response.json();
  const remoteVersion = data.version || APP_VERSION;
  if (remoteVersion !== APP_VERSION) {
    elements.updateStatus.textContent = `發現新版 ${remoteVersion}，將更新快取。`;
    log(`發現新版：${remoteVersion}`);
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.update();
  } else if (showResult) {
    elements.updateStatus.textContent = `目前已是最新：${APP_VERSION}`;
  }
}

class SimpleZip {
  constructor() { this.files = []; }

  addFile(path, data, modifiedTime = '') {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const nameBytes = new TextEncoder().encode(path.replace(/^\/+/, ''));
    const crc = crc32(bytes);
    const dos = dateToDos(modifiedTime ? new Date(modifiedTime) : new Date());
    this.files.push({ nameBytes, bytes, crc, dos, path });
  }

  toBlob() {
    const chunks = [];
    const central = [];
    let offset = 0;

    for (const file of this.files) {
      const localHeader = new Uint8Array(30 + file.nameBytes.length);
      const view = new DataView(localHeader.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, file.dos.time, true);
      view.setUint16(12, file.dos.date, true);
      view.setUint32(14, file.crc, true);
      view.setUint32(18, file.bytes.length, true);
      view.setUint32(22, file.bytes.length, true);
      view.setUint16(26, file.nameBytes.length, true);
      view.setUint16(28, 0, true);
      localHeader.set(file.nameBytes, 30);
      chunks.push(localHeader, file.bytes);

      const centralHeader = new Uint8Array(46 + file.nameBytes.length);
      const cv = new DataView(centralHeader.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, file.dos.time, true);
      cv.setUint16(14, file.dos.date, true);
      cv.setUint32(16, file.crc, true);
      cv.setUint32(20, file.bytes.length, true);
      cv.setUint32(24, file.bytes.length, true);
      cv.setUint16(28, file.nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      centralHeader.set(file.nameBytes, 46);
      central.push(centralHeader);

      offset += localHeader.length + file.bytes.length;
    }

    const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
    chunks.push(...central);

    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, this.files.length, true);
    ev.setUint16(10, this.files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);
    chunks.push(end);

    return new Blob(chunks, { type: 'application/zip' });
  }
}

function dateToDos(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
