import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mmdVecToThree } from '../engine/mmdCoordinates';
import { solveModelIKOnBones } from '../engine/ikSolver';
import type {
  BoneMappingResult,
  BoneTransform,
  BoneVisualCategory,
  PMXModelData,
  RetargetedPose,
  SkeletonAnalysis,
  StandardBoneRole,
} from '../engine/types';

export type CameraPreset = 'perspective' | 'front' | 'back' | 'left' | 'right' | 'top';
export type ViewportRenderMode = 'shaded' | 'wireframe' | 'skeleton';

export const BONE_CATEGORY_COLORS: Record<BoneVisualCategory, number> = {
  'head-neck': 0xa78bfa,
  torso: 0x38bdf8,
  arm: 0x34d399,
  leg: 0x2dd4bf,
  finger: 0x67e8f9,
  twist: 0xf472b6,
  ik: 0xf59e0b,
  helper: 0x94a3b8,
  unknown: 0xfb7185,
};

function roleToCategory(role: StandardBoneRole): BoneVisualCategory {
  if (role === 'neck' || role === 'head' || role === 'eyeL' || role === 'eyeR') return 'head-neck';
  if (
    role === 'allParents' ||
    role === 'center' ||
    role === 'groove' ||
    role === 'waist' ||
    role === 'upperBody' ||
    role === 'upperBody2' ||
    role === 'upperBody3'
  ) {
    return 'torso';
  }
  if (role === 'armTwistL' || role === 'armTwistR' || role === 'wristTwistL' || role === 'wristTwistR') {
    return 'twist';
  }
  if (role === 'legIkL' || role === 'legIkR' || role === 'toeIkL' || role === 'toeIkR') {
    return 'ik';
  }
  if (
    role === 'shoulderL' ||
    role === 'shoulderR' ||
    role === 'armL' ||
    role === 'armR' ||
    role === 'elbowL' ||
    role === 'elbowR' ||
    role === 'wristL' ||
    role === 'wristR'
  ) {
    return 'arm';
  }
  if (
    role === 'legL' ||
    role === 'legR' ||
    role === 'kneeL' ||
    role === 'kneeR' ||
    role === 'ankleL' ||
    role === 'ankleR' ||
    role === 'toeL' ||
    role === 'toeR'
  ) {
    return 'leg';
  }
  return 'finger';
}

interface Viewport3DProps {
  model: PMXModelData | null;
  skeleton?: SkeletonAnalysis | null;
  mapping?: BoneMappingResult | null;
  pose: RetargetedPose | null;
  morphWeights: Record<string, number>;
  selectedBoneIndex: number | null;
  onSelectBone: (boneIndex: number | null) => void;
  onBoneTransformChange: (boneIndex: number, next: Partial<BoneTransform>) => void;
  showBones: boolean;
  showAxes: boolean;
  showGrid: boolean;
  renderMode: ViewportRenderMode;
  gizmoMode: 'rotate' | 'translate';
  cameraPreset: CameraPreset;
  cameraResetNonce: number;
  textureMapByFile?: Record<string, string>;
  refOverlayUrl?: string;
  showRefOverlay?: boolean;
  refOverlayOpacity?: number;
}

const CAMERA_TARGETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  perspective: { pos: [12.5, 13.8, 30.5], target: [0, 9.1, 0] },
  front: { pos: [0, 9.4, 30.5], target: [0, 9.1, 0] },
  back: { pos: [0, 9.4, -30.5], target: [0, 9.1, 0] },
  left: { pos: [30.5, 9.4, 0], target: [0, 9.1, 0] },
  right: { pos: [-30.5, 9.4, 0], target: [0, 9.1, 0] },
  top: { pos: [0, 34, 0.5], target: [0, 8.8, 0] },
};

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export const Viewport3D: React.FC<Viewport3DProps> = ({
  model,
  skeleton,
  mapping,
  pose,
  morphWeights,
  selectedBoneIndex,
  onSelectBone,
  onBoneTransformChange,
  showBones,
  showAxes,
  showGrid,
  renderMode,
  gizmoMode,
  cameraPreset,
  cameraResetNonce,
  textureMapByFile,
  refOverlayUrl,
  showRefOverlay = false,
  refOverlayOpacity = 0.35,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Refs to keep callbacks and current scene objects decoupled from React re-renders
  const onSelectBoneRef = useRef(onSelectBone);
  const onBoneTransformChangeRef = useRef(onBoneTransformChange);
  onSelectBoneRef.current = onSelectBone;
  onBoneTransformChangeRef.current = onBoneTransformChange;

  const sceneRefs = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    orbit: OrbitControls;
    transform: TransformControls;
    modelGroup: THREE.Group;
    skinnedMesh: THREE.SkinnedMesh | null;
    bones: THREE.Bone[];
    restPositions: THREE.Vector3[];
    skeletonHelper: THREE.SkeletonHelper | null;
    jointMarkersGroup: THREE.Group;
    jointMarkerByBone: Map<number, THREE.Mesh>;
    gridHelper: THREE.GridHelper;
    axesHelper: THREE.AxesHelper;
    requestRender: () => void;
    camTransition: { active: boolean; pos: THREE.Vector3; target: THREE.Vector3 };
    currentModel: PMXModelData | null;
  } | null>(null);

  // Mount renderer & scene ONCE
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 240);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1118);
    scene.fog = new THREE.FogExp2(0x0c1118, 0.0085);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 200);
    camera.position.set(...CAMERA_TARGETS.perspective.pos);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(...CAMERA_TARGETS.perspective.target);
    orbit.enableDamping = !isSoftwareGl;
    orbit.dampingFactor = 0.07;
    orbit.minDistance = 5;
    orbit.maxDistance = 65;
    orbit.maxPolarAngle = Math.PI * 0.92;
    orbit.update();

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSize(0.7);
    scene.add(transform.getHelper());

    // 3-point studio lighting + cool sky/ground HemisphereLight
    const hemi = new THREE.HemisphereLight(0xcbe2ff, 0x1a202c, 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.55);
    keyLight.position.set(12, 24, 18);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 65;
    keyLight.shadow.camera.left = -12;
    keyLight.shadow.camera.right = 12;
    keyLight.shadow.camera.top = 20;
    keyLight.shadow.camera.bottom = -2;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.75);
    rimLight.position.set(-14, 16, -16);
    scene.add(rimLight);

    // Studio floor & radial contact shadow disc
    const floorGeo = new THREE.CircleGeometry(36, 48);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x101620,
      roughness: 0.92,
      metalness: 0.05,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = -0.02;
    floorMesh.receiveShadow = !isSoftwareGl;
    scene.add(floorMesh);

    // Soft contact shadow disc
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sctx = shadowCanvas.getContext('2d');
    if (sctx) {
      const grad = sctx.createRadialGradient(64, 64, 4, 64, 64, 60);
      grad.addColorStop(0, 'rgba(0,0,0,0.55)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, 128, 128);
    }
    const contactTex = new THREE.CanvasTexture(shadowCanvas);
    const contactDisc = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 32),
      new THREE.MeshBasicMaterial({
        map: contactTex,
        transparent: true,
        depthWrite: false,
      })
    );
    contactDisc.rotation.x = -Math.PI / 2;
    contactDisc.position.y = 0.005;
    scene.add(contactDisc);

    const gridHelper = new THREE.GridHelper(28, 28, 0x334155, 0x1c2533);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(4.5);
    axesHelper.position.set(0, 0.02, 0);
    scene.add(axesHelper);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    const jointMarkersGroup = new THREE.Group();
    scene.add(jointMarkersGroup);

    // Paced render-on-demand loop
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;
    const camTransition = {
      active: false,
      pos: new THREE.Vector3(),
      target: new THREE.Vector3(),
    };

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      if (!sync) {
        frameId = window.setTimeout(cb, 16);
        return;
      }
      gl.flush();
      const poll = () => {
        if (disposed) {
          gl.deleteSync(sync);
          return;
        }
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 65);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;

        if (camTransition.active) {
          const alpha = isSoftwareGl ? 1 : 0.18;
          camera.position.lerp(camTransition.pos, alpha);
          orbit.target.lerp(camTransition.target, alpha);
          if (
            camera.position.distanceTo(camTransition.pos) < 0.05 &&
            orbit.target.distanceTo(camTransition.target) < 0.05
          ) {
            camera.position.copy(camTransition.pos);
            orbit.target.copy(camTransition.target);
            camTransition.active = false;
          } else {
            renderDirty = true;
          }
        }

        orbit.update();

        // Sync joint selection spheres to current bone world positions
        const refs = sceneRefs.current;
        if (refs && refs.bones.length > 0 && refs.jointMarkersGroup.visible) {
          const wp = new THREE.Vector3();
          refs.jointMarkerByBone.forEach((mesh, bIdx) => {
            const bone = refs.bones[bIdx];
            if (bone) {
              bone.getWorldPosition(wp);
              mesh.position.copy(wp);
            }
          });
        }

        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty && !disposed) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    orbit.addEventListener('start', () => {
      camTransition.active = false;
    });
    orbit.addEventListener('change', requestRender);

    transform.addEventListener('dragging-changed', (event) => {
      orbit.enabled = !event.value;
    });

    transform.addEventListener('objectChange', () => {
      const obj = transform.object;
      const refs = sceneRefs.current;
      if (obj && refs && typeof obj.userData.boneIndex === 'number') {
        const bIdx = obj.userData.boneIndex as number;
        const restPos = refs.restPositions[bIdx] ?? new THREE.Vector3();
        const deltaPos = obj.position.clone().sub(restPos);
        onBoneTransformChangeRef.current(bIdx, {
          boneIndex: bIdx,
          boneName: refs.currentModel?.bones[bIdx]?.name ?? obj.name,
          translation: [deltaPos.x, deltaPos.y, deltaPos.z],
          quaternion: [obj.quaternion.x, obj.quaternion.y, obj.quaternion.z, obj.quaternion.w],
          source: 'manual',
        });
        requestRender();
      }
    });

    // Raycast bone joint spheres on click
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };
    const handlePointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 5) return;
      const refs = sceneRefs.current;
      if (!refs || !refs.jointMarkersGroup.visible) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(refs.jointMarkersGroup.children, false);
      if (hits.length > 0) {
        const bIdx = hits[0].object.userData.boneIndex;
        if (typeof bIdx === 'number') {
          onSelectBoneRef.current(bIdx);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(entry.contentRect.width, 200);
      const h = Math.max(entry.contentRect.height, 200);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    });
    resizeObserver.observe(container);

    sceneRefs.current = {
      scene,
      camera,
      renderer,
      orbit,
      transform,
      modelGroup,
      skinnedMesh: null,
      bones: [],
      restPositions: [],
      skeletonHelper: null,
      jointMarkersGroup,
      jointMarkerByBone: new Map(),
      gridHelper,
      axesHelper,
      requestRender,
      camTransition,
      currentModel: null,
    };

    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      orbit.dispose();
      transform.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      sceneRefs.current = null;
    };
  }, []);

  // Rebuild Three.js SkinnedMesh whenever `model` or `textureMapByFile` changes
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    refs.currentModel = model;

    // Clear previous model & helpers
    refs.transform.detach();
    while (refs.modelGroup.children.length > 0) {
      const child = refs.modelGroup.children[0];
      refs.modelGroup.remove(child);
    }
    if (refs.skeletonHelper) {
      refs.scene.remove(refs.skeletonHelper);
      refs.skeletonHelper.dispose();
      refs.skeletonHelper = null;
    }
    refs.jointMarkersGroup.clear();
    refs.jointMarkerByBone.clear();
    refs.bones = [];
    refs.restPositions = [];
    refs.skinnedMesh = null;

    if (!model) {
      refs.requestRender();
      return;
    }

    // Build Three.js BufferGeometry in Three.js coordinate space (Z negated)
    const vCount = model.vertexCount;
    const posArr = new Float32Array(vCount * 3);
    const normArr = new Float32Array(vCount * 3);
    const uvArr = new Float32Array(vCount * 2);

    for (let i = 0; i < vCount; i++) {
      posArr[i * 3] = model.positions[i * 3];
      posArr[i * 3 + 1] = model.positions[i * 3 + 1];
      posArr[i * 3 + 2] = -model.positions[i * 3 + 2];

      normArr[i * 3] = model.normals[i * 3];
      normArr[i * 3 + 1] = model.normals[i * 3 + 1];
      normArr[i * 3 + 2] = -model.normals[i * 3 + 2];

      uvArr[i * 2] = model.uvs[i * 2];
      uvArr[i * 2 + 1] = 1 - model.uvs[i * 2 + 1];
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(model.skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(model.skinWeights, 4));

    // Flip triangle winding for Z-mirrored right-handed space
    const flippedIndices = new Uint32Array(model.indices.length);
    for (let i = 0; i < model.indices.length; i += 3) {
      flippedIndices[i] = model.indices[i];
      flippedIndices[i + 1] = model.indices[i + 2];
      flippedIndices[i + 2] = model.indices[i + 1];
    }
    geometry.setIndex(new THREE.BufferAttribute(flippedIndices, 1));

    // Material groups
    let offset = 0;
    const materials: THREE.MeshStandardMaterial[] = [];
    const texLoader = new THREE.TextureLoader();

    model.materials.forEach((m, mIdx) => {
      geometry.addGroup(offset, m.faceCount, mIdx);
      offset += m.faceCount;

      let texMap: THREE.Texture | null = null;
      if (m.textureIndex >= 0 && model.textures[m.textureIndex] && textureMapByFile) {
        const texFile = model.textures[m.textureIndex].split(/[\\/]/).pop() ?? '';
        const blobUrl = textureMapByFile[texFile.toLowerCase()];
        if (blobUrl) {
          texMap = texLoader.load(blobUrl, () => refs.requestRender());
          texMap.colorSpace = THREE.SRGBColorSpace;
        }
      }

      const mat = new THREE.MeshStandardMaterial({
        color: texMap ? 0xffffff : new THREE.Color(m.diffuse[0], m.diffuse[1], m.diffuse[2]),
        map: texMap,
        roughness: 0.62,
        metalness: 0.08,
        side: (m.drawFlags & 0x01) !== 0 ? THREE.DoubleSide : THREE.FrontSide,
        transparent: m.diffuse[3] < 0.99,
        opacity: m.diffuse[3],
      });
      materials.push(mat);
    });

    if (materials.length === 0) {
      materials.push(new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6 }));
    }

    // Morph target attributes (vertex morphs)
    const vertexMorphs = model.morphs.filter((m) => m.type === 'vertex');
    const morphPositions: THREE.Float32BufferAttribute[] = [];
    const morphDict: Record<string, number> = {};

    vertexMorphs.forEach((m, idx) => {
      const targetPos = new Float32Array(posArr);
      for (const o of m.vertexOffsets) {
        if (o.vertexIndex < vCount) {
          targetPos[o.vertexIndex * 3] += o.offset[0];
          targetPos[o.vertexIndex * 3 + 1] += o.offset[1];
          targetPos[o.vertexIndex * 3 + 2] -= o.offset[2];
        }
      }
      const attr = new THREE.Float32BufferAttribute(targetPos, 3);
      attr.name = m.name;
      morphPositions.push(attr);
      morphDict[m.name] = idx;
    });

    if (morphPositions.length > 0) {
      geometry.morphAttributes.position = morphPositions;
      geometry.morphTargetsRelative = false;
    }

    // Build Bone Hierarchy in Three.js space
    const threeBones: THREE.Bone[] = model.bones.map((b) => {
      const tb = new THREE.Bone();
      tb.name = b.name;
      tb.userData.boneIndex = b.index;
      return tb;
    });
    const restPositions: THREE.Vector3[] = [];
    const rootBones: THREE.Bone[] = [];

    for (let i = 0; i < model.bones.length; i++) {
      const b = model.bones[i];
      const worldPos = mmdVecToThree(b.position);
      if (b.parentIndex >= 0 && b.parentIndex < threeBones.length && b.parentIndex !== i) {
        const parentWorld = mmdVecToThree(model.bones[b.parentIndex].position);
        const localPos = worldPos.clone().sub(parentWorld);
        threeBones[i].position.copy(localPos);
        restPositions.push(localPos.clone());
        threeBones[b.parentIndex].add(threeBones[i]);
      } else {
        threeBones[i].position.copy(worldPos);
        restPositions.push(worldPos.clone());
        rootBones.push(threeBones[i]);
      }
    }

    const skinnedMesh = new THREE.SkinnedMesh(geometry, materials);
    skinnedMesh.castShadow = true;
    skinnedMesh.receiveShadow = true;
    for (const rb of rootBones) {
      skinnedMesh.add(rb);
    }
    const skeleton = new THREE.Skeleton(threeBones);
    skinnedMesh.bind(skeleton);
    if (morphPositions.length > 0) {
      skinnedMesh.morphTargetDictionary = morphDict;
      skinnedMesh.morphTargetInfluences = new Array(morphPositions.length).fill(0);
    }

    refs.modelGroup.add(skinnedMesh);
    refs.skinnedMesh = skinnedMesh;
    refs.bones = threeBones;
    refs.restPositions = restPositions;

    // Skeleton helper & clickable bone joint spheres
    const skelHelper = new THREE.SkeletonHelper(skinnedMesh);
    const skelMat = skelHelper.material as THREE.LineBasicMaterial;
    skelMat.depthTest = false;
    skelMat.transparent = true;
    skelMat.opacity = 0.72;
    skelHelper.renderOrder = 10;
    refs.scene.add(skelHelper);
    refs.skeletonHelper = skelHelper;

    const jointGeo = new THREE.SphereGeometry(0.16, 10, 10);
    for (const b of model.bones) {
      if (!b.visible) continue;
      const mat = new THREE.MeshBasicMaterial({
        color: b.isIK ? 0xf59e0b : 0x38bdf8,
        depthTest: false,
        transparent: true,
        opacity: 0.85,
      });
      const sphere = new THREE.Mesh(jointGeo, mat);
      sphere.userData.boneIndex = b.index;
      sphere.renderOrder = 11;
      refs.jointMarkersGroup.add(sphere);
      refs.jointMarkerByBone.set(b.index, sphere);
    }

    refs.requestRender();
  }, [model, textureMapByFile]);

  // Apply Pose, Morph Weights, Selection, and Display Toggles without recreating WebGL context
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs || !refs.skinnedMesh || !refs.currentModel) return;

    const { bones, restPositions, skinnedMesh, currentModel } = refs;

    // 1. Reset all bones to rest pose
    for (let i = 0; i < bones.length; i++) {
      bones[i].position.copy(restPositions[i]);
      bones[i].quaternion.set(0, 0, 0, 1);
    }

    // 2. Apply pose transforms
    if (pose) {
      for (const t of Object.values(pose.transforms)) {
        const bone = bones[t.boneIndex];
        if (!bone) continue;
        const rest = restPositions[t.boneIndex];
        bone.position.set(
          rest.x + t.translation[0],
          rest.y + t.translation[1],
          rest.z + t.translation[2]
        );
        bone.quaternion.set(t.quaternion[0], t.quaternion[1], t.quaternion[2], t.quaternion[3]).normalize();
      }

      // Run MMD-compatible IK solver for viewport preview when IK is enabled
      if (pose.ikEnabled) {
        solveModelIKOnBones(currentModel, bones);
      }
    }

    // 3. Apply morph target influences
    if (skinnedMesh.morphTargetDictionary && skinnedMesh.morphTargetInfluences) {
      skinnedMesh.morphTargetInfluences.fill(0);
      for (const [mName, weight] of Object.entries(morphWeights)) {
        const idx = skinnedMesh.morphTargetDictionary[mName];
        if (idx !== undefined) {
          skinnedMesh.morphTargetInfluences[idx] = weight;
        }
      }
    }

    // 4. Visibility & Render mode
    skinnedMesh.visible = renderMode !== 'skeleton';
    if (Array.isArray(skinnedMesh.material)) {
      skinnedMesh.material.forEach((m) => {
        (m as THREE.MeshStandardMaterial).wireframe = renderMode === 'wireframe';
      });
    }

    const showOverlayBones = showBones || renderMode === 'skeleton';
    if (refs.skeletonHelper) {
      refs.skeletonHelper.visible = showOverlayBones;
    }
    refs.jointMarkersGroup.visible = showOverlayBones;
    refs.gridHelper.visible = showGrid;
    refs.axesHelper.visible = showAxes;

    // 5. Bone selection & semantic category highlights + TransformControls attach
    const mappedCategoryByBone = new Map<number, BoneVisualCategory>();
    if (mapping) {
      for (const entry of Object.values(mapping.entries)) {
        if (entry.boneIndex !== null) {
          mappedCategoryByBone.set(entry.boneIndex, roleToCategory(entry.role));
        }
      }
    }

    refs.jointMarkerByBone.forEach((mesh, bIdx) => {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      const bSpec = currentModel.bones[bIdx];
      const cat: BoneVisualCategory = bSpec?.isIK
        ? 'ik'
        : mappedCategoryByBone.get(bIdx) ??
          skeleton?.boneDetails[bIdx]?.visualCategory ??
          'unknown';

      const baseScale = cat === 'finger' ? 0.65 : cat === 'ik' ? 1.25 : 1.0;
      if (bIdx === selectedBoneIndex) {
        mat.color.setHex(0xffffff);
        mesh.scale.setScalar(baseScale * 1.6);
      } else {
        mat.color.setHex(BONE_CATEGORY_COLORS[cat]);
        mesh.scale.setScalar(baseScale);
      }
    });

    if (selectedBoneIndex !== null && bones[selectedBoneIndex]) {
      const targetBone = bones[selectedBoneIndex];
      const boneSpec = currentModel.bones[selectedBoneIndex];
      const allowedMode =
        gizmoMode === 'translate' && !boneSpec?.translatable ? 'rotate' : gizmoMode;
      refs.transform.setMode(allowedMode);
      refs.transform.setSpace('local');
      refs.transform.attach(targetBone);
      refs.transform.enabled = true;
    } else {
      refs.transform.detach();
      refs.transform.enabled = false;
    }

    refs.requestRender();
  }, [
    skeleton,
    mapping,
    pose,
    morphWeights,
    selectedBoneIndex,
    showBones,
    showAxes,
    showGrid,
    renderMode,
    gizmoMode,
  ]);

  // Smooth camera preset transitions
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    const cfg = CAMERA_TARGETS[cameraPreset];
    refs.camTransition.pos.set(...cfg.pos);
    refs.camTransition.target.set(...cfg.target);
    refs.camTransition.active = true;
    refs.requestRender();
  }, [cameraPreset, cameraResetNonce]);

  return (
    <div
      ref={mountRef}
      data-testid="viewport-3d"
      data-model-name={model?.name ?? 'none'}
      data-pose-bones={pose ? Object.keys(pose.transforms).length : 0}
      className="relative w-full h-full overflow-hidden bg-[#0c1118]"
    >
      {showRefOverlay && refOverlayUrl && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 z-10"
          style={{ opacity: refOverlayOpacity }}
        >
          <img
            src={refOverlayUrl}
            alt="Reference silhouette overlay"
            referrerPolicy="no-referrer"
            className="max-h-full max-w-full object-contain rounded"
          />
        </div>
      )}

      {(showBones || renderMode === 'skeleton') && model && (
        <div
          data-testid="skeleton-legend"
          className="pointer-events-none absolute right-3 top-3 px-2.5 py-1.5 rounded bg-[#0E131B]/90 border border-[#253042] text-[10px] text-slate-300 grid grid-cols-2 gap-x-3 gap-y-1"
        >
          {(
            [
              ['head-neck', 'Head/Neck', '#a78bfa'],
              ['torso', 'Torso', '#38bdf8'],
              ['arm', 'Arms', '#34d399'],
              ['leg', 'Legs', '#2dd4bf'],
              ['finger', 'Fingers', '#67e8f9'],
              ['twist', 'Twist', '#f472b6'],
              ['ik', 'IK', '#f59e0b'],
              ['helper', 'Helper', '#94a3b8'],
              ['unknown', 'Unknown', '#fb7185'],
            ] as const
          ).map(([key, label, hex]) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: hex }}
              />
              <span>{label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
