const BASE_URL = 'https://script.google.com/macros/s/AKfycbw4yMjgzqtWTzEoYKeIaVZyLLfqDSFh4VjwhTQ3MTDJ6k9nTBrI_DJInDszVRR9OF0buQ/exec';

export const apiCall = async (payload) => {
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // CORS preflight 우회
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API Call Error:', error);
    if (error.message === 'Failed to fetch') {
      return { success: false, message: '서버 연결 실패(CORS 오류). Google Apps Script 배포 설정(모든 사용자 접근)과 URL을 확인해주세요.' };
    }
    return { success: false, message: '서버와 통신하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' };
  }
};

export const loginApi    = (name, team, password) => apiCall({ action: 'login',    name, team, password });
export const registerApi = (name, team, password) => apiCall({ action: 'register', name, team, password });
export const getConfigApi   = (userId) => apiCall({ action: 'getConfig', userId });
export const getLogsApi     = (userId) => apiCall({ action: 'getLogs',   userId });
export const addConfigApi    = (userId, configData) => apiCall({ action: 'addConfig',    userId, ...configData });
export const updateConfigApi = (userId, configId, configData) => apiCall({ action: 'updateConfig', userId, configId, ...configData });
export const deleteConfigApi = (userId, configId) => apiCall({ action: 'deleteConfig', userId, configId });

// ★ 신규: 웹훅 연결 테스트
export const testWebhookApi = (userId, configId) => apiCall({ action: 'testWebhook', userId, configId });

// ★ 신규: 즉시 체크 & 발송
export const runCheckNowApi = (userId, configId) => apiCall({ action: 'runCheckNow', userId, configId });
