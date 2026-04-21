# Amap Location Planner Design Document
**Date:** 2026-04-21
**Version:** 1.0

## Overview
A standalone web-based location planning tool built on Amap (Gaode Maps) API that allows users to input multiple groups of locations, visualize them on an interactive map, perform batch path planning, and calculate optimal multi-point routes.

## Primary Use Cases
1. **Housing & Job Planning:** Compare distances from multiple rental apartment locations to multiple workplaces
2. **Travel Planning:** Visualize distribution of scenic spots and hotels, plan travel routes
3. **Multi-point Route Optimization:** Calculate shortest/ fastest paths that visit a set of locations in optimal order

## Technology Stack
| Component | Technology Choice | Rationale |
|-----------|-------------------|-----------|
| Core Logic | Vanilla JavaScript (no framework) | Simplicity, no runtime overhead, easy to modify |
| Styling | Tailwind CSS (CDN) | Fast UI development, modern clean design, minimal custom CSS needed |
| Mapping | Amap JS API v2.0 + Amap Web Service API | Official APIs for location search, geocoding, path planning |
| Build Tool | Vite | Lightweight dev server, fast builds, production optimization |
| Deployment | Single minified HTML/CSS/JS bundle | Can be hosted anywhere or used directly as a local file |

## UI Layout (3-Column Desktop-First Design)
Total responsive layout that stacks vertically on mobile screens.

### Left Column (30% width) - Location Input Panel
- Text area for entering locations (one per line, supports pasting lists)
- "Add Group" button to add new location groups (max 5 groups total)
- Auto-assigned distinct marker colors for each group (red, blue, green, purple, orange)
- Group-level controls: Clear group, toggle show/hide all markers
- Individual location controls: Toggle marker visibility, edit location, re-search
- Error indicators for locations that fail geocoding

### Middle Column (40% width) - Interactive Map View
- Full-height Amap canvas with auto-locate to user's current position on load
- Top search bar for searching cities, places, POIs to jump to any location
- Colored markers per location group, showing name/address on hover/click
- Marker selection: Click marker to set as origin for path planning
- Route rendering: Display calculated routes directly on map with distinct colors
- Map controls: Zoom, pan, map type toggle (standard/satellite), fullscreen

### Right Column (30% width) - Path Planning Panel
- Selected origin location info (name, address, coordinates) at top
- Real-time path calculation results list:
  - Each entry shows destination location, distance, estimated time for all 4 transport modes (driving, public transport, walking, cycling)
  - Results sorted by travel time by default
  - Click entry to render full route path on map
- Multi-point route optimization section:
  - "Calculate Optimal Route" button to generate shortest path visiting all locations
  - Display total distance/time for optimal route
  - Render full sequential route on map connecting all points

## Core Features
### 1. Multi-group Location Management
- Add up to 5 independent location groups with distinct marker colors
- Batch geocoding of locations using Amap POI Search API
- Individual and group-level marker visibility controls
- Error handling for locations that cannot be resolved

### 2. Batch Path Planning
- 4 supported transport modes: driving, public transport, walking, cycling
- Auto-calculate routes from selected origin to all other locations
- Side-by-side comparison of travel time and distance across all modes
- Click any result to visualize route on map

### 3. Multi-point Optimal Route Calculation
- Automatically calculate optimal visiting order for all locations
- Show total travel distance and time for full route
- Render complete route on map with connecting lines in sequence

## Data Flow & Handling
- All location, group, and route data stored in in-memory JavaScript objects (no persistence by default)
- Automatic rate limiting for batch API calls to avoid Amap request limits
- User-configurable Amap API key in dedicated configuration section
- All API responses cached in memory to avoid redundant requests

## Error Handling
- Friendly toast notifications for API errors (network failures, rate limits, no results)
- Clear error indicators for locations that fail geocoding with retry option
- Graceful fallback when Amap API is unavailable or returns errors

## Implementation Notes
- No backend required - all logic runs client-side in browser
- All API calls go directly from browser to Amap servers
- Single-file build output for easy distribution and use
