# MultiNavigation 应用重命名设计

## 概述

将项目应用名称从 "MapFlow" 重命名为 "MultiNavigation"，同步更新所有代码、界面显示、npm 包名和文档。

## 命名规范

| 场景 | 旧值 | 新值 |
|------|------|------|
| 界面显示名称 | `MapFlow` | `MultiNavigation` |
| HTML `<title>` | `MapFlow - 多点路径规划` | `MultiNavigation - 多点路径规划` |
| npm 包名 | `amap-location-planner` | `multi-navigation` |
| 文档文件名 | `MapFlow-开发者文档.md` | `MultiNavigation-开发者文档.md` |

副标题「多点路径规划」保持不变，🗺️ emoji 保持不变。

## 变更文件清单

### 1. index.html（3 处字符串替换）

| 行号 | 旧值 | 新值 |
|------|------|------|
| 7 | `<title>MapFlow - 多点路径规划</title>` | `<title>MultiNavigation - 多点路径规划</title>` |
| 158 | `<h1>🗺️ MapFlow</h1>` | `<h1>🗺️ MultiNavigation</h1>` |
| 255 | `<h3>MapFlow 使用帮助</h3>` | `<h3>MultiNavigation 使用帮助</h3>` |

### 2. package.json（1 处修改）

- `"name": "amap-location-planner"` → `"name": "multi-navigation"`

### 3. package-lock.json（2 处修改）

- 自动生成文件，name 字段同步更新为 `"multi-navigation"`

### 4. README.md（1 处修改）

- 标题 `# 高德地图多点规划工具` → `# MultiNavigation - 多点路径规划工具`

### 5. docs/MapFlow-开发者文档.md（重命名 + 内容更新）

- 文件名重命名为 `MultiNavigation-开发者文档.md`
- 内容中所有 "MapFlow" → "MultiNavigation"（共约 4 处）

### 6. docs/superpowers/specs/2026-06-12-mapflow-developer-doc-design.md（内容更新）

- 标题 "MapFlow 开发者文档设计" → "MultiNavigation 开发者文档设计"
- 内容中 "MapFlow" → "MultiNavigation"（约 5 处）
- 文档引用路径更新

### 7. docs/superpowers/specs/2026-06-11-site-title-help-modal-design.md（内容更新）

- 标题 "MapFlow 网站标题 & 帮助弹窗设计" → "MultiNavigation 网站标题 & 帮助弹窗设计"
- 内容中 "MapFlow" → "MultiNavigation"（约 6 处）

## 不变的部分

- `src/` 目录下所有源代码（不含 "MapFlow" 字符串）
- `AGENTS.md`（不含 "MapFlow" 字符串）
- `vite.config.js`、`.gitignore`、ESLint/Prettier 配置
- `dist/` 目录（构建产物，下次构建自动更新）
- `docs/superpowers/plans/` 目录下的历史实现计划文件（保留原始引用）
- 副标题「多点路径规划」
