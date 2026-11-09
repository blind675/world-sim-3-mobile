export interface WorldMeta {
  seed: number;
  width: number;
  height: number;
  chunkSize: number;
  wrapMode: 'toroidal';
  terrain: { minHeight: number; maxHeight: number; seaLevel: number };
  simulation: { tickMs: number };
}

export type Layer = 'height' | 'groundType' | 'waterDepth';

export interface Chunk {
  cx: number;
  cy: number;
  size: number;
  layers: Partial<Record<Layer, number[] | string[]>>;
}

export interface Agent {
  id: string;
  type: 'agent';
  x: number;
  y: number;
  state: string;
  currentAction?: string | null;
  dead?: boolean;
  currentGoal?: { type: string; targetX: number; targetY: number } | null;
  hunger?: number;
  thirst?: number;
  tiredness?: number;
  age?: number;
  sex?: string;
  facing?: number;
  path?: { x: number; y: number }[];
  movementStartPos?: { x: number; y: number } | null;
  targetPos?: { x: number; y: number } | null;
  movementStartTick?: number | null;
  currentTick?: number;
  isMoving?: boolean;
  timelineTickAt?: number;
  pathRemaining?: number;
  traits?: Record<string, number | string | boolean>;
  memory?: { kind?: string; type?: string; x?: number; y?: number; confidence?: number }[];
  inventory?: unknown[];
}

export interface WorldObject {
  id: string;
  type: 'tree' | 'rock' | 'food' | 'water_source' | 'rest_spot';
  x: number;
  y: number;
  definitionId?: string;
}

export interface FoodState {
  stock: number;
  capacity: number;
  depleted: boolean;
  ticksUntilRegrow: number;
}

export interface WorldObjectDetail extends WorldObject {
  food?: FoodState;
}

export interface ObjectDefinition {
  id: string;
  name: string;
  category: string;
  behavior: WorldObject['type'];
  color: string;
  sprite: string;
  spawn?: {
    strategy: string;
    preferredGroundTypes?: string[];
    minHeight?: number;
    maxHeight?: number;
  };
}

export interface ObjectCatalog {
  definitions: ObjectDefinition[];
}

export interface ViewRect { x: number; y: number; w: number; h: number }
export interface Camera { cx: number; cy: number; ppc: number }
