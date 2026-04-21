import { mapManager } from './map.js';
import { showToast } from './utils.js';

async function initApp() {
  try {
    await mapManager.init();
    showToast('地图加载成功', 'success');
  } catch (error) {
    console.error('Init error:', error);
  }
}

initApp();
