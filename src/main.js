import { mapManager } from './map.js';
import { uiManager } from './ui.js';
import { showToast } from './utils.js';
import { locationManager } from './location.js';
import { routeManager } from './route.js';

async function initApp() {
  try {
    await mapManager.init();
    showToast('地图加载成功', 'success');

    // Listen for marker selection events
    window.addEventListener('markerSelected', async (e) => {
      const { location } = e.detail;
      uiManager.updateSelectedOrigin(location);
      // Calculate all routes from selected origin
      await routeManager.calculateAllRoutes(location);
    });

    // Listen for group added events
    window.addEventListener('groupAdded', () => {
      const allLocations = locationManager.getAllLocations();
      document.getElementById('calcOptimalRouteBtn').disabled = allLocations.length < 2;
    });

  } catch (error) {
    console.error('Init error:', error);
    showToast('应用初始化失败', 'error');
  }
}

initApp();
