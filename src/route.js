import {
  RateLimiter,
  showToast,
  formatDistance,
  formatDuration,
} from "./utils.js";
import { mapManager } from "./map.js";
import { locationManager } from "./location.js";

const rateLimiter = new RateLimiter(500); // 1 request per 500ms for route planning

// Transport mode constants
const TRANSPORT_MODES = {
  DRIVING: "driving",
  TRANSIT: "transit",
  WALKING: "walking",
  BICYCLING: "bicycling",
};

// Transport mode display names
const MODE_NAMES = {
  [TRANSPORT_MODES.DRIVING]: "自驾",
  [TRANSPORT_MODES.TRANSIT]: "公交",
  [TRANSPORT_MODES.WALKING]: "步行",
  [TRANSPORT_MODES.BICYCLING]: "骑行",
};

// Transport mode colors
const MODE_COLORS = {
  [TRANSPORT_MODES.DRIVING]: "#3b82f6",
  [TRANSPORT_MODES.TRANSIT]: "#8b5cf6",
  [TRANSPORT_MODES.WALKING]: "#22c55e",
  [TRANSPORT_MODES.BICYCLING]: "#f59e0b",
};

// Route line palette — opacity/width variants for same-mode multi-routes
const ROUTE_PALETTE = [
  { opacity: 0.9, width: 5 },
  { opacity: 0.65, width: 4 },
  { opacity: 0.5, width: 3 },
  { opacity: 0.4, width: 3 },
];

class RouteManager {
  constructor() {
    this.currentResults = []; // [{ origin, routes: { driving, transit, walking, bicycling } }]
    this.activeMode = TRANSPORT_MODES.DRIVING;
    this.currentDestination = null;
    this.currentRouteLines = []; // Track rendered lines for highlighting
    this._transitService = null; // AMap.Transfer instance for native panel
    this._transitDetailResultIndex = null; // Which origin's transit detail is showing
  }

  // Plugin name and constructor class mapping for each transport mode
  static PLUGIN_MAP = {
    [TRANSPORT_MODES.DRIVING]: {
      plugin: "AMap.Driving",
      klass: "AMap.Driving",
    },
    [TRANSPORT_MODES.TRANSIT]: {
      plugin: "AMap.Transfer",
      klass: "AMap.Transfer",
    },
    [TRANSPORT_MODES.WALKING]: {
      plugin: "AMap.Walking",
      klass: "AMap.Walking",
    },
    [TRANSPORT_MODES.BICYCLING]: {
      plugin: "AMap.Riding",
      klass: "AMap.Riding",
    },
  };

  // Calculate route between two points for a specific transport mode
  async calculateRoute(origin, destination, mode = TRANSPORT_MODES.DRIVING) {
    return rateLimiter.execute(async () => {
      return new Promise((resolve, reject) => {
        const originPoint = [origin.longitude, origin.latitude];
        const destinationPoint = [destination.longitude, destination.latitude];

        const pluginConfig = RouteManager.PLUGIN_MAP[mode];
        if (!pluginConfig) {
          reject(new Error(`不支持的交通方式: ${mode}`));
          return;
        }

        AMap.plugin(pluginConfig.plugin, () => {
          // Resolve constructor from dotted path (e.g. "AMap.Driving" → AMap.Driving)
          const ServiceClass = pluginConfig.klass
            .split(".")
            .reduce((obj, key) => obj[key], window);

          const options = { map: null };
          if (mode === "driving")
            options.policy = AMap.DrivingPolicy.LEAST_TIME;
          if (mode === "transit") {
            // city is REQUIRED for transit route planning
            options.city = destination.city || origin.city || "北京";
            options.policy = AMap.TransferPolicy.LEAST_TIME;
          }

          const routeService = new ServiceClass(options);

          routeService.search(
            originPoint,
            destinationPoint,
            (status, result) => {
              if (status === "complete") {
                let path, distance, duration;

                if (mode === "transit") {
                  // Transit: result.plans (NOT result.routes)
                  if (result.plans && result.plans.length > 0) {
                    const plan = result.plans[0];
                    distance = plan.distance;
                    duration = plan.time;
                    path = [];
                    plan.segments.forEach((segment) => {
                      // Walking segments within transit route
                      if (segment.walking && segment.walking.steps) {
                        segment.walking.steps.forEach((step) => {
                          if (step.path) path.push(...step.path);
                        });
                      }
                      // Transit (bus/subway) segments
                      // API structure: segment.transit.path is directly an array of LngLat
                      if (segment.transit && segment.transit.path) {
                        path.push(...segment.transit.path);
                      }
                    });
                  } else {
                    reject(new Error("NO_DATA"));
                    return;
                  }
                } else if (mode === "bicycling") {
                  // Riding: route.rides (NOT route.steps)
                  if (result.routes && result.routes.length > 0) {
                    const route = result.routes[0];
                    distance = route.distance;
                    duration = route.time;
                    path = [];
                    if (route.rides) {
                      route.rides.forEach((ride) => {
                        if (ride.path) path.push(...ride.path);
                      });
                    }
                  } else {
                    reject(new Error("NO_DATA"));
                    return;
                  }
                } else {
                  // Driving / Walking: route.steps[].path
                  if (result.routes && result.routes.length > 0) {
                    const route = result.routes[0];
                    distance = route.distance;
                    duration = route.time;
                    path = [];
                    if (route.steps) {
                      route.steps.forEach((step) => {
                        if (step.path) path.push(...step.path);
                      });
                    }
                  } else {
                    reject(new Error("NO_DATA"));
                    return;
                  }
                }

                // For transit mode, also return the raw result for detail panel rendering
                const rawResult = mode === "transit" ? result : null;
                resolve({ mode, distance, duration, path, rawResult });
              } else if (status === "no_data" || status === "error") {
                reject(new Error("NO_DATA"));
              } else {
                reject(new Error(`路线计算失败: ${destination.name}`));
              }
            },
          );
        });
      });
    });
  }

  // Check if a route result can be rendered on the map (has valid path data)
  _isRouteRenderable(result, mode) {
    const route = result.routes[mode];
    if (!route) return false;
    return Array.isArray(route.path) && route.path.length > 0;
  }

  // Calculate routes from all my-locations to a destination
  async calculateRoutesToDestination(destination, transportMode = null) {
    const allLocations = locationManager.getAllLocations();

    if (allLocations.length === 0) {
      showToast("请先添加收藏地点", "warning");
      return [];
    }

    // Filter out the destination itself from origins
    const origins = allLocations.filter(
      (loc) =>
        Math.abs(loc.latitude - destination.latitude) > 0.0001 ||
        Math.abs(loc.longitude - destination.longitude) > 0.0001,
    );

    if (origins.length === 0) {
      showToast("收藏地点与目的地相同，无需计算", "warning");
      return [];
    }

    showToast(`正在计算 ${origins.length} 条路线...`, "info");

    const modes = transportMode
      ? [transportMode]
      : Object.values(TRANSPORT_MODES);

    const results = [];

    for (const origin of origins) {
      const routeResults = {};
      let success = false;

      for (const mode of modes) {
        try {
          const route = await this.calculateRoute(origin, destination, mode);
          routeResults[mode] = route;
          success = true;
        } catch (error) {
          // "NO_DATA" is expected when no route exists for this mode (e.g. no transit in rural area)
          if (error.message !== "NO_DATA") {
            console.warn(
              `Failed to calculate ${mode} route from ${origin.name}:`,
              error,
            );
          }
          routeResults[mode] = null;
        }
      }

      results.push({
        origin,
        routes: routeResults,
        hasError: !success,
      });
    }

    const successCount = results.filter((r) => !r.hasError).length;
    showToast(
      `路线计算完成，成功 ${successCount} 条`,
      successCount === results.length ? "success" : "warning",
    );

    this.currentResults = results;
    this.currentDestination = destination;
    this.activeMode = transportMode || TRANSPORT_MODES.DRIVING;

    return results;
  }

  // Switch transport mode and render all routes for that mode
  switchTransportMode(mode) {
    this.activeMode = mode;

    // Close transit detail panel when switching away from transit
    if (mode !== TRANSPORT_MODES.TRANSIT) {
      this.hideTransitDetailPanel();
    }

    // Clear old route lines
    mapManager.clearRouteLines();
    this.currentRouteLines = [];

    const routesToRender = [];
    let hasAnyRoute = false;

    this.currentResults.forEach((result, index) => {
      const route = result.routes[mode];
      if (route && route.path && route.path.length > 0) {
        hasAnyRoute = true;
        routesToRender.push({
          index,
          origin: result.origin,
          route,
          pathArray: route.path,
        });
      }
    });

    if (!hasAnyRoute) {
      showToast(`无 ${MODE_NAMES[mode]} 路线可用`, "warning");
      return;
    }

    // Render all routes to map
    routesToRender.forEach((item, paletteIdx) => {
      const palette = ROUTE_PALETTE[paletteIdx % ROUTE_PALETTE.length];
      const color = MODE_COLORS[mode];

      const polyline = new AMap.Polyline({
        path: item.pathArray,
        strokeColor: color,
        strokeWeight: palette.width,
        strokeOpacity: palette.opacity,
        zIndex: 50,
      });

      polyline._routeIndex = item.index;

      mapManager.map.add(polyline);
      this.currentRouteLines.push(polyline);
    });

    mapManager.map.setFitView(this.currentRouteLines);

    showToast(
      `已显示 ${routesToRender.length} 条${MODE_NAMES[mode]}路线`,
      "success",
    );
  }

  // --- Transit Detail Panel on Map (Amap Native) ---

  // Show the transit detail panel using Amap's native Transfer + panel rendering
  showTransitDetailPanel(resultIndex) {
    const result = this.currentResults[resultIndex];
    if (!result) return;

    // Close previous panel first (without redrawing — we'll redraw after new panel)
    this._closeTransitPanelOnly();

    // Clear overview route lines (native panel draws its own routes)
    mapManager.clearRouteLines();
    this.currentRouteLines = [];

    // Show the panel wrapper
    const wrapper = document.getElementById("transitPanelWrapper");
    if (wrapper) wrapper.classList.remove("hidden");

    // Clear panel content (in case of previous residual)
    const panelEl = document.getElementById("transitPanel");
    if (panelEl) panelEl.innerHTML = "";

    // Update title
    const title = document.getElementById("transitPanelTitle");
    if (title) title.textContent = `从 ${result.origin.name}`;

    this._transitDetailResultIndex = resultIndex;

    // Use Amap native Transfer + panel (auto renders plans, routes, handles plan switching)
    AMap.plugin(["AMap.Transfer", "AMap.Adaptor"], () => {
      const transOptions = {
        map: mapManager.map,
        city:
          (this.currentDestination && this.currentDestination.city) ||
          result.origin.city ||
          "北京",
        panel: "transitPanel",
        policy: AMap.TransferPolicy.LEAST_TIME,
        autoFitView: true,
      };

      const transfer = new AMap.Transfer(transOptions);
      this._transitService = transfer;

      const originPoint = [result.origin.longitude, result.origin.latitude];
      const destPoint = [
        this.currentDestination.longitude,
        this.currentDestination.latitude,
      ];

      transfer.search(originPoint, destPoint, (status) => {
        if (status === "complete") {
          // Amap native panel handles everything: plan tabs, route drawing, station markers
        } else {
          showToast("公交路线查询失败", "error");
          this.hideTransitDetailPanel();
        }
      });
    });

    // Bind close button
    const closeBtn = document.getElementById("transitPanelClose");
    if (closeBtn) {
      closeBtn.onclick = () => this.hideTransitDetailPanel();
    }
  }

  // Hide the transit detail panel
  hideTransitDetailPanel() {
    this._closeTransitPanelOnly();

    // Redraw overview transit routes if still in transit mode
    if (
      this.activeMode === TRANSPORT_MODES.TRANSIT &&
      this.currentResults.length > 0
    ) {
      mapManager.clearRouteLines();
      this.currentRouteLines = [];
      // Re-render overview without going through switchTransportMode (avoids recursion)
      this._renderTransitOverviewRoutes();
    }
  }

  // Internal: close panel + clear Transfer instance, without redrawing overview
  _closeTransitPanelOnly() {
    const wrapper = document.getElementById("transitPanelWrapper");
    if (wrapper) wrapper.classList.add("hidden");

    if (this._transitService) {
      this._transitService.clear();
      this._transitService = null;
    }

    this._transitDetailResultIndex = null;
  }

  // Internal: render overview transit routes (extracted from switchTransportMode for reuse)
  _renderTransitOverviewRoutes() {
    const mode = TRANSPORT_MODES.TRANSIT;
    const routesToRender = [];
    let hasAnyRoute = false;

    this.currentResults.forEach((result, index) => {
      const route = result.routes[mode];
      if (route && route.path && route.path.length > 0) {
        hasAnyRoute = true;
        routesToRender.push({
          index,
          origin: result.origin,
          route,
          pathArray: route.path,
        });
      }
    });

    if (!hasAnyRoute) return;

    routesToRender.forEach((item, paletteIdx) => {
      const palette = ROUTE_PALETTE[paletteIdx % ROUTE_PALETTE.length];
      const color = MODE_COLORS[mode];

      const polyline = new AMap.Polyline({
        path: item.pathArray,
        strokeColor: color,
        strokeWeight: palette.width,
        strokeOpacity: palette.opacity,
        zIndex: 50,
      });

      polyline._routeIndex = item.index;
      mapManager.map.add(polyline);
      this.currentRouteLines.push(polyline);
    });

    mapManager.map.setFitView(this.currentRouteLines);
  }

  // Highlight a single route, dim others
  highlightSingleRoute(routeIndex) {
    this.currentRouteLines.forEach((line) => {
      if (line._routeIndex === routeIndex) {
        line.setOptions({
          strokeWeight: 6,
          strokeOpacity: 1,
          zIndex: 100,
        });
      } else {
        line.setOptions({
          strokeOpacity: 0.2,
          zIndex: 30,
        });
      }
    });
  }

  // Reset all route highlights to default
  resetHighlight() {
    this.switchTransportMode(this.activeMode);
  }

  // Render the results panel in right sidebar
  renderResultsPanel(destination, results, activeMode) {
    const container = document.getElementById("routeResultsList");
    if (!container) return;

    // Close transit detail panel when new results come in
    this.hideTransitDetailPanel();

    this.activeMode = activeMode || TRANSPORT_MODES.DRIVING;
    this.currentResults = results;
    this.currentDestination = destination;

    // Update destination display
    const destDisplay = document.getElementById("destinationDisplay");
    if (destDisplay) {
      destDisplay.classList.remove("hidden");
      const destName = destDisplay.querySelector("#destName");
      const destAddr = destDisplay.querySelector("#destAddr");
      if (destName) destName.textContent = destination.name;
      if (destAddr) destAddr.textContent = destination.address || "";
    }

    // Update mode switch bar
    this.renderModeSwitchBar(destination, results);

    // Render route list for active mode
    this.renderRouteList(results, this.activeMode);
  }

  // Render the transport mode switch bar
  renderModeSwitchBar(destination, results) {
    const bar = document.getElementById("modeSwitchBar");
    if (!bar) return;

    const modes = Object.values(TRANSPORT_MODES);

    bar.innerHTML = modes
      .map((mode) => {
        const hasData = results.some((r) => this._isRouteRenderable(r, mode));
        const isActive = mode === this.activeMode;

        return `
        <button class="mode-btn flex-1 text-xs px-2 py-1.5 rounded font-medium transition-colors
          ${
            isActive
              ? "text-white shadow-sm"
              : hasData
                ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                : "bg-gray-50 text-gray-300 cursor-not-allowed"
          }"
          style="${isActive ? `background-color: ${MODE_COLORS[mode]}` : ""}"
          data-mode="${mode}"
          ${!hasData ? "disabled" : ""}>
          ${MODE_NAMES[mode]}
        </button>
      `;
      })
      .join("");

    // Bind mode switch events
    bar.querySelectorAll(".mode-btn:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const mode = e.target.dataset.mode;
        this.activeMode = mode;
        this.renderModeSwitchBar(destination, results);
        this.renderRouteList(results, mode);
        this.switchTransportMode(mode);
      });
    });
  }

  // Render the route list for the active mode
  renderRouteList(results, mode) {
    const container = document.getElementById("routeResultsList");
    if (!container) return;

    const validResults = results.filter((r) =>
      this._isRouteRenderable(r, mode),
    );

    if (validResults.length === 0) {
      container.innerHTML = `<p class="text-sm text-gray-500 italic">暂无${MODE_NAMES[mode]}路线数据</p>`;
      return;
    }

    container.innerHTML = validResults
      .map((result, idx) => {
        const originalIndex = results.indexOf(result);
        const route = result.routes[mode];

        return `
        <div class="route-card p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer"
             data-route-index="${originalIndex}">
          <div class="flex items-center justify-between">
            <span class="font-medium text-sm text-gray-800">${result.origin.name}</span>
            <span class="text-xs text-gray-400">→ 目的地</span>
          </div>
          <p class="text-xs text-gray-500 mt-1 truncate">${result.origin.address || ""}</p>
          <div class="flex items-center mt-2 text-xs text-gray-700 space-x-3">
            <span class="flex items-center">
              <span class="w-2 h-2 rounded-full mr-1" style="background-color: ${MODE_COLORS[mode]}"></span>
              ${formatDistance(route.distance)}
            </span>
            <span>⏱ ${formatDuration(route.duration)}</span>
          </div>
        </div>
      `;
      })
      .join("");

    // Bind click events for highlighting
    container.querySelectorAll(".route-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        const routeIndex = parseInt(e.currentTarget.dataset.routeIndex);
        this.highlightSingleRoute(routeIndex);

        // Highlight the card
        container
          .querySelectorAll(".route-card")
          .forEach((c) =>
            c.classList.remove(
              "border-blue-400",
              "bg-blue-50",
              "ring-1",
              "ring-blue-300",
            ),
          );
        e.currentTarget.classList.add(
          "border-blue-400",
          "bg-blue-50",
          "ring-1",
          "ring-blue-300",
        );

        // For transit mode, show detail panel on the map
        if (mode === TRANSPORT_MODES.TRANSIT) {
          this.showTransitDetailPanel(routeIndex);
        }
      });
    });
  }
}

// Export singleton instance
export const routeManager = new RouteManager();
