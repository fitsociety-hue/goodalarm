// =============================================================
//  Good Alarm - Backend (Google Apps Script)
//  v3.0 - 즉시 알람 아키텍처
//  - 폼 제출 즉시 알람: installFormTrigger()로 각 시트에 onFormSubmit 트리거 설치
//  - 백업 폴링: 10분마다 checkAndSendAlarms()로 누락 방지
// =============================================================

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

  // ConfigsV2에 formTriggerId 컬럼이 없으면 추가 (구버전 호환)
  const configSheet = ss.getSheetByName('ConfigsV2');
  if (configSheet) {
    const firstRow = configSheet.getRange(1, 1, 1, configSheet.getLastColumn()).getValues()[0];
    if (!firstRow.includes('formTriggerId')) {
      configSheet.getRange(1, firstRow.length + 1).setValue('formTriggerId');
    }
  }

  Logger.log('[setup] DB 초기화 완료');
}

// ── doPost: 프론트엔드 API 라우터 ────────────────────────────
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ success: false, message: 'No payload' });
    }
    const data = JSON.parse(e.postData.contents);
    setup();

    const handlers = {
      register:      () => handleRegister(data),
      login:         () => handleLogin(data),
      getConfig:     () => handleGetConfig(data),
      addConfig:     () => handleAddConfig(data),
      updateConfig:  () => handleUpdateConfig(data),
      deleteConfig:  () => handleDeleteConfig(data),
      getLogs:       () => handleGetLogs(data),
      testWebhook:   () => handleTestWebhook(data),
      runCheckNow:   () => handleRunCheckNow(data),
    };

    const handler = handlers[data.action];
    if (!handler) return json({ success: false, message: `Unknown action: ${data.action}` });
    return json(handler());

  } catch (err) {
    Logger.log('[doPost] 예외: ' + err.message);
    return json({ success: false, error: err.toString() });
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── 회원가입 ─────────────────────────────────────────────────
function handleRegister({ name, team, password }) {
  const sheet = getSheet('Users');
  const data  = sheet.getDataRange().getValues();
  const userId = name + '_' + team;

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
  const userId = name + '_' + team;

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
      lastCheckedRow: data[i][5],
      startDate:     formatDateCell(data[i][6], TZ),
      endDate:       formatDateCell(data[i][7], TZ),
      weekdaysOnly:  data[i][8] === true || String(data[i][8]).toLowerCase() === 'true',
      formTriggerId: data[i][9] || ''
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
      const dataSheet   = getTargetSheet(sheetUrl);
      lastCheckedRow    = dataSheet.getLastRow();

      // ★ 폼 제출 즉시 알람 트리거 설치
      formTriggerId = installFormTrigger(sheetUrl);
      Logger.log(`[addConfig] 시트 접근 성공. lastCheckedRow=${lastCheckedRow}, triggerId=${formTriggerId}`);
    } catch (e) {
      Logger.log(`[addConfig] 시트 접근 실패: ${e.message}`);
      return { success: false, message: '스프레드시트에 접근할 수 없습니다. URL과 공유 권한을 확인해주세요.' };
    }
  }

  const configId = Utilities.getUuid();
  sheet.appendRow([configId, userId, name, sheetUrl, chatWebhook,
                   lastCheckedRow, startDate || '', endDate || '',
                   weekdaysOnly || false, formTriggerId]);

  Logger.log(`[addConfig] 완료. configId=${configId}`);
  return { success: true, message: '설정이 추가되었습니다. 즉시 알람이 활성화되었습니다! 🔔' };
}

// ── 설정 수정 ─────────────────────────────────────────────────
function handleUpdateConfig({ userId, configId, name, sheetUrl, chatWebhook, startDate, endDate, weekdaysOnly }) {
  const sheet = getSheet('ConfigsV2');
  const data  = sheet.getDataRange().getValues();

  // configId 컬럼 인덱스 (헤더 기준)
  const headers = data[0];
  const formTriggerColIdx = headers.indexOf('formTriggerId'); // 0-based

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== configId || data[i][1] !== userId) continue;

    const oldUrl          = String(data[i][3]).trim();
    const newUrl          = String(sheetUrl).trim();
    let   lastCheckedRow  = parseInt(data[i][5]) || 0;
    let   formTriggerId   = data[i][9] || '';

    if (oldUrl !== newUrl) {
      // URL 변경 → 기존 트리거 제거 후 새 트리거 설치
      if (formTriggerId) removeFormTrigger(formTriggerId);
      try {
        const dataSheet  = getTargetSheet(newUrl);
        lastCheckedRow   = dataSheet.getLastRow();
        formTriggerId    = installFormTrigger(newUrl);
        Logger.log(`[updateConfig] URL 변경. 새 lastCheckedRow=${lastCheckedRow}, triggerId=${formTriggerId}`);
      } catch (e) {
        return { success: false, message: '새 스프레드시트에 접근할 수 없습니다.' };
      }
    }

    sheet.getRange(i + 1, 3).setValue(name);
    sheet.getRange(i + 1, 4).setValue(sheetUrl);
    sheet.getRange(i + 1, 5).setValue(chatWebhook);
    sheet.getRange(i + 1, 6).setValue(lastCheckedRow);
    sheet.getRange(i + 1, 7).setValue(startDate || '');
    sheet.getRange(i + 1, 8).setValue(endDate || '');
    sheet.getRange(i + 1, 9).setValue(weekdaysOnly || false);
    if (formTriggerColIdx >= 0) {
      sheet.getRange(i + 1, formTriggerColIdx + 1).setValue(formTriggerId);
    }

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
    // 트리거 제거
    const triggerId = data[i][9];
    if (triggerId) removeFormTrigger(triggerId);
    sheet.deleteRow(i + 1);
    return { success: true, message: '삭제되었습니다.' };
  }
  return { success: false, message: '설정을 찾을 수 없거나 권한이 없습니다.' };
}

// ── 로그 조회 ─────────────────────────────────────────────────
function handleGetLogs({ userId }) {
  const logsSheet = getSheet('Logs');
  if (!logsSheet) return { success: true, logs: [] };

  const data = logsSheet.getDataRange().getValues();
  const logs = [];

  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] !== userId) continue;
    logs.push({ timestamp: data[i][0], message: String(data[i][2]) });
    if (logs.length >= 100) break;
  }
  return { success: true, logs };
}

// ── 웹훅 즉시 테스트 (프론트에서 버튼으로 호출) ──────────────
function handleTestWebhook({ userId, configId }) {
  const sheet = getSheet('ConfigsV2');
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== configId || data[i][1] !== userId) continue;

    const configName  = data[i][2];
    const chatWebhook = data[i][4];

    if (!chatWebhook) return { success: false, message: '웹훅 URL이 등록되지 않았습니다.' };

    const msg = `[Good Alarm 테스트] ✅\n*${configName}* 웹훅 연결에 성공했습니다!\n시각: ${formatNowKST()}`;
    const ok  = sendToChatWebhook(chatWebhook, msg);

    appendLog(userId, ok
      ? `[테스트] [${configName}] 웹훅 연결 성공 ✅`
      : `[테스트] [${configName}] 웹훅 전송 실패 ❌ - URL을 확인하세요.`);

    return { success: ok, message: ok ? '구글 챗으로 테스트 메시지를 발송했습니다!' : '웹훅 전송에 실패했습니다. URL을 확인해주세요.' };
  }
  return { success: false, message: '설정을 찾을 수 없습니다.' };
}

// ── 즉시 체크 (프론트의 "지금 확인" 버튼) ────────────────────
function handleRunCheckNow({ userId, configId }) {
  const sheet = getSheet('ConfigsV2');
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== configId || data[i][1] !== userId) continue;

    const configName     = data[i][2];
    const sheetUrl       = data[i][3];
    const chatWebhook    = data[i][4];
    let   lastCheckedRow = parseInt(data[i][5]) || 0;

    if (!sheetUrl || !chatWebhook) {
      return { success: false, message: 'URL 또는 웹훅이 설정되지 않았습니다.' };
    }

    try {
      const dataSheet  = getTargetSheet(sheetUrl);
      const targetData = dataSheet.getDataRange().getValues();
      const totalRows  = targetData.length;
      const headers    = targetData[0];

      if (totalRows <= lastCheckedRow) {
        return { success: true, message: `새로운 데이터가 없습니다. (현재 ${totalRows}행, 마지막 확인 ${lastCheckedRow}행)` };
      }

      let sentCount = 0;
      for (let r = Math.max(lastCheckedRow, 1); r < totalRows; r++) {
        const rowData    = targetData[r];
        const isRowEmpty = rowData.every(c => String(c).trim() === '');
        if (isRowEmpty) continue;

        const msg = buildMessage(configName, headers, rowData);
        const ok  = sendToChatWebhook(chatWebhook, msg);

        appendLog(userId, ok
          ? `[${configName}] 즉시 발송 성공 (row ${r + 1})\n${msg}`
          : `[${configName}] 즉시 발송 실패 (row ${r + 1})\n${msg}`);
        if (ok) sentCount++;
      }
      sheet.getRange(i + 1, 6).setValue(totalRows);
      return { success: true, message: `${sentCount}건을 구글 챗으로 발송했습니다.` };
    } catch (ex) {
      return { success: false, message: `시트 접근 오류: ${ex.message}` };
    }
  }
  return { success: false, message: '설정을 찾을 수 없습니다.' };
}

// =============================================================
//  ★ 핵심: 폼 제출 즉시 알람 (onFormSubmit 트리거에 연결)
//  - installFormTrigger()로 설치된 트리거가 이 함수를 호출함
// =============================================================
function onFormSubmitHandler(e) {
  Logger.log('[onFormSubmitHandler] 폼 제출 감지! 시작...');

  const ss          = e.source;          // 응답이 기록된 스프레드시트
  const sourceSheet = e.range.getSheet(); // 응답이 기록된 시트
  const submittedRow = e.range.getRow();

  // 해당 스프레드시트 URL을 포함한 ConfigsV2 설정 찾기
  const configSheet = getSheet('ConfigsV2');
  if (!configSheet) {
    Logger.log('[onFormSubmitHandler] ConfigsV2 시트 없음!');
    return;
  }

  const configData = configSheet.getDataRange().getValues();
  const ssId       = ss.getId();
  const TZ         = 'Asia/Seoul';
  const todayStr   = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const nowKST     = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const currentDay  = nowKST.getDay();
  const currentHour = nowKST.getHours();

  let handled = false;

  for (let i = 1; i < configData.length; i++) {
    const configName  = configData[i][2];
    const sheetUrl    = configData[i][3];
    const chatWebhook = configData[i][4];
    const startDate   = formatDateCell(configData[i][6], TZ);
    const endDate     = formatDateCell(configData[i][7], TZ);
    const weekdaysOnly = configData[i][8] === true || String(configData[i][8]).toLowerCase() === 'true';
    const userId       = configData[i][1];

    if (!sheetUrl || !chatWebhook) continue;

    // 제출된 스프레드시트 ID와 설정의 ID가 일치하는지 확인
    try {
      const cfgSsId = SpreadsheetApp.openByUrl(sheetUrl).getId();
      if (cfgSsId !== ssId) continue;

      // gid가 명시된 경우 시트 탭도 일치 여부 확인
      const match = sheetUrl.match(/[#&?]gid=([0-9]+)/);
      if (match) {
        const gid = parseInt(match[1], 10);
        if (sourceSheet.getSheetId() !== gid) continue;
      }
    } catch (ex) {
      Logger.log(`[onFormSubmitHandler] 시트 URL 비교 오류 [${configName}]: ${ex.message}`);
      continue;
    }

    // 날짜 범위 체크
    if (startDate && todayStr < startDate) {
      Logger.log(`[onFormSubmitHandler] [${configName}] 시작일 전. 건너뜀.`);
      continue;
    }
    if (endDate && todayStr > endDate) {
      Logger.log(`[onFormSubmitHandler] [${configName}] 종료일 이후. 건너뜀.`);
      continue;
    }

    // 평일 전용 설정 처리
    if (weekdaysOnly && (currentDay === 0 || currentDay === 6)) {
      Logger.log(`[onFormSubmitHandler] [${configName}] 주말 제출 - 즉시 알람 보류. 월요일 기준 체크에서 발송 예정.`);
      // lastCheckedRow는 업데이트하지 않아 10분 폴링의 월요일 로직이 처리
      continue;
    }

    // ★ 즉시 알람 발송
    const dataSheet  = sourceSheet;
    const headers    = dataSheet.getRange(1, 1, 1, dataSheet.getLastColumn()).getValues()[0];
    const rowData    = dataSheet.getRange(submittedRow, 1, 1, dataSheet.getLastColumn()).getValues()[0];

    const isRowEmpty = rowData.every(c => String(c).trim() === '');
    if (isRowEmpty) {
      Logger.log(`[onFormSubmitHandler] [${configName}] 빈 행 건너뜀.`);
      continue;
    }

    const msg = buildMessage(configName, headers, rowData);
    const ok  = sendToChatWebhook(chatWebhook, msg);

    Logger.log(`[onFormSubmitHandler] [${configName}] 즉시 발송 결과: ${ok ? '✅ 성공' : '❌ 실패'}`);

    appendLog(userId, ok
      ? `[${configName}] ⚡즉시 발송 성공 (row ${submittedRow})\n${msg}`
      : `[${configName}] ❌즉시 발송 실패 (row ${submittedRow}) - 웹훅 URL 확인 필요\n${msg}`);

    // lastCheckedRow 업데이트
    configSheet.getRange(i + 1, 6).setValue(dataSheet.getLastRow());
    handled = true;
  }

  if (!handled) {
    Logger.log('[onFormSubmitHandler] 일치하는 설정을 찾지 못했습니다.');
  }
  Logger.log('[onFormSubmitHandler] 처리 완료.');
}

// =============================================================
//  ★ 폼 트리거 설치/제거 유틸
// =============================================================

/**
 * 지정된 스프레드시트에 onFormSubmit 트리거를 설치하고 triggerId를 반환
 * 이미 동일 스프레드시트에 트리거가 있으면 재사용
 */
function installFormTrigger(sheetUrl) {
  const targetSs = SpreadsheetApp.openByUrl(sheetUrl);
  const ssId     = targetSs.getId();

  // 기존 트리거 중 동일 스프레드시트에 설치된 항목 확인
  const existing = ScriptApp.getProjectTriggers().find(t =>
    t.getHandlerFunction() === 'onFormSubmitHandler' &&
    t.getTriggerSourceId() === ssId
  );
  if (existing) {
    Logger.log(`[installFormTrigger] 기존 트리거 재사용. id=${existing.getUniqueId()}`);
    return existing.getUniqueId();
  }

  const trigger = ScriptApp.newTrigger('onFormSubmitHandler')
    .forSpreadsheet(targetSs)
    .onFormSubmit()
    .create();

  Logger.log(`[installFormTrigger] 새 트리거 설치 완료. id=${trigger.getUniqueId()}`);
  return trigger.getUniqueId();
}

/** 트리거 ID로 트리거 제거 */
function removeFormTrigger(triggerId) {
  if (!triggerId) return;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getUniqueId() === triggerId) {
      ScriptApp.deleteTrigger(t);
      Logger.log(`[removeFormTrigger] 트리거 제거 완료. id=${triggerId}`);
    }
  });
}

// =============================================================
//  ★ 10분 백업 폴링 (누락 방지 + 평일전용 주말 건 월요일 발송)
// =============================================================
function checkAndSendAlarms() {
  const configSheet = getSheet('ConfigsV2');
  if (!configSheet) return;

  const configData = configSheet.getDataRange().getValues();
  const TZ         = 'Asia/Seoul';
  const todayStr   = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const nowKST     = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const currentDay  = nowKST.getDay();
  const currentHour = nowKST.getHours();

  Logger.log(`[checkAndSendAlarms] 시작. today=${todayStr}, day=${currentDay}, hour=${currentHour}`);

  for (let i = 1; i < configData.length; i++) {
    const configId    = configData[i][0];
    const userId      = configData[i][1];
    const configName  = configData[i][2];
    const sheetUrl    = configData[i][3];
    const chatWebhook = configData[i][4];
    let   lastCheckedRow = parseInt(configData[i][5]) || 0;
    const startDate   = formatDateCell(configData[i][6], TZ);
    const endDate     = formatDateCell(configData[i][7], TZ);
    const weekdaysOnly = configData[i][8] === true || String(configData[i][8]).toLowerCase() === 'true';

    try {
      if (!sheetUrl || !chatWebhook) continue;
      if (startDate && todayStr < startDate) continue;
      if (endDate   && todayStr > endDate)   continue;

      // 평일 전용: 월요일 9시 이후에 주말 누락분 발송 + 평일 중 이미 즉시 발송된 건은 넘어감
      if (weekdaysOnly) {
        const isWeekend = currentDay === 0 || currentDay === 6;
        const isMondayMorning = currentDay === 1 && currentHour >= 9;
        if (isWeekend) continue;
        // 평일인 경우: 즉시 트리거가 처리하므로 lastCheckedRow와 실제 행수가 같으면 건너뜀
        if (!isMondayMorning) {
          // 평일 & 월요일 아침이 아닌 경우: 즉시 알람이 처리 → 폴링은 누락 방어만
        }
      }

      const dataSheet  = getTargetSheet(sheetUrl);
      const targetData = dataSheet.getDataRange().getValues();
      const totalRows  = targetData.length;
      const headers    = targetData[0];

      Logger.log(`[checkAndSendAlarms] [${configName}] totalRows=${totalRows}, lastCheckedRow=${lastCheckedRow}`);

      // 행수 감소 보정
      if (totalRows < lastCheckedRow) {
        configSheet.getRange(i + 1, 6).setValue(totalRows);
        lastCheckedRow = totalRows;
      }

      if (totalRows <= lastCheckedRow) {
        Logger.log(`[checkAndSendAlarms] [${configName}] 새 행 없음.`);
        continue;
      }

      Logger.log(`[checkAndSendAlarms] [${configName}] 미처리 행 감지 ${lastCheckedRow+1}~${totalRows}`);
      let sentCount = 0;

      for (let r = Math.max(lastCheckedRow, 1); r < totalRows; r++) {
        const rowData    = targetData[r];
        const isRowEmpty = rowData.every(c => String(c).trim() === '');
        if (isRowEmpty) continue;

        const msg = buildMessage(configName, headers, rowData);
        const ok  = sendToChatWebhook(chatWebhook, msg);

        appendLog(userId, ok
          ? `[${configName}] 📋폴링 발송 (row ${r + 1})\n${msg}`
          : `[${configName}] ❌폴링 발송 실패 (row ${r + 1})\n${msg}`);
        if (ok) sentCount++;
      }

      configSheet.getRange(i + 1, 6).setValue(totalRows);
      Logger.log(`[checkAndSendAlarms] [${configName}] 완료. 발송=${sentCount}건.`);

    } catch (ex) {
      Logger.log(`[checkAndSendAlarms] [${configName}] 예외: ${ex.message}`);
      appendLog(userId, `[${configName}] ❌오류: ${ex.message}`);
    }
  }
  Logger.log('[checkAndSendAlarms] 전체 완료.');
}

// =============================================================
//  ★ 수동 설치 함수 (스크립트 에디터에서 한 번 직접 실행)
//  → "모든 설정에 즉시 알람 트리거를 다시 설치"
// =============================================================
function reinstallAllFormTriggers() {
  const configSheet = getSheet('ConfigsV2');
  if (!configSheet) { Logger.log('[reinstall] ConfigsV2 없음'); return; }

  const data    = configSheet.getDataRange().getValues();
  const headers = data[0];
  const triggerColIdx = headers.indexOf('formTriggerId'); // 0-based

  for (let i = 1; i < data.length; i++) {
    const configName = data[i][2];
    const sheetUrl   = data[i][3];
    const oldId      = data[i][9] || '';

    if (!sheetUrl) continue;
    if (oldId) removeFormTrigger(oldId);

    try {
      const newId = installFormTrigger(sheetUrl);
      const col   = triggerColIdx >= 0 ? triggerColIdx + 1 : 10;
      configSheet.getRange(i + 1, col).setValue(newId);
      Logger.log(`[reinstall] [${configName}] 트리거 재설치 완료. id=${newId}`);
    } catch (ex) {
      Logger.log(`[reinstall] [${configName}] 실패: ${ex.message}`);
    }
  }
  Logger.log('[reinstall] 전체 완료.');
}

// 10분 백업 폴링 트리거 설치 (에디터에서 한 번 실행)
function installPollingTrigger() {
  const exists = ScriptApp.getProjectTriggers()
    .some(t => t.getHandlerFunction() === 'checkAndSendAlarms');
  if (!exists) {
    ScriptApp.newTrigger('checkAndSendAlarms').timeBased().everyMinutes(10).create();
    Logger.log('[installPollingTrigger] 10분 폴링 트리거 생성 완료.');
  } else {
    Logger.log('[installPollingTrigger] 이미 존재함.');
  }
}

// =============================================================
//  진단 함수 (에디터에서 직접 실행)
// =============================================================
function diagnosisAll() {
  const TZ    = 'Asia/Seoul';
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
  Logger.log('=== Good Alarm 진단 ===');
  Logger.log(`시각 (KST): ${today}`);

  const triggers = ScriptApp.getProjectTriggers();
  Logger.log(`\n▶ 전체 트리거 수: ${triggers.length}`);
  triggers.forEach((t, idx) => {
    Logger.log(`  [${idx}] 함수: ${t.getHandlerFunction()}, 소스: ${t.getTriggerSource()}, 소스ID: ${t.getTriggerSourceId()}`);
  });

  const configSheet = getSheet('ConfigsV2');
  if (!configSheet) { Logger.log('ConfigsV2 없음!'); return; }

  const data = configSheet.getDataRange().getValues();
  Logger.log(`\n▶ 설정 수: ${data.length - 1}개`);

  for (let i = 1; i < data.length; i++) {
    const configName     = data[i][2];
    const sheetUrl       = data[i][3];
    const chatWebhook    = data[i][4];
    const lastCheckedRow = parseInt(data[i][5]) || 0;
    const formTriggerId  = data[i][9] || '';

    Logger.log(`\n--- [${i}] ${configName} ---`);
    Logger.log(`  sheetUrl: ${sheetUrl ? sheetUrl.substring(0,80) : '없음'}`);
    Logger.log(`  webhook: ${chatWebhook ? '설정됨' : '❌없음'}`);
    Logger.log(`  lastCheckedRow: ${lastCheckedRow}`);
    Logger.log(`  formTriggerId: ${formTriggerId || '❌없음'}`);

    // 트리거 실제 존재 여부
    const triggerExists = triggers.some(t => t.getUniqueId() === formTriggerId);
    Logger.log(`  트리거 실제 존재: ${triggerExists ? '✅' : '❌ → reinstallAllFormTriggers() 실행 필요'}`);

    if (sheetUrl) {
      try {
        const ds = getTargetSheet(sheetUrl);
        const totalRows = ds.getLastRow();
        Logger.log(`  시트 접근: ✅ (전체 ${totalRows}행, 미처리 ${Math.max(0, totalRows - lastCheckedRow)}행)`);
      } catch (ex) {
        Logger.log(`  시트 접근: ❌ ${ex.message}`);
      }
    }
  }
  Logger.log('\n=== 진단 완료 ===');
}

function testWebhookConnection() {
  const configSheet = getSheet('ConfigsV2');
  const data        = configSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const configName  = data[i][2];
    const chatWebhook = data[i][4];
    if (!chatWebhook) { Logger.log(`[testWebhook] [${configName}] 웹훅 없음`); continue; }
    const msg = `[Good Alarm 테스트] *${configName}* 웹훅 연결 테스트 ✅\n${formatNowKST()}`;
    const ok  = sendToChatWebhook(chatWebhook, msg);
    Logger.log(`[testWebhook] [${configName}]: ${ok ? '✅ 성공' : '❌ 실패'}`);
  }
}

function resetAllLastCheckedRows() {
  const configSheet = getSheet('ConfigsV2');
  const data        = configSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const sheetUrl = data[i][3];
    if (!sheetUrl) continue;
    try {
      const currentRow = getTargetSheet(sheetUrl).getLastRow();
      configSheet.getRange(i + 1, 6).setValue(currentRow);
      Logger.log(`[reset] [${data[i][2]}] → ${currentRow}`);
    } catch (ex) {
      Logger.log(`[reset] [${data[i][2]}] 실패: ${ex.message}`);
    }
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
    const gid    = parseInt(match[1], 10);
    const sheets = ss.getSheets();
    const found  = sheets.find(s => s.getSheetId() === gid);
    if (found) return found;
  }
  return ss.getSheets()[0];
}

function buildMessage(configName, headers, rowData) {
  const lines = [`*[${configName || '새 알림'}]* 새로운 응답이 등록되었습니다! 🔔`, ''];
  for (let c = 0; c < headers.length; c++) {
    if (headers[c]) {
      const val = (rowData[c] !== undefined && rowData[c] !== null) ? String(rowData[c]) : '';
      lines.push(`${headers[c]}: ${val}`);
    }
  }
  return lines.join('\n');
}

function sendToChatWebhook(url, text) {
  if (!url) return false;
  try {
    const res  = UrlFetchApp.fetch(url.trim(), {
      method:           'POST',
      headers:          { 'Content-Type': 'application/json' },
      payload:          JSON.stringify({ text }),
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      Logger.log(`[sendToChatWebhook] HTTP ${code}: ${res.getContentText()}`);
    }
    return code >= 200 && code < 300;
  } catch (ex) {
    Logger.log(`[sendToChatWebhook] 예외: ${ex.message}`);
    return false;
  }
}

function appendLog(userId, message) {
  const logsSheet = getSheet('Logs');
  if (logsSheet) {
    logsSheet.appendRow([new Date().toISOString(), userId, message]);
  }
}

function formatDateCell(val, TZ) {
  if (!val) return '';
  if (val instanceof Date) return Utilities.formatDate(val, TZ, 'yyyy-MM-dd');
  return String(val).split('T')[0];
}

function formatNowKST() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
}

function doGet(e) {
  setup();
  return ContentService
    .createTextOutput('Good Alarm Backend V3 Active.')
    .setMimeType(ContentService.MimeType.TEXT);
}
