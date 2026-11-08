import type { Agent, Chunk, ViewRect, WorldMeta, WorldObject } from './types';

// Public read-only API. This value is bundled into the app; never put secrets here.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL?.trim()
  || 'https://world-sim-3-server-production.up.railway.app').replace(/\/+$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} (${path})`);
    return response.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}

export const getMeta = () => request<WorldMeta>('/api/world/meta');
export const getStatus = () => request<{ tickCount: number; agentCount: number; tickMs: number }>('/api/simulation/status');
export const getAgent = (id: string) => request<Agent>(`/api/agents/${encodeURIComponent(id)}`);
export async function getAgents(): Promise<Agent[]> {
  const data = await request<{ agents: Agent[] }>('/api/agents');
  return data.agents.filter((agent) => !agent.dead);
}

export async function getChunks(coords: { cx: number; cy: number }[]): Promise<Chunk[]> {
  const data = await request<{ chunks: Chunk[] }>('/api/world/chunks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chunks: coords, layers: ['height', 'groundType', 'waterDepth'] }),
  });
  return data.chunks;
}

export async function getEntities(rect: ViewRect, types: string[]): Promise<(Agent | WorldObject)[]> {
  const params = new URLSearchParams({
    x: String(rect.x), y: String(rect.y), w: String(rect.w), h: String(rect.h),
    types: types.join(','),
  });
  const data = await request<{ objects: (Agent | WorldObject)[] }>(`/api/entities/in-view?${params}`);
  return data.objects;
}
