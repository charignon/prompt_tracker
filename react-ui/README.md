# Prompt Tracker - React UI

This is the React-based alternative to the D3.js timeline visualization.

## Features

- **React-based Timeline**: Pure React implementation without D3.js dependencies
- **Swim Lanes**: Prompts organized by project in horizontal swim lanes
- **Interactive**: Click prompts to view details and rate them
- **Responsive**: Modern, dark-themed UI with smooth transitions
- **Real-time Updates**: Rating changes update immediately

## Architecture

- **Frontend**: React 19 + Vite
- **Backend**: Flask REST API (shared with D3.js version)
- **API Proxy**: Vite dev server proxies `/api` requests to Flask backend

## Development

The React UI is served through the `serve_react` command which:
1. Starts a Flask API server on port 8080 (by default)
2. Starts a Vite dev server on port 8081 (by default)
3. Proxies API requests from React to Flask

## Components

- **App.jsx**: Main application component with state management
- **Timeline.jsx**: Timeline visualization with swim lanes
- **SidePanel.jsx**: Detailed prompt view with rating controls
- **Controls.jsx**: Date navigation and project filtering

## Running

From the project root:

```bash
./prompt-tracker serve_react
```

Or with custom ports:

```bash
./prompt-tracker serve_react --port 3000 --api-port 8080
```

## Differences from D3.js Version

- **Simpler Implementation**: Uses React state and CSS instead of D3 transforms
- **No Zoom/Pan**: Current version uses scrolling instead of zoom/pan
- **Swim Lanes**: Organizes prompts by project in horizontal lanes
- **Same Data**: Uses the same SQLite database and Flask API

## Future Enhancements

Potential improvements:
- Add zoom/pan functionality using react-zoom-pan-pinch
- Add search and filtering UI
- Implement calendar view
- Add keyboard shortcuts
- Export/import functionality
