const assert = require('node:assert/strict');
const { test } = require('node:test');

const { appendConsoleLine } = require('../lib/consoleHistory.cjs');

test('console history suppresses duplicate adjacent lines', () => {
  const history = [];
  const first = appendConsoleLine(history, { ts: 1000, text: 'There are 1 of a max of 20 players online: pq6', level: 'info' });
  const duplicate = appendConsoleLine(history, { ts: 1001, text: 'There are 1 of a max of 20 players online: pq6', level: 'info' });

  assert.equal(first, true);
  assert.equal(duplicate, false);
  assert.deepEqual(history.map((line) => line.text), ['There are 1 of a max of 20 players online: pq6']);
});

test('console history keeps repeated commands after another line', () => {
  const history = [];
  appendConsoleLine(history, { ts: 1000, text: '> say caca', level: 'cmd' });
  appendConsoleLine(history, { ts: 1001, text: '[Server] caca', level: 'info' });
  const repeatedLater = appendConsoleLine(history, { ts: 1002, text: '> say caca', level: 'cmd' });

  assert.equal(repeatedLater, true);
  assert.deepEqual(history.map((line) => line.text), ['> say caca', '[Server] caca', '> say caca']);
});
