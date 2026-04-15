const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ['Users', 'ConfigsV2', 'Logs'].forEach(name => {
    if (!ss.getSheetByName(name)) {
      const sheet = ss.insertSheet(name);
      if (name === 'Users') sheet.appendRow(['userId', 'name', 'team', 'password']);
      if (name === 'ConfigsV2') sheet.appendRow(['configId', 'userId', 'name', 'sheetUrl', 'chatWebhook', 'lastCheckedRow', 'startDate', 'endDate', 'weekdaysOnly']);
      if (name === 'Logs') sheet.appendRow(['timestamp', 'userId', 'message']);
    }
  });

  const oldSheet = ss.getSheetByName('Config');
  const newSheet = ss.getSheetByName('ConfigsV2');
  if (oldSheet && newSheet && newSheet.getLastRow() === 1) {
    const oldData = oldSheet.getDataRange().getValues();
    for (let i = 1; i < oldData.length; i++) {
      if (oldData[i][0] && oldData[i][1]) {
        newSheet.appendRow([Utilities.getUuid(), oldData[i][0], '기존 알람 설정', oldData[i][1], oldData[i][2], oldData[i][3], '', '', false]);
      }
    }
  }

  const triggers = ScriptApp.getProjectTriggers();
  const exists = triggers.some(t => t.getHandlerFunction() === 'checkAndSendAlarms');
  if (!exists) {
    ScriptApp.newTrigger('checkAndSendAlarms')
      .timeBased()
      .everyMinutes(10)
      .create();
    Logger.log('[setup] 트리거 새로 생성 완료 (10분 간격)');
  } else {
    Logger.log('[setup] 트리거 이미 존재함');
  }
}

function doPost(e) {
  try {
    let data;
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else {
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: 'No payload' })).setMimeType(ContentService.MimeType.JSON);
    }
    const action = data.action;
    let result = {};

    setup(); 

    if (action === 'register') {
      result = handleRegister(data);
    } else if (action === 'login') {
      result = handleLogin(data);
    } else if (action === 'getConfig') {
      result = handleGetConfig(data);
    } else if (action === 'addConfig') {
      result = handleAddConfig(data);
    } else if (action === 'updateConfig') {
      result = handleUpdateConfig(data);
    } else if (action === 'deleteConfig') {
      result = handleDeleteConfig(data);
    } else if (action === 'getLogs') {
      result = handleGetLogs(data);
    }

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleRegister({ name, team, password }) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  const userId = name + '_' + team;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      return { success: false, message: '이미 존재하는 사용자입니다.' };
    }
  }

  sheet.appendRow([userId, name, team, password]);
  return { success: true, userId, name, team };
}

function handleLogin({ name, team, password }) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  const userId = name + '_' + team;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId && String(data[i][3]) === String(password)) {
      return { success: true, userId, name, team };
    }
  }
  return { success: false, message: '정보를 확인해주세요.' };
}

function handleGetConfig({ userId }) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('ConfigsV2');
  if (!sheet) return { success: true, configs: [] };
  const data = sheet.getDataRange().getValues();
  const configs = [];

  const TZ = "Asia/Seoul";
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === userId) {
      let stDateStr = data[i][6] || '';
      let edDateStr = data[i][7] || '';
      
      if (stDateStr instanceof Date) {
        stDateStr = Utilities.formatDate(stDateStr, TZ, "yyyy-MM-dd");
      }
      if (edDateStr instanceof Date) {
        edDateStr = Utilities.formatDate(edDateStr, TZ, "yyyy-MM-dd");
      }

      configs.push({
        configId: data[i][0],
        name: data[i][2],
        sheetUrl: data[i][3],
        chatWebhook: data[i][4],
        lastCheckedRow: data[i][5], // 디버깅용으로 포함
        startDate: stDateStr,
        endDate: edDateStr,
        weekdaysOnly: data[i][8] || false
      });
    }
  }
  return { success: true, configs };
}

function handleAddConfig({ userId, name, sheetUrl, chatWebhook, startDate, endDate, weekdaysOnly }) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('ConfigsV2');
  
  // 등록 시점의 현재 행수를 lastCheckedRow로 저장 (이후 새로 추가되는 행만 감지)
  let lastCheckedRow = 0;
  if (sheetUrl) {
    try {
      const dataSheet = getTargetSheet(sheetUrl);
      lastCheckedRow = dataSheet.getLastRow();
      Logger.log(`[addConfig] 시트 접근 성공. 현재 행수: ${lastCheckedRow}`);
    } catch(e) {
      Logger.log(`[addConfig] 시트 접근 실패: ${e.message}`);
      return { success: false, message: '해당 스프레드시트에 접근할 수 없거나 URL이 잘못되었습니다.' };
    }
  }

  const configId = Utilities.getUuid();
  sheet.appendRow([configId, userId, name, sheetUrl, chatWebhook, lastCheckedRow, startDate, endDate, weekdaysOnly || false]);
  Logger.log(`[addConfig] 설정 추가 완료. configId=${configId}, lastCheckedRow=${lastCheckedRow}`);
  return { success: true, message: '설정이 추가되었습니다.' };
}

function handleUpdateConfig({ userId, configId, name, sheetUrl, chatWebhook, startDate, endDate, weekdaysOnly }) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('ConfigsV2');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === configId && data[i][1] === userId) {
      
      // ★ 핵심 수정: URL이 변경된 경우에만 lastCheckedRow를 재계산
      // URL이 동일한 경우: 기존 lastCheckedRow 유지 (미처리 신청자를 건너뛰지 않음)
      let lastCheckedRow = parseInt(data[i][5]) || 0;
      const oldUrl = String(data[i][3]).trim();
      const newUrl = String(sheetUrl).trim();

      if (oldUrl !== newUrl) {
        // URL이 바뀐 경우에만 새 시트의 현재 행수로 초기화
        try {
          const dataSheet = getTargetSheet(newUrl);
          lastCheckedRow = dataSheet.getLastRow();
          Logger.log(`[updateConfig] URL 변경 감지. 새 lastCheckedRow=${lastCheckedRow}`);
        } catch(e) {
          Logger.log(`[updateConfig] 새 URL 접근 실패: ${e.message}`);
          return { success: false, message: '새로운 시트 URL에 접근할 수 없습니다.' };
        }
      } else {
        Logger.log(`[updateConfig] URL 동일. lastCheckedRow 유지: ${lastCheckedRow}`);
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
  }
  return { success: false, message: '설정을 찾을 수 없습니다.' };
}

function handleDeleteConfig({ userId, configId }) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('ConfigsV2');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === configId && data[i][1] === userId) {
      sheet.deleteRow(i + 1);
      return { success: true, message: '삭제되었습니다.' };
    }
  }
  return { success: false, message: '설정을 찾을 수 없거나 권한이 없습니다.' };
}

function handleGetLogs({ userId }) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logsSheet = ss.getSheetByName('Logs');
  if(!logsSheet) return { success: true, logs: [] };

  const configSheet = ss.getSheetByName('ConfigsV2');
  let activeConfigNames = [];
  if (configSheet) {
    const configData = configSheet.getDataRange().getValues();
    for (let i = 1; i < configData.length; i++) {
        if (configData[i][1] === userId && configData[i][2]) {
            activeConfigNames.push(`[${configData[i][2]}]`); 
        }
    }
  }

  const data = logsSheet.getDataRange().getValues();
  const logs = [];

  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] === userId) {
      const msg = String(data[i][2]);
      
      let isOrphan = true;
      for (const confName of activeConfigNames) {
         if (msg.startsWith(confName)) {
            isOrphan = false;
            break;
         }
      }
      
      if (msg.startsWith('[새 알림]') || msg.startsWith('[진단]') || msg.startsWith('[오류]')) {
         isOrphan = false; 
      }

      if (!isOrphan) {
        logs.push({
          timestamp: data[i][0],
          message: msg
        });
      }
    }
    if (logs.length >= 50) break;
  }
  return { success: true, logs: logs };
}

// ─────────────────────────────────────────
// 핵심 알람 체크 함수 (트리거로 10분마다 실행)
// ─────────────────────────────────────────
function checkAndSendAlarms() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName('ConfigsV2');
  if (!configSheet) return;
  const configData = configSheet.getDataRange().getValues();
  const logsSheet = ss.getSheetByName('Logs');
  
  const TZ = "Asia/Seoul";
  const todayStr = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
  const nowKST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
  const currentDay = nowKST.getDay();   // 0(일) ~ 6(토)
  const currentHour = nowKST.getHours(); // 0 ~ 23

  Logger.log(`[checkAndSendAlarms] 실행 시작. today=${todayStr}, day=${currentDay}, hour=${currentHour}`);

  for (let i = 1; i < configData.length; i++) {
    const configId   = configData[i][0];
    const userId     = configData[i][1];
    const configName = configData[i][2];
    const sheetUrl   = configData[i][3];
    const chatWebhook = configData[i][4];
    let   lastCheckedRow = parseInt(configData[i][5]) || 0;
    const startDate  = configData[i][6];
    const endDate    = configData[i][7];
    const weekdaysOnly = configData[i][8] === true || String(configData[i][8]).toLowerCase() === 'true';

    let startStr = "";
    if (startDate) {
      startStr = (startDate instanceof Date)
        ? Utilities.formatDate(startDate, TZ, "yyyy-MM-dd")
        : String(startDate).split("T")[0];
    }
    let endStr = "";
    if (endDate) {
      endStr = (endDate instanceof Date)
        ? Utilities.formatDate(endDate, TZ, "yyyy-MM-dd")
        : String(endDate).split("T")[0];
    }

    try {
      if (!sheetUrl || !chatWebhook) {
        Logger.log(`[checkAndSendAlarms] [${configName}] sheetUrl 또는 webhook 없음. 건너뜀.`);
        continue;
      }
      
      // 날짜 범위 체크
      if (startStr && todayStr < startStr) {
        Logger.log(`[checkAndSendAlarms] [${configName}] 시작일 전. today=${todayStr}, start=${startStr}`);
        continue;
      }
      if (endStr && todayStr > endStr) {
        Logger.log(`[checkAndSendAlarms] [${configName}] 종료일 이후. today=${todayStr}, end=${endStr}`);
        continue;
      }
      
      // 평일 전용 체크
      if (weekdaysOnly) {
        if (currentDay === 0 || currentDay === 6) {
          Logger.log(`[checkAndSendAlarms] [${configName}] 주말 제외. day=${currentDay}`);
          continue;
        }
        if (currentDay === 1 && currentHour < 9) {
          Logger.log(`[checkAndSendAlarms] [${configName}] 월요일 9시 이전 제외.`);
          continue;
        }
      }

      const dataSheet  = getTargetSheet(sheetUrl);
      const targetData = dataSheet.getDataRange().getValues();

      if (targetData.length === 0) {
        Logger.log(`[checkAndSendAlarms] [${configName}] 시트 데이터 없음.`);
        continue;
      }

      const headers   = targetData[0];
      const totalRows = targetData.length; // 헤더 포함 전체 행수

      Logger.log(`[checkAndSendAlarms] [${configName}] totalRows=${totalRows}, lastCheckedRow=${lastCheckedRow}`);

      // 시트 행수가 줄어든 경우(행 삭제 등) 자동 보정
      if (totalRows < lastCheckedRow) {
        Logger.log(`[checkAndSendAlarms] [${configName}] 행수 감소 감지. 보정: ${lastCheckedRow} → ${totalRows}`);
        configSheet.getRange(i + 1, 6).setValue(totalRows);
        lastCheckedRow = totalRows;
      }

      if (totalRows > lastCheckedRow) {
        Logger.log(`[checkAndSendAlarms] [${configName}] 새 행 감지! 처리 시작: row ${lastCheckedRow + 1} ~ ${totalRows}`);
        let sentCount = 0;

        for (let r = Math.max(lastCheckedRow, 1); r < totalRows; r++) {
          const rowData = targetData[r];
          
          // 행 전체가 빈 경우 건너뜀
          const isRowEmpty = rowData.every(cell => String(cell).trim() === "");
          if (isRowEmpty) {
            Logger.log(`[checkAndSendAlarms] [${configName}] row[${r}] 비어 있어 건너뜀.`);
            continue;
          }

          let msgLines = [`*[${configName || '새 알림'}]* 새로운 응답이 등록되었습니다! 🔔`, ""];
          for (let c = 0; c < headers.length; c++) {
            if (headers[c]) {
              const val = (rowData[c] !== undefined && rowData[c] !== null) ? String(rowData[c]) : "";
              msgLines.push(headers[c] + ": " + val);
            }
          }
          const messageText = msgLines.join("\n");
          
          const success = sendToChatWebhook(chatWebhook, messageText);
          Logger.log(`[checkAndSendAlarms] [${configName}] row[${r}] 웹훅 전송 결과: ${success}`);
          
          if (logsSheet) {
            if (success) {
              logsSheet.appendRow([new Date().toISOString(), userId, `[${configName}] 발송 성공 (row ${r + 1}):\n${messageText}`]);
            } else {
              logsSheet.appendRow([new Date().toISOString(), userId, `[${configName}] 발송 실패 - 웹훅 오류 (row ${r + 1}):\n${messageText}`]);
            }
          }
          if (success) sentCount++;
        }
        
        // 모든 새 행 처리 후 lastCheckedRow 업데이트
        configSheet.getRange(i + 1, 6).setValue(totalRows);
        Logger.log(`[checkAndSendAlarms] [${configName}] 완료. 발송=${sentCount}건. lastCheckedRow → ${totalRows}`);
      } else {
        Logger.log(`[checkAndSendAlarms] [${configName}] 새 행 없음.`);
      }
    } catch (e) {
      Logger.log(`[checkAndSendAlarms] [${configName}] 예외 발생: ${e.message}`);
      if (logsSheet) {
        logsSheet.appendRow([new Date().toISOString(), userId, `[${configName}] 오류 발생: ${e.message}`]);
      }
    }
  }

  Logger.log('[checkAndSendAlarms] 전체 실행 완료.');
}

// ─────────────────────────────────────────
// 진단 함수 1: 웹훅 연결 테스트
// GAS 편집기에서 직접 실행하여 웹훅이 동작하는지 확인
// ─────────────────────────────────────────
function testWebhookConnection() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName('ConfigsV2');
  const logsSheet   = ss.getSheetByName('Logs');

  if (!configSheet) {
    Logger.log('[testWebhook] ConfigsV2 시트 없음!');
    return;
  }

  const configData = configSheet.getDataRange().getValues();
  Logger.log(`[testWebhook] 총 설정 수: ${configData.length - 1}개`);

  for (let i = 1; i < configData.length; i++) {
    const configName  = configData[i][2];
    const chatWebhook = configData[i][4];
    const userId      = configData[i][1];

    if (!chatWebhook) {
      Logger.log(`[testWebhook] [${configName}] 웹훅 URL 없음.`);
      continue;
    }

    const testMsg = `[진단] *${configName}* - Good Alarm 웹훅 연결 테스트 ✅\n시각: ${Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss")}`;
    const ok = sendToChatWebhook(chatWebhook, testMsg);
    Logger.log(`[testWebhook] [${configName}] 결과: ${ok ? '✅ 성공' : '❌ 실패'}`);

    if (logsSheet) {
      logsSheet.appendRow([new Date().toISOString(), userId,
        ok
          ? `[진단] [${configName}] 웹훅 연결 테스트 성공`
          : `[진단] [${configName}] 웹훅 연결 테스트 실패 - URL을 확인하세요.`
      ]);
    }
  }
}

// ─────────────────────────────────────────
// 진단 함수 2: 전체 상태 진단 (스크립트 에디터에서 실행)
// ConfigsV2 내 모든 설정의 현재 상태를 Logger에 출력
// ─────────────────────────────────────────
function diagnosisAll() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName('ConfigsV2');
  const TZ = "Asia/Seoul";
  const today = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss");

  Logger.log('========================================');
  Logger.log(`[진단] 실행 시각 (KST): ${today}`);
  Logger.log('========================================');

  if (!configSheet) {
    Logger.log('[진단] ConfigsV2 시트를 찾을 수 없습니다!');
    return;
  }

  const configData = configSheet.getDataRange().getValues();
  Logger.log(`[진단] 설정 행 수: ${configData.length - 1}개`);

  // 트리거 확인
  const triggers = ScriptApp.getProjectTriggers();
  const alarmTriggers = triggers.filter(t => t.getHandlerFunction() === 'checkAndSendAlarms');
  Logger.log(`[진단] checkAndSendAlarms 트리거 수: ${alarmTriggers.length}`);
  alarmTriggers.forEach((t, idx) => {
    Logger.log(`  트리거[${idx}] - 유형: ${t.getTriggerSource()}, 이벤트: ${t.getEventType()}`);
  });

  for (let i = 1; i < configData.length; i++) {
    const configName    = configData[i][2];
    const sheetUrl      = configData[i][3];
    const chatWebhook   = configData[i][4];
    const lastCheckedRow = parseInt(configData[i][5]) || 0;
    const startDate     = configData[i][6];
    const endDate       = configData[i][7];

    Logger.log(`\n--- 설정[${i}]: ${configName} ---`);
    Logger.log(`  sheetUrl: ${sheetUrl ? sheetUrl.substring(0, 60) + '...' : '없음'}`);
    Logger.log(`  chatWebhook: ${chatWebhook ? '설정됨' : '❌ 없음'}`);
    Logger.log(`  lastCheckedRow: ${lastCheckedRow}`);
    Logger.log(`  startDate: ${startDate}, endDate: ${endDate}`);

    if (sheetUrl) {
      try {
        const dataSheet = getTargetSheet(sheetUrl);
        const sheetName = dataSheet.getName();
        const totalRows = dataSheet.getLastRow();
        Logger.log(`  ✅ 시트 접근 성공. 시트명: "${sheetName}", 전체 행수: ${totalRows}`);
        if (totalRows > lastCheckedRow) {
          Logger.log(`  ⚠️ 미처리 행 있음: ${totalRows - lastCheckedRow}행 (row ${lastCheckedRow + 1} ~ ${totalRows})`);
        } else {
          Logger.log(`  ✅ 미처리 행 없음.`);
        }
      } catch (e) {
        Logger.log(`  ❌ 시트 접근 실패: ${e.message}`);
      }
    }
  }

  Logger.log('\n========================================');
  Logger.log('[진단] 완료. 위 로그를 확인하세요.');
  Logger.log('========================================');
}

// ─────────────────────────────────────────
// 복구 함수: lastCheckedRow를 현재 기준으로 리셋
// ⚠️ 주의: 실행하면 현재 시점 이후 새로 추가되는 행만 감지함
// ─────────────────────────────────────────
function resetAllLastCheckedRows() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName('ConfigsV2');
  if (!configSheet) {
    Logger.log('[reset] ConfigsV2 시트 없음!');
    return;
  }

  const configData = configSheet.getDataRange().getValues();
  for (let i = 1; i < configData.length; i++) {
    const configName = configData[i][2];
    const sheetUrl   = configData[i][3];
    if (!sheetUrl) continue;
    try {
      const dataSheet  = getTargetSheet(sheetUrl);
      const currentRow = dataSheet.getLastRow();
      configSheet.getRange(i + 1, 6).setValue(currentRow);
      Logger.log(`[reset] [${configName}] lastCheckedRow → ${currentRow} 으로 초기화`);
    } catch(e) {
      Logger.log(`[reset] [${configName}] 시트 접근 실패: ${e.message}`);
    }
  }
  Logger.log('[reset] 전체 초기화 완료.');
}

// ─────────────────────────────────────────
// URL에서 gid 파라미터를 파싱하여 정확한 시트 탭 반환
// ─────────────────────────────────────────
function getTargetSheet(url) {
  const ss = SpreadsheetApp.openByUrl(url);
  // URL에서 gid 추출 (쿼리스트링 ?gid= 또는 해시 #gid= 모두 지원)
  const match = url.match(/[#&?]gid=([0-9]+)/);
  if (match) {
    const gid    = parseInt(match[1], 10);
    const sheets = ss.getSheets();
    for (let i = 0; i < sheets.length; i++) {
      if (sheets[i].getSheetId() === gid) {
        return sheets[i];
      }
    }
  }
  return ss.getSheets()[0];
}

function sendToChatWebhook(url, text) {
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    payload: JSON.stringify({ text: text }),
    muteHttpExceptions: true
  };
  try {
    const response = UrlFetchApp.fetch(url.trim(), options);
    const code = response.getResponseCode();
    if (code < 200 || code >= 300) {
      Logger.log(`[sendToChatWebhook] HTTP 오류: ${code}, 응답: ${response.getContentText()}`);
    }
    return code >= 200 && code < 300;
  } catch (e) {
    Logger.log(`[sendToChatWebhook] 예외: ${e.message}`);
    return false;
  }
}

function doGet(e) {
  setup();
  return ContentService.createTextOutput("Good Alarm Backend V2 Active.").setMimeType(ContentService.MimeType.TEXT);
}
