// =============================================================
//  Good Alarm - Backend v4.1 (Google Apps Script)
//  ✅ 설치/설정 없이 바로 동작 (트리거 자동 설치)
//  ✅ 1분 폴링 트리거 (첫 API 호출 시 자동 등록)
//  ✅ 웹훅 테스트 / 즉시 확인 버튼
//  ─────────────────────────────────────────
//  [GAS 배포 방법 - 이것만 하면 됨]
//  1. 이 코드를 GAS 편집기에 전체 붙여넣기
//  2. 저장 후 '배포' > '배포 관리' > 기존 배포 선택 > 연필 아이콘
//     > '새 버전 저장' 클릭
//  ⚠️ '새 배포'가 아닌 '배포 관리'로 같은 URL 유지 필수!
// =============================================================

const GAS_VERSION = 4;

// ── DB 시트 초기화 ──────────────────────────────────────────
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const schemas = {
    'Users':     ['userId', 'name', 'team', 'password'],
    'ConfigsV2': ['configId', 'userId', 'name', 'sheetUrl', 'chatWebhook',
                  'lastCheckedRow', 'startDate', 'endDate', 'weekdaysOnly'],
    'Logs':      ['timestamp', 'userId', 'message']
  };
  Object.entries(schemas).forEach(([name, headers]) => {
    if (!ss.getSheetByName(name)) {
      ss.insertSheet(name).appendRow(headers);
    }
  });
}

// ── ★ 폴링 트리거 자동 설치 (매 doPost 호출 시 확인, 10분 캐시) ──
function ensurePollingTrigger() {
  try {
    const props     = PropertiesService.getScriptProperties();
    const lastCheck = parseInt(props.getProperty('triggerChecked') || '0');
    const now       = Date.now();
    // 10분 이내 이미 확인했으면 건너뜀 (성능 최적화)
    if (now - lastCheck < 10 * 60 * 1000) return;

    const exists = ScriptApp.getProjectTriggers()
      .some(t => t.getHandlerFunction() === 'checkAndSendAlarms');

    if (!exists) {
      ScriptApp.newTrigger('checkAndSendAlarms')
        .timeBased()
        .everyMinutes(1)
        .create();
      Logger.log('✅ [ensurePollingTrigger] 1분 폴링 트리거 자동 설치 완료!');
    }
    props.setProperty('triggerChecked', String(now));
  } catch (ex) {
    Logger.log('[ensurePollingTrigger] 오류 (무시): ' + ex.message);
  }
}

// 수동 실행용 (선택사항)
function setupTrigger() {
  setup();
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'checkAndSendAlarms') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkAndSendAlarms').timeBased().everyMinutes(1).create();
  PropertiesService.getScriptProperties().setProperty('triggerChecked', String(Date.now()));
  Logger.log('✅ [setupTrigger] 1분 트리거 수동 설치 완료.');
}

// ── doPost: API 라우터 ───────────────────────────────────────
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, message: 'No payload' });
    }
    const data = JSON.parse(e.postData.contents);

    setup();
    ensurePollingTrigger(); // ★ 첫 호출 시 자동으로 트리거 등록

    const routes = {
      register:     () => handleRegister(data),
      login:        () => handleLogin(data),
      getConfig:    () => handleGetConfig(data),
      addConfig:    () => handleAddConfig(data),
      updateConfig: () => handleUpdateConfig(data),
      deleteConfig: () => handleDeleteConfig(data),
      getLogs:      () => handleGetLogs(data),
      testWebhook:  () => handleTestWebhook(data),
      runCheckNow:  () => handleRunCheckNow(data),
      checkVersion: () => ({ success: true, version: GAS_VERSION, message: `Good Alarm Backend V${GAS_VERSION}` }),
    };

    const action = data.action;
    if (!routes[action]) {
      return jsonResponse({ success: false, message: `알 수 없는 액션: ${action}` });
    }
    return jsonResponse(routes[action]());
  } catch (err) {
    Logger.log('[doPost] 예외: ' + err.stack);
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── 회원가입 ─────────────────────────────────────────────────
function handleRegister({ name, team, password }) {
  const sheet  = getSheet('Users');
  const data   = sheet.getDataRange().getValues();
  const userId = `${name}_${team}`;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) return { success: false, message: '이미 존재하는 사용자입니다.' };
  }
  sheet.appendRow([userId, name, team, password]);
  return { success: true, userId, name, team };
}

// ── 로그인 ───────────────────────────────────────────────────
function handleLogin({ name, team, password }) {
  const sheet  = getSheet('Users');
  const data   = sheet.getDataRange().getValues();
  const userId = `${name}_${team}`;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId && String(data[i][3]) === String(password)) {
      return { success: true, userId, name, team };
    }
  }
  return { success: false, message: '이름, 팀명, 비밀번호를 확인해주세요.' };
}

// ── 설정 목록 조회 ────────────────────────────────────────────
function handleGetConfig({ userId }) {
  const sheet = getSheet('ConfigsV2');
  if (!sheet) return { success: true, configs: [] };
  const data    = sheet.getDataRange().getValues();
  const TZ      = 'Asia/Seoul';
  const configs = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] !== userId) continue;
    configs.push({
      configId:      data[i][0],
      name:          data[i][2],
      sheetUrl:      data[i][3],
      chatWebhook:   data[i][4],
      lastCheckedRow: parseInt(data[i][5]) || 0,
      startDate:     fmtDate(data[i][6], TZ),
      endDate:       fmtDate(data[i][7], TZ),
      weekdaysOnly:  data[i][8] === true || String(data[i][8]).toLowerCase() === 'true',
    });
  }
  return { success: true, configs };
}

// ── 설정 추가 ─────────────────────────────────────────────────
function handleAddConfig({ userId, name, sheetUrl, chatWebhook, startDate, endDate, weekdaysOnly }) {
  const sheet = getSheet('ConfigsV2');
  let lastCheckedRow = 0;

  if (sheetUrl) {
    try {
      lastCheckedRow = getTargetSheet(sheetUrl).getLastRow();
    } catch (e) {
      return { success: false, message: `스프레드시트에 접근할 수 없습니다: ${e.message}` };
    }
  }

  const configId = Utilities.getUuid();
  sheet.appendRow([configId, userId, name, sheetUrl, chatWebhook,
                   lastCheckedRow, startDate || '', endDate || '', weekdaysOnly || false]);
  Logger.log(`[addConfig] 추가 완료. name=${name}, lastCheckedRow=${lastCheckedRow}`);
  return { success: true, message: '설정이 추가되었습니다. 1분 내로 자동 감지가 시작됩니다.' };
}

// ── 설정 수정 ─────────────────────────────────────────────────
function handleUpdateConfig({ userId, configId, name, sheetUrl, chatWebhook, startDate, endDate, weekdaysOnly }) {
  const sheet = getSheet('ConfigsV2');
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== configId || data[i][1] !== userId) continue;

    const oldUrl = String(data[i][3]).trim();
    const newUrl = String(sheetUrl).trim();
    let lastCheckedRow = parseInt(data[i][5]) || 0;

    if (oldUrl !== newUrl && newUrl) {
      try {
        lastCheckedRow = getTargetSheet(newUrl).getLastRow();
      } catch (e) {
        return { success: false, message: `새 스프레드시트에 접근할 수 없습니다: ${e.message}` };
      }
    }

    sheet.getRange(i + 1, 3).setValue(name);
    sheet.getRange(i + 1, 4).setValue(sheetUrl);
    sheet.getRange(i + 1, 5).setValue(chatWebhook);
    sheet.getRange(i + 1, 6).setValue(lastCheckedRow);
    sheet.getRange(i + 1, 7).setValue(startDate || '');
    sheet.getRange(i + 1, 8).setValue(endDate || '');
    sheet.getRange(i + 1, 9).setValue(weekdaysOnly || false);
    return { success: true, message: '저장되었습니다.' };
  }
  return { success: false, message: '설정을 찾을 수 없습니다.' };
}

// ── 설정 삭제 ─────────────────────────────────────────────────
function handleDeleteConfig({ userId, configId }) {
  const sheet = getSheet('ConfigsV2');
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== configId || data[i][1] !== userId) continue;
    sheet.deleteRow(i + 1);
    return { success: true, message: '삭제되었습니다.' };
  }
  return { success: false, message: '설정을 찾을 수 없거나 권한이 없습니다.' };
}

// ── 로그 조회 ─────────────────────────────────────────────────
function handleGetLogs({ userId }) {
  const sheet = getSheet('Logs');
  if (!sheet) return { success: true, logs: [] };
  const data = sheet.getDataRange().getValues();
  const logs = [];
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] !== userId) continue;
    logs.push({ timestamp: data[i][0], message: String(data[i][2]) });
    if (logs.length >= 100) break;
  }
  return { success: true, logs };
}

// ── ★ 웹훅 테스트 ────────────────────────────────────────────
function handleTestWebhook({ userId, configId }) {
  Logger.log(`[testWebhook] 시작. userId=${userId}, configId=${configId}`);
  const sheet = getSheet('ConfigsV2');
  if (!sheet) return { success: false, message: 'ConfigsV2 시트를 찾을 수 없습니다.' };

  const data = sheet.getDataRange().getValues();
  Logger.log(`[testWebhook] ConfigsV2 전체 행 수: ${data.length}`);

  for (let i = 1; i < data.length; i++) {
    const rowConfigId = String(data[i][0]).trim();
    const rowUserId   = String(data[i][1]).trim();
    Logger.log(`[testWebhook] 비교 [${i}]: rowConfigId="${rowConfigId}" vs "${String(configId).trim()}"`);

    if (rowConfigId !== String(configId).trim() || rowUserId !== String(userId).trim()) continue;

    const configName  = data[i][2];
    const chatWebhook = String(data[i][4]).trim();

    if (!chatWebhook) return { success: false, message: '웹훅 URL이 등록되지 않았습니다.' };

    Logger.log(`[testWebhook] [${configName}] 웹훅 전송 시도: ${chatWebhook.substring(0, 70)}...`);
    const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    const msg = `✅ [Good Alarm 테스트]\n*${configName}* 웹훅 연결 성공!\n시각: ${now}`;
    const ok  = sendWebhook(chatWebhook, msg);

    appendLog(userId, ok
      ? `[테스트] [${configName}] 웹훅 연결 성공 ✅`
      : `[테스트] [${configName}] 웹훅 전송 실패 ❌`);

    return {
      success: ok,
      message: ok
        ? '구글 챗으로 테스트 메시지를 발송했습니다! 챗에서 확인하세요.'
        : '웹훅 전송 실패. 웹훅 URL이 올바른지 확인해주세요.'
    };
  }
  return { success: false, message: `설정을 찾을 수 없습니다. (configId=${configId})` };
}

// ── ★ 즉시 확인 & 발송 ──────────────────────────────────────
function handleRunCheckNow({ userId, configId }) {
  Logger.log(`[runCheckNow] 시작. userId=${userId}, configId=${configId}`);
  const sheet = getSheet('ConfigsV2');
  if (!sheet) return { success: false, message: 'ConfigsV2 시트를 찾을 수 없습니다.' };

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const rowConfigId = String(data[i][0]).trim();
    const rowUserId   = String(data[i][1]).trim();

    if (rowConfigId !== String(configId).trim() || rowUserId !== String(userId).trim()) continue;

    const configName     = data[i][2];
    const sheetUrl       = String(data[i][3]).trim();
    const chatWebhook    = String(data[i][4]).trim();
    let   lastCheckedRow = parseInt(data[i][5]) || 0;

    if (!sheetUrl)    return { success: false, message: '스프레드시트 URL이 등록되지 않았습니다.' };
    if (!chatWebhook) return { success: false, message: '웹훅 URL이 등록되지 않았습니다.' };

    let targetData, totalRows, headers;
    try {
      const dataSheet = getTargetSheet(sheetUrl);
      targetData  = dataSheet.getDataRange().getValues();
      totalRows   = targetData.length;
      headers     = targetData[0];
      Logger.log(`[runCheckNow] [${configName}] totalRows=${totalRows}, lastCheckedRow=${lastCheckedRow}`);
    } catch (ex) {
      return { success: false, message: `스프레드시트 접근 오류: ${ex.message}` };
    }

    if (totalRows <= lastCheckedRow) {
      return { success: true, message: `새로운 데이터 없음. (현재 ${totalRows}행, 마지막 확인 ${lastCheckedRow}행)` };
    }

    let sentCount = 0;
    for (let r = Math.max(lastCheckedRow, 1); r < totalRows; r++) {
      const rowData    = targetData[r];
      const isRowEmpty = rowData.every(c => String(c).trim() === '');
      if (isRowEmpty) continue;

      const msg = buildMessage(configName, headers, rowData);
      const ok  = sendWebhook(chatWebhook, msg);
      appendLog(userId, ok
        ? `[${configName}] ⚡즉시 발송 성공 (row ${r + 1})\n${msg}`
        : `[${configName}] ❌즉시 발송 실패 (row ${r + 1})`);
      if (ok) sentCount++;
    }
    sheet.getRange(i + 1, 6).setValue(totalRows);

    return { success: true, message: `${sentCount}건 구글 챗 발송 완료! (${lastCheckedRow + 1}~${totalRows}행)` };
  }
  return { success: false, message: `설정을 찾을 수 없습니다. (configId=${configId})` };
}

// =============================================================
//  ★ 1분 폴링 (트리거 자동 실행)
// =============================================================
function checkAndSendAlarms() {
  const sheet = getSheet('ConfigsV2');
  if (!sheet) return;
  const data     = sheet.getDataRange().getValues();
  const TZ       = 'Asia/Seoul';
  const todayStr = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const nowKST   = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const day      = nowKST.getDay();
  const hour     = nowKST.getHours();

  Logger.log(`[polling] 시작. ${todayStr} day=${day} hour=${hour}`);

  for (let i = 1; i < data.length; i++) {
    const userId      = data[i][1];
    const configName  = data[i][2];
    const sheetUrl    = String(data[i][3]).trim();
    const chatWebhook = String(data[i][4]).trim();
    let   lastChecked = parseInt(data[i][5]) || 0;
    const startDate   = fmtDate(data[i][6], TZ);
    const endDate     = fmtDate(data[i][7], TZ);
    const weekdaysOnly = data[i][8] === true || String(data[i][8]).toLowerCase() === 'true';

    try {
      if (!sheetUrl || !chatWebhook) continue;
      if (startDate && todayStr < startDate) continue;
      if (endDate   && todayStr > endDate)   continue;

      if (weekdaysOnly) {
        if (day === 0 || day === 6) continue;
        if (day === 1 && hour < 9)  continue;
      }

      const dataSheet  = getTargetSheet(sheetUrl);
      const targetData = dataSheet.getDataRange().getValues();
      const totalRows  = targetData.length;
      const headers    = targetData[0];

      if (totalRows < lastChecked) {
        sheet.getRange(i + 1, 6).setValue(totalRows);
        lastChecked = totalRows;
      }
      if (totalRows <= lastChecked) continue;

      Logger.log(`[polling] [${configName}] 새 행 감지 ${lastChecked + 1}~${totalRows}`);
      let sentCount = 0;
      for (let r = Math.max(lastChecked, 1); r < totalRows; r++) {
        const rowData    = targetData[r];
        const isRowEmpty = rowData.every(c => String(c).trim() === '');
        if (isRowEmpty) continue;
        const msg = buildMessage(configName, headers, rowData);
        const ok  = sendWebhook(chatWebhook, msg);
        appendLog(userId, ok
          ? `[${configName}] ✅알람 발송 (row ${r + 1})\n${msg}`
          : `[${configName}] ❌알람 발송 실패 (row ${r + 1})`);
        if (ok) sentCount++;
      }
      sheet.getRange(i + 1, 6).setValue(totalRows);
      Logger.log(`[polling] [${configName}] 완료. ${sentCount}건 발송.`);
    } catch (ex) {
      Logger.log(`[polling] [${configName}] 예외: ${ex.message}`);
      appendLog(userId, `[${configName}] ❌오류: ${ex.message}`);
    }
  }
  Logger.log('[polling] 전체 완료.');
}

// =============================================================
//  진단 함수 (에디터에서 직접 실행)
// =============================================================
function diagnosisAll() {
  Logger.log('=== Good Alarm v4.1 진단 ===');
  const TZ  = 'Asia/Seoul';
  Logger.log(`실행 시각: ${Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss')}`);

  const triggers = ScriptApp.getProjectTriggers();
  Logger.log(`\n▶ 트리거 수: ${triggers.length}`);
  triggers.forEach((t, idx) => Logger.log(`  [${idx}] 함수=${t.getHandlerFunction()}`));

  const sheet = getSheet('ConfigsV2');
  if (!sheet) { Logger.log('ConfigsV2 없음!'); return; }
  const data = sheet.getDataRange().getValues();
  Logger.log(`\n▶ 설정 수: ${data.length - 1}개`);

  for (let i = 1; i < data.length; i++) {
    const configName     = data[i][2];
    const sheetUrl       = data[i][3];
    const chatWebhook    = data[i][4];
    const lastCheckedRow = parseInt(data[i][5]) || 0;
    Logger.log(`\n--- [${i}] ${configName} ---`);
    Logger.log(`  webhook: ${chatWebhook ? '✅ 설정됨' : '❌ 없음'}`);
    Logger.log(`  lastCheckedRow: ${lastCheckedRow}`);
    if (sheetUrl) {
      try {
        const totalRows = getTargetSheet(sheetUrl).getLastRow();
        Logger.log(`  시트: ✅ 총 ${totalRows}행, 미처리 ${Math.max(0, totalRows - lastCheckedRow)}행`);
      } catch (ex) { Logger.log(`  시트: ❌ ${ex.message}`); }
    }
  }
  Logger.log('\n=== 진단 완료 ===');
}

function testWebhookConnection() {
  const data = getSheet('ConfigsV2').getDataRange().getValues();
  const now  = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  for (let i = 1; i < data.length; i++) {
    const name    = data[i][2];
    const webhook = String(data[i][4]).trim();
    if (!webhook) { Logger.log(`[${name}] 웹훅 없음`); continue; }
    const ok = sendWebhook(webhook, `[Good Alarm 테스트] *${name}* 웹훅 테스트 ✅\n${now}`);
    Logger.log(`[${name}]: ${ok ? '✅' : '❌'}`);
  }
}

function resetAllLastCheckedRows() {
  const sheet = getSheet('ConfigsV2');
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const sheetUrl = data[i][3];
    if (!sheetUrl) continue;
    try {
      const row = getTargetSheet(sheetUrl).getLastRow();
      sheet.getRange(i + 1, 6).setValue(row);
      Logger.log(`[reset] [${data[i][2]}] → ${row}`);
    } catch (ex) { Logger.log(`[reset] [${data[i][2]}] 실패: ${ex.message}`); }
  }
}

// =============================================================
//  공통 유틸
// =============================================================
function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function getTargetSheet(url) {
  const ss    = SpreadsheetApp.openByUrl(url);
  const match = url.match(/[#&?]gid=([0-9]+)/);
  if (match) {
    const gid   = parseInt(match[1], 10);
    const found = ss.getSheets().find(s => s.getSheetId() === gid);
    if (found) return found;
  }
  return ss.getSheets()[0];
}

function buildMessage(configName, headers, rowData) {
  const lines = [`*[${configName || '새 알림'}]* 새로운 응답! 🔔`, ''];
  for (let c = 0; c < headers.length; c++) {
    if (headers[c]) {
      lines.push(`${headers[c]}: ${rowData[c] != null ? String(rowData[c]) : ''}`);
    }
  }
  return lines.join('\n');
}

function sendWebhook(url, text) {
  if (!url) return false;
  try {
    const res  = UrlFetchApp.fetch(url.trim(), {
      method:             'POST',
      headers:            { 'Content-Type': 'application/json' },
      payload:            JSON.stringify({ text }),
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    Logger.log(`[sendWebhook] HTTP ${code}`);
    if (code < 200 || code >= 300) {
      Logger.log(`[sendWebhook] 응답: ${res.getContentText().substring(0, 200)}`);
    }
    return code >= 200 && code < 300;
  } catch (ex) {
    Logger.log(`[sendWebhook] 예외: ${ex.message}`);
    return false;
  }
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

function doGet(e) {
  setup();
  ensurePollingTrigger();
  return ContentService
    .createTextOutput(`Good Alarm Backend V${GAS_VERSION} Active.`)
    .setMimeType(ContentService.MimeType.TEXT);
}
