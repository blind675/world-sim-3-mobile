import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { API_URL, getAgent, getAgents, getMeta, getObjectCatalog, getStatus } from './src/api';
import WorldMap, { type FocusRequest, type ZoomRequest } from './src/WorldMap';
import type { Agent, Layer, ObjectCatalog, WorldMeta, WorldObject } from './src/types';

const LAYERS: { id: Layer; title: string }[] = [
  { id: 'height', title: 'Elevation' },
  { id: 'groundType', title: 'Ground' },
  { id: 'waterDepth', title: 'Water depth' },
];

function Button({ title, onPress, active = false }: { title: string; onPress: () => void; active?: boolean }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.button, active && styles.buttonActive, pressed && { opacity: 0.7 }]}>
    <Text style={styles.buttonText}>{title}</Text>
  </Pressable>;
}

function Sheet({ visible, title, onClose, children, tall = false }: {
  visible: boolean; title: string; onClose: () => void; children: React.ReactNode; tall?: boolean;
}) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.sheet, tall && { height: '76%' }]}>
        <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{title}</Text><Button title="Close" onPress={onClose} /></View>
        {children}
      </View>
    </View>
  </Modal>;
}

function Need({ title, value }: { title: string; value?: number }) {
  if (value == null) return null;
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return <View style={styles.needRow}>
    <Text style={styles.needName}>{title}</Text>
    <View style={styles.needTrack}><View style={[styles.needFill, { width: `${percent}%`, backgroundColor: percent > 70 ? '#ed796c' : '#76d1a0' }]} /></View>
    <Text style={styles.needValue}>{percent}%</Text>
  </View>;
}

export default function App() {
  const [meta, setMeta] = useState<WorldMeta | null>(null);
  const [objectCatalog, setObjectCatalog] = useState<ObjectCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const initialFocusLoaded = useRef(false);
  const [status, setStatus] = useState<{ tickCount: number; agentCount: number } | null>(null);
  const [layer, setLayer] = useState<Layer>('height');
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [zoomRequest, setZoomRequest] = useState<ZoomRequest | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedObject, setSelectedObject] = useState<WorldObject | null>(null);
  const [follow, setFollow] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [search, setSearch] = useState('');
  const [finderError, setFinderError] = useState<string | null>(null);
  const [finderLoading, setFinderLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => sub.remove();
  }, []);

  const loadWorld = useCallback(() => {
    setError(null);
    getMeta().then(setMeta).catch((reason) => setError(String(reason)));
  }, []);
  useEffect(() => { loadWorld(); }, [loadWorld]);
  useEffect(() => {
    let cancelled = false;
    getObjectCatalog().then((catalog) => { if (!cancelled) setObjectCatalog(catalog); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!meta || !active || initialFocusLoaded.current) return;
    let cancelled = false;
    getAgents().then((list) => {
      if (!cancelled) {
        initialFocusLoaded.current = true;
        if (list.length) setFocus((current) => current ?? { x: list[0].x, y: list[0].y, key: Date.now() });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [meta, active]);

  useEffect(() => {
    if (!meta || !active) return;
    let cancelled = false;
    const poll = () => getStatus().then((value) => { if (!cancelled) setStatus(value); }).catch(() => {});
    void poll();
    const timer = setInterval(poll, Math.max(2500, Math.min(5000, meta.simulation.tickMs / 2)));
    return () => { cancelled = true; clearInterval(timer); };
  }, [meta, active]);

  useEffect(() => {
    if (!selectedId || !active) return;
    let cancelled = false;
    const poll = () => getAgent(selectedId).then((agent) => {
      if (cancelled) return;
      setSelectedAgent(agent);
      if (agent.dead) { setFollow(false); setNotice(`Agent ${selectedId} has died.`); }
    }).catch((reason) => {
      if (!cancelled && String(reason).includes('404')) {
        setFollow(false); setSelectedAgent(null);
        setNotice(`Agent ${selectedId} is no longer available.`);
      }
    });
    void poll();
    const timer = setInterval(poll, Math.max(1000, Math.min(3000, meta?.simulation.tickMs ?? 3000)));
    return () => { cancelled = true; clearInterval(timer); };
  }, [selectedId, active, meta?.simulation.tickMs]);

  const refreshAgents = useCallback(() => {
    setFinderLoading(true); setFinderError(null);
    getAgents().then(setAgents).catch((reason) => setFinderError(String(reason))).finally(() => setFinderLoading(false));
  }, []);
  useEffect(() => { if (finderOpen) refreshAgents(); }, [finderOpen, refreshAgents]);

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    return query ? agents.filter((agent) => agent.id.toLowerCase().includes(query) || agent.state.toLowerCase().includes(query)) : agents;
  }, [agents, search]);

  const selectAgent = useCallback((agent: Agent) => {
    setSelectedId(agent.id); setSelectedAgent(agent); setSelectedObject(null); setFollow(false);
    setFocus({ x: agent.x, y: agent.y, key: Date.now() });
    setFinderOpen(false); setDetailsOpen(true); setNotice(null);
  }, []);

  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><SafeAreaView style={styles.root} edges={['top', 'bottom']}>
    <StatusBar style="light" />
    <View style={styles.header}>
      <View><Text style={styles.eyebrow}>FLATWORLD / LIVE</Text><Text style={styles.title}>World Simulator</Text></View>
      <Text style={styles.status}>{status ? `Tick ${status.tickCount.toLocaleString()} · ${status.agentCount} alive` : 'Connecting…'}</Text>
    </View>

    <View style={styles.map}>
      {meta ? <WorldMap meta={meta} layer={layer} focus={focus} zoomRequest={zoomRequest}
        selectedAgentId={selectedId} selectedAgent={selectedAgent} selectedObjectId={selectedObject?.id ?? null} objectCatalog={objectCatalog} following={follow} active={active} onAgentPress={selectAgent}
        onObjectPress={(object) => {
          setSelectedObject(object);
          if (object) { setSelectedId(null); setSelectedAgent(null); setFollow(false); setDetailsOpen(true); }
        }}
        onManualMove={() => setFollow(false)} />
        : <View style={styles.center}>{error
          ? <><Text style={styles.errorTitle}>World unavailable</Text><Text style={styles.errorText}>{error}</Text><Text style={styles.muted}>{API_URL}</Text><Button title="Retry" onPress={loadWorld} /></>
          : <><ActivityIndicator color="#f5bd6a" /><Text style={styles.muted}>Loading the world…</Text></>}
        </View>}
      {meta && <>
        <View style={styles.topActions}>
          <Button title="Find agent" onPress={() => setFinderOpen(true)} />
          <Button title="Layers" onPress={() => setLayersOpen(true)} />
        </View>
        <View style={styles.zoomActions}>
          <Button title="+" onPress={() => setZoomRequest({ factor: 1.4, key: Date.now() })} />
          <Button title="−" onPress={() => setZoomRequest({ factor: 1 / 1.4, key: Date.now() })} />
        </View>
        {selectedId && <Pressable style={styles.selection} onPress={() => setDetailsOpen(true)}>
          <Text style={styles.selectionText}>{follow ? '◎' : '●'} Agent {selectedId}  ›</Text>
        </Pressable>}
      </>}
    </View>
    <View style={styles.footer}><Text style={styles.muted}>Drag to move · Pinch to zoom · Tap an agent</Text>{notice && <Text style={styles.notice}>{notice}</Text>}</View>

    <Sheet visible={finderOpen} title="Find a living agent" onClose={() => setFinderOpen(false)} tall>
      <TextInput style={styles.search} value={search} onChangeText={setSearch} placeholder="Search ID or state" placeholderTextColor="#81939f" autoCorrect={false} />
      <View style={styles.listHeader}><Text style={styles.muted}>{filtered.length} agents</Text><Button title="Refresh" onPress={refreshAgents} /></View>
      {finderLoading && <ActivityIndicator color="#f5bd6a" />}
      {finderError && <Text style={styles.errorText}>{finderError}</Text>}
      <FlatList data={filtered} keyExtractor={(agent) => agent.id} keyboardShouldPersistTaps="handled"
        ListEmptyComponent={!finderLoading ? <Text style={styles.muted}>No living agents found.</Text> : undefined}
        renderItem={({ item }) => <Pressable style={styles.row} onPress={() => selectAgent(item)}>
          <View><Text style={styles.rowTitle}>Agent {item.id}</Text><Text style={styles.rowSub}>{item.state} · {Math.round(item.x)}, {Math.round(item.y)}</Text></View>
          <Text style={styles.arrow}>›</Text>
        </Pressable>} />
    </Sheet>

    <Sheet visible={layersOpen} title="Map layers" onClose={() => setLayersOpen(false)}>
      {LAYERS.map((item) => <Pressable key={item.id} style={[styles.row, layer === item.id && styles.activeRow]}
        onPress={() => { setLayer(item.id); setLayersOpen(false); }}>
        <Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.arrow}>{layer === item.id ? '✓' : '›'}</Text>
      </Pressable>)}
    </Sheet>

    <Sheet visible={detailsOpen} title={selectedAgent ? `Agent ${selectedAgent.id}` : selectedObject ? objectCatalog?.definitions.find((definition) => definition.id === selectedObject.definitionId)?.name ?? selectedObject.type.replace('_', ' ') : 'Details'} onClose={() => setDetailsOpen(false)}>
      {selectedAgent ? <ScrollView contentContainerStyle={styles.detail}>
        <Text style={styles.detailState}>{selectedAgent.dead ? 'Deceased' : selectedAgent.state}</Text>
        <Text style={styles.detailLine}>Position  {Math.round(selectedAgent.x)}, {Math.round(selectedAgent.y)}</Text>
        {selectedAgent.currentGoal && <Text style={styles.detailLine}>Goal  {selectedAgent.currentGoal.type} · {selectedAgent.currentGoal.targetX}, {selectedAgent.currentGoal.targetY}</Text>}
        {selectedAgent.age != null && <Text style={styles.detailLine}>Age  {selectedAgent.age}</Text>}
        <Need title="Hunger" value={selectedAgent.hunger} /><Need title="Thirst" value={selectedAgent.thirst} /><Need title="Tiredness" value={selectedAgent.tiredness} />
        <View style={styles.detailActions}>
          <Button title="Jump to agent" onPress={() => { setFocus({ x: selectedAgent.x, y: selectedAgent.y, key: Date.now() }); setDetailsOpen(false); }} />
          {!selectedAgent.dead && <Button title={follow ? 'Following ✓' : 'Follow agent'} active={follow} onPress={() => { setFollow((value) => !value); setDetailsOpen(false); }} />}
        </View>
      </ScrollView> : selectedObject ? <View style={styles.detail}>
        <Text style={styles.detailState}>{objectCatalog?.definitions.find((definition) => definition.id === selectedObject.definitionId)?.name ?? selectedObject.type.replace('_', ' ')}</Text>
        <Text style={styles.detailLine}>Position  {selectedObject.x}, {selectedObject.y}</Text>
        <Text style={styles.detailLine}>ID  {selectedObject.id}</Text>
      </View> : <Text style={styles.muted}>Tap an agent or object on the map.</Text>}
    </Sheet>
  </SafeAreaView></SafeAreaProvider></GestureHandlerRootView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0c1520' },
  header: { minHeight: 72, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#101b25' },
  eyebrow: { color: '#e8ad5c', fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#f3f6f7', fontSize: 19, fontWeight: '700', marginTop: 3 },
  status: { color: '#b9cad2', fontSize: 11, maxWidth: '48%' },
  map: { flex: 1, minHeight: 200, position: 'relative' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 25 },
  topActions: { position: 'absolute', left: 12, top: 12, flexDirection: 'row', gap: 7 },
  zoomActions: { position: 'absolute', right: 12, top: 12, gap: 7 },
  selection: { position: 'absolute', right: 12, bottom: 12, padding: 11, backgroundColor: '#253b46ee', borderColor: '#e8ad5c', borderWidth: 1, borderRadius: 9 },
  selectionText: { color: '#ffe0aa', fontWeight: '700', fontSize: 12 },
  button: { minHeight: 40, paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1b2d39ee', borderColor: '#4a6776', borderWidth: 1, borderRadius: 9 },
  buttonActive: { borderColor: '#e8ad5c', backgroundColor: '#57432d' },
  buttonText: { color: '#f2f6f7', fontSize: 12, fontWeight: '700' },
  footer: { paddingHorizontal: 15, paddingVertical: 8, backgroundColor: '#101b25' },
  muted: { color: '#9aadb8', fontSize: 11 },
  notice: { color: '#f5bd6a', fontSize: 11, marginTop: 4 },
  errorTitle: { color: '#f8dddd', fontWeight: '700', fontSize: 19 },
  errorText: { color: '#ffb2aa', fontSize: 12, marginVertical: 7 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' },
  sheet: { maxHeight: '82%', padding: 18, paddingBottom: 25, backgroundColor: '#142631', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderColor: '#49616c', borderTopWidth: 1 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle: { color: '#f2f6f7', fontWeight: '700', fontSize: 18 },
  search: { height: 45, color: '#fff', backgroundColor: '#0d1b25', borderColor: '#506875', borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, fontSize: 15 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 9 },
  row: { minHeight: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomColor: '#314653', borderBottomWidth: 1, paddingVertical: 9, paddingHorizontal: 3 },
  activeRow: { backgroundColor: '#263d48', borderRadius: 8 },
  rowTitle: { color: '#f1f6f7', fontWeight: '700', fontSize: 14 },
  rowSub: { color: '#a1b5c0', fontSize: 12, marginTop: 3 },
  arrow: { color: '#f5bd6a', fontWeight: '700', fontSize: 20 },
  detail: { paddingBottom: 10 },
  detailState: { color: '#f5bd6a', fontSize: 15, fontWeight: '700', textTransform: 'capitalize', marginBottom: 12 },
  detailLine: { color: '#d7e2e7', fontSize: 13, marginBottom: 9 },
  detailActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 16 },
  needRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  needName: { color: '#beced6', width: 76, fontSize: 12 },
  needTrack: { flex: 1, height: 7, backgroundColor: '#30444f', borderRadius: 4, overflow: 'hidden' },
  needFill: { height: '100%' },
  needValue: { width: 36, textAlign: 'right', color: '#dce8ec', fontSize: 11 },
});
