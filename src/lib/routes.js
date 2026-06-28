// Maps each view (sidebar section) to a clean URL path and back, so the app can
// drive navigation through the History API. That gives us shareable/refreshable
// URLs and makes the browser's Back/Forward (including the mouse back button)
// work for free, since those fire `popstate`.

export const VIEW_PATHS = {
  dashboard: '/',
  servers: '/servers',
  metrics: '/metrics',
  console: '/console',
  players: '/players',
  map: '/map',
  plugins: '/plugins',
  modrinth: '/mods',
  files: '/files',
  configs: '/configs',
  backups: '/backups',
  tasks: '/schedules',
  users: '/users',
};

const PATH_TO_VIEW = Object.fromEntries(
  Object.entries(VIEW_PATHS).map(([view, path]) => [path, view])
);

export function viewToPath(view) {
  return VIEW_PATHS[view] || '/';
}

// Resolve a pathname to a known view, or null when it doesn't map to one.
// Only the first path segment matters (e.g. `/files/anything` -> files).
export function pathToView(pathname) {
  const seg = String(pathname || '/').replace(/^\/+|\/+$/g, '').split('/')[0];
  if (!seg) return 'dashboard';
  return PATH_TO_VIEW[`/${seg}`] || null;
}
