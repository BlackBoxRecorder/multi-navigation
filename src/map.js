import { showToast } from './utils.js';

class MapManager {
  constructor() {
    this.map = null;
    this.markers = [];
    this.routeLines = [];
    this.selectedMarker = null;
    this.markerColors = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316'];
  }

  init(containerId = 'mapContainer') {
    return new Promise((resolve, reject) => {
      try {
        this.map = new AMap.Map(containerId, {
          zoom: 11,
          center: [116.397428, 39.90923],
          resizeEnable: true
        });

        this.map.addControl(new AMap.Scale());
        this.map.addControl(new AMap.ToolBar({
          position: 'RB'
        }));
        this.map.addControl(new AMap.MapType({
          defaultType: 0,
          showTraffic: false
        }));

        this.map.plugin('AMap.Geolocation', () => {
          const geolocation = new AMap.Geolocation({
            enableHighAccuracy: true,
            timeout: 10000,
            zoomToAccuracy: true,
            position: 'RB'
          });
          
          geolocation.getCurrentPosition((status, result) => {
            if (status === 'complete') {
              this.map.setCenter(result.position);
              showToast('已定位到当前位置', 'success');
            } else {
              showToast('定位失败，使用默认位置', 'warning');
            }
          });
        });

        this.initSearchBar();
        
        resolve(this.map);
      } catch (error) {
        showToast('地图初始化失败，请检查API Key配置', 'error');
        reject(error);
      }
    });
  }

  initSearchBar() {
    const searchInput = document.getElementById('mapSearchInput');
    
    this.map.plugin('AMap.AutoComplete', () => {
      const autoComplete = new AMap.AutoComplete({
        input: searchInput
      });
      
      autoComplete.on('select', (e) => {
        if (e.poi && e.poi.location) {
          this.map.setCenter(e.poi.location);
          this.map.setZoom(15);
        }
      });
    });
  }

  addMarker(location, groupIndex, onClick = null) {
    const position = [location.longitude, location.latitude];
    
    const marker = new AMap.Marker({
      position: position,
      title: location.name,
      icon: new AMap.Icon({
        size: new AMap.Size(24, 36),
        image: `https://a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-${['red', 'blue', 'green', 'purple', 'orange'][groupIndex % 5]}.png`,
        imageSize: new AMap.Size(24, 36)
      }),
      anchor: 'bottom-center'
    });

    marker.on('click', () => {
      if (this.selectedMarker) {
        this.selectedMarker.setIcon(new AMap.Icon({
          size: new AMap.Size(24, 36),
          image: `https://a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-${['red', 'blue', 'green', 'purple', 'orange'][this.selectedMarker.groupIndex % 5]}.png`,
          imageSize: new AMap.Size(24, 36)
        }));
      }
      
      marker.setIcon(new AMap.Icon({
        size: new AMap.Size(24, 36),
        image: `https://a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-${['red', 'blue', 'green', 'purple', 'orange'][groupIndex % 5]}-highlight.png`,
        imageSize: new AMap.Size(24, 36)
      }));
      
      this.selectedMarker = marker;
      marker.locationData = location;
      marker.groupIndex = groupIndex;
      
      if (onClick) {
        onClick(location);
      }
    });

    const infoWindow = new AMap.InfoWindow({
      content: `<div class="p-2">
        <h3 class="font-semibold text-sm">${location.name}</h3>
        <p class="text-xs text-gray-600 mt-1">${location.address || '地址不详'}</p>
      </div>`,
      offset: new AMap.Pixel(0, -36)
    });

    marker.on('mouseover', () => {
      infoWindow.open(this.map, position);
    });

    marker.on('mouseout', () => {
      infoWindow.close();
    });

    this.map.add(marker);
    this.markers.push({ marker, groupIndex, location });
    
    return marker;
  }

  toggleGroupMarkers(groupIndex, visible) {
    this.markers.forEach(item => {
      if (item.groupIndex === groupIndex) {
        if (visible) {
          item.marker.show();
        } else {
          item.marker.hide();
        }
      }
    });
  }

  removeGroupMarkers(groupIndex) {
    const groupMarkers = this.markers.filter(item => item.groupIndex === groupIndex);
    groupMarkers.forEach(item => {
      this.map.remove(item.marker);
    });
    this.markers = this.markers.filter(item => item.groupIndex !== groupIndex);
  }

  addRouteLine(path, color = '#3b82f6', width = 4, opacity = 0.8) {
    const polyline = new AMap.Polyline({
      path: path,
      strokeColor: color,
      strokeWeight: width,
      strokeOpacity: opacity,
      zIndex: 50
    });
    
    this.map.add(polyline);
    this.routeLines.push(polyline);
    
    this.map.setFitView([polyline]);
    
    return polyline;
  }

  clearRouteLines() {
    this.map.remove(this.routeLines);
    this.routeLines = [];
  }

  getAllLocations() {
    return this.markers.map(item => item.location);
  }

  getSelectedOrigin() {
    return this.selectedMarker ? this.selectedMarker.locationData : null;
  }
}

export const mapManager = new MapManager();
