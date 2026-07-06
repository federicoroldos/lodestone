'use strict';

const DUPLICATE_WINDOW_MS = 1500;

function appendConsoleLine(history, entry, maxLines = 500) {
  const prev = history[history.length - 1];
  if (
    prev &&
    prev.text === entry.text &&
    prev.level === entry.level &&
    Math.abs((entry.ts || 0) - (prev.ts || 0)) <= DUPLICATE_WINDOW_MS
  ) {
    return false;
  }

  history.push(entry);
  if (history.length > maxLines) {
    history.splice(0, history.length - maxLines);
  }
  return true;
}

module.exports = {
  appendConsoleLine,
};
