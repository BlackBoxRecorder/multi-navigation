import { locationManager } from './location.js';
import { showToast } from './utils.js';
import { routeManager } from './route.js';

class UIManager {
  constructor() {
    this.locationInput = document.getElementById('locationInput');
    this.addGroupBtn = document.getElementById('addGroupBtn');
    this.groupsList = document.getElementById('groupsList');
    this.calcOptimalRouteBtn = document.getElementById('calcOptimalRouteBtn');

    this.bindEvents();
  }

  bindEvents() {
    // Add group button click
    this.addGroupBtn.addEventListener('click', () => this.handleAddGroup());

    // Enter key in input to add group
    this.locationInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        this.handleAddGroup();
      }
    });

    // Optimal route button click
    this.calcOptimalRouteBtn.addEventListener('click', () => this.handleCalcOptimalRoute());
  }

  async handleAddGroup() {
    const inputText = this.locationInput.value.trim();
    if (!inputText) {
      showToast('请输入地点', 'warning');
      return;
    }

    const locationNames = inputText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (locationNames.length === 0) {
      showToast('请输入有效的地点', 'warning');
      return;
    }

    this.addGroupBtn.disabled = true;
    this.addGroupBtn.textContent = '添加中...';

    try {
      const group = await locationManager.addGroup(locationNames);
      if (group) {
        this.renderGroupsList();
        this.locationInput.value = ''; // Clear input after adding
        // Dispatch group added event
        window.dispatchEvent(new CustomEvent('groupAdded', { detail: { group } }));
      }
    } catch (error) {
      showToast('添加分组失败', 'error');
      console.error('Add group error:', error);
    } finally {
      this.addGroupBtn.disabled = false;
      this.addGroupBtn.textContent = '添加地点组';
    }
  }

  // Render groups list UI
  renderGroupsList() {
    this.groupsList.innerHTML = '';

    locationManager.groups.forEach((group, index) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'p-3 border border-gray-200 rounded-lg bg-gray-50';

      groupEl.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center">
            <span class="w-3 h-3 rounded-full mr-2" style="background-color: ${group.color}"></span>
            <h3 class="font-medium text-gray-800">${group.name}</h3>
            <span class="ml-2 text-xs text-gray-500">${group.locations.length}个地点</span>
          </div>
          <div class="flex items-center space-x-1">
            <button class="toggle-group-btn text-xs px-2 py-1 rounded ${group.visible ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}" data-group-index="${index}">
              ${group.visible ? '隐藏' : '显示'}
            </button>
            <button class="remove-group-btn text-xs px-2 py-1 rounded bg-red-100 text-red-700" data-group-index="${index}">
              删除
            </button>
          </div>
        </div>
        <div class="max-h-40 overflow-y-auto space-y-1">
          ${group.locations.map(loc => `
            <div class="text-xs text-gray-700 flex items-center">
              <span class="w-1.5 h-1.5 rounded-full mr-1.5" style="background-color: ${group.color}"></span>
              <span class="truncate" title="${loc.address || loc.name}">${loc.name}</span>
            </div>
          `).join('')}
        </div>
      `;

      this.groupsList.appendChild(groupEl);
    });

    // Bind toggle and remove events
    document.querySelectorAll('.toggle-group-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const groupIndex = parseInt(e.target.dataset.groupIndex);
        const group = locationManager.groups[groupIndex];
        locationManager.toggleGroupVisibility(groupIndex, !group.visible);
        this.renderGroupsList();
      });
    });

    document.querySelectorAll('.remove-group-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const groupIndex = parseInt(e.target.dataset.groupIndex);
        if (confirm(`确定要删除分组 ${locationManager.groups[groupIndex].name} 吗？`)) {
          locationManager.removeGroup(groupIndex);
          this.renderGroupsList();
        }
      });
    });
  }

  // Update selected origin display
  updateSelectedOrigin(location) {
    const container = document.getElementById('selectedOrigin');
    const nameEl = document.getElementById('originName');
    const addressEl = document.getElementById('originAddress');

    if (location) {
      nameEl.textContent = location.name;
      addressEl.textContent = location.address || '';
      container.classList.remove('hidden');

      // Enable optimal route button if there are at least 2 locations
      const allLocations = locationManager.getAllLocations();
      document.getElementById('calcOptimalRouteBtn').disabled = allLocations.length < 2;
    } else {
      container.classList.add('hidden');
      document.getElementById('calcOptimalRouteBtn').disabled = true;
    }
  }

  async handleCalcOptimalRoute() {
    this.calcOptimalRouteBtn.disabled = true;
    this.calcOptimalRouteBtn.textContent = '计算中...';

    try {
      await routeManager.calculateOptimalMultiPointRoute();
    } catch (error) {
      console.error('Optimal route error:', error);
    } finally {
      this.calcOptimalRouteBtn.disabled = false;
      this.calcOptimalRouteBtn.textContent = '计算最优路线（经过所有地点）';
    }
  }
}

// Export singleton instance
export const uiManager = new UIManager();
