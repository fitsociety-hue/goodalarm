// GAS URL은 localStorage에서 동적으로 읽음 → 배포 URL이 바뀌어도 앱에서 직접 업데이트 가능
const DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbw4yMjgzqtWTzEoYKeIaVZyLLfqDSFh4VjwhTQ3MTDJ6k9nTBrI_DJInDszVRR9OF0buQ/exec';

export const getBaseUrl = () => {
  return localStorage.getItem('goodalarm_gas_url') || DEFAULT_URL;
};

export const setBaseUrl = (url) => {
  if (url && url.trim()) {
    localStorage.setItem('goodalarm_gas_url', url.trim());
  }
};

export const apiCall = async (payload) => {
  const BASE_URL = getBaseUrl();
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API Call Error:', error, 'URL:', BASE_URL);
    if (error.message === 'Failed to fetch') {
      return { success: false, message: '서버 연결 실패. GAS URL을 확인하거나 배포 설정(모든 사용자 접근)을 확인해주세요.' };
    }
    return { success: false, message: '서버 통신 오류가 발생했습니다.' };
  }
};

export const loginApi    = (name, team, password) => apiCall({ action: 'login',    name, team, password });
export const registerApi = (name, team, password) => apiCall({ action: 'register', name, team, password });
export const getConfigApi   = (userId) => apiCall({ action: 'getConfig', userId });
export const getLogsApi     = (userId) => apiCall({ action: 'getLogs',   userId });
export const addConfigApi    = (userId, configData) => apiCall({ action: 'addConfig',    userId, ...configData });
export const updateConfigApi = (userId, configId, configData) => apiCall({ action: 'updateConfig', userId, configId, ...configData });
export const deleteConfigApi = (userId, configId) => apiCall({ action: 'deleteConfig', userId, configId });
export const testWebhookApi  = (userId, configId) => apiCall({ action: 'testWebhook',  userId, configId });
export const runCheckNowApi  = (userId, configId) => apiCall({ action: 'runCheckNow',  userId, configId });
export const checkGasVersionApi = () => apiCall({ action: 'checkVersion' });
