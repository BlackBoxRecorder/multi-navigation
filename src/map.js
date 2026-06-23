import { RateLimiter, showToast } from './utils.js';
import { locationManager } from './location.js';

const poiRateLimiter = new RateLimiter(500); // Rate limit for POI search on map click

class MapManager {
  constructor() {
    this.map = null;
    this.markers = new Map(); // id → { marker, location, tooltip }
    this.routeLines = [];
    this.destinationMarker = null;
    this.destinationTooltip = null;
    this.originMarker = null;
    this.originTooltip = null;
    this.poiInfoWindow = null;
  }

  init(containerId = 'mapContainer') {
    return new Promise((resolve, reject) => {
      try {
        this.map = new AMap.Map(containerId, {
          zoom: 11,
          center: [116.397428, 39.90923],
          resizeEnable: true,
        });

        this.map.plugin('AMap.Geolocation', () => {
          const geolocation = new AMap.Geolocation({
            enableHighAccuracy: true,
            timeout: 10000,
            zoomToAccuracy: true,
            position: 'RB',
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

        // Add map type switcher (standard/satellite) - bottom-right via CSS transform
        AMap.plugin('AMap.MapType', () => {
          const mapType = new AMap.MapType({
            defaultType: 0,
            position: 'RB',
          });
          this.map.addControl(mapType);
        });

        // Add zoom/location toolbar - bottom-right, anchored at corner
        AMap.plugin('AMap.ToolBar', () => {
          const toolBar = new AMap.ToolBar({
            position: 'LB',
            offset: [10, 30],
          });
          this.map.addControl(toolBar);
        });

        this.initSearchBar();
        this.initPoiClickListener();

        resolve(this.map);
      } catch (error) {
        console.error('地图初始化失败:', error);
        showToast('地图初始化失败，请检查API Key配置', 'error');
        reject(error);
      }
    });
  }

  initSearchBar() {
    const searchInput = document.getElementById('mapSearchInput');

    this.map.plugin('AMap.AutoComplete', () => {
      const autoComplete = new AMap.AutoComplete({
        input: searchInput,
      });

      autoComplete.on('select', (e) => {
        if (e.poi && e.poi.location) {
          this.map.setCenter(e.poi.location);
          this.map.setZoom(15);
        }
      });
    });
  }

  // --- POI Click Listener ---

  initPoiClickListener() {
    // Disable default right-click context menu on the map container
    const container = this.map.getContainer();
    container.addEventListener('contextmenu', (e) => e.preventDefault());

    // Cache the currently hovered hotspot POI for right-click
    this._hotspotCache = null;

    this.map.on('hotspotover', (e) => {
      this._hotspotCache = {
        name: e.name,
        id: e.id,
        lnglat: e.lnglat,
      };
    });

    this.map.on('hotspotout', () => {
      this._hotspotCache = null;
    });

    this.map.on('rightclick', (e) => {
      // 优先级1：右键点击已有收藏标记附近 → 弹出该地点的信息窗
      const nearMarkerData = this.getNearMarkerData(e);
      if (nearMarkerData) {
        this.closePoiInfoWindow();
        const markerLngLat = new AMap.LngLat(nearMarkerData.longitude, nearMarkerData.latitude);
        this.showPoiInfoWindow(markerLngLat, nearMarkerData);
        return;
      }

      // 优先级2：右键点击地图POI热点（未收藏）→ 逆地理编码后弹出添加收藏弹窗
      if (this._hotspotCache) {
        this.closePoiInfoWindow();
        // 使用 hotspot 缓存的实际坐标，而非鼠标点击位置（更精准）
        this.reverseGeocodeForAddress(this._hotspotCache.lnglat, this._hotspotCache.name);
        return;
      }

      // Right-click on blank area — do nothing
    });
  }

  // Returns location data if click is near a saved marker, otherwise null
  getNearMarkerData(clickEvent) {
    const clickPixel = clickEvent.pixel;
    const THRESHOLD_PX = 20;

    for (const item of this.markers.values()) {
      const markerPixel = this.map.lngLatToContainer(item.marker.getPosition());
      const dx = clickPixel.x - markerPixel.x;
      const dy = clickPixel.y - markerPixel.y;
      if (Math.sqrt(dx * dx + dy * dy) < THRESHOLD_PX) {
        return item.location;
      }
    }
    return null;
  }

  // Reverse geocode to get an address, using hotspot name as the POI name
  reverseGeocodeForAddress(lnglat, poiName) {
    poiRateLimiter.execute(async () => {
      return new Promise((resolve) => {
        this.map.plugin('AMap.Geocoder', () => {
          const geocoder = new AMap.Geocoder({});

          geocoder.getAddress([lnglat.getLng(), lnglat.getLat()], (status, result) => {
            if (status === 'complete' && result.regeocode) {
              const addressComponent = result.regeocode.addressComponent;
              const pois = result.regeocode.pois || [];

              // Use the closest matching POI for address, or the formatted address
              let poiAddress;
              if (pois.length > 0) {
                const clickLng = lnglat.getLng();
                const clickLat = lnglat.getLat();
                let closestPoi = pois[0];
                let minDistance = Infinity;

                for (const poi of pois) {
                  if (poi.location) {
                    const poiLng = poi.location.lng || poi.location.getLng();
                    const poiLat = poi.location.lat || poi.location.getLat();
                    const dist = Math.sqrt(Math.pow(clickLng - poiLng, 2) + Math.pow(clickLat - poiLat, 2));
                    if (dist < minDistance) {
                      minDistance = dist;
                      closestPoi = poi;
                    }
                  }
                }
                poiAddress = closestPoi.address || result.regeocode.formattedAddress;
              } else {
                poiAddress = `${addressComponent.province || ''}${addressComponent.city || ''}${addressComponent.district || ''}`;
              }

              const poiData = {
                name: poiName,
                address: poiAddress,
                latitude: lnglat.getLat(),
                longitude: lnglat.getLng(),
              };

              this.showPoiInfoWindow(lnglat, poiData);
            } else {
              // Geocoder failed, still show with hotspot name
              const poiData = {
                name: poiName,
                address: '',
                latitude: lnglat.getLat(),
                longitude: lnglat.getLng(),
              };
              this.showPoiInfoWindow(lnglat, poiData);
            }
            resolve();
          });
        });
      });
    });
  }

  // --- Custom Info Window ---

  showPoiInfoWindow(lnglat, poiData) {
    this.closePoiInfoWindow();

    const isCollected = locationManager.hasLocation(poiData.latitude, poiData.longitude);

    const infoDiv = document.createElement('div');
    infoDiv.className = 'absolute z-[100] bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[280px]';
    infoDiv.style.transform = 'translate(-50%, -120%)';

    infoDiv.innerHTML = `
      <button class="poi-info-close-btn close-poi-btn" title="关闭">✕</button>
      <h3 class="font-semibold text-sm text-gray-800 mb-1 pr-5">${poiData.name}</h3>
      <p class="text-xs text-gray-500 mb-3 truncate max-w-[200px]">${poiData.address || '地址不详'}</p>
      <div class="flex space-x-1.5">
        <button class="add-location-btn flex-1 text-xs px-2 py-1.5 rounded font-medium transition-colors
          ${isCollected ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600 text-white'}"
          ${isCollected ? 'disabled' : ''}>
          收藏
        </button>
        <button class="set-origin-btn flex-1 text-xs px-2 py-1.5 rounded font-medium bg-orange-500 hover:bg-orange-600 text-white transition-colors">
          设为起点
        </button>
        <button class="set-destination-btn flex-1 text-xs px-2 py-1.5 rounded font-medium bg-green-500 hover:bg-green-600 text-white transition-colors">
          设为终点
        </button>
      </div>
    `;

    // Position the info window
    const container = this.map.getContainer();
    container.appendChild(infoDiv);

    // Update position initially and on map move
    const updatePosition = () => {
      const pixel = this.map.lngLatToContainer(lnglat);
      infoDiv.style.left = pixel.x + 'px';
      infoDiv.style.top = pixel.y + 'px';
    };

    updatePosition();
    const moveHandler = () => updatePosition();
    this.map.on('move', moveHandler);
    this.map.on('zoom', moveHandler);

    // Store cleanup references
    this.poiInfoWindow = {
      el: infoDiv,
      moveHandler,
      lnglat,
      poiData,
    };

    // Bind button events
    infoDiv.querySelector('.close-poi-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closePoiInfoWindow();
    });

    infoDiv.querySelector('.add-location-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isCollected) {
        const added = locationManager.addLocation(poiData);
        if (added) {
          this.addMyLocationMarker(poiData);
          window.dispatchEvent(
            new CustomEvent('locationAdded', {
              detail: { location: poiData },
            }),
          );
          this.closePoiInfoWindow();
        }
      }
    });

    infoDiv.querySelector('.set-origin-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (locationManager.getAllLocations().length === 0) {
        showToast('请先添加收藏地点', 'warning');
        return;
      }
      window.dispatchEvent(
        new CustomEvent('originSet', {
          detail: { origin: poiData },
        }),
      );
      this.closePoiInfoWindow();
    });

    infoDiv.querySelector('.set-destination-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (locationManager.getAllLocations().length === 0) {
        showToast('请先添加收藏地点', 'warning');
        return;
      }
      window.dispatchEvent(
        new CustomEvent('destinationSet', {
          detail: { destination: poiData },
        }),
      );
      this.closePoiInfoWindow();
    });
  }

  closePoiInfoWindow() {
    if (this.poiInfoWindow) {
      this.map.off('move', this.poiInfoWindow.moveHandler);
      this.map.off('zoom', this.poiInfoWindow.moveHandler);
      if (this.poiInfoWindow.el.parentNode) {
        this.poiInfoWindow.el.parentNode.removeChild(this.poiInfoWindow.el);
      }
      this.poiInfoWindow = null;
    }
  }

  // --- Marker Methods ---

  addMyLocationMarker(location) {
    const position = [location.longitude, location.latitude];

    const marker = new AMap.Marker({
      position: position,
      title: location.name,
      content:
        '<div style="width:28px;height:28px;">' +
        `<svg t="1781248210821" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="23184" width="28" height="28"><path d="M536.217 90.69c-168.027 0-302.524 134.497-302.524 302.524 0 120.961 87.056 215.095 181.191 336.055 32.786 45.949 58.866 91.9 92.023 150.268 1.74 3.105 3.974 5.961 6.582 8.321 5.588 5.091 12.047 9.438 22.726 9.438v0c11.425 0 18.007-4.844 23.844-10.432 1.986-1.862 3.726-4.098 5.217-6.334 33.158-52.409 59.362-98.481 92.273-144.556 94.135-127.666 181.191-221.801 181.191-342.761 0-168.027-134.497-302.524-302.524-302.524v0zM536.217 494.055c-53.774 0-100.842-40.362-100.842-100.842s40.362-100.842 100.842-100.842c53.774 0 100.842 40.362 100.842 100.842 0 53.774-40.362 100.842-100.842 100.842v0z" fill="#47bd46" p-id="23185"></path><path d="M536.217 770.624c-140.334 0-254.091 53.525-254.091 119.47s113.757 119.47 254.091 119.47 254.091-53.525 254.091-119.47-113.757-119.47-254.091-119.47zM536.217 938.651c-105.561 0-191.003-37.505-191.003-78.735s85.566-74.886 191.003-74.886 191.003 33.532 191.003 74.886-85.566 78.735-191.003 78.735z" fill="#47bd46" p-id="23186"></path></svg>` +
        '</div>',
      anchor: 'bottom-center',
      zIndex: 100,
    });

    // DOM tooltip: outer (pointer-events:none) for positioning, inner (pointer-events:auto) for hover
    // Container bottom = marker top; inner div with spacer fills entire 90px, creating seamless hover zone
    const container = this.map.getContainer();
    const tooltip = document.createElement('div');
    tooltip.style.cssText = 'position:absolute;z-index:1000;pointer-events:none;display:none;width:0;height:90px;';
    tooltip.innerHTML = `<div class="tooltip-inner" style="pointer-events:auto;position:relative;display:flex;flex-direction:column;align-items:center;transform:translateX(-50%);">
      <div style="background:white;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);padding:8px 12px;font-size:13px;line-height:1.4;white-space:nowrap;">
        <div style="font-weight:600;">${location.name}</div>
        <div style="color:#4b5563;font-size:12px;margin-top:2px;">${location.address || '地址不详'}</div>
      </div>
      <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:8px solid white;margin-top:-1px;"></div>
      <div style="width:30px;flex:1;background:transparent;"></div>
    </div>`;
    container.appendChild(tooltip);

    const updateTooltipPos = () => {
      const pixel = this.map.lngLatToContainer(position);
      tooltip.style.left = pixel.x + 'px';
      tooltip.style.bottom = container.clientHeight - pixel.y - 4 + 'px';
    };

    const moveHandler = () => updateTooltipPos();
    this.map.on('move', moveHandler);
    this.map.on('zoom', moveHandler);
    this.map.on('resize', moveHandler);

    let closeTimer = null;
    const show = () => {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      updateTooltipPos();
      tooltip.style.display = 'block';
    };
    const hide = () => {
      closeTimer = setTimeout(() => {
        tooltip.style.display = 'none';
      }, 80);
    };

    const tooltipInner = tooltip.querySelector('.tooltip-inner');
    marker.on('mouseover', show);
    marker.on('mouseout', hide);
    tooltipInner.addEventListener('mouseenter', () => {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
    });
    tooltipInner.addEventListener('mouseleave', hide);

    this.map.add(marker);
    this.markers.set(location.id, { marker, location, tooltip: { el: tooltip, moveHandler } });
  }

  addDestinationMarker(location) {
    // Clear origin marker when setting destination (mutual exclusion)
    this.clearOriginMarker();

    // Remove old destination marker and tooltip if exists
    if (this.destinationMarker) {
      this.map.remove(this.destinationMarker);
    }
    if (this.destinationTooltip) {
      this.map.off('move', this.destinationTooltip.moveHandler);
      this.map.off('zoom', this.destinationTooltip.moveHandler);
      this.map.off('resize', this.destinationTooltip.moveHandler);
      this.destinationTooltip.el.remove();
      this.destinationTooltip = null;
    }

    const position = [location.longitude, location.latitude];

    this.destinationMarker = new AMap.Marker({
      position: position,
      title: '目的地: ' + location.name,
      content:
        '<div style="width:28px;height:28px;">' +
        `<svg t="1781248311650" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="24161" width="28" height="28"><path d="M516.937143 2.194286C301.129143 3.145143 126.317714 179.529143 127.268571 395.337143c0.877714 202.532571 323.401143 567.552 360.155429 608.475428a45.421714 45.421714 0 0 0 67.949714-0.292571c36.388571-41.252571 355.657143-409.124571 354.742857-611.657143C909.165714 176.054857 732.745143 1.243429 516.937143 2.194286z m2.523428 563.273143a158.72 158.72 0 0 1-159.268571-157.842286 158.72 158.72 0 0 1 157.842286-159.232 158.72 158.72 0 0 1 159.268571 157.805714 158.72 158.72 0 0 1-157.842286 159.268572z" fill="#FF3737" p-id="24162"></path></svg>` +
        '</div>',
      anchor: 'bottom-center',
      zIndex: 200,
    });

    // DOM tooltip: outer (pointer-events:none) for positioning, inner (pointer-events:auto) for hover
    // Container bottom = marker top; inner div with spacer fills entire 90px, creating seamless hover zone
    const container = this.map.getContainer();
    const tooltip = document.createElement('div');
    tooltip.style.cssText = 'position:absolute;z-index:1000;pointer-events:none;display:none;width:0;height:90px;';
    tooltip.innerHTML = `<div class="dest-tooltip-inner" style="pointer-events:auto;position:relative;display:flex;flex-direction:column;align-items:center;transform:translateX(-50%);">
      <div style="background:white;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);padding:8px 12px;font-size:13px;line-height:1.4;white-space:nowrap;">
        <div style="font-weight:600;color:#dc2626;">📍 目的地</div>
        <div style="font-weight:500;margin-top:2px;">${location.name}</div>
        <div style="color:#4b5563;font-size:12px;margin-top:2px;">${location.address || '地址不详'}</div>
      </div>
      <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:8px solid white;margin-top:-1px;"></div>
      <div style="width:30px;flex:1;background:transparent;"></div>
    </div>`;
    container.appendChild(tooltip);

    const updateTooltipPos = () => {
      const pixel = this.map.lngLatToContainer(position);
      tooltip.style.left = pixel.x + 'px';
      tooltip.style.bottom = container.clientHeight - pixel.y + 18 + 'px';
    };

    const moveHandler = () => updateTooltipPos();
    this.map.on('move', moveHandler);
    this.map.on('zoom', moveHandler);
    this.map.on('resize', moveHandler);

    let closeTimer = null;
    const show = () => {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      updateTooltipPos();
      tooltip.style.display = 'block';
    };
    const hide = () => {
      closeTimer = setTimeout(() => {
        tooltip.style.display = 'none';
      }, 80);
    };

    const tooltipInner = tooltip.querySelector('.dest-tooltip-inner');
    this.destinationMarker.on('mouseover', show);
    this.destinationMarker.on('mouseout', hide);
    tooltipInner.addEventListener('mouseenter', () => {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
    });
    tooltipInner.addEventListener('mouseleave', hide);

    this.map.add(this.destinationMarker);
    this.destinationTooltip = { el: tooltip, moveHandler };

    // Fit view to include destination
    this.map.setCenter(position);
  }

  removeMyLocationMarker(id) {
    const item = this.markers.get(id);
    if (item) {
      this.map.remove(item.marker);
      if (item.tooltip) {
        this.map.off('move', item.tooltip.moveHandler);
        this.map.off('zoom', item.tooltip.moveHandler);
        this.map.off('resize', item.tooltip.moveHandler);
        item.tooltip.el.remove();
      }
      this.markers.delete(id);
    }
  }

  clearAllMyLocationMarkers() {
    for (const item of this.markers.values()) {
      this.map.remove(item.marker);
      if (item.tooltip) {
        this.map.off('move', item.tooltip.moveHandler);
        this.map.off('zoom', item.tooltip.moveHandler);
        this.map.off('resize', item.tooltip.moveHandler);
        item.tooltip.el.remove();
      }
    }
    this.markers.clear();
  }

  clearDestinationMarker() {
    if (this.destinationMarker) {
      this.map.remove(this.destinationMarker);
      this.destinationMarker = null;
    }
    if (this.destinationTooltip) {
      this.map.off('move', this.destinationTooltip.moveHandler);
      this.map.off('zoom', this.destinationTooltip.moveHandler);
      this.map.off('resize', this.destinationTooltip.moveHandler);
      this.destinationTooltip.el.remove();
      this.destinationTooltip = null;
    }
  }

  // --- Origin Marker Methods ---

  addOriginMarker(location) {
    // Clear destination marker when setting origin (mutual exclusion)
    this.clearDestinationMarker();

    // Remove old origin marker and tooltip if exists
    if (this.originMarker) {
      this.map.remove(this.originMarker);
    }
    if (this.originTooltip) {
      this.map.off('move', this.originTooltip.moveHandler);
      this.map.off('zoom', this.originTooltip.moveHandler);
      this.map.off('resize', this.originTooltip.moveHandler);
      this.originTooltip.el.remove();
      this.originTooltip = null;
    }

    const position = [location.longitude, location.latitude];

    this.originMarker = new AMap.Marker({
      position: position,
      title: '起点: ' + location.name,
      content:
        '<div style="width:28px;height:28px;">' +
        `<svg t="1781248311650" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="24161" width="28" height="28"><path d="M516.937143 2.194286C301.129143 3.145143 126.317714 179.529143 127.268571 395.337143c0.877714 202.532571 323.401143 567.552 360.155429 608.475428a45.421714 45.421714 0 0 0 67.949714-0.292571c36.388571-41.252571 355.657143-409.124571 354.742857-611.657143C909.165714 176.054857 732.745143 1.243429 516.937143 2.194286z m2.523428 563.273143a158.72 158.72 0 0 1-159.268571-157.842286 158.72 158.72 0 0 1 157.842286-159.232 158.72 158.72 0 0 1 159.268571 157.805714 158.72 158.72 0 0 1-157.842286 159.268572z" fill="#22c55e" p-id="24162"></path></svg>` +
        '</div>',
      anchor: 'bottom-center',
      zIndex: 200,
    });

    // DOM tooltip
    const container = this.map.getContainer();
    const tooltip = document.createElement('div');
    tooltip.style.cssText = 'position:absolute;z-index:1000;pointer-events:none;display:none;width:0;height:90px;';
    tooltip.innerHTML = `<div class="origin-tooltip-inner" style="pointer-events:auto;position:relative;display:flex;flex-direction:column;align-items:center;transform:translateX(-50%);">
      <div style="background:white;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);padding:8px 12px;font-size:13px;line-height:1.4;white-space:nowrap;">
        <div style="font-weight:600;color:#16a34a;">🚩 起点</div>
        <div style="font-weight:500;margin-top:2px;">${location.name}</div>
        <div style="color:#4b5563;font-size:12px;margin-top:2px;">${location.address || '地址不详'}</div>
      </div>
      <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:8px solid white;margin-top:-1px;"></div>
      <div style="width:30px;flex:1;background:transparent;"></div>
    </div>`;
    container.appendChild(tooltip);

    const updateTooltipPos = () => {
      const pixel = this.map.lngLatToContainer(position);
      tooltip.style.left = pixel.x + 'px';
      tooltip.style.bottom = container.clientHeight - pixel.y + 18 + 'px';
    };

    const moveHandler = () => updateTooltipPos();
    this.map.on('move', moveHandler);
    this.map.on('zoom', moveHandler);
    this.map.on('resize', moveHandler);

    let closeTimer = null;
    const show = () => {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      updateTooltipPos();
      tooltip.style.display = 'block';
    };
    const hide = () => {
      closeTimer = setTimeout(() => {
        tooltip.style.display = 'none';
      }, 80);
    };

    const tooltipInner = tooltip.querySelector('.origin-tooltip-inner');
    this.originMarker.on('mouseover', show);
    this.originMarker.on('mouseout', hide);
    tooltipInner.addEventListener('mouseenter', () => {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
    });
    tooltipInner.addEventListener('mouseleave', hide);

    this.map.add(this.originMarker);
    this.originTooltip = { el: tooltip, moveHandler };

    // Fit view to include origin
    this.map.setCenter(position);
  }

  clearOriginMarker() {
    if (this.originMarker) {
      this.map.remove(this.originMarker);
      this.originMarker = null;
    }
    if (this.originTooltip) {
      this.map.off('move', this.originTooltip.moveHandler);
      this.map.off('zoom', this.originTooltip.moveHandler);
      this.map.off('resize', this.originTooltip.moveHandler);
      this.originTooltip.el.remove();
      this.originTooltip = null;
    }
  }

  // --- Route Line Methods ---

  addRouteLine(path, color = '#3b82f6', width = 6, opacity = 0.8) {
    const polyline = new AMap.Polyline({
      path: path,
      strokeColor: color,
      strokeWeight: width,
      strokeOpacity: opacity,
      showDir: true,
      zIndex: 50,
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

  // Notify map that container size changed (e.g. sidebar resize)
  refreshSize() {
    window.dispatchEvent(new Event('resize'));
  }
}

export const mapManager = new MapManager();
