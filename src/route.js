import { RateLimiter, showToast, formatDistance, formatDuration } from './utils.js';
import { mapManager } from './map.js';
import { locationManager } from './location.js';

const rateLimiter = new RateLimiter(500); // 1 request per 500ms for route planning

// Transport mode constants
const TRANSPORT_MODES = {
  DRIVING: 'driving',
  TRANSIT: 'transit',
  WALKING: 'walking',
  BICYCLING: 'bicycling',
};

// Transport mode display names
const MODE_NAMES = {
  [TRANSPORT_MODES.DRIVING]: '自驾',
  [TRANSPORT_MODES.TRANSIT]: '公交',
  [TRANSPORT_MODES.WALKING]: '步行',
  [TRANSPORT_MODES.BICYCLING]: '骑行',
};

// Transport mode colors
const MODE_COLORS = {
  [TRANSPORT_MODES.DRIVING]: '#3b82f6',
  [TRANSPORT_MODES.TRANSIT]: '#07cfb4ff',
  [TRANSPORT_MODES.WALKING]: '#22c55e',
  [TRANSPORT_MODES.BICYCLING]: '#f59e0b',
};

// Driving policy options
const DRIVING_POLICIES = {
  LEAST_TIME: { label: '时间最短', value: 0 },
  LEAST_DISTANCE: { label: '距离最短', value: 2 },
  LEAST_FEE: { label: '费用最少', value: 1 },
  REAL_TRAFFIC: { label: '实时路况', value: 3 },
};

// Origin-distinct colors — each origin route gets a unique color for easy identification
const ORIGIN_COLORS = [
  '#ef4444', // 红 — 起点 0
  '#3b82f6', // 蓝 — 起点 1
  '#22c55e', // 绿 — 起点 2
  '#8b5cf6', // 紫 — 起点 3
  '#f59e0b', // 橙 — 起点 4
  '#06b6d4', // 青 — 起点 5
];

// Sub-route styles — different color + dash pattern for each alternative route in multi-route mode
const SUB_ROUTE_STYLES = [
  { color: '#ef4444', dashPattern: null },
  { color: '#3b82f6', dashPattern: null },
  { color: '#22c55e', dashPattern: null },
  { color: '#f59e0b', dashPattern: null },
  { color: '#8b5cf6', dashPattern: null },
];

class RouteManager {
  constructor() {
    this.currentResults = []; // [{ origin, routes: { driving, transit, walking, bicycling } }]
    this.activeMode = TRANSPORT_MODES.DRIVING;
    this.currentDestination = null;
    this.currentRouteLines = []; // Track rendered lines for highlighting
    this._routeDetailService = null; // Native AMap route service instance
    this._routeDetailResultIndex = null; // Which origin's detail is showing
    this.multiRouteMode = false; // false=single-route mode (default), true=multi-route mode
    this._highlightedRoute = null; // { groupIndex, subRouteIdx } in multi-route mode
    this._expandedGroupIndex = null; // accordion: only one group expanded at a time in multi-route mode
    this.activeDrivingPolicy = this._loadDrivingPolicy();
  }

  // Load driving policy from localStorage, default to LEAST_TIME
  _loadDrivingPolicy() {
    try {
      const saved = localStorage.getItem('drivingPolicy');
      if (saved && DRIVING_POLICIES[saved]) return saved;
    } catch (_) {
      void _;
      // localStorage unavailable
    }
    return 'LEAST_TIME';
  }

  // Switch driving policy — persists to localStorage, recalculates if in driving mode
  setDrivingPolicy(policyKey) {
    if (!DRIVING_POLICIES[policyKey] || this.activeDrivingPolicy === policyKey) return;

    this.activeDrivingPolicy = policyKey;
    try {
      localStorage.setItem('drivingPolicy', policyKey);
    } catch (_) {
      void _;
    }

    // If currently in driving mode with a destination, recalculate with new policy
    if (this.activeMode === TRANSPORT_MODES.DRIVING && this.currentDestination) {
      this._recalculateWithNewPolicy();
    }
  }

  // Clear driving routes and recalculate with current policy
  async _recalculateWithNewPolicy() {
    this.currentRouteLines.forEach((line) => mapManager.map.remove(line));
    this.currentRouteLines = [];

    const container = document.getElementById('routeResultsList');
    if (container) container.innerHTML = '<p class="text-sm text-gray-500 italic">正在重新计算路线...</p>';

    const select = document.getElementById('drivingPolicySelect');
    if (select) select.disabled = true;

    try {
      const results = await this.calculateRoutesToDestination(this.currentDestination);
      if (results.length > 0) {
        this.renderResultsPanel(this.currentDestination, results, this.activeMode);
        this.switchTransportMode(this.activeMode);
      } else {
        showToast('该策略下无可用路线', 'warning');
        if (container) container.innerHTML = '<p class="text-sm text-gray-500 italic">该策略下无可用路线</p>';
      }
    } finally {
      if (select) select.disabled = false;
    }
  }

  // Plugin name and constructor class mapping for each transport mode
  static PLUGIN_MAP = {
    [TRANSPORT_MODES.DRIVING]: {
      plugin: 'AMap.Driving',
      klass: 'AMap.Driving',
    },
    [TRANSPORT_MODES.TRANSIT]: {
      plugin: 'AMap.Transfer',
      klass: 'AMap.Transfer',
    },
    [TRANSPORT_MODES.WALKING]: {
      plugin: 'AMap.Walking',
      klass: 'AMap.Walking',
    },
    [TRANSPORT_MODES.BICYCLING]: {
      plugin: 'AMap.Riding',
      klass: 'AMap.Riding',
    },
  };

  // Calculate route between two points for a specific transport mode
  // Returns an ARRAY of route objects (multiple alternatives from Amap)
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
          const ServiceClass = pluginConfig.klass.split('.').reduce((obj, key) => obj[key], window);

          const options = { map: null };
          if (mode === 'driving') options.policy = DRIVING_POLICIES[this.activeDrivingPolicy].value;
          if (mode === 'transit') {
            // city is REQUIRED for transit route planning
            options.city = destination.city || origin.city || '北京';
            options.policy = AMap.TransferPolicy.LEAST_TIME;
          }

          const routeService = new ServiceClass(options);

          routeService.search(originPoint, destinationPoint, (status, result) => {
            if (status === 'complete') {
              const routes = [];

              if (mode === 'transit') {
                // Transit: result.plans (NOT result.routes)
                if (result.plans && result.plans.length > 0) {
                  result.plans.forEach((plan) => {
                    const path = [];
                    plan.segments.forEach((segment) => {
                      // Walking segments within transit route
                      if (segment.walking && segment.walking.steps) {
                        segment.walking.steps.forEach((step) => {
                          if (step.path) path.push(...step.path);
                        });
                      }
                      // Transit (bus/subway) segments
                      if (segment.transit && segment.transit.path) {
                        path.push(...segment.transit.path);
                      }
                    });
                    routes.push({
                      mode,
                      distance: plan.distance,
                      duration: plan.time,
                      path,
                      rawResult: result,
                    });
                  });
                } else {
                  reject(new Error('NO_DATA'));
                  return;
                }
              } else if (mode === 'bicycling') {
                // Riding: route.rides (NOT route.steps)
                if (result.routes && result.routes.length > 0) {
                  result.routes.forEach((route) => {
                    const path = [];
                    if (route.rides) {
                      route.rides.forEach((ride) => {
                        if (ride.path) path.push(...ride.path);
                      });
                    }
                    routes.push({
                      mode,
                      distance: route.distance,
                      duration: route.time,
                      path,
                      rawResult: null,
                    });
                  });
                } else {
                  reject(new Error('NO_DATA'));
                  return;
                }
              } else {
                // Driving / Walking: route.steps[].path
                if (result.routes && result.routes.length > 0) {
                  result.routes.forEach((route) => {
                    const path = [];
                    if (route.steps) {
                      route.steps.forEach((step) => {
                        if (step.path) path.push(...step.path);
                      });
                    }
                    routes.push({
                      mode,
                      distance: route.distance,
                      duration: route.time,
                      path,
                      rawResult: null,
                    });
                  });
                } else {
                  reject(new Error('NO_DATA'));
                  return;
                }
              }

              resolve(routes);
            } else if (status === 'no_data' || status === 'error') {
              reject(new Error('NO_DATA'));
            } else {
              reject(new Error(`路线计算失败: ${destination.name}`));
            }
          });
        });
      });
    });
  }

  // Check if a route result has at least one renderable route for the given mode
  _isRouteRenderable(result, mode) {
    const routes = result.routes[mode];
    if (!routes || !Array.isArray(routes) || routes.length === 0) return false;
    return routes.some((r) => Array.isArray(r.path) && r.path.length > 0);
  }

  // Calculate routes from selected origins (or all my-locations) to a destination
  async calculateRoutesToDestination(destination, originIndices = null, transportMode = null) {
    const allLocations = locationManager.getAllLocations();

    if (allLocations.length === 0) {
      showToast('请先添加收藏地点', 'warning');
      return [];
    }

    // Determine origins: use specified indices or all locations
    let origins;
    if (originIndices && originIndices.length > 0) {
      origins = originIndices.map((i) => allLocations[i]).filter(Boolean);
    } else {
      origins = allLocations;
    }

    if (origins.length === 0) {
      showToast('请至少选择一个地点', 'warning');
      return [];
    }

    // Filter out the destination itself from origins
    origins = origins.filter((loc) => Math.abs(loc.latitude - destination.latitude) > 0.0001 || Math.abs(loc.longitude - destination.longitude) > 0.0001);

    if (origins.length === 0) {
      showToast('收藏地点与目的地相同，无需计算', 'warning');
      return [];
    }

    showToast(`正在计算 ${origins.length} 条路线...`, 'info');

    const modes = transportMode ? [transportMode] : Object.values(TRANSPORT_MODES);

    const results = [];

    for (const origin of origins) {
      const routeResults = {};
      let success = false;

      for (const mode of modes) {
        try {
          const routes = await this.calculateRoute(origin, destination, mode);
          routeResults[mode] = routes;
          success = true;
        } catch (error) {
          // "NO_DATA" is expected when no route exists for this mode (e.g. no transit in rural area)
          if (error.message !== 'NO_DATA') {
            console.warn(`Failed to calculate ${mode} route from ${origin.name}:`, error);
          }
          routeResults[mode] = [];
        }
      }

      results.push({
        origin,
        routes: routeResults,
        activeRouteIndex: {
          [TRANSPORT_MODES.DRIVING]: 0,
          [TRANSPORT_MODES.TRANSIT]: 0,
          [TRANSPORT_MODES.WALKING]: 0,
          [TRANSPORT_MODES.BICYCLING]: 0,
        },
        hasError: !success,
      });
    }

    const successCount = results.filter((r) => !r.hasError).length;
    showToast(`路线计算完成，成功 ${successCount} 条`, successCount === results.length ? 'success' : 'warning');

    this.currentResults = results;
    this.currentDestination = destination;
    this.activeMode = transportMode || TRANSPORT_MODES.DRIVING;

    return results;
  }

  // Switch transport mode and render all routes for that mode
  switchTransportMode(mode) {
    this.activeMode = mode;

    // Close native detail panel when switching mode
    this.hideRouteDetailPanel();

    // Clear old route lines from map
    this.currentRouteLines.forEach((line) => mapManager.map.remove(line));
    this.currentRouteLines = [];

    // Count renderable routes for toast
    let routeCount = 0;
    this.currentResults.forEach((result) => {
      const routes = result.routes[mode];
      if (this.multiRouteMode) {
        if (routes && Array.isArray(routes)) {
          routeCount += routes.filter((r) => r.path && r.path.length > 0).length;
        }
      } else {
        const activeIdx = (result.activeRouteIndex && result.activeRouteIndex[mode]) || 0;
        if (routes && Array.isArray(routes) && routes.length > activeIdx) {
          const route = routes[activeIdx];
          if (route.path && route.path.length > 0) routeCount++;
        }
      }
    });

    if (routeCount === 0) {
      showToast(`无 ${MODE_NAMES[mode]} 路线可用`, 'warning');
      return;
    }

    // Delegate rendering to _renderOverviewRoutes (handles both modes)
    this._renderOverviewRoutes(mode);

    //showToast(`已显示 ${routeCount} 条${MODE_NAMES[mode]}路线`, 'success');
  }

  // --- Route Detail Panel on Map (Amap Native — all modes) ---

  // Show native route detail panel for ANY transport mode
  _showNativeRoutePanel(mode, resultIndex) {
    const result = this.currentResults[resultIndex];
    if (!result) return;

    // Close previous panel first (without redrawing)
    this._closeRoutePanelOnly();

    // Clear overview route lines (native panel draws its own routes)
    this.currentRouteLines.forEach((line) => mapManager.map.remove(line));
    this.currentRouteLines = [];

    // Show the panel wrapper
    const wrapper = document.getElementById('routeDetailPanelWrapper');
    if (wrapper) wrapper.classList.remove('hidden');

    // Clear panel content
    const panelEl = document.getElementById('routeDetailPanel');
    if (panelEl) panelEl.innerHTML = '';

    // Update title
    const title = document.getElementById('routeDetailPanelTitle');
    if (title) title.textContent = `从 ${result.origin.name} (${MODE_NAMES[mode]})`;

    this._routeDetailResultIndex = resultIndex;

    const pluginConfig = RouteManager.PLUGIN_MAP[mode];
    // Transit needs AMap.Adaptor for panel styling; all modes work fine without it
    const plugins = mode === TRANSPORT_MODES.TRANSIT ? [pluginConfig.plugin, 'AMap.Adaptor'] : [pluginConfig.plugin];

    AMap.plugin(plugins, () => {
      const ServiceClass = pluginConfig.klass.split('.').reduce((obj, key) => obj[key], window);

      const options = {
        map: mapManager.map,
        panel: 'routeDetailPanel',
        autoFitView: true,
      };

      // Mode-specific options
      if (mode === TRANSPORT_MODES.DRIVING) {
        options.policy = DRIVING_POLICIES[this.activeDrivingPolicy].value;
      } else if (mode === TRANSPORT_MODES.TRANSIT) {
        options.city = (this.currentDestination && this.currentDestination.city) || result.origin.city || '北京';
        options.policy = AMap.TransferPolicy.LEAST_TIME;
      }
      // Walking and Riding use default options

      const service = new ServiceClass(options);
      this._routeDetailService = service;

      const originPoint = [result.origin.longitude, result.origin.latitude];
      const destPoint = [this.currentDestination.longitude, this.currentDestination.latitude];

      service.search(originPoint, destPoint, (status) => {
        if (status === 'complete') {
          // Amap native panel handles everything: plan tabs, route drawing, markers
        } else {
          showToast(`${MODE_NAMES[mode]}路线查询失败`, 'error');
          this.hideRouteDetailPanel();
        }
      });
    });

    // Bind close button
    const closeBtn = document.getElementById('routeDetailPanelClose');
    if (closeBtn) {
      closeBtn.onclick = () => this.hideRouteDetailPanel();
    }
  }

  // Hide the route detail panel (any mode)
  hideRouteDetailPanel() {
    this._closeRoutePanelOnly();

    // Redraw overview routes if we still have results
    if (this.currentResults.length > 0) {
      this.currentRouteLines.forEach((line) => mapManager.map.remove(line));
      this.currentRouteLines = [];
      this._renderOverviewRoutes(this.activeMode);
    }
  }

  // Internal: close panel + clear service instance, without redrawing overview
  _closeRoutePanelOnly() {
    const wrapper = document.getElementById('routeDetailPanelWrapper');
    if (wrapper) wrapper.classList.add('hidden');

    if (this._routeDetailService) {
      this._routeDetailService.clear();
      this._routeDetailService = null;
    }

    this._routeDetailResultIndex = null;
  }

  // Toggle between single-route and multi-route mode
  setMultiRouteMode(enabled) {
    if (this.multiRouteMode === enabled) return; // no change

    this.multiRouteMode = enabled;

    // Close native detail panel without redrawing (redraw happens below)
    this._closeRoutePanelOnly();

    // Clear highlight and accordion state
    this._highlightedRoute = null;
    this._expandedGroupIndex = null;

    // Clear and re-render map lines
    this.currentRouteLines.forEach((line) => mapManager.map.remove(line));
    this.currentRouteLines = [];
    this._renderOverviewRoutes(this.activeMode);

    // Re-render list (detail button visibility depends on mode)
    this.renderRouteList(this.currentResults, this.activeMode);
  }

  // Internal: render overview routes for a given mode (extracted for reuse)
  _renderOverviewRoutes(mode) {
    const isMulti = this.multiRouteMode;

    if (isMulti) {
      // --- Multi-route mode: render routes only for the expanded group ---
      if (this._expandedGroupIndex === null) {
        // No group expanded → map is empty
        return;
      }

      const result = this.currentResults[this._expandedGroupIndex];
      if (!result) return;

      const groupIndex = this._expandedGroupIndex;
      const routes = result.routes[mode];
      if (!routes || !Array.isArray(routes) || routes.length === 0) return;

      let hasAnyRoute = false;

      routes.forEach((route, subRouteIdx) => {
        if (route.path && route.path.length > 0) {
          hasAnyRoute = true;
          const style = SUB_ROUTE_STYLES[subRouteIdx % SUB_ROUTE_STYLES.length];

          // Check if this specific sub-route is highlighted
          const isHighlighted =
            this._highlightedRoute && this._highlightedRoute.groupIndex === groupIndex && this._highlightedRoute.subRouteIdx === subRouteIdx;

          const polyline = new AMap.Polyline({
            path: route.path,
            strokeColor: style.color,
            strokeWeight: isHighlighted ? 8 : 4,
            strokeOpacity: isHighlighted ? 1.0 : 0.7,
            strokeStyle: style.dashPattern ? 'dashed' : 'solid',
            strokeDasharray: style.dashPattern || undefined,
            showDir: true,
            zIndex: isHighlighted ? 60 : 50,
          });

          polyline._groupIndex = groupIndex;
          polyline._subRouteIdx = subRouteIdx;
          mapManager.map.add(polyline);
          this.currentRouteLines.push(polyline);
        }
      });

      if (!hasAnyRoute) return;
    } else {
      // --- Single-route mode: render active route only for each group ---
      const routesToRender = [];
      let hasAnyRoute = false;

      this.currentResults.forEach((result, index) => {
        const routes = result.routes[mode];
        const activeIdx = (result.activeRouteIndex && result.activeRouteIndex[mode]) || 0;
        if (routes && Array.isArray(routes) && routes.length > activeIdx) {
          const route = routes[activeIdx];
          if (route.path && route.path.length > 0) {
            hasAnyRoute = true;
            routesToRender.push({
              index,
              origin: result.origin,
              route,
              pathArray: route.path,
            });
          }
        }
      });

      if (!hasAnyRoute) return;

      routesToRender.forEach((item) => {
        const color = ORIGIN_COLORS[item.index % ORIGIN_COLORS.length];

        const polyline = new AMap.Polyline({
          path: item.pathArray,
          strokeColor: color,
          strokeWeight: 6,
          strokeOpacity: 0.8,
          showDir: true,
          zIndex: 50,
        });

        polyline._routeIndex = item.index;
        mapManager.map.add(polyline);
        this.currentRouteLines.push(polyline);
      });
    }

    mapManager.map.setFitView(this.currentRouteLines);
  }

  // Highlight a single route — deprecated, native panel handles this now
  highlightSingleRoute(_routeIndex) {
    // no-op: native route detail panel renders its own route lines
  }

  // Reset all route state (used when clearing all locations)
  resetState() {
    this.hideRouteDetailPanel();
    this.currentResults = [];
    this.currentDestination = null;
    this.currentRouteLines.forEach((line) => mapManager.map.remove(line));
    this.currentRouteLines = [];
    this.multiRouteMode = false;
    this._highlightedRoute = null;
    this._expandedGroupIndex = null;

    // Reset checkbox
    const checkbox = document.getElementById('multiRouteToggle');
    if (checkbox) checkbox.checked = false;
  }

  // Reset all route highlights — deprecated
  resetHighlight() {
    // no-op: switching transport mode re-renders all routes
  }

  // Render the results panel in right sidebar
  renderResultsPanel(destination, results, activeMode) {
    const container = document.getElementById('routeResultsList');
    if (!container) return;

    // Close native route detail panel when new results come in
    this.hideRouteDetailPanel();

    this.activeMode = activeMode || TRANSPORT_MODES.DRIVING;
    this.currentResults = results;
    this.currentDestination = destination;

    // Reset multi-route mode and checkbox for new results
    this.multiRouteMode = false;
    this._highlightedRoute = null;
    const checkbox = document.getElementById('multiRouteToggle');
    if (checkbox) checkbox.checked = false;

    // Update destination display
    const destDisplay = document.getElementById('destinationDisplay');
    if (destDisplay) {
      destDisplay.classList.remove('hidden');
      const destName = destDisplay.querySelector('#destName');
      const destAddr = destDisplay.querySelector('#destAddr');
      if (destName) destName.textContent = destination.name;
      if (destAddr) destAddr.textContent = destination.address || '';
    }

    // Update mode switch bar
    this.renderModeSwitchBar(destination, results);

    // Render route list for active mode
    this.renderRouteList(results, this.activeMode);
  }

  // Render the transport mode switch bar
  renderModeSwitchBar(destination, results) {
    const bar = document.getElementById('modeSwitchBar');
    if (!bar) return;

    const modeBtns = document.getElementById('modeBtns');
    const toggleLabel = document.getElementById('multiRouteToggleLabel');

    const modes = Object.values(TRANSPORT_MODES);

    // Check if we have any valid results to determine if checkbox should show
    const hasAnyResults = results && results.some((r) => Object.values(TRANSPORT_MODES).some((m) => this._isRouteRenderable(r, m)));

    if (modeBtns) {
      modeBtns.innerHTML = modes
        .map((mode) => {
          const hasData = results.some((r) => this._isRouteRenderable(r, mode));
          const isActive = mode === this.activeMode;

          return `
        <button class="mode-btn flex-1 text-xs px-2 py-1.5 rounded font-medium transition-colors
          ${isActive ? 'text-white shadow-sm' : hasData ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-gray-50 text-gray-300 cursor-not-allowed'}"
          style="${isActive ? `background-color: ${MODE_COLORS[mode]}` : ''}"
          data-mode="${mode}"
          ${!hasData ? 'disabled' : ''}>
          ${MODE_NAMES[mode]}
        </button>
      `;
        })
        .join('');

      // Bind mode switch events
      bar.querySelectorAll('.mode-btn:not([disabled])').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const mode = e.target.dataset.mode;
          this.activeMode = mode;
          this.renderModeSwitchBar(destination, results);
          this.renderRouteList(results, mode);
          this.switchTransportMode(mode);
        });
      });
    }

    // Show/hide multi-route checkbox based on whether we have results
    if (toggleLabel) {
      if (hasAnyResults) {
        toggleLabel.classList.remove('hidden');
      } else {
        toggleLabel.classList.add('hidden');
      }
    }

    // Bind checkbox change event (only once, use a flag to avoid re-binding)
    const checkbox = document.getElementById('multiRouteToggle');
    if (checkbox && !checkbox._bound) {
      checkbox._bound = true;
      checkbox.addEventListener('change', () => {
        this.setMultiRouteMode(checkbox.checked);
      });
    }

    // Control driving policy select visibility based on active mode
    const policySelect = document.getElementById('drivingPolicySelect');
    if (policySelect) {
      if (this.activeMode === TRANSPORT_MODES.DRIVING) {
        policySelect.classList.remove('hidden');
        policySelect.value = this.activeDrivingPolicy;
      } else {
        policySelect.classList.add('hidden');
      }
    }

    // Bind policy select change event (only once)
    if (policySelect && !policySelect._bound) {
      policySelect._bound = true;
      policySelect.addEventListener('change', () => {
        this.setDrivingPolicy(policySelect.value);
      });
    }
  }

  // Render the route list for the active mode (foldable groups)
  renderRouteList(results, mode) {
    const container = document.getElementById('routeResultsList');
    if (!container) return;

    const validResults = results.filter((r) => this._isRouteRenderable(r, mode));

    if (validResults.length === 0) {
      container.innerHTML = `<p class="text-sm text-gray-500 italic">暂无${MODE_NAMES[mode]}路线数据</p>`;
      return;
    }

    const isMulti = this.multiRouteMode;

    container.innerHTML = validResults
      .map((result) => {
        const originalIndex = results.indexOf(result);
        const routes = result.routes[mode];
        const activeIdx = (result.activeRouteIndex && result.activeRouteIndex[mode]) || 0;
        const routeCount = routes.length;

        // In multi-route mode, body visibility is controlled by _expandedGroupIndex
        const isExpanded = !isMulti || this._expandedGroupIndex === originalIndex;
        const foldIcon = isExpanded ? '▼' : '▶';
        const bodyHiddenClass = isExpanded ? '' : 'hidden';

        // Sub-route cards: color dot style depends on mode
        const routesHtml = routes
          .map((route, routeIdx) => {
            const isActive = !isMulti && routeIdx === activeIdx;
            // In multi-route mode, check if this sub-route is highlighted
            const isHighlighted =
              isMulti && this._highlightedRoute && this._highlightedRoute.groupIndex === originalIndex && this._highlightedRoute.subRouteIdx === routeIdx;
            // Color for dot: ORIGIN_COLORS in single mode, SUB_ROUTE_STYLES in multi mode
            const dotColor = isMulti ? SUB_ROUTE_STYLES[routeIdx % SUB_ROUTE_STYLES.length].color : ORIGIN_COLORS[originalIndex % ORIGIN_COLORS.length];

            const highlightClass = isHighlighted
              ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300'
              : isActive
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50';

            return `
          <div class="route-sub-card p-2.5 ml-3 border-l-2 rounded-r cursor-pointer transition-colors ${highlightClass}"
            data-route-index="${originalIndex}"
            data-sub-route="${routeIdx}">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium ${isActive || isHighlighted ? 'text-blue-700' : 'text-gray-700'}">方案${routeIdx + 1}</span>
              <span class="text-xs text-gray-400">→ 目的地</span>
            </div>
            <div class="flex items-center mt-1 text-xs text-gray-600 space-x-3">
              <span class="flex items-center">
                <span class="w-1.5 h-1.5 rounded-full mr-1" style="background-color: ${dotColor}"></span>
                ${formatDistance(route.distance)}
              </span>
              <span>⏱ ${formatDuration(route.duration)}</span>
            </div>
          </div>
        `;
          })
          .join('');

        // Detail button: only in single-route mode, placed in group header
        const detailBtnHtml = !isMulti
          ? `<button class="route-group-detail-btn text-xs px-2 py-0.5 rounded border border-gray-300 bg-white hover:border-blue-400 hover:text-blue-600 text-gray-500 transition-colors flex-shrink-0 ml-2"
                  data-group-index="${originalIndex}">
                详情
              </button>`
          : '';

        return `
        <div class="route-group border border-gray-200 rounded-lg overflow-hidden mb-2">
          <div class="route-group-header flex items-center justify-between p-2.5 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
               data-group-index="${originalIndex}">
            <div class="flex items-center min-w-0">
              <span class="text-xs text-gray-400 mr-1.5 fold-icon">${foldIcon}</span>
              <span class="font-medium text-sm text-gray-800 truncate">${result.origin.name}</span>
            </div>
            <div class="flex items-center">
              <span class="text-xs text-gray-400 flex-shrink-0">${MODE_NAMES[mode]} ${routeCount}条</span>
${detailBtnHtml}
            </div>
          </div>
          <div class="route-group-body ${bodyHiddenClass}">
${routesHtml}
          </div>
        </div>
      `;
      })
      .join('');

    // Bind fold/unfold on group headers
    container.querySelectorAll('.route-group-header').forEach((header) => {
      header.addEventListener('click', (e) => {
        // Ignore clicks on detail button (handled separately)
        if (e.target.closest('.route-group-detail-btn')) return;

        const groupIndex = parseInt(header.dataset.groupIndex);

        if (isMulti) {
          // Multi-route mode: accordion — only one group expanded at a time
          if (this._expandedGroupIndex === groupIndex) {
            this._expandedGroupIndex = null; // collapse current
          } else {
            this._expandedGroupIndex = groupIndex; // expand this (auto-closes others)
          }
          // Clear map lines and re-render for the expanded group
          this.currentRouteLines.forEach((line) => mapManager.map.remove(line));
          this.currentRouteLines = [];
          this._renderOverviewRoutes(mode);
          this.renderRouteList(results, mode);
          return;
        }

        // Single-route mode: independent fold/unfold
        const group = header.closest('.route-group');
        const body = group.querySelector('.route-group-body');
        const icon = header.querySelector('.fold-icon');
        if (body.classList.contains('hidden')) {
          body.classList.remove('hidden');
          if (icon) icon.textContent = '▼';
        } else {
          body.classList.add('hidden');
          if (icon) icon.textContent = '▶';
        }
      });
    });

    // Bind sub-route card clicks
    container.querySelectorAll('.route-sub-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        const resultIndex = parseInt(e.currentTarget.dataset.routeIndex);
        const subRouteIdx = parseInt(e.currentTarget.dataset.subRoute);
        const result = results[resultIndex];

        if (isMulti) {
          // Multi-route mode: toggle highlight
          if (this._highlightedRoute && this._highlightedRoute.groupIndex === resultIndex && this._highlightedRoute.subRouteIdx === subRouteIdx) {
            // Click same card → cancel highlight
            this._highlightedRoute = null;
          } else {
            this._highlightedRoute = { groupIndex: resultIndex, subRouteIdx };
          }
          // Re-render map and list
          this.currentRouteLines.forEach((line) => mapManager.map.remove(line));
          this.currentRouteLines = [];
          this._renderOverviewRoutes(mode);
          this.renderRouteList(results, mode);
        } else {
          // Single-route mode: switch active route
          result.activeRouteIndex[mode] = subRouteIdx;

          // Replace polyline for this origin on the map
          const oldLineIdx = this.currentRouteLines.findIndex((line) => line._routeIndex === resultIndex);
          if (oldLineIdx >= 0) {
            mapManager.map.remove(this.currentRouteLines[oldLineIdx]);
            this.currentRouteLines.splice(oldLineIdx, 1);
          }

          const route = result.routes[mode][subRouteIdx];
          if (route && route.path && route.path.length > 0) {
            const color = ORIGIN_COLORS[resultIndex % ORIGIN_COLORS.length];
            const polyline = new AMap.Polyline({
              path: route.path,
              strokeColor: color,
              strokeWeight: 6,
              strokeOpacity: 0.8,
              showDir: true,
              zIndex: 50,
            });
            polyline._routeIndex = resultIndex;
            mapManager.map.add(polyline);
            this.currentRouteLines.push(polyline);
          }

          // Re-render list to update highlights
          this.renderRouteList(results, mode);
        }
      });
    });

    // Bind group header detail button clicks (single-route mode only)
    container.querySelectorAll('.route-group-detail-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const groupIndex = parseInt(e.currentTarget.dataset.groupIndex);
        const wrapper = document.getElementById('routeDetailPanelWrapper');

        // Toggle: if panel is showing for the same group, close it; else open
        if (this._routeDetailResultIndex === groupIndex && wrapper && !wrapper.classList.contains('hidden')) {
          this.hideRouteDetailPanel();
        } else {
          this._showNativeRoutePanel(mode, groupIndex);
        }
      });
    });
  }
}

// Export singleton instance
export const routeManager = new RouteManager();
