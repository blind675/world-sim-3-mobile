import type { Agent } from './types';

export type Point = { x: number; y: number };

// Server movement uses one tick to traverse a cell and one tick before the
// following traversal. Keep prediction short when the server or network stops.
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
  const stepIndex = Math.floor(elapsed / (2 * tickMs));
  if (stepIndex >= path.length) return path[path.length - 1];
  const from = stepIndex === 0 ? origin : path[stepIndex - 1];
  const progress = Math.min(1, (elapsed % (2 * tickMs)) / tickMs);
  const dx = ((path[stepIndex].x - from.x + worldW * 1.5) % worldW) - worldW / 2;
  const dy = ((path[stepIndex].y - from.y + worldH * 1.5) % worldH) - worldH / 2;
  return {
    x: ((from.x + dx * progress) % worldW + worldW) % worldW,
    y: ((from.y + dy * progress) % worldH + worldH) % worldH,
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
