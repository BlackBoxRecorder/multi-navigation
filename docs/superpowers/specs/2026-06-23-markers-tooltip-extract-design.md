# 地图标记 Tooltip 逻辑提取复用设计

## 背景

`src/map.js` 中 `addMyLocationMarker`、`addDestinationMarker`、`addOriginMarker` 三个添加方法，以及 `removeMyLocationMarker`、`clearAllMyLocationMarkers`、`clearDestinationMarker`、`clearOriginMarker` 四个移除/清理方法，存在大量重复代码。尤其是 tooltip 的 DOM 创建、位置更新、hover 事件绑定、延迟隐藏逻辑，在三个 add 方法中几乎完全一致。

重复代码总行数约 **303 行**（6 个方法 + 1 个内联清理），重构后可减少至约 **150 行**（含 2 个新增辅助方法），减少约 **50%**。

## 方案选择

采用**中等力度提取（方案 C1）**：提取 tooltip 相关的公共辅助方法，保留三个 add 方法各自的 marker 创建逻辑（SVG 图标、zIndex、存储位置、互斥逻辑差异显著，合并反而增加复杂度）。

## 新增辅助方法

### 1. `_attachTooltipToMarker({ marker, position, tooltipHTML, innerClass, bottomOffset })` → `{ el, moveHandler }`

封装完整的 tooltip 生命周期：

- 创建外层 DOM 容器（`pointer-events:none`，固定尺寸 0×90px）
- 设置 innerHTML 为传入的 `tooltipHTML`（带 `innerClass` 样式类名）
- 基于 `position` 和 `bottomOffset` 生成 `updateTooltipPos` 函数
- 绑定 `map.on('move/zoom/resize', moveHandler)`
- 内部实现 show/hide + 80ms `closeTimer` 延迟隐藏
- 绑定 marker `mouseover/mouseout` 与 tooltip inner `mouseenter/mouseleave` 互通
- 返回 `{ el, moveHandler }` 供调用方存储和后续清理

参数说明：

| 参数 | 说明 |
|---|---|
| `marker` | AMap.Marker 实例 |
| `position` | `[lng, lat]` 数组 |
| `tooltipHTML` | tooltip 内部 HTML 字符串（不含外层容器） |
| `innerClass` | tooltip 内层 div 的 CSS 类名 |
| `bottomOffset` | 像素偏移值，`-4` 用于普通标记，`+18` 用于起点/终点标记 |

### 2. `_cleanupTooltip(tooltip)`

解绑 map 上的 `move/zoom/resize` 事件并移除 DOM：

```
map.off('move', tooltip.moveHandler)
map.off('zoom', tooltip.moveHandler)
map.off('resize', tooltip.moveHandler)
tooltip.el.remove()
```

## 各公开方法变化

### `addMyLocationMarker(location)` — 约 22 行

```js
addMyLocationMarker(location) {
  const position = [location.longitude, location.latitude];
  const marker = new AMap.Marker({
    position, title: location.name,
    content: '<div style="width:28px;height:28px;">' + GREEN_SVG + '</div>',
    anchor: 'bottom-center', zIndex: 100,
  });

  const tooltipHTML = `...name + address...`;
  const tooltip = this._attachTooltipToMarker({
    marker, position, tooltipHTML,
    innerClass: 'tooltip-inner', bottomOffset: -4,
  });

  this.map.add(marker);
  this.markers.set(location.id, { marker, location, tooltip });
}
```

### `addDestinationMarker(location)` — 约 28 行

```js
addDestinationMarker(location) {
  this.clearOriginMarker();
  if (this.destinationMarker) this.map.remove(this.destinationMarker);
  if (this.destinationTooltip) { this._cleanupTooltip(this.destinationTooltip); this.destinationTooltip = null; }

  const position = [location.longitude, location.latitude];
  this.destinationMarker = new AMap.Marker({
    position, title: '目的地: ' + location.name,
    content: '<div style="width:28px;height:28px;">' + RED_SVG + '</div>',
    anchor: 'bottom-center', zIndex: 200,
  });

  const tooltipHTML = `..."📍 目的地" header...`;
  this.destinationTooltip = this._attachTooltipToMarker({
    marker: this.destinationMarker, position, tooltipHTML,
    innerClass: 'dest-tooltip-inner', bottomOffset: 18,
  });

  this.map.add(this.destinationMarker);
  this.map.setCenter(position);
}
```

### `addOriginMarker(location)` — 约 28 行

与 `addDestinationMarker` 结构对称，互斥对象相反（清除 destination），SVG 为绿色 `#22c55e`，tooltip 头为 `"🚩 起点"`。

### `removeMyLocationMarker(id)` — 约 6 行

```js
removeMyLocationMarker(id) {
  const item = this.markers.get(id);
  if (item) {
    this.map.remove(item.marker);
    if (item.tooltip) this._cleanupTooltip(item.tooltip);
    this.markers.delete(id);
  }
}
```

### `clearAllMyLocationMarkers()` — 约 5 行

循环 `this.markers.values()`，每个 item 调用 `map.remove` + `_cleanupTooltip`，最后 `this.markers.clear()`。

### `clearDestinationMarker()` / `clearOriginMarker()` — 各约 6 行

结构相同：检查单例引用 → `map.remove` → `_cleanupTooltip` → 置 null。

## 不变项

- 所有公开方法的签名和语义保持不变
- 三种标记的视觉样式（图标颜色、tooltip 内容、zIndex）完全不变
- 互斥逻辑（起点↔目的地）不变
- `this.markers` Map、`this.destinationMarker`/`this.originMarker` 单例引用保持不变

## 影响范围

仅修改 `src/map.js` 一个文件，不涉及其他模块。无需修改调用方代码。
