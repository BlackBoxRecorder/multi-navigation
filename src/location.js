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
        id: loc.id,
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

  // Load locations from localStorage (only loads data with id field)
  loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        // Only load entries that have an id (discard legacy data)
        this.locations = data.filter((loc) => loc.id).slice(0, MAX_LOCATIONS);
      }
    } catch (e) {
      console.warn('从 localStorage 加载地点失败:', e);
    }
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

    // Generate stable short UUID (with fallback for older browsers)
    const uuid =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
          });
    location.id = uuid.slice(0, 8);
    this.locations.push(location);
    return true;
  }

  // Remove a location by id
  removeLocation(id) {
    const index = this.locations.findIndex((loc) => loc.id === id);
    if (index !== -1) {
      const removed = this.locations.splice(index, 1)[0];
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
