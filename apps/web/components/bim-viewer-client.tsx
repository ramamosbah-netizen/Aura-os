'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface Project {
  id: string;
  title: string;
}

interface BimModel {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  name: string;
  discipline: string;
  format: string;
  storageKey: string | null;
  fileUrl: string | null;
  version: number;
  revision: string;
  status: string;
  fileSizeBytes: number | null;
  createdAt: string;
}

interface Props {
  initialModels: BimModel[];
  projects: Project[];
}

const DISCIPLINES = ['architectural', 'structural', 'mep', 'elv', 'civil', 'other'] as const;

/** Three.js scene handle kept outside React state (mutable, disposed on unmount). */
interface SceneHandle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  modelGroup: THREE.Group;
  dispose: () => void;
}

function createScene(container: HTMLDivElement): SceneHandle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161a);

  const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 5000);
  camera.position.set(15, 12, 15);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(20, 40, 25);
  scene.add(sun);
  scene.add(new THREE.GridHelper(50, 50, 0x2c313a, 0x22262d));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const modelGroup = new THREE.Group();
  scene.add(modelGroup);

  let frame = 0;
  const animate = () => {
    frame = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();

  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', onResize);

  return {
    renderer,
    scene,
    camera,
    controls,
    modelGroup,
    dispose: () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  }
}

/** Parse IFC bytes with web-ifc (WASM) and stream every placed mesh into the group. */
async function loadIfcIntoGroup(buffer: ArrayBuffer, group: THREE.Group): Promise<number> {
  const WebIFC = await import('web-ifc');
  const api = new WebIFC.IfcAPI();
  api.SetWasmPath('/wasm/', true);
  await api.Init();

  const modelID = api.OpenModel(new Uint8Array(buffer));
  const materials = new Map<string, THREE.MeshLambertMaterial>();
  let meshCount = 0;

  try {
    api.StreamAllMeshes(modelID, (mesh) => {
      const placed = mesh.geometries;
      for (let i = 0; i < placed.size(); i++) {
        const pg = placed.get(i);
        const geom = api.GetGeometry(modelID, pg.geometryExpressID);
        const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
        const indices = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());

        // web-ifc vertices are interleaved [x,y,z, nx,ny,nz] per vertex.
        const buffered = new THREE.BufferGeometry();
        const interleaved = new THREE.InterleavedBuffer(new Float32Array(verts), 6);
        buffered.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0));
        buffered.setAttribute('normal', new THREE.InterleavedBufferAttribute(interleaved, 3, 3));
        buffered.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

        const c = pg.color;
        const key = `${c.x.toFixed(3)}/${c.y.toFixed(3)}/${c.z.toFixed(3)}/${c.w.toFixed(3)}`;
        let material = materials.get(key);
        if (!material) {
          material = new THREE.MeshLambertMaterial({
            color: new THREE.Color(c.x, c.y, c.z),
            transparent: c.w < 1,
            opacity: c.w,
            side: THREE.DoubleSide,
          });
          materials.set(key, material);
        }

        const threeMesh = new THREE.Mesh(buffered, material);
        threeMesh.applyMatrix4(new THREE.Matrix4().fromArray(pg.flatTransformation));
        group.add(threeMesh);
        meshCount++;
        geom.delete();
      }
    });
  } finally {
    api.CloseModel(modelID);
  }
  return meshCount;
}

function fitCameraTo(group: THREE.Group, camera: THREE.PerspectiveCamera, controls: OrbitControls): void {
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  const distance = Math.max(size * 0.8, 5);
  camera.position.set(center.x + distance, center.y + distance * 0.7, center.z + distance);
  camera.near = Math.max(size / 1000, 0.01);
  camera.far = size * 10 + 100;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

export default function BimViewerClient({ initialModels, projects }: Props) {
  const [models, setModels] = useState<BimModel[]>(initialModels);
  const [error, setError] = useState<string | null>(null);
  const [viewerStatus, setViewerStatus] = useState<string>('No model loaded — pick a local IFC file or view a registered model with a file URL.');
  const [busy, setBusy] = useState(false);

  // Register form
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [discipline, setDiscipline] = useState<string>('structural');
  const [fileUrl, setFileUrl] = useState('');

  // Version-bump inputs per model
  const [revisions, setRevisions] = useState<Record<string, string>>({});

  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const handle = createScene(containerRef.current);
    sceneRef.current = handle;
    return () => {
      clearGroup(handle.modelGroup);
      handle.dispose();
      sceneRef.current = null;
    };
  }, []);

  const renderBuffer = async (buffer: ArrayBuffer, label: string) => {
    const handle = sceneRef.current;
    if (!handle) return;
    setBusy(true);
    setError(null);
    setViewerStatus(`Parsing ${label} …`);
    try {
      clearGroup(handle.modelGroup);
      const meshes = await loadIfcIntoGroup(buffer, handle.modelGroup);
      fitCameraTo(handle.modelGroup, handle.camera, handle.controls);
      setViewerStatus(`${label} — ${meshes} mesh${meshes === 1 ? '' : 'es'} rendered. Drag to orbit, scroll to zoom.`);
    } catch (e) {
      setError(`Failed to parse IFC: ${(e as Error).message}`);
      setViewerStatus('Load failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleLocalFile = async (file: File | null) => {
    if (!file) return;
    await renderBuffer(await file.arrayBuffer(), file.name);
  };

  const handleViewModel = async (model: BimModel) => {
    if (!model.fileUrl) return;
    setBusy(true);
    setError(null);
    setViewerStatus(`Fetching ${model.code} rev ${model.revision} …`);
    try {
      const res = await fetch(model.fileUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await renderBuffer(await res.arrayBuffer(), `${model.code} rev ${model.revision}`);
    } catch (e) {
      setError(`Failed to fetch model file: ${(e as Error).message}`);
      setViewerStatus('Load failed.');
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !code.trim() || !name.trim()) return;
    setError(null);
    try {
      const res = await fetch('/api/engineering/bim-models', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          projectName: projects.find((p) => p.id === projectId)?.title,
          code,
          name,
          discipline,
          format: 'ifc',
          fileUrl: fileUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? `HTTP ${res.status}`);
      setModels((prev) => [data, ...prev]);
      setCode('');
      setName('');
      setFileUrl('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleBumpVersion = async (model: BimModel) => {
    const revision = (revisions[model.id] ?? '').trim();
    if (!revision) return;
    setError(null);
    try {
      const res = await fetch(`/api/engineering/bim-models/${model.id}/version`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ revision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? `HTTP ${res.status}`);
      setModels((prev) => prev.map((m) => (m.id === model.id ? data : m)));
      setRevisions((prev) => ({ ...prev, [model.id]: '' }));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div>
      {error && <div style={st.error}>{error}</div>}

      {/* ── Viewer ── */}
      <div style={st.viewerWrap}>
        <div ref={containerRef} style={st.canvas} />
        <div style={st.viewerBar}>
          <label style={st.fileLabel}>
            {busy ? 'Working…' : 'Open local IFC'}
            <input
              type="file"
              accept=".ifc"
              disabled={busy}
              style={{ display: 'none' }}
              onChange={(e) => void handleLocalFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <span style={st.status}>{viewerStatus}</span>
        </div>
      </div>

      {/* ── Register a model ── */}
      <h2 style={st.h2}>Register model</h2>
      <form onSubmit={handleRegister} style={st.form}>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={st.input}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code (BIM-STR-01)" style={st.input} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Model name" style={st.input} />
        <select value={discipline} onChange={(e) => setDiscipline(e.target.value)} style={st.input}>
          {DISCIPLINES.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="IFC file URL (optional)" style={{ ...st.input, minWidth: 220 }} />
        <button type="submit" style={st.button}>Register</button>
      </form>

      {/* ── Registry ── */}
      <h2 style={st.h2}>Model registry</h2>
      {models.length === 0 ? (
        <p style={st.empty}>No models registered yet.</p>
      ) : (
        <table style={st.table}>
          <thead>
            <tr>
              {['Code', 'Name', 'Project', 'Discipline', 'Rev', 'v', 'Status', ''].map((h) => (
                <th key={h} style={st.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id}>
                <td style={st.td}>{m.code}</td>
                <td style={st.td}>{m.name}</td>
                <td style={st.td}>{m.projectName ?? m.projectId.slice(0, 8)}</td>
                <td style={st.td}>{m.discipline}</td>
                <td style={st.td}>{m.revision}</td>
                <td style={st.td}>{m.version}</td>
                <td style={st.td}>{m.status}</td>
                <td style={{ ...st.td, whiteSpace: 'nowrap' }}>
                  <button
                    style={{ ...st.smallButton, opacity: m.fileUrl ? 1 : 0.4 }}
                    disabled={!m.fileUrl || busy}
                    title={m.fileUrl ? 'Load into the viewer' : 'No file URL on this model'}
                    onClick={() => void handleViewModel(m)}
                  >
                    View
                  </button>
                  <input
                    value={revisions[m.id] ?? ''}
                    onChange={(e) => setRevisions((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    placeholder="Rev"
                    style={st.revInput}
                  />
                  <button style={st.smallButton} onClick={() => void handleBumpVersion(m)}>
                    +Version
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const st = {
  error: { background: '#3b1d1d', color: '#ff9c9c', padding: '10px 14px', borderRadius: 8, margin: '0 0 14px', fontSize: 13 } as CSSProperties,
  viewerWrap: { border: '1px solid var(--border, #2a2e35)', borderRadius: 10, overflow: 'hidden', marginBottom: 26 } as CSSProperties,
  canvas: { width: '100%', height: 460 } as CSSProperties,
  viewerBar: { display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', background: 'var(--panel, #1b1e24)' } as CSSProperties,
  fileLabel: { cursor: 'pointer', background: 'var(--accent, #3f6cff)', color: '#fff', padding: '7px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600 } as CSSProperties,
  status: { color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  h2: { fontSize: 17, margin: '0 0 10px' } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 26 } as CSSProperties,
  input: { background: 'var(--panel, #1b1e24)', border: '1px solid var(--border, #2a2e35)', color: 'inherit', borderRadius: 7, padding: '8px 10px', fontSize: 13 } as CSSProperties,
  button: { background: 'var(--accent, #3f6cff)', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as CSSProperties,
  smallButton: { background: 'var(--panel, #1b1e24)', border: '1px solid var(--border, #2a2e35)', color: 'inherit', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', marginRight: 6 } as CSSProperties,
  revInput: { width: 44, background: 'var(--panel, #1b1e24)', border: '1px solid var(--border, #2a2e35)', color: 'inherit', borderRadius: 6, padding: '4px 6px', fontSize: 12, marginRight: 6 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border, #2a2e35)', color: 'var(--muted)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 10px', borderBottom: '1px solid var(--border, #22262d)' } as CSSProperties,
  empty: { color: 'var(--muted)', fontSize: 14 } as CSSProperties,
};
