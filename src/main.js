import { mapManager } from "./map.js";
import { uiManager } from "./ui.js";
import { showToast } from "./utils.js";
import { routeManager } from "./route.js";
import { locationManager } from "./location.js";

function initResizeHandles() {
  const layout = document.getElementById("mainLayout");
  const leftPanel = document.getElementById("leftPanel");
  const rightPanel = document.getElementById("rightPanel");
  const leftHandle = document.getElementById("leftResizeHandle");
  const rightHandle = document.getElementById("rightResizeHandle");

  if (!layout || !leftPanel || !rightPanel || !leftHandle || !rightHandle)
    return;

  const MIN_LEFT = 180;
  const MAX_LEFT = 500;
  const MIN_RIGHT = 300;
  const MAX_RIGHT = 700;

  let activeHandle = null;

  function onMouseDown(e, handle) {
    e.preventDefault();
    activeHandle = handle;
    handle.classList.add("active");
    document.body.classList.add("resizing");

    function onMouseMove(e) {
      const layoutRect = layout.getBoundingClientRect();
      if (activeHandle === leftHandle) {
        let newWidth = e.clientX - layoutRect.left;
        newWidth = Math.max(MIN_LEFT, Math.min(MAX_LEFT, newWidth));
        leftPanel.style.width = newWidth + "px";
      } else if (activeHandle === rightHandle) {
        let newWidth = layoutRect.right - e.clientX;
        newWidth = Math.max(MIN_RIGHT, Math.min(MAX_RIGHT, newWidth));
        rightPanel.style.width = newWidth + "px";
      }
      // Notify map of container size change
      mapManager.refreshSize();
    }

    function onMouseUp() {
      activeHandle.classList.remove("active");
      document.body.classList.remove("resizing");
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      mapManager.refreshSize();
      activeHandle = null;
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  leftHandle.addEventListener("mousedown", (e) => onMouseDown(e, leftHandle));
  rightHandle.addEventListener("mousedown", (e) => onMouseDown(e, rightHandle));
}

async function initApp() {
  try {
    await mapManager.init();
    showToast("地图加载成功", "success");

    // Init resizable sidebars
    initResizeHandles();

    // Restore saved locations from localStorage
    locationManager.loadFromStorage();
    const savedLocations = locationManager.getAllLocations();
    if (savedLocations.length > 0) {
      savedLocations.forEach((loc) => mapManager.addMyLocationMarker(loc));
      uiManager.renderMyLocations();
      showToast(`已恢复 ${savedLocations.length} 个收藏地点`, "info");
    }

    // Listen for location added events
    window.addEventListener("locationAdded", (e) => {
      const { location } = e.detail;
      locationManager.saveToStorage();
      uiManager.renderMyLocations();
    });

    // Listen for location removed events
    window.addEventListener("locationRemoved", (e) => {
      locationManager.saveToStorage();
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
