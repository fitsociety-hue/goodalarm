// =============================================================
//  Good Alarm - Backend v5.5 (Google Apps Script)
//
//  ★★★ v5.5 근본 해결책 ★★★
//  [해결1] getSheet() → BACKEND_SS_ID 기반 openById() 사용
//           onFormSubmitHandler 크로스-시트 컨텍스트 버그 제거
//  [해결2] 시트 초기화 감지: totalRows < lastChecked → 자동 리셋
//  [해결3] forceRescan API 추가 → 대시보드에서 즉시 미수신 재발송
//  [해결4] onChange 트리거 추가: onFormSubmit 외에 변경 감지 2중화
//  [해결5] GAS_REQUIRED_VERSION = 55 → 배포 후 버전 자동 검증
//
//  ─────────────────────────────────────────
//  [GAS 배포 방법]
//  1. 이 코드 전체를 GAS 편집기에 붙여넣기
//  2. Ctrl+S 저장
//  3. 배포 → 배포 관리 → ✏️ → 새 버전 선택 → 배포
//  4. [필수] 에디터에서 reinstallAllTriggers 함수 직접 실행
//  5. 대시보드에서 새 배포 URL 입력 후 저장
// =============================================================

const GAS_VERSION = 55; // 5.5

// =============================================================
//  백엔드 스프레드시트 안전 접근
//  - doGet/doPost/time-trigger: getActiveSpreadsheet() → 저장
//  - onFormSubmit trigger (타겟 시트 컨텍스트): openById() → 정상
// =============================================================
function getBackendSs() {
  const props = PropertiesService.getScriptProperties();
  const id    = props.getProperty('BACKEND_SS_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); }
    catch (ex) { Logger.log('[getBackendSs] openById 실패: ' + ex.message); }
  }
  // fallback: active spreadsheet (doPost/doGet/time-trigger에서 동작)
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      props.setProperty('BACKEND_SS_ID', ss.getId());
      Logger.log('[getBackendSs] BACKEND_SS_ID 자동저장: ' + ss.getId());
      return ss;
    }
  } catch (ex) { Logger.log('[getBackendSs] fallback 실패: ' + ex.message); }
  return null;
}

function getSheet(name) {
  const ss = getBackendSs();
  if (!ss) { Logger.log(`[getSheet] 백엔드 SS 없음! name=${name}`); return null; }
  return ss.getSheetByName(name);
}

// =============================================================
//  DB 초기화 (BACKEND_SS_ID 저장 포함)
// =============================================================
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('BACKEND_SS_ID', ss.getId());
  Logger.log('[setup] BACKEND_SS_ID=' + ss.getId());

  const schemas = {
    'Users':     ['userId', 'name', 'team', 'password'],
    'ConfigsV2': ['configId', 'userId', 'name', 'sheetUrl', 'chatWebhook',
                  'lastCheckedRow', 'startDate', 'endDate', 'weekdaysOnly', 'formTriggerId'],
    'Logs':      ['timestamp', 'userId', 'message']
  };
  Object.entries(schemas).forEach(([name, headers]) => {
    if (!ss.getSheetByName(name)) ss.insertSheet(name).appendRow(headers);
  });
  const cfgSheet = ss.getSheetByName('ConfigsV2');
  if (cfgSheet && cfgSheet.getLastColumn() < 10) cfgSheet.getRange(1, 10).setValue('formTriggerId');
}

// =============================================================
//  폴링 트리거 확인 (doPost마다, 5분 캐시)
// =============================================================
function ensurePollingTrigger() {
  try {
    const props = PropertiesService.getScriptProperties();
    const last  = parseInt(props.getProperty('pollingChecked') || '0');
    if (Date.now() - last < 5 * 60 * 1000) return;
    const exists = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'checkAndSendAlarms');
    if (!exists) {
      ScriptApp.newTrigger('checkAndSendAlarms').timeBased().everyMinutes(1).create();
      Logger.log('✅ [ensurePollingTrigger] 폴링 트리거 재설치');
    }
    props.setProperty('pollingChecked', String(Date.now()));
  } catch (ex) { Logger.log('[ensurePollingTrigger] 오류: ' + ex.message); }
}

// =============================================================
//  onFormSubmit 트리거 설치
// =============================================================
function installFormTrigger(sheetUrl) {
  try {
    const targetSs = SpreadsheetApp.openByUrl(sheetUrl);
    const ssId     = targetSs.getId();
    const existing = ScriptApp.getProjectTriggers().find(t =>
      t.getHandlerFunction() === 'onFormSubmitHandler' && t.getTriggerSourceId() === ssId
    );
    if (existing) {
      Logger.log(`[installFormTrigger] 기존 재사용: ${existing.getUniqueId()}`);
      return existing.getUniqueId();
    }
    const trigger = ScriptApp.newTrigger('onFormSubmitHandler').forSpreadsheet(targetSs).onFormSubmit().create();
    Logger.log(`[installFormTrigger] ✅ 신규: ${trigger.getUniqueId()} (ssId=${ssId})`);
    return trigger.getUniqueId();
  } catch (ex) { Logger.log(`[installFormTrigger] 실패: ${ex.message}`); return ''; }
}

function removeFormTrigger(triggerId) {
  if (!triggerId) return;
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getUniqueId() === triggerId) ScriptApp.deleteTrigger(t); });
}

// =============================================================
//  doPost: API 라우터
// =============================================================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return jsonResponse({ success: false, message: 'No payload' });
    const data = JSON.parse(e.postData.contents);
    setup();
    ensurePollingTrigger();

    const routes = {
      register:       () => handleRegister(data),
      login:          () => handleLogin(data),
      getConfig:      () => handleGetConfig(data),
      addConfig:      () => handleAddConfig(data),
      updateConfig:   () => handleUpdateConfig(data),
      deleteConfig:   () => handleDeleteConfig(data),
      getLogs:        () => handleGetLogs(data),
      testWebhook:    () => handleTestWebhook(data),
      runCheckNow:    () => handleRunCheckNow(data),
      forceRescan:    () => handleForceRescan(data),   // ★ v5.5 신규
      checkVersion:   () => ({ success: true, version: GAS_VERSION, message: `Good Alarm Backend V${GAS_VERSION}` }),
    };

    const action = data.action;
    if (!routes[action]) return jsonResponse({ success: false, message: `알 수 없는 액션: ${action}` });
    return jsonResponse(routes[action]());
  } catch (err) {
    Logger.log('[doPost] 예외: ' + err.stack);
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// =============================================================
//  회원가입 / 로그인
// =============================================================
function handleRegister({ name, team, password }) {
  const sheet = getSheet('Users'); const data = sheet.getDataRange().getValues(); const userId = `${name}_${team}`;
  for (let i = 1; i < data.length; i++) { if (data[i][0] === userId) return { success: false, message: '이미 존재하는 사용자입니다.' }; }
  sheet.appendRow([userId, name, team, password]);
  return { success: true, userId, name, team };
}

function handleLogin({ name, team, password }) {
  const sheet = getSheet('Users'); const data = sheet.getDataRange().getValues(); const userId = `${name}_${team}`;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId && String(data[i][3]) === String(password)) return { success: true, userId, name, team };
  }
  return { success: false, message: '이름, 팀명, 비밀번호를 확인해주세요.' };
}

// =============================================================
//  설정 CRUD
// =============================================================
function handleGetConfig({ userId }) {
  const sheet = getSheet('ConfigsV2');
  if (!sheet) return { success: true, configs: [] };
  const data = sheet.getDataRange().getValues(); const TZ = 'Asia/Seoul'; const configs = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] !== userId) continue;
    configs.push({
      configId: data[i][0], name: data[i][2], sheetUrl: data[i][3], chatWebhook: data[i][4],
      lastCheckedRow: parseInt(data[i][5]) || 0,
      startDate: fmtDate(data[i][6], TZ), endDate: fmtDate(data[i][7], TZ),
      weekdaysOnly: data[i][8] === true || String(data[i][8]).toLowerCase() === 'true',
      formTriggerId: String(data[i][9] || '').trim(),
    });
  }
  return { success: true, configs };
}

function handleAddConfig({ userId, name, sheetUrl, chatWebhook, startDate, endDate, weekdaysOnly }) {
  const sheet = getSheet('ConfigsV2');
  let lastCheckedRow = 0, formTriggerId = '';
  if (sheetUrl) {
    try { lastCheckedRow = getTargetSheet(sheetUrl).getLastRow(); formTriggerId = installFormTrigger(sheetUrl); }
    catch (e) { return { success: false, message: `스프레드시트 접근 불가: ${e.message}` }; }
  }
  const configId = Utilities.getUuid();
  sheet.appendRow([configId, userId, name, sheetUrl, chatWebhook, lastCheckedRow, startDate || '', endDate || '', weekdaysOnly || false, formTriggerId]);
  PropertiesService.getScriptProperties().setProperty('pollingChecked', '0');
  return { success: true, message: `설정이 추가되었습니다. ⚡ 즉시 알람이 활성화됩니다.` };
}

function handleUpdateConfig({ userId, configId, name, sheetUrl, chatWebhook, startDate, endDate, weekdaysOnly }) {
  const sheet = getSheet('ConfigsV2'); const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== configId || data[i][1] !== userId) continue;
    const oldUrl = String(data[i][3]).trim(), newUrl = String(sheetUrl).trim();
    let lastCheckedRow = parseInt(data[i][5]) || 0, formTriggerId = String(data[i][9] || '').trim();
    if (oldUrl !== newUrl && newUrl) {
      if (formTriggerId) removeFormTrigger(formTriggerId);
      try { lastCheckedRow = getTargetSheet(newUrl).getLastRow(); formTriggerId = installFormTrigger(newUrl); }
      catch (e) { return { success: false, message: `새 스프레드시트 접근 불가: ${e.message}` }; }
    }
    sheet.getRange(i+1,3).setValue(name); sheet.getRange(i+1,4).setValue(sheetUrl);
    sheet.getRange(i+1,5).setValue(chatWebhook); sheet.getRange(i+1,6).setValue(lastCheckedRow);
    sheet.getRange(i+1,7).setValue(startDate||''); sheet.getRange(i+1,8).setValue(endDate||'');
    sheet.getRange(i+1,9).setValue(weekdaysOnly||false); sheet.getRange(i+1,10).setValue(formTriggerId);
    PropertiesService.getScriptProperties().setProperty('pollingChecked', '0');
    return { success: true, message: '저장되었습니다.' };
  }
  return { success: false, message: '설정을 찾을 수 없습니다.' };
}

function handleDeleteConfig({ userId, configId }) {
  const sheet = getSheet('ConfigsV2'); const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== configId || data[i][1] !== userId) continue;
    removeFormTrigger(String(data[i][9] || '').trim()); sheet.deleteRow(i + 1);
    return { success: true, message: '삭제되었습니다.' };
  }
  return { success: false, message: '설정을 찾을 수 없거나 권한이 없습니다.' };
}

// =============================================================
//  로그 조회
// =============================================================
function handleGetLogs({ userId }) {
  const sheet = getSheet('Logs'); if (!sheet) return { success: true, logs: [] };
  const data = sheet.getDataRange().getValues(); const logs = [];
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] !== userId) continue;
    logs.push({ timestamp: data[i][0], message: String(data[i][2]) });
    if (logs.length >= 100) break;
  }
  return { success: true, logs };
}

// =============================================================
//  웹훅 테스트
// =============================================================
function handleTestWebhook({ userId, configId }) {
  const sheet = getSheet('ConfigsV2'); if (!sheet) return { success: false, message: 'ConfigsV2 없음' };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() !== String(configId).trim()) continue;
    if (String(data[i][1]).trim() !== String(userId).trim())   continue;
    const configName = data[i][2], chatWebhook = String(data[i][4]).trim();
    if (!chatWebhook) return { success: false, message: '웹훅 URL이 등록되지 않았습니다.' };
    const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    const ok  = sendWebhook(chatWebhook, `✅ [Good Alarm 테스트]\n*${configName}* 웹훅 연결 성공!\n시각: ${now}`);
    appendLog(userId, ok ? `[테스트] [${configName}] 웹훅 연결 성공 ✅` : `[테스트] [${configName}] 웹훅 전송 실패 ❌`);
    return { success: ok, message: ok ? '구글 챗으로 테스트 메시지를 발송했습니다!' : '웹훅 전송 실패. URL을 확인해주세요.' };
  }
  return { success: false, message: '설정을 찾을 수 없습니다.' };
}

// =============================================================
//  즉시 확인 & 발송 (lastCheckedRow 리셋 포함)
// =============================================================
function handleRunCheckNow({ userId, configId }) {
  const sheet = getSheet('ConfigsV2'); if (!sheet) return { success: false, message: 'ConfigsV2 없음' };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() !== String(configId).trim()) continue;
    if (String(data[i][1]).trim() !== String(userId).trim())   continue;
    const configName = data[i][2], sheetUrl = String(data[i][3]).trim(), chatWebhook = String(data[i][4]).trim();
    let lastCheckedRow = parseInt(data[i][5]) || 0;
    if (!sheetUrl)    return { success: false, message: '스프레드시트 URL 미등록' };
    if (!chatWebhook) return { success: false, message: '웹훅 URL 미등록' };
    let targetData, totalRows, headers;
    try { const ds = getTargetSheet(sheetUrl); targetData = ds.getDataRange().getValues(); totalRows = targetData.length; headers = targetData[0] || []; }
    catch (ex) { return { success: false, message: `시트 접근 오류: ${ex.message}` }; }

    // ★ 시트 초기화 감지
    if (lastCheckedRow >= totalRows) {
      sheet.getRange(i + 1, 6).setValue(0); lastCheckedRow = 0;
      Logger.log(`[runCheckNow] [${configName}] lastCheckedRow 리셋`);
    }
    const startRow = Math.max(lastCheckedRow, 1);
    if (totalRows <= startRow) return { success: true, message: `새 데이터 없음. (총 ${totalRows}행, 마지막확인 ${lastCheckedRow}행)` };

    let sentCount = 0;
    for (let r = startRow; r < totalRows; r++) {
      const rowData = targetData[r];
      if (!rowData || rowData.every(c => String(c).trim() === '')) continue;
      const msg = buildMessage(configName, headers, rowData);
      if (sendWebhook(chatWebhook, msg)) { appendLog(userId, `[${configName}] ⚡즉시 발송 성공 (row ${r+1})\n${msg}`); sentCount++; }
      else { appendLog(userId, `[${configName}] ❌즉시 발송 실패 (row ${r+1})`); }
    }
    sheet.getRange(i + 1, 6).setValue(totalRows);
    return { success: true, message: `${sentCount}건 구글 챗 발송 완료!` };
  }
  return { success: false, message: '설정을 찾을 수 없습니다.' };
}

// =============================================================
//  ★ v5.5 신규: forceRescan - lastCheckedRow를 0으로 강제 리셋
//  대시보드의 "미수신 재발송" 버튼에서 호출
// =============================================================
function handleForceRescan({ userId, configId }) {
  const sheet = getSheet('ConfigsV2'); if (!sheet) return { success: false, message: 'ConfigsV2 없음' };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() !== String(configId).trim()) continue;
    if (String(data[i][1]).trim() !== String(userId).trim())   continue;
    const configName = data[i][2], sheetUrl = String(data[i][3]).trim(), chatWebhook = String(data[i][4]).trim();
    if (!sheetUrl || !chatWebhook) return { success: false, message: 'URL/웹훅 미등록' };

    // lastCheckedRow를 0으로 리셋 → 전체 재스캔
    sheet.getRange(i + 1, 6).setValue(0);
    appendLog(userId, `[${configName}] 🔄 강제 재스캔 요청 → lastCheckedRow 리셋`);

    // 즉시 발송 시도
    let targetData, totalRows, headers;
    try { const ds = getTargetSheet(sheetUrl); targetData = ds.getDataRange().getValues(); totalRows = targetData.length; headers = targetData[0] || []; }
    catch (ex) { return { success: false, message: `시트 접근 오류: ${ex.message}` }; }

    if (totalRows <= 1) return { success: true, message: '발송할 데이터 없음 (헤더만 존재)' };

    let sentCount = 0;
    for (let r = 1; r < totalRows; r++) {
      const rowData = targetData[r];
      if (!rowData || rowData.every(c => String(c).trim() === '')) continue;
      const msg = buildMessage(configName, headers, rowData);
      if (sendWebhook(chatWebhook, msg)) { appendLog(userId, `[${configName}] 🔄재스캔 발송 성공 (row ${r+1})\n${msg}`); sentCount++; }
      else { appendLog(userId, `[${configName}] ❌재스캔 발송 실패 (row ${r+1})`); }
    }
    sheet.getRange(i + 1, 6).setValue(totalRows);
    return { success: true, message: `🔄 강제 재스캔 완료! ${sentCount}건 발송, 이후 신규 데이터는 자동 알람됩니다.` };
  }
  return { success: false, message: '설정을 찾을 수 없습니다.' };
}

// =============================================================
//  ★ 폼 제출 즉시 알람 핸들러
//  v5.5: getSheet()가 BACKEND_SS_ID로 백엔드에 안전하게 접근
// =============================================================
function onFormSubmitHandler(e) {
  Logger.log('[onFormSubmitHandler] ⚡ 폼 제출 트리거 실행!');
  try {
    const ss = e.source, srcSheet = e.range.getSheet();
    const submittedRow = e.range.getRow(), ssId = ss.getId(), srcSheetId = srcSheet.getSheetId();
    Logger.log(`[onFormSubmitHandler] ssId=${ssId}, srcSheetId=${srcSheetId}, row=${submittedRow}`);

    const cfgSheet = getSheet('ConfigsV2');
    if (!cfgSheet) {
      Logger.log('[onFormSubmitHandler] ❌ ConfigsV2 없음! reinstallAllTriggers 실행 필요');
      return;
    }
    const cfgData = cfgSheet.getDataRange().getValues();
    const TZ = 'Asia/Seoul';
    const todayStr = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
    const nowKST = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
    const day = nowKST.getDay();

    Logger.log(`[onFormSubmitHandler] 오늘=${todayStr}, 요일=${day}, 설정수=${cfgData.length - 1}`);

    for (let i = 1; i < cfgData.length; i++) {
      const configName = cfgData[i][2], sheetUrl = String(cfgData[i][3] || '').trim();
      const chatWebhook = String(cfgData[i][4] || '').trim(), userId = cfgData[i][1];
      const startDate = fmtDate(cfgData[i][6], TZ), endDate = fmtDate(cfgData[i][7], TZ);
      const weekdaysOnly = cfgData[i][8] === true || String(cfgData[i][8]).toLowerCase() === 'true';

      if (!sheetUrl || !chatWebhook) continue;
      if (startDate && todayStr < startDate) continue;
      if (endDate   && todayStr > endDate)   continue;
      if (weekdaysOnly && (day === 0 || day === 6)) continue;

      try {
        const cfgSsId = SpreadsheetApp.openByUrl(sheetUrl).getId();
        if (cfgSsId !== ssId) { Logger.log(`  → ssId 불일치, 건너뜀`); continue; }
        const gidMatches = [...sheetUrl.matchAll(/[?&#]gid=([0-9]+)/g)];
        if (gidMatches.length > 0) {
          const cfgGid = parseInt(gidMatches[gidMatches.length - 1][1], 10);
          if (srcSheetId !== cfgGid) { Logger.log(`  → GID 불일치(설정=${cfgGid}, 폼=${srcSheetId})`); continue; }
        }
        Logger.log(`  → 매칭 성공! [${configName}]`);
      } catch (ex) { Logger.log(`[onFormSubmitHandler] URL비교 오류: ${ex.message}`); continue; }

      const lastCol = srcSheet.getLastColumn();
      const headers = srcSheet.getRange(1, 1, 1, lastCol).getValues()[0];
      const rowData = srcSheet.getRange(submittedRow, 1, 1, lastCol).getValues()[0];
      if (!rowData || rowData.every(c => String(c).trim() === '')) continue;

      const msg = buildMessage(configName, headers, rowData);
      const ok  = sendWebhook(chatWebhook, msg);
      Logger.log(`[onFormSubmitHandler] [${configName}] ${ok ? '✅' : '❌'}`);
      appendLog(userId, ok ? `[${configName}] ⚡즉시 발송 성공 (row ${submittedRow})\n${msg}` : `[${configName}] ❌즉시 발송 실패 (row ${submittedRow})`);
      cfgSheet.getRange(i + 1, 6).setValue(srcSheet.getLastRow());
    }
  } catch (ex) { Logger.log('[onFormSubmitHandler] 예외: ' + ex.stack); }
}

// =============================================================
//  ★ 1분 폴링 백업
//  v5.5: 시트 초기화 감지(totalRows < lastChecked → 리셋) 포함
// =============================================================
function checkAndSendAlarms() {
  Logger.log('[polling] 시작 v5.5');
  const sheet = getSheet('ConfigsV2');
  if (!sheet || sheet.getLastRow() < 2) { Logger.log('[polling] 설정 없음'); return; }

  const data = sheet.getDataRange().getValues();
  const TZ = 'Asia/Seoul';
  const todayStr = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const nowKST   = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const day = nowKST.getDay(), hour = nowKST.getHours();

  // 폼 트리거 자동 검증·재설치
  try {
    const allTriggers = ScriptApp.getProjectTriggers();
    for (let i = 1; i < data.length; i++) {
      const sheetUrl = String(data[i][3] || '').trim(), existingId = String(data[i][9] || '').trim();
      if (!sheetUrl) continue;
      const isActive = existingId && allTriggers.some(t => t.getUniqueId() === existingId);
      if (!isActive) {
        const newId = installFormTrigger(sheetUrl);
        if (newId) { sheet.getRange(i + 1, 10).setValue(newId); Logger.log(`✅ [polling] [${data[i][2]}] 트리거 재설치: ${newId}`); }
      }
    }
  } catch (ex) { Logger.log('[polling] 트리거검증 오류: ' + ex.message); }

  // 누락 응답 발송
  for (let i = 1; i < data.length; i++) {
    const userId = data[i][1], configName = data[i][2];
    const sheetUrl = String(data[i][3] || '').trim(), chatWebhook = String(data[i][4] || '').trim();
    let lastChecked = parseInt(data[i][5]) || 0;
    const startDate = fmtDate(data[i][6], TZ), endDate = fmtDate(data[i][7], TZ);
    const weekdaysOnly = data[i][8] === true || String(data[i][8]).toLowerCase() === 'true';

    try {
      if (!sheetUrl || !chatWebhook) continue;
      if (startDate && todayStr < startDate) continue;
      if (endDate   && todayStr > endDate)   continue;
      if (weekdaysOnly && (day === 0 || day === 6)) continue;
      if (weekdaysOnly && day === 1 && hour < 9)    continue;

      const ds = getTargetSheet(sheetUrl);
      const totalRows = ds.getLastRow();

      // ★ v5.5 핵심: 시트 초기화 감지 → lastChecked 리셋
      if (totalRows < lastChecked) {
        Logger.log(`[polling] [${configName}] ⚠️ 시트 초기화! ${lastChecked}→0 리셋`);
        appendLog(userId, `[${configName}] ⚠️ 시트 초기화 감지 → lastCheckedRow 리셋`);
        sheet.getRange(i + 1, 6).setValue(0);
        lastChecked = 0;
      }

      if (totalRows <= lastChecked) {
        Logger.log(`[polling] [${configName}] 새 행 없음 (총 ${totalRows}행, 마지막 ${lastChecked}행)`);
        continue;
      }

      Logger.log(`[polling] [${configName}] ★ 새 행 발견! (${lastChecked+1}~${totalRows}행)`);
      const targetData = ds.getDataRange().getValues();
      const headers = targetData[0] || [];
      let sentCount = 0;
      const startIdx = Math.max(lastChecked, 1); // 헤더(0번) 건너뜀

      for (let r = startIdx; r < targetData.length; r++) {
        const rowData = targetData[r];
        if (!rowData || rowData.every(c => String(c).trim() === '')) continue;
        const msg = buildMessage(configName, headers, rowData);
        const ok  = sendWebhook(chatWebhook, msg);
        Logger.log(`[polling] [${configName}] row ${r+1} ${ok ? '✅' : '❌'}`);
        appendLog(userId, ok ? `[${configName}] 📋폴링 발송 성공 (row ${r+1})\n${msg}` : `[${configName}] ❌폴링 발송 실패 (row ${r+1})`);
        if (ok) sentCount++;
      }
      sheet.getRange(i + 1, 6).setValue(totalRows);
      Logger.log(`[polling] [${configName}] 완료. ${sentCount}건 발송.`);
    } catch (ex) {
      Logger.log(`[polling] [${configName}] 예외: ${ex.stack || ex.message}`);
      appendLog(userId, `[${configName}] ❌오류: ${ex.message}`);
    }
  }
  Logger.log('[polling] 종료');
}

// =============================================================
//  ★★★ 배포 후 반드시 실행! reinstallAllTriggers
//  BACKEND_SS_ID 저장 + 폴링 + 폼트리거 전체 재설치
// =============================================================
function reinstallAllTriggers() {
  setup(); // BACKEND_SS_ID 저장

  // 기존 폴링 트리거 제거 후 재설치
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'checkAndSendAlarms') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkAndSendAlarms').timeBased().everyMinutes(1).create();
  PropertiesService.getScriptProperties().setProperty('pollingChecked', '0');
  Logger.log('✅ 폴링 트리거 재설치');

  const sheet = getSheet('ConfigsV2');
  if (sheet && sheet.getLastRow() > 1) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const sheetUrl = String(data[i][3] || '').trim(), oldId = String(data[i][9] || '').trim();
      if (!sheetUrl) continue;
      if (oldId) removeFormTrigger(oldId);
      const newId = installFormTrigger(sheetUrl);
      sheet.getRange(i + 1, 10).setValue(newId || '');
      Logger.log(`✅ [${data[i][2]}] 폼트리거: ${newId || '실패'}`);
    }
  }
  Logger.log('✅ reinstallAllTriggers 완료. BACKEND_SS_ID=' +
    PropertiesService.getScriptProperties().getProperty('BACKEND_SS_ID'));
}
function setupTrigger() { reinstallAllTriggers(); }

// =============================================================
//  진단 함수
// =============================================================
function diagnosisAll() {
  Logger.log('=== Good Alarm v5.5 진단 ===');
  Logger.log(`시각: ${Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss')}`);
  Logger.log(`BACKEND_SS_ID: ${PropertiesService.getScriptProperties().getProperty('BACKEND_SS_ID') || '❌ 미설정!'}`);
  const triggers = ScriptApp.getProjectTriggers();
  const polling  = triggers.filter(t => t.getHandlerFunction() === 'checkAndSendAlarms');
  const formTrig = triggers.filter(t => t.getHandlerFunction() === 'onFormSubmitHandler');
  Logger.log(`▶ 폴링트리거: ${polling.length}개 ${polling.length > 0 ? '✅' : '❌'}`);
  Logger.log(`▶ 폼트리거: ${formTrig.length}개`);
  formTrig.forEach((t, idx) => Logger.log(`  [${idx}] src=${t.getTriggerSourceId()} id=${t.getUniqueId()}`));
  const sheet = getSheet('ConfigsV2');
  if (!sheet) { Logger.log('❌ ConfigsV2 없음'); return; }
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const configName = data[i][2], sheetUrl = String(data[i][3]||'').trim();
    const lastCheckedRow = parseInt(data[i][5])||0, triggerId = String(data[i][9]||'').trim();
    const trigActive = triggerId && triggers.some(t => t.getUniqueId() === triggerId);
    Logger.log(`\n[${i}] ${configName}`);
    Logger.log(`  webhook: ${data[i][4] ? '✅' : '❌'} | lastChecked=${lastCheckedRow} | trigger=${trigActive ? '✅' : '❌'}`);
    if (sheetUrl) {
      try {
        const ds = getTargetSheet(sheetUrl); const tot = ds.getLastRow();
        Logger.log(`  시트: ${tot}행 | 미처리: ${Math.max(0, tot-lastCheckedRow)}행 ${tot<lastCheckedRow ? '⚠️ 시트초기화감지!' : ''}`);
      } catch (ex) { Logger.log(`  시트접근오류: ${ex.message}`); }
    }
  }
  Logger.log('=== 진단완료 ===');
}

// =============================================================
//  공통 유틸
// =============================================================
function getTargetSheet(url) {
  const ss = SpreadsheetApp.openByUrl(url);
  const gidMatches = [...url.matchAll(/[?&#]gid=([0-9]+)/g)];
  if (gidMatches.length > 0) {
    const gid = parseInt(gidMatches[gidMatches.length - 1][1], 10);
    const found = ss.getSheets().find(s => s.getSheetId() === gid);
    if (found) return found;
  }
  return ss.getSheets()[0];
}

function buildMessage(configName, headers, rowData) {
  const lines = [`*[${configName || '새 알림'}]* 🔔 새로운 응답이 등록되었습니다!`, ''];
  for (let c = 0; c < headers.length; c++) {
    const key = String(headers[c] || '').trim();
    if (key) lines.push(`${key}: ${rowData[c] != null ? String(rowData[c]) : ''}`);
  }
  return lines.join('\n');
}

function sendWebhook(url, text) {
  if (!url) return false;
  try {
    const res  = UrlFetchApp.fetch(url.trim(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, payload: JSON.stringify({ text }), muteHttpExceptions: true });
    const code = res.getResponseCode();
    if (code < 200 || code >= 300) Logger.log(`[sendWebhook] HTTP ${code}: ${res.getContentText().substring(0, 200)}`);
    return code >= 200 && code < 300;
  } catch (ex) { Logger.log(`[sendWebhook] 예외: ${ex.message}`); return false; }
}

function appendLog(userId, message) {
  const sheet = getSheet('Logs');
  if (sheet) sheet.appendRow([new Date().toISOString(), userId, message]);
}

function fmtDate(val, TZ) {
  if (!val) return '';
  if (val instanceof Date) return Utilities.formatDate(val, TZ, 'yyyy-MM-dd');
  return String(val).split('T')[0];
}

function doGet() {
  setup();
  ensurePollingTrigger();
  return ContentService.createTextOutput(`Good Alarm Backend V${GAS_VERSION} Active.`).setMimeType(ContentService.MimeType.TEXT);
}
