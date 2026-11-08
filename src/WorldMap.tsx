import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas, Circle, Fill, Group, Image, type SkImage } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { getChunks, getEntities } from './api';
import { makeTerrainImage } from './terrain';
import type { Agent, Camera, Chunk, Layer, WorldMeta, WorldObject } from './types';
import { clamp, minZoom, nearestWrapped, viewportRect, visibleChunks, wrap } from './world';

type CachedTile = { data: Chunk; images: Partial<Record<Layer, SkImage>> };
export type FocusRequest = { x: number; y: number; key: number; duration?: number };
export type ZoomRequest = { factor: number; key: number };

interface Props {
  meta: WorldMeta;
  layer: Layer;
  focus: FocusRequest | null;
  zoomRequest: ZoomRequest | null;
  selectedAgentId: string | null;
  active: boolean;
  onAgentPress: (agent: Agent) => void;
  onObjectPress: (object: WorldObject | null) => void;
  onManualMove: () => void;
}

const OBJECT_COLORS: Record<WorldObject['type'], string> = {
  tree: '#315d36', rock: '#d3d4d7', food: '#f25e54',
  water_source: '#5fc3f0', rest_spot: '#e1a35d',
};
const OBJECT_TYPES = ['tree', 'rock', 'food', 'water_source', 'rest_spot'];
const MAX_CACHED_TILES = 100;

function AgentMarker({ agent, selected, camera, meta }: { agent: Agent; selected: boolean; camera: Camera; meta: WorldMeta }) {
  const targetX = nearestWrapped(agent.x + 0.5, camera.cx, meta.width);
  const targetY = nearestWrapped(agent.y + 0.5, camera.cy, meta.height);
  const x = useSharedValue(targetX);
  const y = useSharedValue(targetY);
  useEffect(() => {
    const duration = Math.min(1600, Math.max(300, meta.simulation.tickMs));
    x.value = Math.abs(targetX - x.value) > meta.width / 4 ? targetX : withTiming(targetX, { duration });
    y.value = Math.abs(targetY - y.value) > meta.height / 4 ? targetY : withTiming(targetY, { duration });
  }, [targetX, targetY, meta.width, meta.height, meta.simulation.tickMs, x, y]);
  return selected ? <Group>
    <Circle cx={x} cy={y} r={3.5} color="#fff4aa" />
    <Circle cx={x} cy={y} r={1.9} color="#ff943c" />
  </Group> : <Circle cx={x} cy={y} r={1.8} color="#ffc36b" />;
}

export default function WorldMap({ meta, layer, focus, zoomRequest, selectedAgentId, active, onAgentPress, onObjectPress, onManualMove }: Props) {
  const [size, setSize] = useState({ width: 360, height: 600 });
  const [camera, setCamera] = useState<Camera>({ cx: meta.width / 2, cy: meta.height / 2, ppc: 4 });
  const [tileVersion, setTileVersion] = useState(0);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [objects, setObjects] = useState<WorldObject[]>([]);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const cache = useRef(new Map<string, CachedTile>());
  const inFlight = useRef(new Set<string>());

  const cx = useSharedValue(camera.cx);
  const cy = useSharedValue(camera.cy);
  const ppc = useSharedValue(camera.ppc);
  const startX = useSharedValue(camera.cx);
  const startY = useSharedValue(camera.cy);
  const startZoom = useSharedValue(camera.ppc);
  const pinchWorldX = useSharedValue(0);
  const pinchWorldY = useSharedValue(0);

  const transform = useDerivedValue(() => [
    { translateX: size.width / 2 - cx.value * ppc.value },
    { translateY: size.height / 2 - cy.value * ppc.value },
    { scale: ppc.value },
  ]);

  const commitCamera = useCallback((nextX: number, nextY: number, nextZoom: number) => {
    setCamera({ cx: nextX, cy: nextY, ppc: nextZoom });
  }, []);

  useEffect(() => {
    const floor = minZoom(size.width, size.height, meta.chunkSize);
    if (ppc.value < floor) {
      ppc.value = floor;
      commitCamera(cx.value, cy.value, floor);
    }
  }, [size.width, size.height, meta.chunkSize, cx, cy, ppc, commitCamera]);

  useEffect(() => {
    if (!focus) return;
    const nextX = nearestWrapped(focus.x, cx.value, meta.width);
    const nextY = nearestWrapped(focus.y, cy.value, meta.height);
    const farAway = Math.abs(nextX - cx.value) > size.width / ppc.value * 2
      || Math.abs(nextY - cy.value) > size.height / ppc.value * 2;
    const duration = farAway ? 0 : (focus.duration ?? 280);
    cx.value = withTiming(nextX, { duration });
    cy.value = withTiming(nextY, { duration });
    commitCamera(nextX, nextY, ppc.value);
    // The key represents a deliberate jump or a fresh position while following.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);

  useEffect(() => {
    if (!zoomRequest) return;
    const next = clamp(ppc.value * zoomRequest.factor, minZoom(size.width, size.height, meta.chunkSize), 24);
    ppc.value = withTiming(next, { duration: 180 });
    commitCamera(cx.value, cy.value, next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomRequest?.key]);

  const range = useMemo(
    () => visibleChunks(camera, size.width, size.height, meta),
    [camera, size.width, size.height, meta],
  );

  useEffect(() => {
    if (!active || size.width <= 0 || size.height <= 0) return;
    let cancelled = false;
    const cols = Math.ceil(meta.width / meta.chunkSize);
    const rows = Math.ceil(meta.height / meta.chunkSize);
    const missing: { cx: number; cy: number; key: string }[] = [];
    for (let y = range.minY; y <= range.maxY; y++) {
      for (let x = range.minX; x <= range.maxX; x++) {
        const tx = wrap(x, cols);
        const ty = wrap(y, rows);
        const key = `${tx},${ty}`;
        if (!cache.current.has(key) && !inFlight.current.has(key)) missing.push({ cx: tx, cy: ty, key });
      }
    }
    missing.sort((a, b) =>
      (a.cx - camera.cx / meta.chunkSize) ** 2 + (a.cy - camera.cy / meta.chunkSize) ** 2
      - (b.cx - camera.cx / meta.chunkSize) ** 2 - (b.cy - camera.cy / meta.chunkSize) ** 2);

    const load = async () => {
      for (let i = 0; i < missing.length && !cancelled; i += 4) {
        const batch = missing.slice(i, i + 4).filter(({ key }) => !inFlight.current.has(key) && !cache.current.has(key));
        if (!batch.length) continue;
        batch.forEach(({ key }) => inFlight.current.add(key));
        try {
          const chunks = await getChunks(batch.map(({ cx: x, cy: y }) => ({ cx: x, cy: y })));
          for (const chunk of chunks) {
            const key = `${chunk.cx},${chunk.cy}`;
            cache.current.set(key, { data: chunk, images: {} });
          }
          while (cache.current.size > MAX_CACHED_TILES) {
            const oldest = cache.current.keys().next().value;
            if (oldest == null) break;
            cache.current.delete(oldest);
          }
          setTileVersion((v) => v + 1);
          setNetworkError(null);
        } catch (error) {
          setNetworkError(`Terrain request failed: ${String(error)}`);
        } finally {
          batch.forEach(({ key }) => inFlight.current.delete(key));
        }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [active, camera.cx, camera.cy, meta, range, size.height, size.width]);

  const tiles = useMemo(() => {
    const result: { key: string; image: SkImage; x: number; y: number }[] = [];
    const cols = Math.ceil(meta.width / meta.chunkSize);
    const rows = Math.ceil(meta.height / meta.chunkSize);
    for (let y = range.minY; y <= range.maxY; y++) {
      for (let x = range.minX; x <= range.maxX; x++) {
        const key = `${wrap(x, cols)},${wrap(y, rows)}`;
        const tile = cache.current.get(key);
        if (!tile) continue;
        let image = tile.images[layer];
        if (!image) {
          image = makeTerrainImage(tile.data, layer, meta) ?? undefined;
          if (image) tile.images[layer] = image;
        }
        if (image) result.push({ key: `${x},${y}`, image, x: x * meta.chunkSize, y: y * meta.chunkSize });
      }
    }
    return result;
  }, [layer, meta, range, tileVersion]);

  const rect = useMemo(() => viewportRect(camera, size.width, size.height, meta), [camera, size, meta]);
  const rectKey = `${rect.x},${rect.y},${rect.w},${rect.h}`;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let busy = false;
    const poll = async () => {
      if (busy) return;
      busy = true;
      try {
        const entities = await getEntities(rect, ['agent']);
        if (!cancelled) {
          setAgents(entities.filter((entity): entity is Agent => entity.type === 'agent'));
          setNetworkError(null);
        }
      } catch (error) {
        if (!cancelled) setNetworkError(`Agent request failed: ${String(error)}`);
      } finally { busy = false; }
    };
    void poll();
    const timer = setInterval(poll, clamp(meta.simulation.tickMs / 2, 2500, 5000));
    return () => { cancelled = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, rectKey, meta.simulation.tickMs]);

  useEffect(() => {
    if (!active || camera.ppc < 1.8) { setObjects([]); return; }
    let cancelled = false;
    getEntities(rect, OBJECT_TYPES)
      .then((entities) => { if (!cancelled) setObjects(entities.filter((entity): entity is WorldObject => entity.type !== 'agent')); })
      .catch(() => { if (!cancelled) setObjects([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, rectKey, camera.ppc >= 1.8]);

  const handleTap = useCallback((screenX: number, screenY: number, atX: number, atY: number, atZoom: number) => {
    const worldX = atX + (screenX - size.width / 2) / atZoom;
    const worldY = atY + (screenY - size.height / 2) / atZoom;
    let best: Agent | null = null;
    let bestDistance = (24 / atZoom) ** 2;
    for (const agent of agents) {
      const dx = nearestWrapped(agent.x + 0.5, worldX, meta.width) - worldX;
      const dy = nearestWrapped(agent.y + 0.5, worldY, meta.height) - worldY;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) { best = agent; bestDistance = distance; }
    }
    if (best) { onAgentPress(best); return; }
    const object = objects.find((item) =>
      Math.abs(nearestWrapped(item.x + 0.5, worldX, meta.width) - worldX) < 14 / atZoom
      && Math.abs(nearestWrapped(item.y + 0.5, worldY, meta.height) - worldY) < 14 / atZoom) ?? null;
    onObjectPress(object);
  }, [agents, meta, objects, onAgentPress, onObjectPress, size]);

  const pan = Gesture.Pan().minDistance(6).maxPointers(1)
    .onStart(() => {
      startX.value = cx.value;
      startY.value = cy.value;
      runOnJS(onManualMove)();
    })
    .onUpdate((event) => {
      cx.value = startX.value - event.translationX / ppc.value;
      cy.value = startY.value - event.translationY / ppc.value;
    })
    .onEnd(() => runOnJS(commitCamera)(cx.value, cy.value, ppc.value));

  const pinch = Gesture.Pinch()
    .onStart((event) => {
      startZoom.value = ppc.value;
      pinchWorldX.value = cx.value + (event.focalX - size.width / 2) / ppc.value;
      pinchWorldY.value = cy.value + (event.focalY - size.height / 2) / ppc.value;
      runOnJS(onManualMove)();
    })
    .onUpdate((event) => {
      const next = clamp(startZoom.value * event.scale, minZoom(size.width, size.height, meta.chunkSize), 24);
      ppc.value = next;
      cx.value = pinchWorldX.value - (event.focalX - size.width / 2) / next;
      cy.value = pinchWorldY.value - (event.focalY - size.height / 2) / next;
    })
    .onEnd(() => runOnJS(commitCamera)(cx.value, cy.value, ppc.value));

  const tap = Gesture.Tap().maxDistance(12)
    .onEnd((event, success) => {
      if (success) runOnJS(handleTap)(event.x, event.y, cx.value, cy.value, ppc.value);
    });

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, tap)}>
      <View style={styles.container} onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) setSize({ width, height });
      }}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill color="#101b25" />
          <Group transform={transform}>
            {tiles.map(({ key, image, x, y }) => (
              <Image key={key} image={image} x={x} y={y} width={meta.chunkSize} height={meta.chunkSize} fit="fill" />
            ))}
            {objects.map((object) => (
              <Circle key={object.id} cx={nearestWrapped(object.x + 0.5, camera.cx, meta.width)}
                cy={nearestWrapped(object.y + 0.5, camera.cy, meta.height)} r={1.3}
                color={OBJECT_COLORS[object.type]} />
            ))}
            {agents.map((agent) => <AgentMarker key={agent.id} agent={agent}
              selected={selectedAgentId === agent.id} camera={camera} meta={meta} />)}
          </Group>
        </Canvas>
        {networkError && <View style={styles.error}><Text style={styles.errorText}>{networkError}</Text></View>}
        <View pointerEvents="none" style={styles.coordinates}>
          <Text style={styles.coordinateText}>{wrap(Math.floor(camera.cx), meta.width)}, {wrap(Math.floor(camera.cy), meta.height)} · {camera.ppc.toFixed(1)}×</Text>
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#101b25' },
  coordinates: { position: 'absolute', left: 14, bottom: 15, backgroundColor: '#0a1520cc', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  coordinateText: { color: '#cfdae3', fontSize: 11, fontVariant: ['tabular-nums'] },
  error: { position: 'absolute', left: 12, right: 12, top: 12, padding: 10, borderRadius: 10, backgroundColor: '#512b2be8' },
  errorText: { color: '#ffe4e1', fontSize: 12 },
});
