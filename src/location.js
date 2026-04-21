import { RateLimiter, showToast } from './utils.js';
import { mapManager } from './map.js';

const rateLimiter = new RateLimiter(300); // 1 request per 300ms
const MAX_GROUPS = 5;

class LocationManager {
  constructor() {
    this.groups = [];
  }

  // Search for a location using Amap POI API
  async searchLocation(name) {
    return rateLimiter.execute(async () => {
      return new Promise((resolve, reject) => {
        AMap.plugin('AMap.PlaceSearch', () => {
          const placeSearch = new AMap.PlaceSearch({
            pageSize: 1,
            pageIndex: 1,
            city: '全国',
            citylimit: false
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
                district: poi.adname
              });
            } else {
              reject(new Error(`找不到地点: ${name}`));
            }
          });
        });
      });
    });
  }

  // Add a new location group
  async addGroup(locationNames) {
    if (this.groups.length >= MAX_GROUPS) {
      showToast(`最多支持 ${MAX_GROUPS} 个地点组`, 'error');
      return null;
    }

    const groupIndex = this.groups.length;
    const group = {
      id: `group-${groupIndex}`,
      name: `分组 ${groupIndex + 1}`,
      locations: [],
      visible: true,
      color: mapManager.markerColors[groupIndex % mapManager.markerColors.length]
    };

    this.groups.push(group);

    // Batch search locations
    const promises = locationNames.map(name =>
      this.searchLocation(name.trim())
        .then(location => {
          group.locations.push(location);
          // Add marker to map
          mapManager.addMarker(location, groupIndex, (selectedLoc) => {
            // Emit marker selected event
            window.dispatchEvent(new CustomEvent('markerSelected', {
              detail: { location: selectedLoc, groupIndex }
            }));
          });
          return { success: true, name, location };
        })
        .catch(error => {
          return { success: false, name, error: error.message };
        })
    );

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    if (successCount > 0) {
      showToast(`成功添加 ${successCount} 个地点${failedCount > 0 ? `，${failedCount} 个地点搜索失败` : ''}`,
        failedCount > 0 ? 'warning' : 'success');
    } else {
      showToast('所有地点搜索失败', 'error');
      this.groups.pop(); // Remove empty group
      return null;
    }

    // Show failed locations in toast
    const failedLocations = results.filter(r => !r.success);
    if (failedLocations.length > 0) {
      console.warn('Failed locations:', failedLocations);
      showToast(`搜索失败的地点: ${failedLocations.map(f => f.name).join(', ')}`, 'warning');
    }

    // Fit map to all markers in this group
    const markers = mapManager.markers.filter(m => m.groupIndex === groupIndex);
    if (markers.length > 0) {
      mapManager.map.setFitView(markers.map(m => m.marker));
    }

    return group;
  }

  // Toggle group visibility
  toggleGroupVisibility(groupIndex, visible) {
    if (this.groups[groupIndex]) {
      this.groups[groupIndex].visible = visible;
      mapManager.toggleGroupMarkers(groupIndex, visible);
    }
  }

  // Remove a group
  removeGroup(groupIndex) {
    if (this.groups[groupIndex]) {
      this.groups.splice(groupIndex, 1);
      mapManager.removeGroupMarkers(groupIndex);
      // Reindex remaining groups
      this.groups.forEach((group, idx) => {
        // Update marker group indices
        mapManager.markers.forEach(item => {
          if (item.groupIndex > groupIndex) {
            item.groupIndex--;
          }
        });
      });
      showToast('已删除分组', 'info');
    }
  }

  // Get all locations across all groups
  getAllLocations() {
    return this.groups.flatMap(group => group.locations);
  }
}

// Export singleton instance
export const locationManager = new LocationManager();
