# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server on http://localhost:3000
npm run build        # Production build to dist/
npm run preview      # Preview production build locally
npm run lint         # Run ESLint on src/
npm run lint:fix     # Run ESLint with auto-fix
npm run format       # Format all files with Prettier
npm run format:check # Check formatting without writing
```

ESLint (flat config) and Prettier are configured. ESLint checks for code quality; Prettier handles formatting. Run `npm run format` after making changes.

## Architecture

This is a **purely client-side** single-page application. No backend. All API calls go directly from the browser to Amap (高德) servers.

### Module Structure (Singleton ES Modules)

Each file in `src/` exports a single **singleton class instance**. Modules are loaded via `<script type="module" src="/src/main.js">` in `index.html`.

| File              | Singleton Export    | Responsibility                                                                                                                                 |
| ----------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.js`     | (entry point)       | Bootstraps the app. Calls `mapManager.init()`, wires up CustomEvent listeners for inter-module communication.                                  |
| `src/map.js`      | `mapManager`        | Amap map instance lifecycle, marker CRUD, route polyline rendering, search bar autocomplete. Owns the `.markers[]` and `.routeLines[]` arrays. |
| `src/location.js` | `locationManager`   | POI search via Amap PlaceSearch, group management (add/toggle/remove), rate-limited batch geocoding. Owns the `.groups[]` array.               |
| `src/route.js`    | `routeManager`      | Route calculation (driving/transit/walking/bicycling), optimal multi-point route via waypoints. Owns `.currentRoutes[]`.                       |
| `src/ui.js`       | `uiManager`         | All DOM event binding and rendering: group list UI, route results cards, origin display, button states.                                        |
| `src/utils.js`    | N/A (named exports) | Pure helpers: `showToast()`, `RateLimiter`, `formatDistance()`, `formatDuration()`.                                                            |

### Inter-Module Communication

Modules communicate via **CustomEvent** dispatched on `window`, not direct method calls:

- `markerSelected` — fired by `location.js` when a map marker is clicked. Listened to by `main.js` to trigger route calculation.
- `groupAdded` — fired by `ui.js` after a group is added. Listened to by `main.js` to update the "Calculate Optimal Route" button state.

### Data Flow

1. User inputs location names → `UIManager.handleAddGroup()` splits by newline
2. `LocationManager.addGroup()` batch-searches via Amap PlaceSearch (rate-limited at 300ms)
3. Each resolved location creates a marker via `MapManager.addMarker()`
4. Marker click → event dispatched → `RouteManager.calculateAllRoutes()` computes all 4 transport modes to every other location (rate-limited at 500ms)
5. Results rendered by `RouteManager.renderRouteResults()` into right panel
6. Clicking a result card → `RouteManager.showRouteOnMap()` draws polylines
7. "Calculate Optimal Route" button → `RouteManager.calculateOptimalMultiPointRoute()` uses Amap Driving API with waypoints (max 16 locations)

All state is in-memory JavaScript objects. There is no persistence across page reloads.

## Rate Limiting

Two separate `RateLimiter` instances protect against Amap API rate limits:

- **POI search** (`location.js`): 300ms interval
- **Route calculation** (`route.js`): 500ms interval

The `RateLimiter` class in `utils.js` is a simple queue-based throttler. When modifying API call code, always wrap calls in `rateLimiter.execute()`.

## API Key Configuration

The Amap API key is hardcoded in `index.html`:

```html
<script src="https://webapi.amap.com/maps?v=2.0&key=44abb82d7e642da458d0d24b6a5a4f42"></script>
```

The security JS code is also inlined:

```javascript
window._AMapSecurityConfig = { securityJsCode: '7ab0ed26880ef99bbf68311a88796ca0' };
```

Users must replace `YOUR_AMAP_API_KEY` placeholder with their own key (the current file contains a working key — this must NOT be committed to public repos).

## Key Constraints

- **Max 5 location groups** (`MAX_GROUPS` in `location.js`)
- **Max 16 locations for optimal route** (hard limit in `route.js`)
- **No framework** — all DOM manipulation is imperative (innerHTML, createElement, appendChild)
- **Tailwind CSS via CDN** — all styling is utility classes in `index.html`, no build-time CSS processing
- **Vite is build-only** — there is no framework-specific Vite plugin configured

## Deployment

Build output is a static site in `dist/`. Can be served from any static file server (Nginx, Vercel, Netlify, GitHub Pages) or opened directly as a local file. See `DEPLOYMENT.md` for details.
