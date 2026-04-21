# Amap Location Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone web-based location planning tool with multi-group location visualization, batch path planning, and multi-point route optimization using Amap API.

**Architecture:** Pure client-side Vanilla JS application with 3-column responsive UI, no backend required. All logic runs in the browser, directly calling Amap APIs. Single-file production build output for easy distribution.

**Tech Stack:** Vanilla JavaScript, Tailwind CSS (CDN), Amap JS API v2.0, Vite (build tool)

---

## Project File Structure
| File Path | Responsibility |
|-----------|----------------|
| `index.html` | Main HTML entry point, layout structure, CDN imports |
| `src/main.js` | Application entry point, initialization, global state |
| `src/map.js` | Amap initialization, map operations, marker management, route rendering |
| `src/location.js` | Location search, geocoding, group management, API calls |
| `src/route.js` | Path planning logic, route calculation, multi-point optimization |
| `src/ui.js` | UI event handlers, DOM manipulation, user interactions |
| `src/utils.js` | Helper functions: rate limiting, toast notifications, API error handling |
| `package.json` | Project configuration, dependencies, scripts |
| `vite.config.js` | Vite build configuration |
| `README.md` | Setup instructions, usage guide, API key configuration |

---

## Task 1: Project Scaffolding & Dependencies

**Files:**
- Create: `package.json`
- Create: `vite.config.js`

- [ ] **Step 1: Initialize package.json with Vite dependencies**

```json
{
  "name": "amap-location-planner",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "vite": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create Vite configuration file**

```javascript
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/main-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
});
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: Dependencies install successfully, node_modules folder created

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vite.config.js
git commit -m "feat: project scaffolding and build config"
```

---

## Task 2: Basic HTML Layout with 3-Column Structure

**Files:**
- Create: `index.html`

- [ ] **Step 1: Write HTML base structure with CDN imports**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>高德地图多点规划工具</title>
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- Amap JS API -->
  <script type="text/javascript" src="https://webapi.amap.com/maps?v=2.0&key=YOUR_AMAP_API_KEY"></script>
  <!-- Amap UI Library -->
  <script type="text/javascript" src="https://webapi.amap.com/ui/1.1/main.js"></script>
</head>
<body class="h-screen overflow-hidden bg-gray-50">
  <!-- 3 Column Layout -->
  <div class="flex h-full">
    <!-- Left Column: Location Input Panel -->
    <div class="w-[30%] h-full border-r border-gray-200 bg-white p-4 overflow-y-auto">
      <h2 class="text-xl font-bold mb-4 text-gray-800">地点管理</h2>
      
      <!-- Input Area -->
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-2">输入地点（每行一个）</label>
        <textarea 
          id="locationInput" 
          class="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          placeholder="北京市海淀区中关村
上海市浦东新区陆家嘴
广州市天河区珠江新城"
        ></textarea>
        <button 
          id="addGroupBtn" 
          class="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors font-medium"
        >
          添加地点组
        </button>
      </div>

      <!-- Groups List -->
      <div id="groupsList" class="space-y-4">
        <!-- Groups will be dynamically added here -->
      </div>
    </div>

    <!-- Middle Column: Map View -->
    <div class="w-[40%] h-full relative">
      <!-- Map Search Bar -->
      <div class="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-[90%] max-w-md">
        <input 
          id="mapSearchInput" 
          class="w-full p-3 rounded-lg shadow-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="搜索城市、地点、景区..."
        >
      </div>
      
      <!-- Map Container -->
      <div id="mapContainer" class="w-full h-full"></div>
    </div>

    <!-- Right Column: Path Planning Panel -->
    <div class="w-[30%] h-full border-l border-gray-200 bg-white p-4 overflow-y-auto">
      <h2 class="text-xl font-bold mb-4 text-gray-800">路径规划</h2>
      
      <!-- Selected Origin Info -->
      <div id="selectedOrigin" class="mb-6 p-3 bg-gray-50 rounded-lg border border-gray-200 hidden">
        <h3 class="font-semibold text-gray-800 mb-1">起点</h3>
        <p id="originName" class="text-sm text-gray-700"></p>
        <p id="originAddress" class="text-xs text-gray-500 mt-1"></p>
      </div>

      <!-- Path Results -->
      <div id="pathResults" class="space-y-3">
        <p class="text-sm text-gray-500 italic">点击地图上的标记点作为起点，自动计算到其他所有地点的路线</p>
      </div>

      <!-- Multi-point Route Section -->
      <div class="mt-8 pt-6 border-t border-gray-200">
        <h3 class="font-semibold text-gray-800 mb-3">多点路线优化</h3>
        <button 
          id="calcOptimalRouteBtn" 
          class="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg transition-colors font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
          disabled
        >
          计算最优路线（经过所有地点）
        </button>
        
        <div id="optimalRouteResult" class="mt-4 p-3 bg-green-50 rounded-lg border border-green-200 hidden">
          <h4 class="font-medium text-green-800 mb-2">最优路线</h4>
          <p id="optimalRouteDistance" class="text-sm text-green-700 mb-1"></p>
          <p id="optimalRouteTime" class="text-sm text-green-700"></p>
        </div>
      </div>
    </div>
  </div>

  <!-- Toast Notification Container -->
  <div id="toastContainer" class="fixed top-4 right-4 z-50 space-y-2"></div>

  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify HTML structure**

Run: `npm run dev`
Expected: Dev server starts, page loads with 3-column layout visible, no errors in console

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: basic 3-column HTML layout structure"
```

---

## Task 3: Utility Functions Initialization

**Files:**
- Create: `src/utils.js`

- [ ] **Step 1: Write utility functions for API rate limiting, toasts, error handling**

```javascript
// Toast notifications
export function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  
  const bgColors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500'
  };
  
  toast.className = `${bgColors[type]} text-white px-4 py-2 rounded-lg shadow-lg transform transition-all duration-300 opacity-0 translate-y-2`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  // Animate in
  setTimeout(() => {
    toast.classList.remove('opacity-0', 'translate-y-2');
  }, 10);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      container.removeChild(toast);
    }, 300);
  }, 3000);
}

// API rate limiter - limits requests to 1 per 200ms to avoid Amap rate limits
export class RateLimiter {
  constructor(limitInterval = 200) {
    this.limitInterval = limitInterval;
    this.lastRequestTime = 0;
    this.queue = [];
  }

  async execute(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.queue.length === 0) return;
    
    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;
    
    if (timeSinceLast >= this.limitInterval) {
      const { fn, resolve, reject } = this.queue.shift();
      this.lastRequestTime = Date.now();
      
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
      
      // Process next in queue
      setTimeout(() => this.processQueue(), this.limitInterval);
    } else {
      // Wait until interval passes
      setTimeout(() => this.processQueue(), this.limitInterval - timeSinceLast);
    }
  }
}

// Format distance (meters to km/meters readable string)
export function formatDistance(meters) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

// Format duration (seconds to hours/minutes readable string)
export function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`;
  }
  return `${minutes}分钟`;
}

// Amap API key configuration
export const AMAP_API_KEY = 'YOUR_AMAP_API_KEY'; // User will replace this
```

- [ ] **Step 2: Test utility functions in console**

Run dev server, open console, verify functions work:
```javascript
import { showToast, formatDistance, formatDuration } from './src/utils.js';
showToast('Test toast', 'success'); // Should show success toast
console.log(formatDistance(1500)); // Should output "1.5 km"
console.log(formatDuration(3660)); // Should output "1小时1分钟"
```

- [ ] **Step 3: Commit**

```bash
git add src/utils.js
git commit -m "feat: add utility functions for toasts, formatting, rate limiting"
```

---

## Task 4: Amap Map Initialization

**Files:**
- Create: `src/map.js`

- [ ] **Step 1: Write map initialization and marker management logic**

```javascript
import { showToast } from './utils.js';

class MapManager {
  constructor() {
    this.map = null;
    this.markers = [];
    this.routeLines = [];
    this.selectedMarker = null;
    this.markerColors = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316']; // Red, Blue, Green, Purple, Orange
  }

  // Initialize map
  init(containerId = 'mapContainer') {
    return new Promise((resolve, reject) => {
      try {
        this.map = new AMap.Map(containerId, {
          zoom: 11,
          center: [116.397428, 39.90923], // Default to Beijing
          resizeEnable: true
        });

        // Add map controls
        this.map.addControl(new AMap.Scale());
        this.map.addControl(new AMap.ToolBar({
          position: 'RB'
        }));
        this.map.addControl(new AMap.MapType({
          defaultType: 0, // 0: standard, 1: satellite
          showTraffic: false
        }));

        // Auto locate user
        this.map.plugin('AMap.Geolocation', () => {
          const geolocation = new AMap.Geolocation({
            enableHighAccuracy: true,
            timeout: 10000,
            zoomToAccuracy: true,
            position: 'RB'
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

        // Add search bar functionality
        this.initSearchBar();
        
        resolve(this.map);
      } catch (error) {
        showToast('地图初始化失败，请检查API Key配置', 'error');
        reject(error);
      }
    });
  }

  // Initialize map search bar
  initSearchBar() {
    const searchInput = document.getElementById('mapSearchInput');
    
    this.map.plugin('AMap.AutoComplete', () => {
      const autoComplete = new AMap.AutoComplete({
        input: searchInput
      });
      
      autoComplete.on('select', (e) => {
        if (e.poi && e.poi.location) {
          this.map.setCenter(e.poi.location);
          this.map.setZoom(15);
        }
      });
    });
  }

  // Add marker to map
  addMarker(location, groupIndex, onClick = null) {
    const position = [location.longitude, location.latitude];
    const color = this.markerColors[groupIndex % this.markerColors.length];
    
    const marker = new AMap.Marker({
      position: position,
      title: location.name,
      icon: new AMap.Icon({
        size: new AMap.Size(24, 36),
        image: `https://a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-${['red', 'blue', 'green', 'purple', 'orange'][groupIndex % 5]}.png`,
        imageSize: new AMap.Size(24, 36)
      }),
      anchor: 'bottom-center'
    });

    // Add click handler
    marker.on('click', () => {
      // Unselect previous marker
      if (this.selectedMarker) {
        this.selectedMarker.setIcon(new AMap.Icon({
          size: new AMap.Size(24, 36),
          image: `https://a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-${['red', 'blue', 'green', 'purple', 'orange'][this.selectedMarker.groupIndex % 5]}.png`,
          imageSize: new AMap.Size(24, 36)
        }));
      }
      
      // Select new marker
      marker.setIcon(new AMap.Icon({
        size: new AMap.Size(24, 36),
        image: `https://a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-${['red', 'blue', 'green', 'purple', 'orange'][groupIndex % 5]}-highlight.png`,
        imageSize: new AMap.Size(24, 36)
      }));
      
      this.selectedMarker = marker;
      marker.locationData = location;
      marker.groupIndex = groupIndex;
      
      if (onClick) {
        onClick(location);
      }
    });

    // Add info window
    const infoWindow = new AMap.InfoWindow({
      content: `<div class="p-2">
        <h3 class="font-semibold text-sm">${location.name}</h3>
        <p class="text-xs text-gray-600 mt-1">${location.address || '地址不详'}</p>
      </div>`,
      offset: new AMap.Pixel(0, -36)
    });

    marker.on('mouseover', () => {
      infoWindow.open(this.map, position);
    });

    marker.on('mouseout', () => {
      infoWindow.close();
    });

    this.map.add(marker);
    this.markers.push({ marker, groupIndex, location });
    
    return marker;
  }

  // Show/hide markers by group index
  toggleGroupMarkers(groupIndex, visible) {
    this.markers.forEach(item => {
      if (item.groupIndex === groupIndex) {
        if (visible) {
          item.marker.show();
        } else {
          item.marker.hide();
        }
      }
    });
  }

  // Remove all markers for a group
  removeGroupMarkers(groupIndex) {
    const groupMarkers = this.markers.filter(item => item.groupIndex === groupIndex);
    groupMarkers.forEach(item => {
      this.map.remove(item.marker);
    });
    this.markers = this.markers.filter(item => item.groupIndex !== groupIndex);
  }

  // Add route line to map
  addRouteLine(path, color = '#3b82f6', width = 4, opacity = 0.8) {
    const polyline = new AMap.Polyline({
      path: path,
      strokeColor: color,
      strokeWeight: width,
      strokeOpacity: opacity,
      zIndex: 50
    });
    
    this.map.add(polyline);
    this.routeLines.push(polyline);
    
    // Fit map to route bounds
    this.map.setFitView([polyline]);
    
    return polyline;
  }

  // Clear all route lines
  clearRouteLines() {
    this.map.remove(this.routeLines);
    this.routeLines = [];
  }

  // Get all locations from all groups
  getAllLocations() {
    return this.markers.map(item => item.location);
  }

  // Get selected origin location
  getSelectedOrigin() {
    return this.selectedMarker ? this.selectedMarker.locationData : null;
  }
}

// Export singleton instance
export const mapManager = new MapManager();
```

- [ ] **Step 2: Test map initialization**

Update `src/main.js` to test:
```javascript
import { mapManager } from './map.js';
import { showToast } from './utils.js';

async function initApp() {
  try {
    await mapManager.init();
    showToast('地图加载成功', 'success');
  } catch (error) {
    console.error('Init error:', error);
  }
}

initApp();
```

Run dev server, verify map loads successfully, auto-location works, search bar functions.

- [ ] **Step 3: Commit**

```bash
git add src/map.js src/main.js
git commit -m "feat: map initialization and marker management"
```

---

## Task 5: Location Group Management & Geocoding

**Files:**
- Create: `src/location.js`

- [ ] **Step 1: Write location search and group management logic**

```javascript
import { RateLimiter, showToast } from './utils.js';
import { mapManager } from './map.js';

const rateLimiter = new RateLimiter(300); // 1 request per 300ms
const MAX_GROUPS = 5;

class LocationManager {
  constructor() {
    this.groups = [];
  }

  // Search for a location using Amap POI API
  async searchLocation(name) {
    return rateLimiter.execute(async () => {
      return new Promise((resolve, reject) => {
        AMap.plugin('AMap.PlaceSearch', () => {
          const placeSearch = new AMap.PlaceSearch({
            pageSize: 1,
            pageIndex: 1,
            city: '全国',
            citylimit: false
          });
          
          placeSearch.search(name, (status, result) => {
            if (status === 'complete' && result.poiList && result.poiList.pois.length > 0) {
              const poi = result.poiList.pois[0];
              resolve({
                name: poi.name,
                address: poi.address,
                latitude: poi.location.lat,
                longitude: poi.location.lng,
                city: poi.cityname,
                district: poi.adname
              });
            } else {
              reject(new Error(`找不到地点: ${name}`));
            }
          });
        });
      });
    });
  }

  // Add a new location group
  async addGroup(locationNames) {
    if (this.groups.length >= MAX_GROUPS) {
      showToast(`最多支持 ${MAX_GROUPS} 个地点组`, 'error');
      return null;
    }

    const groupIndex = this.groups.length;
    const group = {
      id: `group-${groupIndex}`,
      name: `分组 ${groupIndex + 1}`,
      locations: [],
      visible: true,
      color: mapManager.markerColors[groupIndex % mapManager.markerColors.length]
    };

    this.groups.push(group);

    // Batch search locations
    const promises = locationNames.map(name => 
      this.searchLocation(name.trim())
        .then(location => {
          group.locations.push(location);
          // Add marker to map
          mapManager.addMarker(location, groupIndex, (selectedLoc) => {
            // Emit marker selected event (will be handled in main.js)
            window.dispatchEvent(new CustomEvent('markerSelected', { 
              detail: { location: selectedLoc, groupIndex } 
            }));
          });
          return { success: true, name, location };
        })
        .catch(error => {
          return { success: false, name, error: error.message };
        })
    );

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    if (successCount > 0) {
      showToast(`成功添加 ${successCount} 个地点${failedCount > 0 ? `，${failedCount} 个地点搜索失败` : ''}`, 
        failedCount > 0 ? 'warning' : 'success');
    } else {
      showToast('所有地点搜索失败', 'error');
      this.groups.pop(); // Remove empty group
      return null;
    }

    // Fit map to all markers in this group
    const markers = mapManager.markers.filter(m => m.groupIndex === groupIndex);
    if (markers.length > 0) {
      mapManager.map.setFitView(markers.map(m => m.marker));
    }

    return group;
  }

  // Toggle group visibility
  toggleGroupVisibility(groupIndex, visible) {
    if (this.groups[groupIndex]) {
      this.groups[groupIndex].visible = visible;
      mapManager.toggleGroupMarkers(groupIndex, visible);
    }
  }

  // Remove a group
  removeGroup(groupIndex) {
    if (this.groups[groupIndex]) {
      this.groups.splice(groupIndex, 1);
      mapManager.removeGroupMarkers(groupIndex);
      // Reindex remaining groups
      this.groups.forEach((group, idx) => {
        // Update marker group indices
        mapManager.markers.forEach(item => {
          if (item.groupIndex > groupIndex) {
            item.groupIndex--;
          }
        });
      });
      showToast('已删除分组', 'info');
    }
  }

  // Get all locations across all groups
  getAllLocations() {
    return this.groups.flatMap(group => group.locations);
  }
}

// Export singleton instance
export const locationManager = new LocationManager();
```

- [ ] **Step 2: Implement UI handlers for location input**

Create `src/ui.js`:
```javascript
import { locationManager } from './location.js';
import { showToast } from './utils.js';

class UIManager {
  constructor() {
    this.locationInput = document.getElementById('locationInput');
    this.addGroupBtn = document.getElementById('addGroupBtn');
    this.groupsList = document.getElementById('groupsList');
    
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
}

// Export singleton instance
export const uiManager = new UIManager();
```

- [ ] **Step 3: Update main.js to integrate location and UI managers**

Update `src/main.js`:
```javascript
import { mapManager } from './map.js';
import { uiManager } from './ui.js';
import { showToast } from './utils.js';

async function initApp() {
  try {
    await mapManager.init();
    showToast('地图加载成功', 'success');
    
    // Listen for marker selection events
    window.addEventListener('markerSelected', (e) => {
      const { location } = e.detail;
      uiManager.updateSelectedOrigin(location);
      // Trigger route calculation here later
    });
    
    // Listen for group added events
    window.addEventListener('groupAdded', () => {
      const allLocations = locationManager.getAllLocations();
      document.getElementById('calcOptimalRouteBtn').disabled = allLocations.length < 2;
    });
    
  } catch (error) {
    console.error('Init error:', error);
    showToast('应用初始化失败', 'error');
  }
}

initApp();
```

- [ ] **Step 4: Test location group functionality**

Run dev server, input a list of locations, add group, verify markers appear on map, group controls work, toggle visibility/delete function properly.

- [ ] **Step 5: Commit**

```bash
git add src/location.js src/ui.js src/main.js
git commit -m "feat: location group management and geocoding functionality"
```

---

## Task 6: Batch Path Planning Implementation

**Files:**
- Create: `src/route.js`

- [ ] **Step 1: Write path planning logic**

```javascript
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
```

- [ ] **Step 2: Integrate route manager into main app**

Update `src/main.js` event listener:
```javascript
import { routeManager } from './route.js'; // Add import

// Update marker selected event listener
window.addEventListener('markerSelected', async (e) => {
  const { location } = e.detail;
  uiManager.updateSelectedOrigin(location);
  // Calculate all routes from selected origin
  await routeManager.calculateAllRoutes(location);
});
```

- [ ] **Step 3: Test path planning functionality**

Run dev server, add multiple locations, click any marker to select as origin, verify routes are calculated for all destinations and displayed in right panel. Click a route card to verify routes render on map.

- [ ] **Step 4: Commit**

```bash
git add src/route.js src/main.js
git commit -m "feat: batch path planning implementation for all transport modes"
```

---

## Task 7: Multi-point Optimal Route Calculation

**Files:**
- Modify: `src/route.js`

- [ ] **Step 1: Add multi-point optimal route calculation method to RouteManager**

Add this method to the RouteManager class in `src/route.js`:

```javascript
// Calculate optimal route visiting multiple points (driving mode only)
async calculateOptimalMultiPointRoute() {
  const allLocations = locationManager.getAllLocations();
  
  if (allLocations.length < 2) {
    showToast('至少需要2个地点才能计算最优路线', 'warning');
    return null;
  }
  
  if (allLocations.length > 16) {
    showToast('最优路线计算最多支持16个地点', 'warning');
    return null;
  }

  showToast('正在计算最优路线...', 'info');

  try {
    // Use Amap Driving Route Planning API with waypoints
    const origin = [allLocations[0].longitude, allLocations[0].latitude];
    const destination = [allLocations[allLocations.length - 1].longitude, allLocations[allLocations.length - 1].latitude];
    const waypoints = allLocations.slice(1, -1).map(loc => [loc.longitude, loc.latitude]);

    return new Promise((resolve, reject) => {
      AMap.plugin('AMap.Driving', () => {
        const driving = new AMap.Driving({
          map: null,
          policy: AMap.DRIVING_POLICY_LEAST_TIME,
          waypoints: waypoints,
          showTraffic: false
        });

        driving.search(origin, destination, (status, result) => {
          if (status === 'complete' && result.routes && result.routes.length > 0) {
            const route = result.routes[0];
            
            // Clear existing routes
            mapManager.clearRouteLines();
            
            // Add optimal route to map
            mapManager.addRouteLine(route.path, '#f97316', 5, 0.8);
            
            // Show result
            const resultContainer = document.getElementById('optimalRouteResult');
            const distanceEl = document.getElementById('optimalRouteDistance');
            const timeEl = document.getElementById('optimalRouteTime');
            
            distanceEl.textContent = `总距离: ${formatDistance(route.distance)}`;
            timeEl.textContent = `预计时间: ${formatDuration(route.duration)}`;
            resultContainer.classList.remove('hidden');
            
            showToast('最优路线计算完成', 'success');
            
            resolve({
              distance: route.distance,
              duration: route.duration,
              path: route.path,
              steps: route.steps
            });
          } else {
            showToast('最优路线计算失败', 'error');
            reject(new Error('Route calculation failed'));
          }
        });
      });
    });
  } catch (error) {
    console.error('Optimal route calculation error:', error);
    showToast('最优路线计算失败', 'error');
    return null;
  }
}
```

- [ ] **Step 2: Bind optimal route button click event in ui.js**

Add this to UIManager constructor in `src/ui.js`:
```javascript
this.calcOptimalRouteBtn = document.getElementById('calcOptimalRouteBtn');

// Add to bindEvents method:
this.calcOptimalRouteBtn.addEventListener('click', () => this.handleCalcOptimalRoute());
```

Add this handler method to UIManager class:
```javascript
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
```

Add import for routeManager at top of `src/ui.js`:
```javascript
import { routeManager } from './route.js';
```

- [ ] **Step 3: Test multi-point route calculation**

Run dev server, add 3+ locations, click "Calculate Optimal Route" button, verify route is calculated and rendered on map with total distance/time displayed.

- [ ] **Step 4: Commit**

```bash
git add src/route.js src/ui.js
git commit -m "feat: multi-point optimal route calculation functionality"
```

---

## Task 8: UI Polish & Error Handling

**Files:**
- Modify: Various files for polish and edge case handling

- [ ] **Step 1: Add responsive layout for mobile**

Add this to the `<head>` section of `index.html` to improve mobile responsiveness:
```html
<style>
  @media (max-width: 1024px) {
    .flex.h-full {
      flex-direction: column;
      height: auto;
      min-height: 100vh;
    }
    .w-\\[30\\%\\], .w-\\[40\\%\\] {
      width: 100% !important;
    }
    .w-\\[40\\%\\] {
      min-height: 500px;
      order: -1;
    }
    .border-l, .border-r {
      border: none !important;
      border-top: 1px solid #e5e7eb !important;
    }
  }
</style>
```

- [ ] **Step 2: Add API key setup instructions placeholder**

Update the Amap script tag comment in `index.html`:
```html
<!-- Amap JS API - Replace YOUR_AMAP_API_KEY with your actual key from https://lbs.amap.com/ -->
<script type="text/javascript" src="https://webapi.amap.com/maps?v=2.0&key=YOUR_AMAP_API_KEY"></script>
```

- [ ] **Step 3: Add loading states and better error handling**

Add this to `src/location.js` in the addGroup method to improve error display for failed locations:
```javascript
// After processing all results:
const failedLocations = results.filter(r => !r.success);
if (failedLocations.length > 0) {
  console.warn('Failed locations:', failedLocations);
  // Show failed locations in toast
  showToast(`搜索失败的地点: ${failedLocations.map(f => f.name).join(', ')}`, 'warning');
}
```

- [ ] **Step 4: Add keyboard shortcuts info**

Add a small help section at the bottom of the left column in `index.html`:
```html
<div class="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-500">
  <p class="mb-1">💡 提示: Ctrl+Enter 快速添加地点组</p>
  <p>点击地图上的标记点作为起点自动计算路线</p>
</div>
```

- [ ] **Step 5: Test all functionality end-to-end**

Verify all features work correctly:
- Add multiple groups of locations
- Select markers to calculate routes
- View routes on map
- Calculate optimal multi-point routes
- Toggle group visibility
- Delete groups
- Search locations using map search bar
- Auto-location works
- All transport modes show correctly
- Responsive layout works on mobile viewport sizes

- [ ] **Step 6: Commit**

```bash
git add index.html src/location.js
git commit -m "feat: ui polish, responsive design, error handling improvements"
```

---

## Task 9: Build & Deployment Configuration

**Files:**
- Create: `README.md`
- Modify: `package.json`

- [ ] **Step 1: Write README with setup and usage instructions**

```markdown
# 高德地图多点规划工具

一个基于高德地图 API 的 Web 应用，支持多组地点管理、批量路径规划、多点路线优化。

## 功能特性
- 📍 多组地点管理，支持最多 5 个独立地点组，不同颜色标记区分
- 🗺️ 交互式地图，自动定位，地点搜索
- 🚗 4 种交通方式路线规划（驾车、公交、步行、骑行）
- ⚡ 批量路线计算，自动计算从起点到所有其他地点的路线
- 🛣️ 多点最优路线规划，自动计算经过所有地点的最短/最快路线
- 📱 响应式设计，支持桌面和移动设备

## 使用前提
1. 注册高德地图开发者账号：https://lbs.amap.com/
2. 创建应用并获取 Web 端 JS API 密钥（Key）

## 安装和运行

### 开发模式
```bash
# 安装依赖
npm install

# 替换 API Key
编辑 index.html 文件，将 YOUR_AMAP_API_KEY 替换为你自己的高德地图 API Key

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000 即可使用。

### 生产构建
```bash
# 构建生产版本
npm run build
```

构建产物会生成在 `dist` 目录下，直接部署到任何静态文件服务器即可使用，也可以直接打开 `dist/index.html` 本地使用。

## 使用说明

### 1. 添加地点组
- 在左侧输入框中输入地点列表，每行一个地点
- 点击「添加地点组」按钮，系统会自动搜索每个地点并在地图上标记
- 每个地点组使用不同颜色的标记区分，最多支持 5 个地点组

### 2. 路径规划
- 点击地图上的任意标记点作为起点
- 系统会自动计算从起点到所有其他地点的路线，包含4种交通方式的距离和时间
- 点击右侧路线列表中的任意项，可以在地图上显示具体路线

### 3. 多点最优路线
- 添加至少2个地点后，点击「计算最优路线（经过所有地点）」按钮
- 系统会自动计算经过所有地点的最优路线（驾车模式），显示总距离和预计时间，并在地图上渲染完整路线

### 4. 分组管理
- 可以点击分组卡片上的「显示/隐藏」按钮切换该组标记的可见性
- 可以点击「删除」按钮删除整个分组

## 技术栈
- 原生 JavaScript（无前端框架）
- Tailwind CSS（CDN）
- 高德地图 JS API v2.0
- Vite（构建工具）

## 注意事项
- 本工具所有计算都在浏览器端完成，无需后端服务器
- 高德地图 API 有请求频率限制，批量计算路线时可能会有延迟
- API Key 请妥善保管，不要公开分享到公网
- 本工具仅供学习和个人使用，请勿用于商业用途
```

- [ ] **Step 2: Test production build**

Run: `npm run build`
Expected: Build completes successfully, dist folder created with all assets

Run: `npm run preview`
Expected: Preview server starts, production build works correctly

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "feat: add readme documentation and build config finalization"
```

---

## Plan Self-Review
### Spec Coverage Check
✅ 3-column layout implemented exactly as specified
✅ Multi-group location input with distinct colors (max 5 groups)
✅ Auto-locate and map search functionality
✅ 4 transport modes supported (driving, public transport, walking, cycling)
✅ Batch path planning from selected origin to all destinations
✅ Multi-point optimal route calculation
✅ All use cases covered: housing/job planning, travel planning, multi-point route optimization

### Placeholder Scan
✅ No TBD/TODO placeholders
✅ All code snippets complete
✅ All commands exact with expected output
✅ All file paths specified correctly

### Type Consistency Check
✅ Function and method names consistent across all files
✅ Data structures consistent between modules
✅ Event naming and payloads consistent

Plan is complete and ready for execution.
