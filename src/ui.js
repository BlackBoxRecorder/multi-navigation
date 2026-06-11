import { locationManager } from "./location.js";
import { mapManager } from "./map.js";

class UIManager {
  constructor() {
    this.myLocationsList = document.getElementById("myLocationsList");
    this.routeResultsList = document.getElementById("routeResultsList");
    this.destinationDisplay = document.getElementById("destinationDisplay");

    this.bindEvents();
    this.renderMyLocations();
  }

  bindEvents() {
    // No DOM events needed at constructor level —
    // interactions are handled via CustomEvent listeners in main.js
    // and inline click handlers in map.js info window / route.js mode switches
  }

  // Render the flat "我的地点" list in the left panel
  renderMyLocations() {
    if (!this.myLocationsList) return;

    const locations = locationManager.getAllLocations();

    if (locations.length === 0) {
      this.myLocationsList.innerHTML = `
        <div class="text-center py-8 text-gray-400">
          <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          <p class="text-sm">点击地图上的 POI 添加地点</p>
        </div>
      `;
      return;
    }

    this.myLocationsList.innerHTML = locations
      .map(
        (loc, index) => `
      <div class="flex items-start justify-between p-3 border border-gray-200 rounded-lg bg-white hover:border-blue-200 transition-colors">
        <div class="flex-1 min-w-0 mr-2">
          <p class="font-medium text-sm text-gray-800 truncate">${loc.name}</p>
          <p class="text-xs text-gray-500 mt-0.5 truncate">${loc.address || "地址不详"}</p>
        </div>
        <button class="remove-location-btn flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors p-1"
                data-index="${index}"
                title="删除">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `,
      )
      .join("");

    // Bind delete events
    this.myLocationsList
      .querySelectorAll(".remove-location-btn")
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const index = parseInt(e.currentTarget.dataset.index);
          this.handleRemoveLocation(index);
        });
      });
  }

  // Handle location removal
  handleRemoveLocation(index) {
    const locations = locationManager.getAllLocations();
    const removed = locationManager.removeLocation(index);

    if (removed) {
      // Remove marker from map
      mapManager.removeMyLocationMarker(index);

      // Dispatch event
      window.dispatchEvent(
        new CustomEvent("locationRemoved", {
          detail: { index, location: removed },
        }),
      );

      // Re-render
      this.renderMyLocations();
    }
  }

  // Show empty state in right panel
  showEmptyState() {
    if (this.destinationDisplay) {
      this.destinationDisplay.classList.add("hidden");
    }
    if (this.routeResultsList) {
      this.routeResultsList.innerHTML = `
        <p class="text-sm text-gray-500 italic">点击地图 POI 并设为目的地以计算路线</p>
      `;
    }
    const modeBar = document.getElementById("modeSwitchBar");
    if (modeBar) {
      modeBar.innerHTML = "";
    }
  }
}

// Export singleton instance
export const uiManager = new UIManager();
