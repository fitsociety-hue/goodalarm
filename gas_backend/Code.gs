// =============================================================
//  Good Alarm - Backend v5 (Google Apps Script)
//  ✅ onFormSubmit 즉시 알람 (폼 제출 순간 발송)
//  ✅ 1분 폴링 백업 (즉시 알람 누락 방지)
//  ✅ 트리거 자동 설치 (설정 추가 시 자동)
//  ─────────────────────────────────────────
//  [GAS 배포 방법]
//  1. 이 코드를 GAS 편집기에 전체 붙여넣기 → 저장
//  2. 배포 → 배포 관리 → 연필(✏️) → 새 버전 → 배포
//  3. 완료! (트리거는 설정 추가 시 자동으로 설치됨)
//
//  [기존 설정 즉시 알람 활성화]
//  함수 목록에서 reinstallAllTriggers 선택 → 실행 (1회)
// =============================================================

const GAS_VERSION = 5;

// ── DB 시트 초기화 ──────────────────────────────────────────
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const schemas = {
    'Users':     ['userId', 'name', 'team', 'password'],
    'ConfigsV2': ['configId', 'userId', 'name', 'sheetUrl', 'chatWebhook',
                  'lastCheckedRow', 'startDate', 'endDate', 'weekdaysOnly', 'formTriggerId'],
    'Logs':      ['timestamp', 'userId', 'message']
  };
  Object.entries(schemas).forEach(([name, headers]) => {
    if (!ss.getSheetByName(name)) {
      ss.insertSheet(name).appendRow(headers);
    }
  });

  // ConfigsV2에 formTriggerId 컬럼 없으면 추가 (구버전 호환)
  const cfgSheet = ss.getSheetByName('ConfigsV2');
  if (cfgSheet && cfgSheet.getLastColumn() < 10) {
    cfgSheet.getRange(1, 10).setValue('formTriggerId');
  }
}

// ── 폴링 트리거 자동 설치 (10분 캐시) ───────────────────────
function ensurePollingTrigger() {
  try {
    const props     = PropertiesService.getScriptProperties();
    const lastCheck = parseInt(props.getProperty('triggerChecked') || '0');
    if (Date.now() - lastCheck < 10 * 60 * 1000) return;

    const exists = ScriptApp.getProjectTriggers()
      .some(t => t.getHandlerFunction() === 'checkAndSendAlarms');
    if (!exists) {
      ScriptApp.newTrigger('checkAndSendAlarms').timeBased().everyMinutes(1).create();
      Logger.log('✅ [ensurePollingTrigger] 1분 폴링 트리거 자동 설치');
    }
    props.setProperty('triggerChecked', String(Date.now()));
  } catch (ex) {
    Logger.log('[ensurePollingTrigger] 오류: ' + ex.message);
  }
}

// ── ★ onFormSubmit 트리거 설치 ───────────────────────────────
function installFormTrigger(sheetUrl) {
  try {
    const targetSs = SpreadsheetApp.openByUrl(sheetUrl);
    const ssId     = targetSs.getId();

    // 이미 동일 스프레드시트에 트리거 있으면 재사용
    const existing = ScriptApp.getProjectTriggers().find(t =>
      t.getHandlerFunction() === 'onFormSubmitHandler' &&
      t.getTriggerSourceId()  === ssId
    );
    if (existing) {
      Logger.log(`[installFormTrigger] 기존 트리거 재사용: ${existing.getUniqueId()}`);
      return existing.getUniqueId();
    }

    const trigger = ScriptApp.newTrigger('onFormSubmitHandler')
      .forSpreadsheet(targetSs)
      .onFormSubmit()
      .create();
    Logger.log(`[installFormTrigger] ✅ 새 트리거 설치: ${trigger.getUniqueId()}`);
    return trigger.getUniqueId();
  } catch (ex) {
    Logger.log(`[installFormTrigger] 실패: ${ex.message}`);
    return '';
  }
}

// ── onFormSubmit 트리거 제거 ─────────────────────────────────
function removeFormTrigger(triggerId) {
  if (!triggerId) return;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getUniqueId() === triggerId) {
      ScriptApp.deleteTrigger(t);
      Logger.log(`[removeFormTrigger] 트리거 제거: ${triggerId}`);
    }
  });
}

// ── doPost: API 라우터 ───────────────────────────────────────
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, message: 'No payload' });
    }
    const data = JSON.parse(e.postData.contents);
    setup();
    ensurePollingTrigger();

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
      configId:       data[i][0],
      name:           data[i][2],
      sheetUrl:       data[i][3],
      chatWebhook:    data[i][4],
      lastCheckedRow: parseInt(data[i][5]) || 0,
      startDate:      fmtDate(data[i][6], TZ),
      endDate:        fmtDate(data[i][7], TZ),
      weekdaysOnly:   data[i][8] === true || String(data[i][8]).toLowerCase() === 'true',
      formTriggerId:  data[i][9] || '',
    });
  }
  return { success: true, configs };
}

// ── 설정 추가 ─────────────────────────────────────────────────
function handleAddConfig({ userId, name, sheetUrl, chatWebhook, startDate, endDate, weekdaysOnly }) {
  const sheet = getSheet('ConfigsV2');
  let lastCheckedRow = 0;
  let formTriggerId  = '';

  if (sheetUrl) {
    try {
      lastCheckedRow = getTargetSheet(sheetUrl).getLastRow();
      formTriggerId  = installFormTrigger(sheetUrl); // ★ 즉시 알람 트리거 설치
      Logger.log(`[addConfig] lastCheckedRow=${lastCheckedRow}, triggerId=${formTriggerId}`);
    } catch (e) {
      return { success: false, message: `스프레드시트에 접근할 수 없습니다: ${e.message}` };
    }
  }

  const configId = Utilities.getUuid();
  sheet.appendRow([configId, userId, name, sheetUrl, chatWebhook,
                   lastCheckedRow, startDate || '', endDate || '',
                   weekdaysOnly || false, formTriggerId]);

  const triggerStatus = formTriggerId ? '⚡ 즉시 알람 트리거 설치 완료!' : '⚠️ 트리거 설치 실패 (1분 폴링으로 동작)';
  return { success: true, message: `설정이 추가되었습니다. ${triggerStatus}` };
}

// ── 설정 수정 ─────────────────────────────────────────────────
function handleUpdateConfig({ userId, configId, name, sheetUrl, chatWebhook, startDate, endDate, weekdaysOnly }) {
  const sheet = getSheet('ConfigsV2');
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== configId || data[i][1] !== userId) continue;

    const oldUrl       = String(data[i][3]).trim();
    const newUrl       = String(sheetUrl).trim();
    let lastCheckedRow = parseInt(data[i][5]) || 0;
    let formTriggerId  = data[i][9] || '';

    if (oldUrl !== newUrl && newUrl) {
      // URL 변경 → 기존 트리거 제거 후 새 트리거
      if (formTriggerId) removeFormTrigger(formTriggerId);
      try {
        lastCheckedRow = getTargetSheet(newUrl).getLastRow();
        formTriggerId  = installFormTrigger(newUrl);
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
    sheet.getRange(i + 1, 10).setValue(formTriggerId);
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
    removeFormTrigger(data[i][9]); // 트리거 제거
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

// ── 웹훅 테스트 ───────────────────────────────────────────────
function handleTestWebhook({ userId, configId }) {
  Logger.log(`[testWebhook] userId=${userId}, configId=${configId}`);
  const sheet = getSheet('ConfigsV2');
  if (!sheet) return { success: false, message: 'ConfigsV2 시트를 찾을 수 없습니다.' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() !== String(configId).trim()) continue;
    if (String(data[i][1]).trim() !== String(userId).trim())   continue;

    const configName  = data[i][2];
    const chatWebhook = String(data[i][4]).trim();
    if (!chatWebhook) return { success: false, message: '웹훅 URL이 등록되지 않았습니다.' };

    const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    const ok  = sendWebhook(chatWebhook, `✅ [Good Alarm 테스트]\n*${configName}* 웹훅 연결 성공!\n시각: ${now}`);

    appendLog(userId, ok
      ? `[테스트] [${configName}] 웹훅 연결 성공 ✅`
      : `[테스트] [${configName}] 웹훅 전송 실패 ❌`);

    return {
      success: ok,
      message: ok ? '구글 챗으로 테스트 메시지를 발송했습니다! 챗에서 확인하세요.'
                  : '웹훅 전송 실패. 웹훅 URL이 올바른지 확인해주세요.'
    };
  }
  return { success: false, message: `설정을 찾을 수 없습니다. (configId=${configId})` };
}

// ── 즉시 확인 & 발송 ─────────────────────────────────────────
function handleRunCheckNow({ userId, configId }) {
  Logger.log(`[runCheckNow] userId=${userId}, configId=${configId}`);
  const sheet = getSheet('ConfigsV2');
  if (!sheet) return { success: false, message: 'ConfigsV2 시트를 찾을 수 없습니다.' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() !== String(configId).trim()) continue;
    if (String(data[i][1]).trim() !== String(userId).trim())   continue;

    const configName     = data[i][2];
    const sheetUrl       = String(data[i][3]).trim();
    const chatWebhook    = String(data[i][4]).trim();
    let   lastCheckedRow = parseInt(data[i][5]) || 0;

    if (!sheetUrl)    return { success: false, message: '스프레드시트 URL이 등록되지 않았습니다.' };
    if (!chatWebhook) return { success: false, message: '웹훅 URL이 등록되지 않았습니다.' };

    let targetData, totalRows, headers;
    try {
      const ds = getTargetSheet(sheetUrl);
      targetData = ds.getDataRange().getValues();
      totalRows  = targetData.length;
      headers    = targetData[0];
    } catch (ex) {
      return { success: false, message: `스프레드시트 접근 오류: ${ex.message}` };
    }

    if (totalRows <= lastCheckedRow) {
      return { success: true, message: `새로운 데이터 없음. (현재 ${totalRows}행, 마지막 확인 ${lastCheckedRow}행)` };
    }

    let sentCount = 0;
    for (let r = Math.max(lastCheckedRow, 1); r < totalRows; r++) {
      const rowData = targetData[r];
      if (rowData.every(c => String(c).trim() === '')) continue;
      const msg = buildMessage(configName, headers, rowData);
      if (sendWebhook(chatWebhook, msg)) {
        appendLog(userId, `[${configName}] ⚡즉시 발송 성공 (row ${r + 1})\n${msg}`);
        sentCount++;
      } else {
        appendLog(userId, `[${configName}] ❌즉시 발송 실패 (row ${r + 1})`);
      }
    }
    sheet.getRange(i + 1, 6).setValue(totalRows);
    return { success: true, message: `${sentCount}건 구글 챗 발송 완료! (${lastCheckedRow + 1}~${totalRows}행)` };
  }
  return { success: false, message: `설정을 찾을 수 없습니다.` };
}

// =============================================================
//  ★★★ 핵심: 폼 제출 즉시 알람 (onFormSubmit 트리거 연결)
// =============================================================
function onFormSubmitHandler(e) {
  Logger.log('[onFormSubmitHandler] ⚡ 폼 제출 감지!');

  const ss           = e.source;
  const sourceSheet  = e.range.getSheet();
  const submittedRow = e.range.getRow();
  const ssId         = ss.getId();

  const cfgSheet = getSheet('ConfigsV2');
  if (!cfgSheet) { Logger.log('[onFormSubmitHandler] ConfigsV2 없음'); return; }

  const cfgData  = cfgSheet.getDataRange().getValues();
  const TZ       = 'Asia/Seoul';
  const todayStr = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const nowKST   = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const day      = nowKST.getDay();

  for (let i = 1; i < cfgData.length; i++) {
    const configName   = cfgData[i][2];
    const sheetUrl     = String(cfgData[i][3]).trim();
    const chatWebhook  = String(cfgData[i][4]).trim();
    const startDate    = fmtDate(cfgData[i][6], TZ);
    const endDate      = fmtDate(cfgData[i][7], TZ);
    const weekdaysOnly = cfgData[i][8] === true || String(cfgData[i][8]).toLowerCase() === 'true';
    const userId       = cfgData[i][1];

    if (!sheetUrl || !chatWebhook) continue;

    // 해당 스프레드시트인지 확인
    try {
      const cfgSsId = SpreadsheetApp.openByUrl(sheetUrl).getId();
      if (cfgSsId !== ssId) continue;

      // gid(탭)가 명시된 경우 탭 일치 여부 확인
      const gidMatch = sheetUrl.match(/[#&?]gid=([0-9]+)/);
      if (gidMatch && sourceSheet.getSheetId() !== parseInt(gidMatch[1], 10)) continue;
    } catch (ex) {
      Logger.log(`[onFormSubmitHandler] URL 비교 오류 [${configName}]: ${ex.message}`);
      continue;
    }

    // 날짜 범위 체크
    if (startDate && todayStr < startDate) { Logger.log(`[${configName}] 시작일 전`); continue; }
    if (endDate   && todayStr > endDate)   { Logger.log(`[${configName}] 종료일 후`); continue; }

    // 평일 전용: 주말이면 즉시 알람 보류 → 1분 폴링의 월요일 로직이 처리
    if (weekdaysOnly && (day === 0 || day === 6)) {
      Logger.log(`[${configName}] 주말 제출 - 즉시 알람 보류, 월요일 발송 예정`);
      continue;
    }

    // ★ 즉시 발송
    const headers = sourceSheet.getRange(1, 1, 1, sourceSheet.getLastColumn()).getValues()[0];
    const rowData = sourceSheet.getRange(submittedRow, 1, 1, sourceSheet.getLastColumn()).getValues()[0];

    if (rowData.every(c => String(c).trim() === '')) continue;

    const msg = buildMessage(configName, headers, rowData);
    const ok  = sendWebhook(chatWebhook, msg);

    Logger.log(`[onFormSubmitHandler] [${configName}] 발송 결과: ${ok ? '✅ 성공' : '❌ 실패'}`);
    appendLog(userId, ok
      ? `[${configName}] ⚡즉시 발송 성공 (row ${submittedRow})\n${msg}`
      : `[${configName}] ❌즉시 발송 실패 (row ${submittedRow})`);

    // lastCheckedRow 업데이트
    cfgSheet.getRange(i + 1, 6).setValue(sourceSheet.getLastRow());
  }
  Logger.log('[onFormSubmitHandler] 처리 완료.');
}

// =============================================================
//  1분 폴링 백업 (즉시 알람 누락 방지 + 평일전용 주말 건 월요일 발송)
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

  for (let i = 1; i < data.length; i++) {
    const userId       = data[i][1];
    const configName   = data[i][2];
    const sheetUrl     = String(data[i][3]).trim();
    const chatWebhook  = String(data[i][4]).trim();
    let   lastChecked  = parseInt(data[i][5]) || 0;
    const startDate    = fmtDate(data[i][6], TZ);
    const endDate      = fmtDate(data[i][7], TZ);
    const weekdaysOnly = data[i][8] === true || String(data[i][8]).toLowerCase() === 'true';

    try {
      if (!sheetUrl || !chatWebhook) continue;
      if (startDate && todayStr < startDate) continue;
      if (endDate   && todayStr > endDate)   continue;

      if (weekdaysOnly) {
        if (day === 0 || day === 6) continue;
        if (day === 1 && hour < 9)  continue;
      }

      const ds         = getTargetSheet(sheetUrl);
      const targetData = ds.getDataRange().getValues();
      const totalRows  = targetData.length;
      const headers    = targetData[0];

      if (totalRows < lastChecked) {
        sheet.getRange(i + 1, 6).setValue(totalRows);
        lastChecked = totalRows;
      }
      if (totalRows <= lastChecked) continue;

      Logger.log(`[polling] [${configName}] 미처리 행 감지: ${lastChecked + 1}~${totalRows}`);
      let sentCount = 0;
      for (let r = Math.max(lastChecked, 1); r < totalRows; r++) {
        const rowData = targetData[r];
        if (rowData.every(c => String(c).trim() === '')) continue;
        const msg = buildMessage(configName, headers, rowData);
        const ok  = sendWebhook(chatWebhook, msg);
        appendLog(userId, ok
          ? `[${configName}] 📋폴링 발송 성공 (row ${r + 1})\n${msg}`
          : `[${configName}] ❌폴링 발송 실패 (row ${r + 1})`);
        if (ok) sentCount++;
      }
      sheet.getRange(i + 1, 6).setValue(totalRows);
      Logger.log(`[polling] [${configName}] 완료. ${sentCount}건 발송.`);
    } catch (ex) {
      Logger.log(`[polling] [${configName}] 예외: ${ex.message}`);
      appendLog(userId, `[${configName}] ❌오류: ${ex.message}`);
    }
  }
}

// =============================================================
//  기존 설정에 즉시 알람 트리거 재설치 (에디터에서 1회 실행)
// =============================================================
function reinstallAllTriggers() {
  Logger.log('=== reinstallAllTriggers 시작 ===');
  const sheet = getSheet('ConfigsV2');
  if (!sheet) { Logger.log('ConfigsV2 없음'); return; }
  setup();

  // 기존 폴링 트리거 재설치
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'checkAndSendAlarms') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkAndSendAlarms').timeBased().everyMinutes(1).create();
  PropertiesService.getScriptProperties().setProperty('triggerChecked', String(Date.now()));
  Logger.log('✅ 1분 폴링 트리거 재설치 완료');

  // 각 설정의 onFormSubmit 트리거 재설치
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const configName = data[i][2];
    const sheetUrl   = String(data[i][3]).trim();
    const oldTrigger = data[i][9] || '';

    if (!sheetUrl) continue;
    if (oldTrigger) removeFormTrigger(oldTrigger);

    const newTriggerId = installFormTrigger(sheetUrl);
    sheet.getRange(i + 1, 10).setValue(newTriggerId);
    Logger.log(`✅ [${configName}] 즉시 알람 트리거 설치: ${newTriggerId}`);
  }
  Logger.log('=== reinstallAllTriggers 완료 ===');
}

// 수동 폴링 트리거 설치
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'checkAndSendAlarms') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkAndSendAlarms').timeBased().everyMinutes(1).create();
  PropertiesService.getScriptProperties().setProperty('triggerChecked', String(Date.now()));
  Logger.log('✅ [setupTrigger] 완료');
}

// =============================================================
//  진단 함수
// =============================================================
function diagnosisAll() {
  Logger.log('=== Good Alarm v5 진단 ===');
  Logger.log(`시각: ${Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss')}`);

  const triggers = ScriptApp.getProjectTriggers();
  Logger.log(`\n▶ 전체 트리거: ${triggers.length}개`);
  triggers.forEach((t, i) => Logger.log(
    `  [${i}] ${t.getHandlerFunction()} | 소스: ${t.getTriggerSource()} | ID: ${t.getTriggerSourceId()}`
  ));

  const sheet = getSheet('ConfigsV2');
  if (!sheet) { Logger.log('ConfigsV2 없음!'); return; }
  const data = sheet.getDataRange().getValues();
  Logger.log(`\n▶ 설정: ${data.length - 1}개`);

  for (let i = 1; i < data.length; i++) {
    const configName     = data[i][2];
    const sheetUrl       = data[i][3];
    const chatWebhook    = data[i][4];
    const lastCheckedRow = parseInt(data[i][5]) || 0;
    const formTriggerId  = data[i][9] || '';
    const triggerExists  = triggers.some(t => t.getUniqueId() === formTriggerId);

    Logger.log(`\n--- [${i}] ${configName} ---`);
    Logger.log(`  webhook: ${chatWebhook ? '✅' : '❌ 없음'}`);
    Logger.log(`  lastCheckedRow: ${lastCheckedRow}`);
    Logger.log(`  즉시 알람 트리거: ${formTriggerId ? (triggerExists ? '✅ 활성' : '⚠️ ID 있음 but 실제 없음 → reinstallAllTriggers() 실행') : '❌ 없음 → reinstallAllTriggers() 실행'}`);
    if (sheetUrl) {
      try {
        const totalRows = getTargetSheet(sheetUrl).getLastRow();
        Logger.log(`  시트: ✅ 총 ${totalRows}행, 미처리 ${Math.max(0, totalRows - lastCheckedRow)}행`);
      } catch (ex) { Logger.log(`  시트: ❌ ${ex.message}`); }
    }
  }
  Logger.log('\n=== 진단 완료 ===');
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
  const lines = [`*[${configName || '새 알림'}]* 🔔 새로운 응답이 등록되었습니다!`, ''];
  for (let c = 0; c < headers.length; c++) {
    if (headers[c]) lines.push(`${headers[c]}: ${rowData[c] != null ? String(rowData[c]) : ''}`);
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
    if (code < 200 || code >= 300) {
      Logger.log(`[sendWebhook] HTTP ${code}: ${res.getContentText().substring(0, 200)}`);
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
