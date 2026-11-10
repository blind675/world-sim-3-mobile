import type { Agent } from './types';

export type Point = { x: number; y: number };

// Server movement traverses a bounded path segment over one tick, then waits
// a tick before the next segment. Keep prediction short if updates stop.
export function interpolateAgentPosition(agent: Agent, at: number, tickMs: number, worldW: number, worldH: number): Point {
  'worklet';
  const path = agent.path ?? [];
  const origin = agent.isMoving && agent.movementStartPos ? agent.movementStartPos : agent;
  if (!path.length || agent.timelineTickAt == null || !Number.isFinite(agent.timelineTickAt) || tickMs <= 0) {
    return { x: agent.x, y: agent.y };
  }
  const firstStepAt = agent.timelineTickAt + (agent.isMoving ? 0 : tickMs);
  const elapsed = Math.min(at - firstStepAt, 4 * tickMs);
  if (elapsed <= 0) return { x: origin.x, y: origin.y };
  const stride = Math.max(1, Math.floor(agent.moveCellsPerStep ?? 1));
  const stepIndex = Math.floor(elapsed / (2 * tickMs));
  const startIndex = stepIndex * stride;
  if (startIndex >= path.length) return path[path.length - 1];
  const segmentLength = Math.min(stride, path.length - startIndex);
  const progress = Math.min(1, (elapsed % (2 * tickMs)) / tickMs);
  const distance = progress * segmentLength;
  const cellIndex = Math.min(segmentLength - 1, Math.floor(distance));
  const from = cellIndex === 0
    ? (startIndex === 0 ? origin : path[startIndex - 1])
    : path[startIndex + cellIndex - 1];
  const to = path[startIndex + cellIndex];
  const dx = ((to.x - from.x + worldW * 1.5) % worldW) - worldW / 2;
  const dy = ((to.y - from.y + worldH * 1.5) % worldH) - worldH / 2;
  return {
    x: ((from.x + dx * (distance - cellIndex)) % worldW + worldW) % worldW,
    y: ((from.y + dy * (distance - cellIndex)) % worldH + worldH) % worldH,
  };
}

export function wrappedPathSegments(start: Point, path: Point[], camera: Point, worldW: number, worldH: number): Point[][] {
  if (!path.length) return [];
  const first = {
    x: start.x + 0.5 + Math.round((camera.x - start.x - 0.5) / worldW) * worldW,
    y: start.y + 0.5 + Math.round((camera.y - start.y - 0.5) / worldH) * worldH,
  };
  const segments: Point[][] = [[first]];
  let previous = first;
  for (const cell of path.slice(0, 2048)) {
    const point = {
      x: cell.x + 0.5 + Math.round((previous.x - cell.x - 0.5) / worldW) * worldW,
      y: cell.y + 0.5 + Math.round((previous.y - cell.y - 0.5) / worldH) * worldH,
    };
    if (Math.abs(point.x - previous.x) > 2 || Math.abs(point.y - previous.y) > 2) segments.push([point]);
    else segments[segments.length - 1].push(point);
    previous = point;
  }
  return segments;
}
