import { mapManager } from "./map.js";
import { uiManager } from "./ui.js";
import { showToast } from "./utils.js";
import { routeManager } from "./route.js";

async function initApp() {
  try {
    await mapManager.init();
    showToast("地图加载成功", "success");

    // Listen for location added events
    window.addEventListener("locationAdded", (e) => {
      const { location } = e.detail;
      uiManager.renderMyLocations();
    });

    // Listen for location removed events
    window.addEventListener("locationRemoved", (e) => {
      uiManager.renderMyLocations();

      // If there's still a destination set, recalculate routes
      if (routeManager.currentDestination) {
        routeManager
          .calculateRoutesToDestination(routeManager.currentDestination)
          .then((results) => {
            if (results.length > 0) {
              routeManager.renderResultsPanel(
                routeManager.currentDestination,
                results,
                routeManager.activeMode,
              );
              routeManager.switchTransportMode(routeManager.activeMode);
            } else {
              uiManager.showEmptyState();
            }
          });
      }
    });

    // Listen for destination set events
    window.addEventListener("destinationSet", async (e) => {
      const { destination } = e.detail;

      // Skip if same destination
      if (
        routeManager.currentDestination &&
        Math.abs(
          routeManager.currentDestination.latitude - destination.latitude,
        ) < 0.0001 &&
        Math.abs(
          routeManager.currentDestination.longitude - destination.longitude,
        ) < 0.0001
      ) {
        return;
      }

      // Clear old routes on map
      mapManager.clearRouteLines();

      // Calculate routes
      const results =
        await routeManager.calculateRoutesToDestination(destination);
      if (results.length > 0) {
        routeManager.renderResultsPanel(
          destination,
          results,
          routeManager.activeMode,
        );
        routeManager.switchTransportMode(routeManager.activeMode);
      }
    });
  } catch (error) {
    console.error("Init error:", error);
    showToast("应用初始化失败", "error");
  }
}

initApp();
