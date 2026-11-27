import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLineage, parseResponse } from './lineage.js';

const event = (job, runId = 'r1') => ({
  eventType: 'COMPLETE',
  eventTime: '2025-01-01T00:00:00Z',
  run: { runId },
  job: { namespace: 'ns', name: job },
  inputs: [{ namespace: 'db', name: `${job}_in` }],
  outputs: [{ namespace: 'db', name: `${job}_out` }],
});

test('reads a JSON array of events', () => {
  const { events, skipped } = parseLineage(JSON.stringify([event('a'), event('b')]));
  assert.equal(events.length, 2);
  assert.equal(skipped, 0);
});

test('reads a single event and an events wrapper', () => {
  assert.equal(parseLineage(JSON.stringify(event('a'))).events.length, 1);
  assert.equal(parseLineage(JSON.stringify({ events: [event('a'), event('b')] })).events.length, 2);
});

test('reads NDJSON', () => {
  const text = `${JSON.stringify(event('a'))}\n\n${JSON.stringify(event('b'))}\n`;
  assert.equal(parseLineage(text).events.length, 2);
});

test('skips entries that are not run events', () => {
  const { events, skipped } = parseLineage(JSON.stringify([event('a'), { foo: 1 }, null]));
  assert.equal(events.length, 1);
  assert.equal(skipped, 2);
});

test('passes a precomputed graph through', () => {
  assert.deepEqual(parseLineage(JSON.stringify({ graph: [] })), { graph: [] });
});

test('throws on text that is not JSON', () => {
  assert.throws(() => parseLineage('not json'));
});

test('parseResponse builds the graph of the events', () => {
  const ids = parseResponse(JSON.stringify([event('a')])).graph.map((n) => n.id).sort();
  assert.deepEqual(ids, ['db:a_in', 'db:a_out', 'ns:a']);
});
