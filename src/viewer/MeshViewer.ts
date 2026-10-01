import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HalfEdgeHelper } from 'three-bvh-csg';
import { edgeVertices } from '../mesh/diagnostics';
import { neighborhood } from '../graph/analysis';
import type { MeshGraphData } from '../mesh/types';

export interface ViewSettings { hopDepth: number; showNeighbors: boolean; showUnmatched: boolean; showBoundary: boolean; showHalfEdges: boolean; wireframe: boolean }
export class MeshViewer {
  readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
  readonly controls: OrbitControls;
  readonly group = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private mesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private highlight?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private unmatched?: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private boundary?: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private helper?: HalfEdgeHelper;
  private data?: MeshGraphData;
  private observer: ResizeObserver;

  constructor(private container: HTMLElement, onPick: (face: number) => void) {
    this.scene.background = new THREE.Color('#101922');
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.prepend(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', '三維模型；也可使用右側 Face ID 選面');
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.scene.add(this.group, new THREE.HemisphereLight(0xd9f3ff, 0x27323d, 2.3));
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(3, 5, 4); this.scene.add(light);
    const rim = new THREE.DirectionalLight(0x75bfff, 1.4); rim.position.set(-3, 0, -2); this.scene.add(rim);
    this.home();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container);
    let down: { x: number; y: number; id: number; moved: boolean } | undefined;
    this.renderer.domElement.addEventListener('pointerdown', event => {
      if (event.button === 0 && event.isPrimary) down = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false };
      else if (down) down.moved = true;
    });
    this.renderer.domElement.addEventListener('pointermove', event => {
      if (down && event.pointerId === down.id && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) down.moved = true;
    });
    this.renderer.domElement.addEventListener('pointercancel', () => { down = undefined; });
    this.renderer.domElement.addEventListener('pointerup', event => {
      const press = down; down = undefined;
      if (!press || press.id !== event.pointerId || press.moved || event.button !== 0 || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5 || !this.mesh) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.scene.updateMatrixWorld(true);
      this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), this.camera);
      const hit = this.raycaster.intersectObject(this.mesh)[0];
      if (hit?.faceIndex !== undefined && hit.faceIndex !== null) onPick(hit.faceIndex);
    });
    this.renderer.setAnimationLoop(() => { this.controls.update(); this.renderer.render(this.scene, this.camera); });
  }

  private resize() {
    const width = this.container.clientWidth, height = this.container.clientHeight;
    this.camera.aspect = width / Math.max(height, 1); this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
  home() { this.camera.position.set(2.6, 1.7, 3.0); this.controls?.target.set(0, 0, 0); this.controls?.update(); }
  private clear() {
    for (const object of [...this.group.children]) {
      this.group.remove(object);
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    }
    this.mesh = this.highlight = this.unmatched = this.boundary = this.helper = undefined;
    this.data = undefined;
  }
  setData(data: MeshGraphData) {
    this.clear(); this.data = data;
    const material = new THREE.MeshStandardMaterial({ color: 0xb3c9ce, roughness: 0.72, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.mesh = new THREE.Mesh(data.geometry, material);
    this.group.add(this.mesh);
    const center = data.geometry.boundingBox!.getCenter(new THREE.Vector3());
    const radius = Math.max(data.geometry.boundingSphere!.radius, 1e-6);
    this.group.scale.setScalar(1 / radius); this.group.position.copy(center).multiplyScalar(-1 / radius);
    this.unmatched = this.makeLines(data.unmatchedEdges, 0xff6688);
    this.boundary = this.makeLines(data.boundaryEdges, 0x64e4c4);
    this.group.add(this.unmatched, this.boundary); this.home();
  }
  private makeLines(halfEdges: Uint32Array, color: number) {
    const data = this.data!, positions = new Float32Array(halfEdges.length * 6);
    for (let i = 0; i < halfEdges.length; i++) {
      const [a, b] = edgeVertices(data.indices, halfEdges[i]);
      positions.set(data.positions.subarray(a * 3, a * 3 + 3), i * 6);
      positions.set(data.positions.subarray(b * 3, b * 3 + 3), i * 6 + 3);
    }
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8 }));
  }
  update(selected: number, settings: ViewSettings) {
    if (!this.data || !this.mesh) return;
    this.mesh.material.wireframe = settings.wireframe;
    this.unmatched!.visible = settings.showUnmatched; this.boundary!.visible = settings.showBoundary;
    if (settings.showHalfEdges && !this.helper) {
      this.helper = new HalfEdgeHelper(); this.helper.setHalfEdges(this.data.geometry, this.data.halfEdges);
      const material = this.helper.material as THREE.LineBasicMaterial;
      material.color.set(0x58aeff); material.depthTest = false; this.group.add(this.helper);
    }
    if (this.helper) this.helper.visible = settings.showHalfEdges;
    if (this.highlight) { this.group.remove(this.highlight); this.highlight.geometry.dispose(); this.highlight.material.dispose(); this.highlight = undefined; }
    if (selected < 0 || selected >= this.data.graph.faceCount) return;
    const hops = neighborhood(this.data.graph, selected, settings.showNeighbors ? settings.hopDepth : 0);
    let count = 0; for (const hop of hops) if (hop >= 0) count++;
    const positions = new Float32Array(count * 9), colors = new Float32Array(count * 9);
    const palette = [0xffdc65, 0x51d8bd, 0x58b6f2, 0x9478e8, 0xc979cf, 0xf5a174].map(color => new THREE.Color(color));
    let offset = 0;
    for (let face = 0; face < hops.length; face++) {
      if (hops[face] < 0) continue;
      for (let v = 0; v < 3; v++) {
        const vertex = this.data.indices[face * 3 + v];
        positions.set(this.data.positions.subarray(vertex * 3, vertex * 3 + 3), offset);
        palette[hops[face]].toArray(colors, offset); offset += 3;
      }
    }
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3)).setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.highlight = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.highlight.renderOrder = 1; this.group.add(this.highlight);
  }
  dispose() { this.renderer.setAnimationLoop(null); this.observer.disconnect(); this.clear(); this.controls.dispose(); this.renderer.dispose(); }
}
