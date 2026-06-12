import { locationManager } from './location.js';
import { mapManager } from './map.js';
import { routeManager } from './route.js';
import { showToast } from './utils.js';

class UIManager {
  constructor() {
    this.myLocationsList = document.getElementById('myLocationsList');
    this.routeResultsList = document.getElementById('routeResultsList');
    this.destinationDisplay = document.getElementById('destinationDisplay');
    this.clearAllBtn = document.getElementById('clearAllLocationsBtn');

    this.bindEvents();
    this.renderMyLocations();
    this.initHelpModal();
  }

  bindEvents() {
    // Bind clear all button
    if (this.clearAllBtn) {
      this.clearAllBtn.addEventListener('click', () => this.handleClearAll());
    }
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
          <p class="text-sm">右键点击地图上的蓝色标记添加地点</p>
        </div>
      `;
      return;
    }

    this.myLocationsList.innerHTML = locations
      .map((loc, index) => {
        // Address dedup: if name starts with address, trim the prefix
        let displayName = loc.name;
        if (loc.address && loc.name.startsWith(loc.address)) {
          displayName = loc.name.replace(loc.address, '').trim();
        }

        return `
      <div class="flex items-center p-3 border border-gray-200 rounded-lg bg-white hover:border-blue-200 transition-colors">
        <input type="checkbox" class="my-loc-checkbox flex-shrink-0 w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-400" data-index="${index}">
        <div class="flex-1 min-w-0 ml-2 mr-2">
          <p class="font-medium text-sm text-gray-800 truncate">${displayName}</p>
          <p class="text-xs text-gray-500 mt-0.5 truncate">${loc.address || '地址不详'}</p>
        </div>
        <button class="remove-location-btn flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors p-1"
                data-index="${index}"
                title="删除">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `;
      })
      .join('');

    // Bind delete events
    this.myLocationsList.querySelectorAll('.remove-location-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(e.currentTarget.dataset.index);
        this.handleRemoveLocation(index);
      });
    });
  }

  // Handle location removal
  handleRemoveLocation(index) {
    const removed = locationManager.removeLocation(index);

    if (removed) {
      // Remove marker from map
      mapManager.removeMyLocationMarker(index);

      // Dispatch event
      window.dispatchEvent(
        new CustomEvent('locationRemoved', {
          detail: { index, location: removed },
        }),
      );

      // Re-render
      this.renderMyLocations();
    }
  }

  // Get indices of selected (checked) locations
  getSelectedLocationIndices() {
    const checkboxes = this.myLocationsList.querySelectorAll('.my-loc-checkbox:checked');
    return Array.from(checkboxes).map((cb) => parseInt(cb.dataset.index));
  }

  // Handle clear all button click
  handleClearAll() {
    const locations = locationManager.getAllLocations();
    if (locations.length === 0) {
      showToast('没有可清空的地点', 'warning');
      return;
    }

    if (!confirm('确定清空所有收藏地点吗？此操作不可恢复。')) return;

    // Clear route state first (removes route lines from map)
    routeManager.resetState();

    // Clear map markers
    mapManager.clearAllMyLocationMarkers();
    mapManager.clearRouteLines();

    // Clear location data
    locationManager.clearAll();

    // Re-render
    this.renderMyLocations();
    this.showEmptyState();
  }

  // Initialize help modal interactions
  initHelpModal() {
    const modal = document.getElementById('helpModal');
    const helpBtn = document.getElementById('helpBtn');
    const closeBtn = document.getElementById('helpModalClose');

    if (!modal || !helpBtn) return;

    // Open modal
    helpBtn.addEventListener('click', () => {
      modal.classList.remove('hidden');
    });

    // Close modal helpers
    const closeModal = () => {
      modal.classList.add('hidden');
    };

    // Close button
    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }

    // Click overlay background
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        closeModal();
      }
    });

    // Tab switching
    const tabBtns = modal.querySelectorAll('.help-tab-btn');
    const tabContents = modal.querySelectorAll('.help-tab-content');

    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;

        // Update tab button styles
        tabBtns.forEach((b) => {
          b.classList.remove('border-blue-500', 'text-blue-600');
          b.classList.add('border-transparent', 'text-gray-500');
        });
        btn.classList.add('border-blue-500', 'text-blue-600');
        btn.classList.remove('border-transparent', 'text-gray-500');

        // Show/hide tab content
        tabContents.forEach((content) => {
          if (content.id === 'helpTabFeatures' && targetTab === 'features') {
            content.classList.remove('hidden');
          } else if (content.id === 'helpTabGuide' && targetTab === 'guide') {
            content.classList.remove('hidden');
          } else if (content.id === 'helpTabVideo' && targetTab === 'video') {
            content.classList.remove('hidden');
          } else {
            content.classList.add('hidden');
          }
        });
      });
    });
  }

  // Show empty state in right panel
  showEmptyState() {
    if (this.destinationDisplay) {
      this.destinationDisplay.classList.add('hidden');
    }
    if (this.routeResultsList) {
      this.routeResultsList.innerHTML = `
        <p class="text-sm text-gray-500 italic">右键点击地图上蓝色标记的地点并设为目的地以计算路线</p>
      `;
    }
    const modeBtns = document.getElementById('modeBtns');
    if (modeBtns) {
      modeBtns.innerHTML = '';
    }
    const toggleLabel = document.getElementById('multiRouteToggleLabel');
    if (toggleLabel) {
      toggleLabel.classList.add('hidden');
    }
  }
}

// Export singleton instance
export const uiManager = new UIManager();
