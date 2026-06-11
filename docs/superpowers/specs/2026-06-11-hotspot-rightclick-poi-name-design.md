# 右键 POI 名称准确性修复及弹窗范围限制

## 问题

1. 用户右击地图默认 POI 标记时，弹窗显示的名称与点击的标记不一致
2. 地图空白处右击也会弹窗，不符合预期

## 根因

旧逻辑通过逆地理编码获取附近 POI，直接取 `pois[0]`，该 POI 不一定是用户点击的那个。且无论右击哪里都弹窗。

## 方案：hotspotover/hotspotout 缓存 POI 状态

利用高德地图 `hotspotover` / `hotspotout` 事件获取准确的 POI 名称，不做任何坐标计算。

### 事件流

```
hotspotover → 缓存 { name, id, lnglat }
hotspotout  → 清除缓存
rightclick  → 按优先级：
    1. 靠近已收藏 marker？→ 弹窗（现有逻辑不变）
    2. 有 hotspot 缓存？  → 用 hotspot.name + 逆地理编码取地址 → 弹窗
    3. 都没有（空白处）   → 不弹窗
```

### 涉及文件

仅 `src/map.js`：
- 在 `initPoiClickListener` 中新增 `hotspotover` / `hotspotout` 监听
- 修改 `rightclick` 处理逻辑，移除回退到 `reverseGeocodeAndSearch` 的路径
- `reverseGeocodeAndSearch` 改为仅接受 lnglat 参数，不再负责 POI 名称

### 边界情况

| 场景 | 行为 |
|---|---|
| 右击已收藏 marker | 弹窗显示 marker 数据 + 已收藏标识 |
| 右击地图默认 POI（悬停中） | 弹窗显示 hotspot name + 逆地理编码地址 |
| 鼠标移出 POI 后右击同一位置 | 不弹窗（hotspotout 已清除） |
| 右击真正空白区域 | 不弹窗 |
