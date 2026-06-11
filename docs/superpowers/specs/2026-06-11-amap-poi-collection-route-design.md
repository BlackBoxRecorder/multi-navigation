# 高德地图 POI 收藏与路径规划功能设计

> 日期: 2026-06-11 | 方案: 增量改造（方案B）

## 一、概述

将现有的"分组+多点路线"模式改造为"POI 收藏+起点→目的地"模式。用户在地图上点击 POI 即可收藏到"我的地点"，然后选中任意 POI 作为目的地，一键计算所有收藏地点到该目的地的路线。

## 二、数据模型

### LocationManager (`location.js`)

```
旧: this.groups = [{ id, name, locations[], visible, color }]
新: this.locations = [{ name, address, latitude, longitude, city, district }]

方法变更:
  + addLocation(location)     // 添加单个地点
  + removeLocation(index)     // 按索引删除
  + hasLocation(lat, lng)     // 判断经纬度是否已收藏（容差 0.0001°）
  + getAllLocations()          // 保留
  - addGroup()                 // 移除
  - toggleGroupVisibility()    // 移除
  - removeGroup()              // 移除
  ~ searchLocation(name)       // 保留，用于 POI 查询
```

- 收藏上限: **20 个**
- 去重依据：经纬度差 < 0.0001°（约10米）

### RouteManager (`route.js`)

```
方法变更:
  + calculateRoutesToDestination(destination, transportMode?)
      // mode 可选，不传则计算全部4种
      // 返回: [{ origin, routes: { driving, transit, walking, bicycling } }]
  + renderResultsPanel(destination, results)
  ~ calculateRoute(origin, destination, mode)  // 保留不变
  - calculateAllRoutes(origin)                  // 移除（one-to-many 模式）
  - calculateOptimalMultiPointRoute()           // 移除（多点最优路线）
```

### MapManager (`map.js`)

```
数据结构:
  this.markers = [{ marker, location }]        // 去掉 groupIndex
  this.destinationPoi = null                    // 当前选中的目的地
  this.poiInfoWindow = null                     // 自定义信息窗 DOM 元素

新增方法:
  + initPoiClickListener()         // 监听地图点击 → 逆地理/POI搜索 → 弹出信息窗
  + showPoiInfoWindow(lnglat, poi) // 渲染自定义信息窗（HTML 浮层定位）
  + closePoiInfoWindow()           // 关闭信息窗
  + addMyLocationMarker(location)  // 为收藏地点添加蓝色标记
  + addDestinationMarker(location) // 添加红色目的地标记

变更方法:
  ~ addMarker()                    // 简化，不再关联 groupIndex
```

### 事件通信

| 事件名 | 触发时机 | 携带数据 |
|--------|----------|----------|
| `locationAdded` | POI 被添加到我的地点 | `{ location }` |
| `locationRemoved` | 我的地点被删除 | `{ index, location }` |
| `destinationSet` | POI 被设为目的地 | `{ destination }` |

移除的事件: `markerSelected`, `groupAdded`

## 三、交互流程

### 3.1 添加收藏

```
用户点击地图任意位置
  → map click 事件触发
  → 逆地理编码 (AMap.Geocoder) + 附近 POI 搜索 (AMap.PlaceSearch searchNearBy)
  → 获取最近的 POI 名称和坐标
  → 弹出自定义信息窗，内容:
    - 未收藏: [名称] [地址] 按钮: [添加到我的地点] [设为目的地]
    - 已收藏: [名称] [地址] "已添加 ✓"(灰色) 按钮: [设为目的地]
  → 点击"添加到我的地点":
    → locationManager.addLocation(poi)
    → 地图添加蓝色标记
    → 左侧列表刷新
    → 触发 locationAdded 事件
    → 关闭信息窗
```

### 3.2 路径规划

```
  → 点击信息窗"设为目的地":
    → 地图添加红色目的地标记
    → 清空旧路线
    → 右侧面板切换为路线模式
    → 触发 destinationSet 事件
    → routeManager.calculateRoutesToDestination(destination)
    → 计算所有收藏地点 → 目的地的 4 种模式路线（rate-limited 500ms）
    → 渲染右侧面板

右侧面板:
  ┌─────────────────────────┐
  │ 目的地: 无锡新吴宝龙广场    │
  │ [公共交通] [自驾] [步行] [骑车] │  ← 全局模式切换
  │─────────────────────────│
  │ 无锡东站 → 15km / 30分钟   │
  │ 硕放机场 → 20km / 40分钟   │
  │ ...                     │
  └─────────────────────────┘

用户点击模式标签:
  → 清空地图旧路线
  → 遍历所有路线结果，取该模式的 route.path
  → 一次性渲染所有路线到地图（每条路线的起点用不同颜色区分）
  → 地图自动 fitView
```

## 四、UI 布局

### 左侧面板: 我的地点

```
┌──────────────────────┐
│ 我的地点 (N个)         │
│──────────────────────│
│ 📍 无锡东站      ✕    │
│    无锡市锡山区        │
│──────────────────────│
│ 📍 硕放机场      ✕    │
│    无锡市新吴区        │
│──────────────────────│
│ (空状态提示)          │
│ 点击地图上的POI添加地点  │
└──────────────────────┘
```

- 去掉 textarea、添加按钮、Ctrl+Enter 提示
- 每个地点项右侧有删除按钮（✕）

### 中部: 地图

- 保留顶部搜索栏（AutoComplete + 定位）
- 收藏地点: 蓝色标记
- 目的地: 红色标记
- 路线: 按交通方式颜色渲染，同一模式下不同起点用该色系的不同深浅

### 右侧面板: 路径规划

```
┌─────────────────────────────┐
│ 路径规划                     │
│─────────────────────────────│
│ 目的地: (空或已设置)          │
│─────────────────────────────│
│ [公共交通] [自驾] [步行] [骑车] │  ← 有数据时显示
│─────────────────────────────│
│ 路线列表 / 空状态提示         │
└─────────────────────────────┘
```

- 初始状态: 显示"点击地图POI并设为目的地以计算路线"
- 去掉: 最优路线按钮、最优路线结果区域
- 路线卡片点击: 高亮对应路线（加粗/改变透明度）

## 五、标记与路线颜色方案

### 标记颜色
- 收藏地点: 蓝色 (`#3b82f6`)
- 目的地: 红色 (`#ef4444`)

### 路线颜色（按交通方式）
- 公共交通: 紫色 (`#8b5cf6`)
- 自驾: 蓝色 (`#3b82f6`)
- 步行: 绿色 (`#22c55e`)
- 骑行: 橙色 (`#f59e0b`)

同一模式下多条路线，通过调整透明度（0.4~0.9）或线宽（3~5px）区分。

## 六、错误与边界处理

1. **POI 搜索失败**: 信息窗显示"未能识别此位置"，仅提供经纬度坐标信息，两个按钮仍可用
2. **收藏数量达上限**: toast 提示"最多收藏20个地点"
3. **重复收藏**: 信息窗显示"已添加"，添加按钮不可点击（灰色）
4. **路线计算失败**: 某条路线计算失败时，列表中显示"计算失败"，不阻塞其他路线的计算和渲染
5. **收藏列表为空时设目的地**: toast 提示"请先添加收藏地点"
6. **重复设目的地**: 如果新目的地和现有相同，跳过重新计算
7. **地图点击在已有标记上**: 如果点击位置在已有收藏标记或目的地标记附近（距离 < 20px 屏幕像素），不弹信息窗，避免干扰

