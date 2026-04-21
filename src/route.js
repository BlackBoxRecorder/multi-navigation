import { RateLimiter, showToast, formatDistance, formatDuration } from './utils.js';
import { mapManager } from './map.js';
import { locationManager } from './location.js';

const rateLimiter = new RateLimiter(500); // 1 request per 500ms for route planning

// Transport mode constants
const TRANSPORT_MODES = {
  DRIVING: 'driving',
  TRANSIT: 'transit',
  WALKING: 'walking',
  BICYCLING: 'bicycling'
};

// Transport mode display names
const MODE_NAMES = {
  [TRANSPORT_MODES.DRIVING]: '驾车',
  [TRANSPORT_MODES.TRANSIT]: '公交',
  [TRANSPORT_MODES.WALKING]: '步行',
  [TRANSPORT_MODES.BICYCLING]: '骑行'
};

// Transport mode colors
const MODE_COLORS = {
  [TRANSPORT_MODES.DRIVING]: '#3b82f6',
  [TRANSPORT_MODES.TRANSIT]: '#8b5cf6',
  [TRANSPORT_MODES.WALKING]: '#22c55e',
  [TRANSPORT_MODES.BICYCLING]: '#f59e0b'
};

class RouteManager {
  constructor() {
    this.currentRoutes = [];
    this.selectedRoute = null;
  }

  // Calculate route between two points for a specific transport mode
  async calculateRoute(origin, destination, mode = TRANSPORT_MODES.DRIVING) {
    return rateLimiter.execute(async () => {
      return new Promise((resolve, reject) => {
        const originPoint = [origin.longitude, origin.latitude];
        const destinationPoint = [destination.longitude, destination.latitude];

        const serviceName = `AMap.${mode.charAt(0).toUpperCase() + mode.slice(1)}Search`;

        AMap.plugin(serviceName, () => {
          const routeService = new AMap[serviceName.charAt(0).toUpperCase() + serviceName.slice(1)]({
            map: null, // Don't auto render on map
            policy: AMap[mode === 'driving' ? 'DRIVING_POLICY_LEAST_TIME' :
                        mode === 'transit' ? 'TRANSIT_POLICY_FASTEST' :
                        mode === 'bicycling' ? 'BICYCLING_POLICY_FASTEST' :
                        'WALKING_POLICY_DEFAULT']
          });

          routeService.search(originPoint, destinationPoint, (status, result) => {
            if (status === 'complete' && result.routes && result.routes.length > 0) {
              const route = result.routes[0];
              resolve({
                mode,
                distance: route.distance,
                duration: route.duration,
                path: route.path,
                steps: mode === 'transit' ? route.transits : route.steps
              });
            } else {
              reject(new Error(`路线计算失败: ${destination.name}`));
            }
          });
        });
      });
    });
  }

  // Calculate routes from origin to all other locations for all transport modes
  async calculateAllRoutes(origin) {
    const allLocations = locationManager.getAllLocations().filter(loc =>
      loc.latitude !== origin.latitude || loc.longitude !== origin.longitude
    );

    if (allLocations.length === 0) {
      showToast('没有其他地点可以计算路线', 'warning');
      return [];
    }

    showToast(`开始计算到 ${allLocations.length} 个地点的路线...`, 'info');

    const results = [];

    for (const destination of allLocations) {
      const routeResults = {};
      let success = false;

      for (const mode of Object.values(TRANSPORT_MODES)) {
        try {
          const route = await this.calculateRoute(origin, destination, mode);
          routeResults[mode] = route;
          success = true;
        } catch (error) {
          console.warn(`Failed to calculate ${mode} route to ${destination.name}:`, error);
          routeResults[mode] = null;
        }
      }

      if (success) {
        results.push({
          destination,
          routes: routeResults
        });
      }
    }

    // Sort results by driving duration (or any available mode)
    results.sort((a, b) => {
      const aDur = a.routes.driving?.duration || a.routes.transit?.duration || a.routes.bicycling?.duration || a.routes.walking?.duration || Infinity;
      const bDur = b.routes.driving?.duration || b.routes.transit?.duration || b.routes.bicycling?.duration || b.routes.walking?.duration || Infinity;
      return aDur - bDur;
    });

    showToast(`路线计算完成，成功 ${results.length} 个，失败 ${allLocations.length - results.length} 个`,
      results.length === allLocations.length ? 'success' : 'warning');

    this.currentRoutes = results;
    this.renderRouteResults(results);

    return results;
  }

  // Render route results in right panel
  renderRouteResults(routes) {
    const container = document.getElementById('pathResults');

    if (routes.length === 0) {
      container.innerHTML = '<p class="text-sm text-gray-500 italic">暂无路线结果</p>';
      return;
    }

    container.innerHTML = routes.map((result, index) => {
      const { destination, routes: modeRoutes } = result;

      return `
        <div class="p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer route-result-card"
             data-result-index="${index}">
          <h4 class="font-medium text-gray-800 mb-2">${destination.name}</h4>
          <p class="text-xs text-gray-500 mb-2 truncate">${destination.address || ''}</p>

          <div class="grid grid-cols-2 gap-2 text-xs">
            ${Object.values(TRANSPORT_MODES).map(mode => {
              const route = modeRoutes[mode];
              if (!route) return '';

              return `
                <div class="flex items-center">
                  <span class="w-2 h-2 rounded-full mr-1.5" style="background-color: ${MODE_COLORS[mode]}"></span>
                  <span class="text-gray-700">${MODE_NAMES[mode]}:</span>
                  <span class="ml-1 font-medium">${formatDistance(route.distance)} / ${formatDuration(route.duration)}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Bind click events to route cards
    document.querySelectorAll('.route-result-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const resultIndex = parseInt(e.currentTarget.dataset.resultIndex);
        const result = routes[resultIndex];
        this.showRouteOnMap(result);
      });
    });
  }

  // Show selected route on map
  showRouteOnMap(routeResult) {
    // Clear existing routes
    mapManager.clearRouteLines();

    // Show all transport mode routes for this destination
    Object.values(TRANSPORT_MODES).forEach(mode => {
      const route = routeResult.routes[mode];
      if (route && route.path) {
        mapManager.addRouteLine(route.path, MODE_COLORS[mode], 4, 0.7);
      }
    });

    showToast(`已显示到 ${routeResult.destination.name} 的路线`, 'success');
  }
}

// Export singleton instance
export const routeManager = new RouteManager();
