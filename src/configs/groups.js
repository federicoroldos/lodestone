// File group definitions for the left-rail nav. Each group has an i18n
// label key (looked up by the view), and a list of files that should
// appear in that group. `groupFile()` returns the group id for a given
// filename, or 'other' if no group matches. Matching is
// case-insensitive to stay forgiving of the file system.

export const FILE_GROUPS = [
  { id: 'gameplay',    labelKey: 'configs.groupGameplay',    files: ['server.properties', 'bukkit.yml'] },
  { id: 'performance', labelKey: 'configs.groupPerformance', files: ['spigot.yml', 'paper-world-defaults.yml', 'paper-global.yml', 'paper-global-defaults.yml'] },
  { id: 'world',       labelKey: 'configs.groupWorld',       files: ['ops.json', 'whitelist.json', 'banned-players.json', 'banned-ips.json'] },
  { id: 'other',       labelKey: 'configs.groupOther',       files: [] },
];

const GROUPS_BY_FILE = (() => {
  const map = new Map();
  for (const g of FILE_GROUPS) {
    for (const f of g.files) {
      map.set(String(f).toLowerCase(), g.id);
    }
  }
  return map;
})();

export function groupFile(name) {
  if (!name) return 'other';
  return GROUPS_BY_FILE.get(String(name).toLowerCase()) || 'other';
}
