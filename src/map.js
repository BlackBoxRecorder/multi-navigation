import { RateLimiter, showToast } from "./utils.js";
import { locationManager } from "./location.js";

const poiRateLimiter = new RateLimiter(500); // Rate limit for POI search on map click

// Marker colors
const MY_LOCATION_COLOR = "#3b82f6"; // Blue for saved locations
const DESTINATION_COLOR = "#ef4444"; // Red for destination

class MapManager {
  constructor() {
    this.map = null;
    this.markers = [];
    this.routeLines = [];
    this.destinationMarker = null;
    this.poiInfoWindow = null;
  }

  init(containerId = "mapContainer") {
    return new Promise((resolve, reject) => {
      try {
        this.map = new AMap.Map(containerId, {
          zoom: 11,
          center: [116.397428, 39.90923],
          resizeEnable: true,
        });

        this.map.plugin("AMap.Geolocation", () => {
          const geolocation = new AMap.Geolocation({
            enableHighAccuracy: true,
            timeout: 10000,
            zoomToAccuracy: true,
            position: "RB",
          });

          geolocation.getCurrentPosition((status, result) => {
            if (status === "complete") {
              this.map.setCenter(result.position);
              showToast("已定位到当前位置", "success");
            } else {
              showToast("定位失败，使用默认位置", "warning");
            }
          });
        });

        // Add map type switcher (standard/satellite) - bottom-right via CSS transform
        AMap.plugin("AMap.MapType", () => {
          const mapType = new AMap.MapType({
            defaultType: 0,
            position: "RB",
          });
          this.map.addControl(mapType);
        });

        // Add zoom/location toolbar - bottom-right, anchored at corner
        AMap.plugin("AMap.ToolBar", () => {
          const toolBar = new AMap.ToolBar({
            position: "LB",
            offset: [10, 30],
          });
          this.map.addControl(toolBar);
        });

        this.initSearchBar();
        this.initPoiClickListener();

        resolve(this.map);
      } catch (error) {
        console.error("地图初始化失败:", error);
        showToast("地图初始化失败，请检查API Key配置", "error");
        reject(error);
      }
    });
  }

  initSearchBar() {
    const searchInput = document.getElementById("mapSearchInput");

    this.map.plugin("AMap.AutoComplete", () => {
      const autoComplete = new AMap.AutoComplete({
        input: searchInput,
      });

      autoComplete.on("select", (e) => {
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
    container.addEventListener("contextmenu", (e) => e.preventDefault());

    // Cache the currently hovered hotspot POI for right-click
    this._hotspotCache = null;

    this.map.on("hotspotover", (e) => {
      this._hotspotCache = {
        name: e.name,
        id: e.id,
        lnglat: e.lnglat,
      };
    });

    this.map.on("hotspotout", () => {
      this._hotspotCache = null;
    });

    this.map.on("rightclick", (e) => {
      const lnglat = e.lnglat;

      // Check if right-click is near an existing saved marker
      const nearMarkerData = this.getNearMarkerData(e);
      if (nearMarkerData) {
        this.closePoiInfoWindow();
        const markerLngLat = new AMap.LngLat(
          nearMarkerData.longitude,
          nearMarkerData.latitude,
        );
        this.showPoiInfoWindow(markerLngLat, nearMarkerData);
        return;
      }

      // Only show popup if hovering over a map hotspot POI
      if (this._hotspotCache) {
        this.closePoiInfoWindow();
        // Use hotspot's actual coordinates, not mouse click position
        this.reverseGeocodeForAddress(
          this._hotspotCache.lnglat,
          this._hotspotCache.name,
        );
        return;
      }

      // Right-click on blank area — do nothing
    });
  }

  // Returns location data if click is near a saved marker, otherwise null
  getNearMarkerData(clickEvent) {
    const clickPixel = clickEvent.pixel;
    const THRESHOLD_PX = 20;

    for (const item of this.markers) {
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
        this.map.plugin("AMap.Geocoder", () => {
          const geocoder = new AMap.Geocoder({});

          geocoder.getAddress(
            [lnglat.getLng(), lnglat.getLat()],
            (status, result) => {
              if (status === "complete" && result.regeocode) {
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
                      const dist = Math.sqrt(
                        Math.pow(clickLng - poiLng, 2) +
                          Math.pow(clickLat - poiLat, 2),
                      );
                      if (dist < minDistance) {
                        minDistance = dist;
                        closestPoi = poi;
                      }
                    }
                  }
                  poiAddress =
                    closestPoi.address || result.regeocode.formattedAddress;
                } else {
                  poiAddress = `${addressComponent.province || ""}${addressComponent.city || ""}${addressComponent.district || ""}`;
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
                  address: "",
                  latitude: lnglat.getLat(),
                  longitude: lnglat.getLng(),
                };
                this.showPoiInfoWindow(lnglat, poiData);
              }
              resolve();
            },
          );
        });
      });
    });
  }

  // --- Custom Info Window ---

  showPoiInfoWindow(lnglat, poiData) {
    this.closePoiInfoWindow();

    const isCollected = locationManager.hasLocation(
      poiData.latitude,
      poiData.longitude,
    );

    const infoDiv = document.createElement("div");
    infoDiv.className =
      "absolute z-[100] bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[220px]";
    infoDiv.style.transform = "translate(-50%, -120%)";

    infoDiv.innerHTML = `
      <button class="poi-info-close-btn close-poi-btn" title="关闭">✕</button>
      <h3 class="font-semibold text-sm text-gray-800 mb-1 pr-5">${poiData.name}</h3>
      <p class="text-xs text-gray-500 mb-3 truncate max-w-[200px]">${poiData.address || "地址不详"}</p>
      <div class="flex space-x-2">
        <button class="add-location-btn flex-1 text-xs px-3 py-1.5 rounded font-medium transition-colors
          ${
            isCollected
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-blue-500 hover:bg-blue-600 text-white"
          }"
          ${isCollected ? "disabled" : ""}>
          ${isCollected ? "已添加 ✓" : "添加到我的地点"}
        </button>
        <button class="set-destination-btn flex-1 text-xs px-3 py-1.5 rounded font-medium bg-green-500 hover:bg-green-600 text-white transition-colors">
          设为目的地
        </button>
      </div>
    `;

    // Position the info window
    const container = this.map.getContainer();
    container.appendChild(infoDiv);

    // Update position initially and on map move
    const updatePosition = () => {
      const pixel = this.map.lngLatToContainer(lnglat);
      infoDiv.style.left = pixel.x + "px";
      infoDiv.style.top = pixel.y + "px";
    };

    updatePosition();
    const moveHandler = () => updatePosition();
    this.map.on("move", moveHandler);
    this.map.on("zoom", moveHandler);

    // Store cleanup references
    this.poiInfoWindow = {
      el: infoDiv,
      moveHandler,
      lnglat,
      poiData,
    };

    // Bind button events
    infoDiv.querySelector(".close-poi-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      this.closePoiInfoWindow();
    });

    infoDiv
      .querySelector(".add-location-btn")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        if (!isCollected) {
          const added = locationManager.addLocation(poiData);
          if (added) {
            this.addMyLocationMarker(poiData);
            window.dispatchEvent(
              new CustomEvent("locationAdded", {
                detail: { location: poiData },
              }),
            );
            this.closePoiInfoWindow();
          }
        }
      });

    infoDiv
      .querySelector(".set-destination-btn")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        if (locationManager.getAllLocations().length === 0) {
          showToast("请先添加收藏地点", "warning");
          return;
        }
        window.dispatchEvent(
          new CustomEvent("destinationSet", {
            detail: { destination: poiData },
          }),
        );
        this.closePoiInfoWindow();
      });
  }

  closePoiInfoWindow() {
    if (this.poiInfoWindow) {
      this.map.off("move", this.poiInfoWindow.moveHandler);
      this.map.off("zoom", this.poiInfoWindow.moveHandler);
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
        '<div style="width:24px;height:36px;">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">' +
        '<path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24C24 5.373 18.627 0 12 0z" ' +
        'fill="#3b82f6" stroke="#1d4ed8" stroke-width="1.5"/>' +
        '<circle cx="12" cy="10" r="4.5" fill="white"/>' +
        "</svg></div>",
      anchor: "bottom-center",
      zIndex: 100,
    });

    // Info window on hover
    const infoWindow = new AMap.InfoWindow({
      content: `<div class="p-2">
        <h3 class="font-semibold text-sm">${location.name}</h3>
        <p class="text-xs text-gray-600 mt-1">${location.address || "地址不详"}</p>
      </div>`,
      offset: new AMap.Pixel(0, -36),
    });

    marker.on("mouseover", () => {
      infoWindow.open(this.map, position);
    });

    marker.on("mouseout", () => {
      infoWindow.close();
    });

    this.map.add(marker);
    this.markers.push({ marker, location });
  }

  addDestinationMarker(location) {
    // Remove old destination marker if exists
    if (this.destinationMarker) {
      this.map.remove(this.destinationMarker);
    }

    const position = [location.longitude, location.latitude];

    this.destinationMarker = new AMap.Marker({
      position: position,
      title: "目的地: " + location.name,
      content:
        '<div style="width:30px;height:42px;">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42">' +
        '<path d="M15 0C6.716 0 0 6.716 0 15c0 11.25 15 27 15 27s15-15.75 15-27C30 6.716 23.284 0 15 0z" ' +
        'fill="#ef4444" stroke="#b91c1c" stroke-width="1.5"/>' +
        '<circle cx="15" cy="13" r="5.5" fill="white"/>' +
        "</svg></div>",
      anchor: "bottom-center",
      zIndex: 200,
    });

    // Info window
    const infoWindow = new AMap.InfoWindow({
      content: `<div class="p-2">
        <h3 class="font-semibold text-sm text-red-600">📍 目的地</h3>
        <p class="font-medium text-sm mt-1">${location.name}</p>
        <p class="text-xs text-gray-600 mt-1">${location.address || "地址不详"}</p>
      </div>`,
      offset: new AMap.Pixel(0, -42),
    });

    this.destinationMarker.on("mouseover", () => {
      infoWindow.open(this.map, position);
    });

    this.destinationMarker.on("mouseout", () => {
      infoWindow.close();
    });

    this.map.add(this.destinationMarker);

    // Fit view to include destination
    this.map.setCenter(position);
  }

  removeMyLocationMarker(index) {
    if (index >= 0 && index < this.markers.length) {
      const item = this.markers[index];
      this.map.remove(item.marker);
      this.markers.splice(index, 1);
    }
  }

  clearAllMyLocationMarkers() {
    this.markers.forEach((item) => this.map.remove(item.marker));
    this.markers = [];
  }

  // --- Route Line Methods ---

  addRouteLine(path, color = "#3b82f6", width = 6, opacity = 0.8) {
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

  // Getter for destination
  getDestination() {
    return this.destinationMarker ? this.poiInfoWindow?.poiData || null : null;
  }

  // Notify map that container size changed (e.g. sidebar resize)
  refreshSize() {
    window.dispatchEvent(new Event("resize"));
  }
}

export const mapManager = new MapManager();
