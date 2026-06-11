import { showToast } from "./utils.js";

const MAX_LOCATIONS = 20;

class LocationManager {
  constructor() {
    this.locations = [];
  }

  // Search for a location using Amap POI API
  searchLocation(name) {
    return new Promise((resolve, reject) => {
      AMap.plugin("AMap.PlaceSearch", () => {
        const placeSearch = new AMap.PlaceSearch({
          pageSize: 1,
          pageIndex: 1,
          city: "全国",
          citylimit: false,
        });

        placeSearch.search(name, (status, result) => {
          if (
            status === "complete" &&
            result.poiList &&
            result.poiList.pois.length > 0
          ) {
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
      showToast(`最多收藏 ${MAX_LOCATIONS} 个地点`, "error");
      return false;
    }

    // Check for duplicates （tolerance ~10m）
    if (this.hasLocation(location.latitude, location.longitude)) {
      showToast("该地点已收藏", "warning");
      return false;
    }

    this.locations.push(location);
    showToast(`已添加: ${location.name}`, "success");
    return true;
  }

  // Remove a location by index
  removeLocation(index) {
    if (index >= 0 && index < this.locations.length) {
      const removed = this.locations.splice(index, 1)[0];
      showToast(`已删除: ${removed.name}`, "info");
      return removed;
    }
    return null;
  }

  // Check if a location already exists （tolerance ~10m）
  hasLocation(lat, lng) {
    const TOLERANCE = 0.0001;
    return this.locations.some(
      (loc) =>
        Math.abs(loc.latitude - lat) < TOLERANCE &&
        Math.abs(loc.longitude - lng) < TOLERANCE,
    );
  }

  // Get all locations
  getAllLocations() {
    return this.locations;
  }
}

// Export singleton instance
export const locationManager = new LocationManager();
