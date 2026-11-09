import assert from 'node:assert/strict';
import test from 'node:test';
import { interpolateAgentPosition, wrappedPathSegments } from '../src/mapMotion.ts';

test('interpolates the server two-tick movement cadence and holds when updates stop', () => {
  const agent = {
    x: 9, y: 5, isMoving: true, movementStartPos: { x: 9, y: 5 },
    path: [{ x: 10, y: 5 }, { x: 11, y: 5 }], timelineTickAt: 100_000,
  };
  assert.deepEqual(interpolateAgentPosition(agent, 105_000, 10_000, 100, 100), { x: 9.5, y: 5 });
  assert.deepEqual(interpolateAgentPosition(agent, 115_000, 10_000, 100, 100), { x: 10, y: 5 });
  assert.deepEqual(interpolateAgentPosition(agent, 125_000, 10_000, 100, 100), { x: 10.5, y: 5 });
  assert.deepEqual(interpolateAgentPosition(agent, 300_000, 10_000, 100, 100), { x: 11, y: 5 });
});

test('movement and route cross a wrapped edge without jumping across the world', () => {
  const agent = {
    x: 99, y: 5, isMoving: true, movementStartPos: { x: 99, y: 5 },
    path: [{ x: 0, y: 5 }, { x: 1, y: 5 }], timelineTickAt: 100_000,
  };
  assert.deepEqual(interpolateAgentPosition(agent, 105_000, 10_000, 100, 100), { x: 99.5, y: 5 });
  const segments = wrappedPathSegments(agent, agent.path, { x: 0, y: 5 }, 100, 100);
  assert.deepEqual(segments, [[{ x: -0.5, y: 5.5 }, { x: 0.5, y: 5.5 }, { x: 1.5, y: 5.5 }]]);
});

test('a broken route does not draw a long misleading line', () => {
  const segments = wrappedPathSegments({ x: 3, y: 3 }, [{ x: 4, y: 3 }, { x: 30, y: 3 }, { x: 31, y: 3 }], { x: 3, y: 3 }, 100, 100);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].length, 2);
  assert.equal(segments[1].length, 2);
});
