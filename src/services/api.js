const BASE_URL = 'https://script.google.com/macros/s/AKfycbyglb8DxmUJ8Zbimw1pQszwo96rlldmWY-r7TP1t94R4Uqc_cOUtSDWN1NnIb9xQin5iQ/exec';

export const apiCall = async (payload) => {
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain', // Bypass CORS preflight
      },
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

export const loginApi = async (name, team, password) => {
  return await apiCall({ action: 'login', name, team, password });
};

export const registerApi = async (name, team, password) => {
  return await apiCall({ action: 'register', name, team, password });
};

export const getConfigApi = async (userId) => {
  return await apiCall({ action: 'getConfig', userId });
};

export const addConfigApi = async (userId, configData) => {
  return await apiCall({ action: 'addConfig', userId, ...configData });
};

export const updateConfigApi = async (userId, configId, configData) => {
  return await apiCall({ action: 'updateConfig', userId, configId, ...configData });
};

export const deleteConfigApi = async (userId, configId) => {
  return await apiCall({ action: 'deleteConfig', userId, configId });
};

export const getLogsApi = async (userId) => {
  return await apiCall({ action: 'getLogs', userId });
};
