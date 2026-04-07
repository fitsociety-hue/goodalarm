const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ['Users', 'Config', 'Logs'].forEach(name => {
    if (!ss.getSheetByName(name)) {
      const sheet = ss.insertSheet(name);
      if (name === 'Users') sheet.appendRow(['userId', 'name', 'team', 'password']);
      if (name === 'Config') sheet.appendRow(['userId', 'sheetUrl', 'chatWebhook', 'lastCheckedRow']);
      if (name === 'Logs') sheet.appendRow(['timestamp', 'userId', 'message']);
    }
  });

  // Create 10-min trigger
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
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    let result = {};

    setup(); // Ensure setup

    if (action === 'register') {
      result = handleRegister(data);
    } else if (action === 'login') {
      result = handleLogin(data);
    } else if (action === 'getConfig') {
      result = handleGetConfig(data);
    } else if (action === 'updateConfig') {
      result = handleUpdateConfig(data);
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
  const sheet = ss.getSheetByName('Config');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      return { success: true, sheetUrl: data[i][1], chatWebhook: data[i][2], tracking: data[i][1] && data[i][2] };
    }
  }
  return { success: true, sheetUrl: '', chatWebhook: '', tracking: false };
}

function handleUpdateConfig({ userId, sheetUrl, chatWebhook }) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Config');
  const data = sheet.getDataRange().getValues();
  
  let found = false;
  // Test if sheet url is accessible logic
  let lastCheckedRow = 0;
  if(sheetUrl) {
    try {
      const targetSs = SpreadsheetApp.openByUrl(sheetUrl);
      lastCheckedRow = targetSs.getSheets()[0].getLastRow();
    } catch(e) {
      return { success: false, message: '해당 스프레드시트에 접근할 수 없거나 URL이 잘못되었습니다. 앱스스크립트 계정이 시트에 대한 접근 권한이 있어야 합니다.' };
    }
  }

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      sheet.getRange(i + 1, 2).setValue(sheetUrl);
      sheet.getRange(i + 1, 3).setValue(chatWebhook);
      sheet.getRange(i + 1, 4).setValue(lastCheckedRow);
      found = true;
      break;
    }
  }

  if (!found) {
    sheet.appendRow([userId, sheetUrl, chatWebhook, lastCheckedRow]);
  }
  return { success: true, message: '저장되었습니다.' };
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
  const configSheet = ss.getSheetByName('Config');
  if (!configSheet) return;
  const configData = configSheet.getDataRange().getValues();
  const logsSheet = ss.getSheetByName('Logs');

  for (let i = 1; i < configData.length; i++) {
    const userId = configData[i][0];
    const sheetUrl = configData[i][1];
    const chatWebhook = configData[i][2];
    let lastCheckedRow = parseInt(configData[i][3]) || 0;

    if (!sheetUrl || !chatWebhook) continue;

    try {
      const targetSs = SpreadsheetApp.openByUrl(sheetUrl);
      const dataSheet = targetSs.getSheets()[0];
      const targetData = dataSheet.getDataRange().getValues();
      const headers = targetData[0];
      const totalRows = targetData.length;

      if (totalRows > lastCheckedRow) {
        let newEntriesCount = 0;
        for (let r = Math.max(lastCheckedRow, 1); r < totalRows; r++) {
          const rowData = targetData[r];
          // Make a generic message using headers
          let msgLines = ["*[새로운 신청자 알림]*", ""];
          for (let c = 0; c < headers.length; c++) {
            if(headers[c]) {
              msgLines.push(headers[c] + ": " + rowData[c]);
            }
          }
          const messageText = msgLines.join("\n");
          
          sendToChatWebhook(chatWebhook, messageText);
          
          if(logsSheet) {
             logsSheet.appendRow([new Date().toISOString(), userId, `새 알림 발송: \n${messageText}`]);
          }
          newEntriesCount++;
        }
        
        // update last checked row
        configSheet.getRange(i + 1, 4).setValue(totalRows);
      }
    } catch (e) {
      if(logsSheet) {
        logsSheet.appendRow([new Date().toISOString(), userId, `오류 발생: ${e.message}`]);
      }
    }
  }
}

function sendToChatWebhook(url, text) {
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    payload: JSON.stringify({
      text: text
    }),
    muteHttpExceptions: true
  };
  UrlFetchApp.fetch(url, options);
}

// Handling GET for simple testing if needed
function doGet(e) {
  setup();
  return ContentService.createTextOutput("Good Alarm Backend Active.");
}
