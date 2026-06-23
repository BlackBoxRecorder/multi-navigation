import AMapLoader from '@amap/amap-jsapi-loader';

// Vite define 注入的编译时常量，构建时替换为字符串字面量
const AMAP_KEY = __AMAP_KEY__;
const AMAP_SECURITY_CODE = __AMAP_SECURITY_CODE__;

// 安全配置必须在 AMapLoader.load() 之前设置
window._AMapSecurityConfig = {
  securityJsCode: AMAP_SECURITY_CODE,
};

// 预加载常用插件，减少后续动态加载延迟
const amapReady = AMapLoader.load({
  key: AMAP_KEY,
  version: '2.0',
  plugins: ['AMap.Geolocation', 'AMap.MapType', 'AMap.ToolBar', 'AMap.AutoComplete', 'AMap.Geocoder'],
});

export { amapReady };
