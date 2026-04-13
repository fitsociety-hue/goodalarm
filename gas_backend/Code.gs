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

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === userId) {
      configs.push({
        configId: data[i][0],
        name: data[i][2],
        sheetUrl: data[i][3],
        chatWebhook: data[i][4],
        startDate: data[i][6] || '',
        endDate: data[i][7] || '',
        weekdaysOnly: data[i][8] || false
      });
    }
  }
  return { success: true, configs };
}

function handleAddConfig({ userId, name, sheetUrl, chatWebhook, startDate, endDate, weekdaysOnly }) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('ConfigsV2');
  
  let lastCheckedRow = 0;
  if(sheetUrl) {
    try {
      const targetSs = SpreadsheetApp.openByUrl(sheetUrl);
      lastCheckedRow = targetSs.getSheets()[0].getLastRow();
    } catch(e) {
      return { success: false, message: '해당 스프레드시트에 접근할 수 없거나 URL이 잘못되었습니다.' };
    }
  }

  const configId = Utilities.getUuid();
  sheet.appendRow([configId, userId, name, sheetUrl, chatWebhook, lastCheckedRow, startDate, endDate, weekdaysOnly || false]);
  return { success: true, message: '설정이 추가되었습니다.' };
}

function handleUpdateConfig({ userId, configId, name, sheetUrl, chatWebhook, startDate, endDate, weekdaysOnly }) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('ConfigsV2');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === configId && data[i][1] === userId) {
      
      // Update check row if URL changed. Minimal approach: just keep old or recalculate safely.
      let lastCheckedRow = data[i][5];
      if (data[i][3] !== sheetUrl) {
        try {
          const targetSs = SpreadsheetApp.openByUrl(sheetUrl);
          lastCheckedRow = targetSs.getSheets()[0].getLastRow();
        } catch(e) {
          return { success: false, message: '새로운 시트 URL에 접근할 수 없습니다.' };
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
  const sheet = ss.getSheetByName('Logs');
  if(!sheet) return { success: true, logs: [] };
  const data = sheet.getDataRange().getValues();
  const logs = [];

  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] === userId) {
      logs.push({
        timestamp: data[i][0],
        message: data[i][2]
      });
    }
  }
  return { success: true, logs: logs.slice(0, 50) };
}

function checkAndSendAlarms() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName('ConfigsV2');
  if (!configSheet) return;
  const configData = configSheet.getDataRange().getValues();
  const logsSheet = ss.getSheetByName('Logs');
  
  const TZ = "Asia/Seoul";
  const todayStr = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");

  for (let i = 1; i < configData.length; i++) {
    const configId = configData[i][0];
    const userId = configData[i][1];
    const configName = configData[i][2];
    const sheetUrl = configData[i][3];
    const chatWebhook = configData[i][4];
    let lastCheckedRow = parseInt(configData[i][5]) || 0;
    const startDate = configData[i][6];
    const endDate = configData[i][7];
    const weekdaysOnly = configData[i][8] === true || String(configData[i][8]).toLowerCase() === 'true';

    let startStr = "";
    if (startDate) {
      startStr = (startDate instanceof Date) ? Utilities.formatDate(startDate, TZ, "yyyy-MM-dd") : String(startDate).split("T")[0];
    }
    let endStr = "";
    if (endDate) {
      endStr = (endDate instanceof Date) ? Utilities.formatDate(endDate, TZ, "yyyy-MM-dd") : String(endDate).split("T")[0];
    }

    if (!sheetUrl || !chatWebhook) continue;
    
    // Check date boundaries
    if (startStr && todayStr < startStr) continue;
    if (endStr && todayStr > endStr) continue;
    
    // Check weekdaysOnly
    if (weekdaysOnly) {
      const gmtTime = new Date();
      const currentHourStr = Utilities.formatDate(gmtTime, TZ, "H");
      const currentDayStr = Utilities.formatDate(gmtTime, TZ, "u"); // 1=Monday, 7=Sunday
      const currentHour = parseInt(currentHourStr, 10);
      const currentDay = parseInt(currentDayStr, 10);
      
      if (currentDay === 6 || currentDay === 7) continue; // Saturday or Sunday
      if (currentDay === 1 && currentHour < 9) continue;  // Monday before 9 AM
    }

    try {
      const targetSs = SpreadsheetApp.openByUrl(sheetUrl);
      const dataSheet = targetSs.getSheets()[0];
      const targetData = dataSheet.getDataRange().getValues();
      if (targetData.length === 0) continue;
      const headers = targetData[0];
      const totalRows = targetData.length;

      if (totalRows > lastCheckedRow) {
        let newEntriesCount = 0;
        for (let r = Math.max(lastCheckedRow, 1); r < totalRows; r++) {
          const rowData = targetData[r];
          let msgLines = [`*[${configName || '새 알림'}]* 새로운 응답이 등록되었습니다.`, ""];
          for (let c = 0; c < headers.length; c++) {
            if(headers[c]) {
              msgLines.push(headers[c] + ": " + rowData[c]);
            }
          }
          const messageText = msgLines.join("\n");
          
          sendToChatWebhook(chatWebhook, messageText);
          
          if(logsSheet) {
             logsSheet.appendRow([new Date().toISOString(), userId, `[${configName}] 발송: \n${messageText}`]);
          }
          newEntriesCount++;
        }
        
        configSheet.getRange(i + 1, 6).setValue(totalRows);
      }
    } catch (e) {
      if(logsSheet) {
        logsSheet.appendRow([new Date().toISOString(), userId, `[${configName}] 오류 발생: ${e.message}`]);
      }
    }
  }
}

function sendToChatWebhook(url, text) {
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    payload: JSON.stringify({ text: text }),
    muteHttpExceptions: true
  };
  UrlFetchApp.fetch(url, options);
}

function doGet(e) {
  setup();
  return ContentService.createTextOutput("Good Alarm Backend V2 Active.");
}
