# 多路线模式手风琴折叠 + 地图单组渲染设计

## 概述

当前多路线模式下，地图同时渲染所有起点组的所有路线，列表允许多个折叠组同时展开。这在地图路线较多时视觉混乱。

改进方案：多路线模式下改为手风琴式折叠（**同一时间只有一个组可展开**），同时地图**只渲染当前展开组的路线**。折叠所有组时地图清空。

## 改动范围

| 文件 | 改动内容 |
|------|---------|
| `src/route.js` | 新增 `_expandedGroupIndex` 状态；`_renderOverviewRoutes` 多路线分支按展开组过滤；`renderRouteList` 折叠头改为手风琴逻辑 + body 可见性由状态控制；`setMultiRouteMode`、`resetState` 追加重置 |

`src/main.js`、`src/ui.js`、`src/map.js`、`index.html` 无需改动。

---

## 新增状态

```javascript
this._expandedGroupIndex = null; // 多路线模式下当前展开的组索引，null=全部折叠
```

该字段**仅在 `multiRouteMode === true` 时生效**。单路线模式下忽略，所有组默认全展开，行为不变。

生命周期：
- 进入多路线模式：设为 `null`（全部折叠）
- 退出多路线模式：设为 `null`
- `resetState()`：设为 `null`

---

## 地图渲染：`_renderOverviewRoutes(mode)`

多路线模式分支（当前 L490-L529）改造：

```
if (isMulti) {
  if (this._expandedGroupIndex === null) {
    // 无展开组 → 地图清空，直接 return
    return;
  }

  // 只遍历 _expandedGroupIndex 指向的那一个组
  const result = this.currentResults[this._expandedGroupIndex];
  const routes = result.routes[mode];
  if (!routes || !Array.isArray(routes) || routes.length === 0) return;

  routes.forEach((route, subRouteIdx) => {
    // 颜色+线型用 SUB_ROUTE_STYLES[subRouteIdx % SUB_ROUTE_STYLES.length]
    // 高亮逻辑不变（_highlightedRoute 匹配 → 加粗、不透明）
    // polyline 元数据 _groupIndex、_subRouteIdx 不变
  });
}
```

单路线模式分支不变。

---

## 列表渲染：`renderRouteList(results, mode)`

### body 可见性

```javascript
// 多路线模式：body 可见性由 _expandedGroupIndex 控制
const isExpanded = !isMulti || this._expandedGroupIndex === originalIndex;
const foldIcon = isExpanded ? "▼" : "▶";
const bodyHidden = isExpanded ? "" : "hidden";
```

### 折叠头点击事件

```javascript
header.addEventListener("click", (e) => {
  if (e.target.closest(".route-group-detail-btn")) return;

  if (isMulti) {
    // 手风琴逻辑
    if (this._expandedGroupIndex === originalIndex) {
      this._expandedGroupIndex = null; // 折叠当前组
    } else {
      this._expandedGroupIndex = originalIndex; // 展开该组（旧组自动关闭）
    }
    // 清除地图折线 + 重新渲染
    this.currentRouteLines.forEach((line) => mapManager.map.remove(line));
    this.currentRouteLines = [];
    this._renderOverviewRoutes(mode);
    this.renderRouteList(results, mode);
    return;
  }

  // 单路线模式：保持原有独立折叠逻辑
  const group = header.closest(".route-group");
  const body = group.querySelector(".route-group-body");
  const icon = header.querySelector(".fold-icon");
  if (body.classList.contains("hidden")) {
    body.classList.remove("hidden");
    if (icon) icon.textContent = "▼";
  } else {
    body.classList.add("hidden");
    if (icon) icon.textContent = "▶";
  }
});
```

---

## 子路线卡片点击

保持现有逻辑不变：
- 多路线模式：高亮/取消高亮 toggle（`_highlightedRoute`）
- 单路线模式：切换 activeRouteIndex + 替换折线

---

## 切换交通方式

`switchTransportMode(mode)` 行为：
- `_expandedGroupIndex` 保持当前值不变
- `_renderOverviewRoutes` 自动按展开组渲染新模式路线
- 如果展开组在新模式下无数据 → 地图不渲染路线，列表正常显示

---

## 影响的方法

| 方法 | 改动 |
|------|------|
| `constructor` | 新增 `this._expandedGroupIndex = null` |
| `_renderOverviewRoutes` | 多路线分支：null 时清空；非 null 时只渲染对应组 |
| `renderRouteList` | body 类添加 `hidden`；折叠头点击改为手风琴逻辑 |
| `setMultiRouteMode` | 进入/退出时设 `_expandedGroupIndex = null` |
| `resetState` | 新增 `this._expandedGroupIndex = null` |

---

## 验收标准

1. 多路线模式下初始全部折叠，地图上无路线
2. 展开一个组 → 自动关闭其他组，地图只显示该组全部路线（颜色+线型双重编码）
3. 点击已展开组的折叠头 → 折叠，地图清空
4. 点击组内子路线卡片 → 高亮/取消高亮 toggle，行为不变
5. 切换交通方式 → `_expandedGroupIndex` 保持不变，地图自动渲染新模式下的展开组路线
6. 切换到单路线模式 → `_expandedGroupIndex` 清空，恢复原有全展开行为
7. 清空所有地点 → `_expandedGroupIndex` 重置为 null
