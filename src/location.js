import { showToast } from './utils.js';

const MAX_LOCATIONS = 20;
const STORAGE_KEY = 'map_my_locations';

class LocationManager {
  constructor() {
    this.locations = [];
  }

  // Save locations to localStorage
  saveToStorage() {
    try {
      const data = this.locations.map((loc) => ({
        name: loc.name,
        address: loc.address,
        latitude: loc.latitude,
        longitude: loc.longitude,
        city: loc.city || '',
        district: loc.district || '',
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('保存地点到 localStorage 失败:', e);
    }
  }

  // Load locations from localStorage
  loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        this.locations = data.slice(0, MAX_LOCATIONS);
      }
    } catch (e) {
      console.warn('从 localStorage 加载地点失败:', e);
    }
  }

  // Search for a location using Amap POI API
  searchLocation(name) {
    return new Promise((resolve, reject) => {
      AMap.plugin('AMap.PlaceSearch', () => {
        const placeSearch = new AMap.PlaceSearch({
          pageSize: 1,
          pageIndex: 1,
          city: '全国',
          citylimit: false,
        });

        placeSearch.search(name, (status, result) => {
          if (status === 'complete' && result.poiList && result.poiList.pois.length > 0) {
            const poi = result.poiList.pois[0];
            resolve({
              name: poi.name,
              address: poi.address,
              latitude: poi.location.lat,
              longitude: poi.location.lng,
              city: poi.cityname,
              district: poi.adname,
            });
          } else {
            reject(new Error(`找不到地点: ${name}`));
          }
        });
      });
    });
  }

  // Add a single location to the flat list
  addLocation(location) {
    if (this.locations.length >= MAX_LOCATIONS) {
      showToast(`最多收藏 ${MAX_LOCATIONS} 个地点`, 'error');
      return false;
    }

    // Check for duplicates （tolerance ~10m）
    if (this.hasLocation(location.latitude, location.longitude)) {
      showToast('有相近地点已收藏', 'warning');
      return false;
    }

    this.locations.push(location);
    return true;
  }

  // Remove a location by index
  removeLocation(index) {
    if (index >= 0 && index < this.locations.length) {
      const removed = this.locations.splice(index, 1)[0];
      showToast(`已删除: ${removed.name}`, 'info');
      return removed;
    }
    return null;
  }

  // Check if a location already exists （tolerance ~10m）
  hasLocation(lat, lng) {
    const TOLERANCE = 0.0001;
    return this.locations.some((loc) => Math.abs(loc.latitude - lat) < TOLERANCE && Math.abs(loc.longitude - lng) < TOLERANCE);
  }

  // Clear all locations
  clearAll() {
    const count = this.locations.length;
    if (count === 0) return;
    this.locations = [];
    localStorage.removeItem(STORAGE_KEY);
    showToast(`已清空 ${count} 个地点`, 'info');
  }

  // Get all locations
  getAllLocations() {
    return this.locations;
  }
}

// Export singleton instance
export const locationManager = new LocationManager();
