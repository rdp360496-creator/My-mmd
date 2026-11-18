import type { Vec3 } from './types';

export type BuiltInModelPresetId = 'yuki-jp-apose' | 'aria-en-tpose' | 'kuro-custom-rig';

export interface BuiltInModelDescriptor {
  id: BuiltInModelPresetId;
  fileName: string;
  title: string;
  subtitle: string;
  restPoseLabel: string;
  namingStyle: string;
}

export const BUILTIN_MODEL_PRESETS: BuiltInModelDescriptor[] = [
  {
    id: 'yuki-jp-apose',
    fileName: 'yuki_standard_apose.pmx',
    title: 'Yuki Standard',
    subtitle: 'Japanese MMD Rig · 38° A-Pose · Full Fingers & Leg IK',
    restPoseLabel: 'A-Pose',
    namingStyle: 'Japanese Standard',
  },
  {
    id: 'aria-en-tpose',
    fileName: 'aria_studio_tpose.pmx',
    title: 'Aria Studio',
    subtitle: 'English Studio Rig · 0° T-Pose · Twist Bones & IK',
    restPoseLabel: 'T-Pose',
    namingStyle: 'English Standard',
  },
  {
    id: 'kuro-custom-rig',
    fileName: 'kuro_custom_rig.pmx',
    title: 'Kuro Stylize',
    subtitle: 'Custom Nonstandard Rig · 3-Finger · FK Legs · Long Bone Name',
    restPoseLabel: 'A-Pose',
    namingStyle: 'Custom Nonstandard',
  },
];

class BinaryWriter {
  private buf: Uint8Array;
  private view: DataView;
  public length = 0;

  constructor(initialCapacity = 16384) {
    this.buf = new Uint8Array(initialCapacity);
    this.view = new DataView(this.buf.buffer);
  }

  private grow(extra: number) {
    if (this.length + extra <= this.buf.length) return;
    let next = this.buf.length * 2;
    while (next < this.length + extra) next *= 2;
    const copy = new Uint8Array(next);
    copy.set(this.buf.subarray(0, this.length));
    this.buf = copy;
    this.view = new DataView(this.buf.buffer);
  }

  writeUint8(v: number) {
    this.grow(1);
    this.buf[this.length++] = v & 0xff;
  }

  writeUint16(v: number) {
    this.grow(2);
    this.view.setUint16(this.length, v, true);
    this.length += 2;
  }

  writeInt16(v: number) {
    this.grow(2);
    this.view.setInt16(this.length, v, true);
    this.length += 2;
  }

  writeInt32(v: number) {
    this.grow(4);
    this.view.setInt32(this.length, v, true);
    this.length += 4;
  }

  writeFloat32(v: number) {
    this.grow(4);
    this.view.setFloat32(this.length, v, true);
    this.length += 4;
  }

  writeVec2(x: number, y: number) {
    this.writeFloat32(x);
    this.writeFloat32(y);
  }

  writeVec3(v: Vec3) {
    this.writeFloat32(v[0]);
    this.writeFloat32(v[1]);
    this.writeFloat32(v[2]);
  }

  writeVec4(v: [number, number, number, number]) {
    this.writeFloat32(v[0]);
    this.writeFloat32(v[1]);
    this.writeFloat32(v[2]);
    this.writeFloat32(v[3]);
  }

  writeBytes(bytes: Uint8Array) {
    this.grow(bytes.length);
    this.buf.set(bytes, this.length);
    this.length += bytes.length;
  }

  writeAscii(str: string) {
    for (let i = 0; i < str.length; i++) {
      this.writeUint8(str.charCodeAt(i));
    }
  }

  writePMXTextUtf8(str: string) {
    const encoded = new TextEncoder().encode(str);
    this.writeInt32(encoded.length);
    this.writeBytes(encoded);
  }

  toArrayBuffer(): ArrayBuffer {
    return this.buf.slice(0, this.length).buffer;
  }
}

interface BoneSpec {
  name: string;
  en: string;
  pos: Vec3;
  parent: number;
  flags: number;
  tailBone?: number;
  tailOffset?: Vec3;
  inheritParent?: number;
  inheritRatio?: number;
  ikTarget?: number;
  ikLoops?: number;
  ikLimit?: number;
  ikLinks?: Array<{ boneIndex: number; hasLimits: boolean; min: Vec3; max: Vec3 }>;
}

interface VertexRec {
  pos: Vec3;
  norm: Vec3;
  uv: [number, number];
  b0: number;
  b1: number;
  w0: number;
  tag?: 'eyeL' | 'eyeR' | 'mouth' | 'browL' | 'browR';
}

interface MaterialRec {
  name: string;
  en: string;
  diffuse: [number, number, number, number];
  ambient: Vec3;
  faceCount: number;
}

function addBoxPart(
  verts: VertexRec[],
  indices: number[],
  center: Vec3,
  size: Vec3,
  bone0: number,
  bone1 = bone0,
  w0 = 1.0,
  tag?: VertexRec['tag']
): number {
  const startV = verts.length;
  const hx = size[0] / 2;
  const hy = size[1] / 2;
  const hz = size[2] / 2;
  const faces: Array<{ n: Vec3; corners: Vec3[] }> = [
    {
      n: [0, 0, 1],
      corners: [
        [-hx, -hy, hz],
        [hx, -hy, hz],
        [hx, hy, hz],
        [-hx, hy, hz],
      ],
    },
    {
      n: [0, 0, -1],
      corners: [
        [hx, -hy, -hz],
        [-hx, -hy, -hz],
        [-hx, hy, -hz],
        [hx, hy, -hz],
      ],
    },
    {
      n: [1, 0, 0],
      corners: [
        [hx, -hy, hz],
        [hx, -hy, -hz],
        [hx, hy, -hz],
        [hx, hy, hz],
      ],
    },
    {
      n: [-1, 0, 0],
      corners: [
        [-hx, -hy, -hz],
        [-hx, -hy, hz],
        [-hx, hy, hz],
        [-hx, hy, -hz],
      ],
    },
    {
      n: [0, 1, 0],
      corners: [
        [-hx, hy, hz],
        [hx, hy, hz],
        [hx, hy, -hz],
        [-hx, hy, -hz],
      ],
    },
    {
      n: [0, -1, 0],
      corners: [
        [-hx, -hy, -hz],
        [hx, -hy, -hz],
        [hx, -hy, hz],
        [-hx, -hy, hz],
      ],
    },
  ];

  const uvs: Array<[number, number]> = [
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ];

  let addedIndices = 0;
  for (const f of faces) {
    const base = verts.length;
    for (let i = 0; i < 4; i++) {
      const c = f.corners[i];
      verts.push({
        pos: [center[0] + c[0], center[1] + c[1], center[2] + c[2]],
        norm: f.n,
        uv: uvs[i],
        b0: bone0,
        b1: bone1,
        w0,
        tag,
      });
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    addedIndices += 6;
  }
  void startV;
  return addedIndices;
}

function addCapsuleLimb(
  verts: VertexRec[],
  indices: number[],
  pStart: Vec3,
  pEnd: Vec3,
  rStart: number,
  rEnd: number,
  segments: number,
  bone0: number,
  bone1: number
): number {
  const dx = pEnd[0] - pStart[0];
  const dy = pEnd[1] - pStart[1];
  const dz = pEnd[2] - pStart[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const dir: Vec3 = [dx / len, dy / len, dz / len];

  // Orthonormal basis around dir
  const ref: Vec3 = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const tx = dir[1] * ref[2] - dir[2] * ref[1];
  const ty = dir[2] * ref[0] - dir[0] * ref[2];
  const tz = dir[0] * ref[1] - dir[1] * ref[0];
  const tLen = Math.hypot(tx, ty, tz) || 1;
  const u: Vec3 = [tx / tLen, ty / tLen, tz / tLen];
  const v: Vec3 = [
    dir[1] * u[2] - dir[2] * u[1],
    dir[2] * u[0] - dir[0] * u[2],
    dir[0] * u[1] - dir[1] * u[0],
  ];

  const rings = 4;
  const baseIdx = verts.length;
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const rad = rStart * (1 - t) + rEnd * t;
    const cx = pStart[0] + dx * t;
    const cy = pStart[1] + dy * t;
    const cz = pStart[2] + dz * t;
    const weight0 = t < 0.7 ? 1 : 0.65;
    for (let s = 0; s < segments; s++) {
      const ang = (s / segments) * Math.PI * 2;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const nx = u[0] * ca + v[0] * sa;
      const ny = u[1] * ca + v[1] * sa;
      const nz = u[2] * ca + v[2] * sa;
      verts.push({
        pos: [cx + nx * rad, cy + ny * rad, cz + nz * rad],
        norm: [nx, ny, nz],
        uv: [s / segments, t],
        b0: bone0,
        b1: bone1,
        w0: weight0,
      });
    }
  }

  let added = 0;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const sNext = (s + 1) % segments;
      const i0 = baseIdx + r * segments + s;
      const i1 = baseIdx + r * segments + sNext;
      const i2 = baseIdx + (r + 1) * segments + sNext;
      const i3 = baseIdx + (r + 1) * segments + s;
      indices.push(i0, i1, i2, i0, i2, i3);
      added += 6;
    }
  }

  // Caps
  const capStartCenter = verts.length;
  verts.push({
    pos: pStart,
    norm: [-dir[0], -dir[1], -dir[2]],
    uv: [0.5, 0],
    b0: bone0,
    b1: bone1,
    w0: 1,
  });
  for (let s = 0; s < segments; s++) {
    const sNext = (s + 1) % segments;
    indices.push(capStartCenter, baseIdx + sNext, baseIdx + s);
    added += 3;
  }

  const capEndCenter = verts.length;
  verts.push({
    pos: pEnd,
    norm: dir,
    uv: [0.5, 1],
    b0: bone1,
    b1: bone0,
    w0: 1,
  });
  const topRing = baseIdx + rings * segments;
  for (let s = 0; s < segments; s++) {
    const sNext = (s + 1) % segments;
    indices.push(capEndCenter, topRing + s, topRing + sNext);
    added += 3;
  }

  return added;
}

export function buildSamplePMXBuffer(presetId: BuiltInModelPresetId): ArrayBuffer {
  const isTPose = presetId === 'aria-en-tpose';
  const isCustom = presetId === 'kuro-custom-rig';
  const isJP = presetId === 'yuki-jp-apose';

  // MMD scale: ~15.8 units tall (~158cm)
  const armDeg = isTPose ? 0 : 38;
  const armRad = (armDeg * Math.PI) / 180;
  const shoulderX = 1.45;
  const shoulderY = 12.95;
  const upperArmLen = 2.45;
  const forearmLen = 2.25;

  const elbowLX = shoulderX + Math.cos(armRad) * upperArmLen;
  const elbowLY = shoulderY - Math.sin(armRad) * upperArmLen;
  const wristLX = elbowLX + Math.cos(armRad) * forearmLen;
  const wristLY = elbowLY - Math.sin(armRad) * forearmLen;

  const bones: BoneSpec[] = [];
  const addBone = (spec: BoneSpec): number => {
    const idx = bones.length;
    bones.push(spec);
    return idx;
  };

  // Standard flags
  const ROT_VIS_EN = 0x0002 | 0x0008 | 0x0010;
  const ROT_TRANS_VIS_EN = 0x0002 | 0x0004 | 0x0008 | 0x0010;
  const BONE_TAIL = 0x0001;
  const IK_FLAG = 0x0020;

  // 0: All Parents / Root
  const idxRoot = addBone({
    name: isJP ? '全ての親' : isCustom ? 'ModelRoot' : 'Root',
    en: 'AllParents',
    pos: [0, 0, 0],
    parent: -1,
    flags: ROT_TRANS_VIS_EN,
    tailOffset: [0, 1, 0],
  });

  // 1: Center
  const idxCenter = addBone({
    name: isJP ? 'センター' : isCustom ? 'PelvisRoot' : 'Center',
    en: 'Center',
    pos: [0, 8.2, 0],
    parent: idxRoot,
    flags: ROT_TRANS_VIS_EN,
    tailOffset: [0, 1.0, 0],
  });

  // 2: Groove (JP & EN only)
  const idxGroove = !isCustom
    ? addBone({
        name: isJP ? 'グルーブ' : 'Groove',
        en: 'Groove',
        pos: [0, 8.4, 0],
        parent: idxCenter,
        flags: ROT_TRANS_VIS_EN,
        tailOffset: [0, 0.8, 0],
      })
    : idxCenter;

  // Lower body
  const idxLowerBody = addBone({
    name: isJP ? '下半身' : isCustom ? 'HipBase' : 'LowerBody',
    en: 'LowerBody',
    pos: [0, 9.2, 0],
    parent: idxGroove,
    flags: ROT_VIS_EN,
    tailOffset: [0, -1.2, 0],
  });

  // Upper body
  const idxUpperBody = addBone({
    name: isJP ? '上半身' : isCustom ? 'Spine_Core' : 'UpperBody',
    en: 'UpperBody',
    pos: [0, 9.5, 0],
    parent: idxGroove,
    flags: ROT_VIS_EN | BONE_TAIL,
    tailBone: -1,
  });

  const idxUpperBody2 = addBone({
    name: isJP ? '上半身2' : isCustom ? 'Chest_Upper' : 'UpperBody2',
    en: 'UpperBody2',
    pos: [0, 11.2, 0],
    parent: idxUpperBody,
    flags: ROT_VIS_EN | BONE_TAIL,
    tailBone: -1,
  });
  bones[idxUpperBody].tailBone = idxUpperBody2;

  const idxNeck = addBone({
    name: isJP ? '首' : isCustom ? 'Cervical' : 'Neck',
    en: 'Neck',
    pos: [0, 13.4, 0],
    parent: idxUpperBody2,
    flags: ROT_VIS_EN | BONE_TAIL,
    tailBone: -1,
  });
  bones[idxUpperBody2].tailBone = idxNeck;

  const idxHead = addBone({
    name: isJP ? '頭' : isCustom ? 'Skull' : 'Head',
    en: 'Head',
    pos: [0, 14.1, 0],
    parent: idxNeck,
    flags: ROT_VIS_EN,
    tailOffset: [0, 1.8, 0],
  });
  bones[idxNeck].tailBone = idxHead;

  const idxEyeL = addBone({
    name: isJP ? '左目' : 'Eye_L',
    en: 'Eye_L',
    pos: [0.42, 14.95, -0.82],
    parent: idxHead,
    flags: ROT_VIS_EN,
    tailOffset: [0, 0, -0.35],
  });
  const idxEyeR = addBone({
    name: isJP ? '右目' : 'Eye_R',
    en: 'Eye_R',
    pos: [-0.42, 14.95, -0.82],
    parent: idxHead,
    flags: ROT_VIS_EN,
    tailOffset: [0, 0, -0.35],
  });

  // Arms helper
  const buildArmSide = (side: 'L' | 'R') => {
    const sign = side === 'L' ? 1 : -1;
    const jpSide = side === 'L' ? '左' : '右';
    const enSide = `_${side}`;

    const sh = addBone({
      name: isJP ? `${jpSide}肩` : isCustom ? `Clavicle${enSide}` : `Shoulder${enSide}`,
      en: `Shoulder${enSide}`,
      pos: [sign * 0.55, 13.0, 0],
      parent: idxUpperBody2,
      flags: ROT_VIS_EN | BONE_TAIL,
      tailBone: -1,
    });

    const arm = addBone({
      name: isJP ? `${jpSide}腕` : isCustom ? `UpperArm${enSide}` : `Arm${enSide}`,
      en: `Arm${enSide}`,
      pos: [sign * shoulderX, shoulderY, 0],
      parent: sh,
      flags: ROT_VIS_EN | BONE_TAIL,
      tailBone: -1,
    });
    bones[sh].tailBone = arm;

    let armTwist = arm;
    if (!isCustom) {
      armTwist = addBone({
        name: isJP ? `${jpSide}腕捩` : `ArmTwist${enSide}`,
        en: `ArmTwist${enSide}`,
        pos: [
          sign * (shoulderX + (elbowLX - shoulderX) * 0.55),
          shoulderY + (elbowLY - shoulderY) * 0.55,
          0,
        ],
        parent: arm,
        flags: ROT_VIS_EN,
        tailOffset: [sign * Math.cos(armRad) * 0.4, -Math.sin(armRad) * 0.4, 0],
      });
    }

    const elbow = addBone({
      name: isJP ? `${jpSide}ひじ` : isCustom ? `Forearm${enSide}` : `Elbow${enSide}`,
      en: `Elbow${enSide}`,
      pos: [sign * elbowLX, elbowLY, 0.08],
      parent: armTwist,
      flags: ROT_VIS_EN | BONE_TAIL,
      tailBone: -1,
    });
    bones[arm].tailBone = elbow;

    let wristTwist = elbow;
    if (isJP) {
      wristTwist = addBone({
        name: `${jpSide}手捩`,
        en: `WristTwist${enSide}`,
        pos: [
          sign * (elbowLX + (wristLX - elbowLX) * 0.55),
          elbowLY + (wristLY - elbowLY) * 0.55,
          0.05,
        ],
        parent: elbow,
        flags: ROT_VIS_EN,
        tailOffset: [sign * Math.cos(armRad) * 0.35, -Math.sin(armRad) * 0.35, 0],
      });
    }

    const wrist = addBone({
      name: isJP ? `${jpSide}手首` : isCustom ? `Hand${enSide}` : `Wrist${enSide}`,
      en: `Wrist${enSide}`,
      pos: [sign * wristLX, wristLY, 0],
      parent: wristTwist,
      flags: ROT_VIS_EN,
      tailOffset: [sign * Math.cos(armRad) * 0.75, -Math.sin(armRad) * 0.75, 0],
    });
    bones[elbow].tailBone = wrist;

    // Fingers
    const dx = sign * Math.cos(armRad);
    const dy = -Math.sin(armRad);
    if (isCustom) {
      // Stylized 3-finger hand + long >15-byte custom bone
      addBone({
        name: `Thumb${enSide}`,
        en: `Thumb${enSide}`,
        pos: [sign * (wristLX + 0.15), wristLY - 0.1, -0.18],
        parent: wrist,
        flags: ROT_VIS_EN,
        tailOffset: [dx * 0.35, dy * 0.35, -0.25],
      });
      addBone({
        name: `Index${enSide}`,
        en: `Index${enSide}`,
        pos: [sign * wristLX + dx * 0.55, wristLY + dy * 0.55, -0.12],
        parent: wrist,
        flags: ROT_VIS_EN,
        tailOffset: [dx * 0.45, dy * 0.45, 0],
      });
      addBone({
        name: `OtherFingers${enSide}`,
        en: `OtherFingers${enSide}`,
        pos: [sign * wristLX + dx * 0.55, wristLY + dy * 0.55, 0.08],
        parent: wrist,
        flags: ROT_VIS_EN,
        tailOffset: [dx * 0.45, dy * 0.45, 0],
      });
    } else {
      const fNames = isJP
        ? [
            ['親指０', '親指１', '親指２'],
            ['人指１', '人指２', '人指３'],
            ['中指１', '中指２', '中指３'],
            ['薬指１', '薬指２', '薬指３'],
            ['小指１', '小指２', '小指３'],
          ]
        : [
            ['Thumb0', 'Thumb1', 'Thumb2'],
            ['Index1', 'Index2', 'Index3'],
            ['Middle1', 'Middle2', 'Middle3'],
            ['Ring1', 'Ring2', 'Ring3'],
            ['Pinky1', 'Pinky2', 'Pinky3'],
          ];
      const fZ = [-0.22, -0.14, -0.04, 0.06, 0.16];
      for (let f = 0; f < 5; f++) {
        let p = wrist;
        for (let seg = 0; seg < 3; seg++) {
          const dist = (f === 0 ? 0.18 : 0.52) + seg * 0.22;
          const bName = isJP ? `${jpSide}${fNames[f][seg]}` : `${fNames[f][seg]}${enSide}`;
          p = addBone({
            name: bName,
            en: `${['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'][f]}${seg + (f === 0 ? 0 : 1)}${enSide}`,
            pos: [
              sign * wristLX + dx * dist,
              wristLY + dy * dist - (f === 0 ? 0.1 : 0),
              fZ[f],
            ],
            parent: p,
            flags: ROT_VIS_EN,
            tailOffset: [dx * 0.2, dy * 0.2, f === 0 ? -0.08 : 0],
          });
        }
      }
    }

    return { sh, arm, elbow, wrist };
  };

  const armL = buildArmSide('L');
  const armR = buildArmSide('R');

  // Legs helper
  const buildLegSide = (side: 'L' | 'R') => {
    const sign = side === 'L' ? 1 : -1;
    const jpSide = side === 'L' ? '左' : '右';
    const enSide = `_${side}`;

    const leg = addBone({
      name: isJP ? `${jpSide}足` : isCustom ? `Thigh${enSide}` : `Leg${enSide}`,
      en: `Leg${enSide}`,
      pos: [sign * 0.9, 8.75, 0],
      parent: idxLowerBody,
      flags: ROT_VIS_EN | BONE_TAIL,
      tailBone: -1,
    });

    const knee = addBone({
      name: isJP ? `${jpSide}ひざ` : isCustom ? `Shin${enSide}` : `Knee${enSide}`,
      en: `Knee${enSide}`,
      pos: [sign * 0.9, 4.75, -0.05],
      parent: leg,
      flags: ROT_VIS_EN | BONE_TAIL,
      tailBone: -1,
    });
    bones[leg].tailBone = knee;

    const ankle = addBone({
      name: isJP ? `${jpSide}足首` : isCustom ? `Foot${enSide}` : `Ankle${enSide}`,
      en: `Ankle${enSide}`,
      pos: [sign * 0.9, 0.85, 0.05],
      parent: knee,
      flags: ROT_VIS_EN | BONE_TAIL,
      tailBone: -1,
    });
    bones[knee].tailBone = ankle;

    const toe = addBone({
      name: isJP ? `${jpSide}つま先` : isCustom ? `ToeTip${enSide}` : `Toe${enSide}`,
      en: `Toe${enSide}`,
      pos: [sign * 0.9, 0.05, -0.95],
      parent: ankle,
      flags: ROT_VIS_EN,
      tailOffset: [0, 0, -0.4],
    });
    bones[ankle].tailBone = toe;

    if (!isCustom) {
      const legIk = addBone({
        name: isJP ? `${jpSide}足ＩＫ` : `LegIK${enSide}`,
        en: `LegIK${enSide}`,
        pos: [sign * 0.9, 0.85, 0.05],
        parent: idxRoot,
        flags: ROT_TRANS_VIS_EN | IK_FLAG,
        tailOffset: [0, 0, 0.9],
        ikTarget: ankle,
        ikLoops: 40,
        ikLimit: 2.0,
        ikLinks: [
          {
            boneIndex: knee,
            hasLimits: true,
            minAngle: [-Math.PI, 0, 0] as unknown as Vec3,
            min: [-Math.PI, 0, 0],
            max: [-0.01, 0, 0],
          } as unknown as { boneIndex: number; hasLimits: boolean; min: Vec3; max: Vec3 },
          {
            boneIndex: leg,
            hasLimits: false,
            min: [0, 0, 0],
            max: [0, 0, 0],
          },
        ],
      });

      addBone({
        name: isJP ? `${jpSide}つま先ＩＫ` : `ToeIK${enSide}`,
        en: `ToeIK${enSide}`,
        pos: [sign * 0.9, 0.05, -0.95],
        parent: legIk,
        flags: ROT_TRANS_VIS_EN | IK_FLAG,
        tailOffset: [0, -0.5, 0],
        ikTarget: toe,
        ikLoops: 3,
        ikLimit: 4.0,
        ikLinks: [
          {
            boneIndex: ankle,
            hasLimits: false,
            min: [0, 0, 0],
            max: [0, 0, 0],
          },
        ],
      });
    }

    return { leg, knee, ankle, toe };
  };

  const legL = buildLegSide('L');
  const legR = buildLegSide('R');

  // Optional extra custom accessory bone with >15-byte name on Kuro to test VMD byte-limit checker
  if (isCustom) {
    addBone({
      name: 'Custom_Accessory_Ribbon_LongName',
      en: 'Custom_Accessory_Ribbon_LongName',
      pos: [0, 12.6, 0.75],
      parent: idxUpperBody2,
      flags: ROT_VIS_EN,
      tailOffset: [0, -1.4, 0.4],
    });
  }

  // Build character geometry across stylized materials
  const verts: VertexRec[] = [];
  const indices: number[] = [];
  const materials: MaterialRec[] = [];

  const pushMat = (name: string, en: string, diffuse: [number, number, number, number], count: number) => {
    materials.push({
      name,
      en,
      diffuse,
      ambient: [diffuse[0] * 0.55, diffuse[1] * 0.55, diffuse[2] * 0.55],
      faceCount: count,
    });
  };

  // 1. Skin (Head, neck, hands)
  let cSkin = 0;
  cSkin += addBoxPart(verts, indices, [0, 14.95, 0], [1.65, 1.85, 1.55], idxHead); // Head
  cSkin += addCapsuleLimb(verts, indices, [0, 13.35, 0], [0, 14.1, 0], 0.42, 0.38, 10, idxNeck, idxHead); // Neck
  cSkin += addBoxPart(verts, indices, [wristLX + Math.cos(armRad) * 0.42, wristLY - Math.sin(armRad) * 0.42, 0], [0.85, 0.24, 0.55], armL.wrist);
  cSkin += addBoxPart(verts, indices, [-wristLX - Math.cos(armRad) * 0.42, wristLY - Math.sin(armRad) * 0.42, 0], [0.85, 0.24, 0.55], armR.wrist);
  // Thigh skin gap
  cSkin += addCapsuleLimb(verts, indices, [0.9, 6.2, 0], [0.9, 4.75, -0.05], 0.48, 0.42, 10, legL.leg, legL.knee);
  cSkin += addCapsuleLimb(verts, indices, [-0.9, 6.2, 0], [-0.9, 4.75, -0.05], 0.48, 0.42, 10, legR.leg, legR.knee);
  pushMat('肌', 'Skin', [0.98, 0.87, 0.81, 1], cSkin);

  // 2. Hair (Distinctive silhouette per preset)
  const hairCol: [number, number, number, number] = isJP
    ? [0.16, 0.68, 0.78, 1] // Cyan-teal MMD twin-tails
    : isCustom
      ? [0.18, 0.19, 0.25, 1] // Obsidian bob
      : [0.85, 0.58, 0.36, 1]; // Warm studio amber-blonde
  let cHair = 0;
  cHair += addBoxPart(verts, indices, [0, 15.65, 0.12], [1.84, 0.75, 1.78], idxHead); // Crown
  cHair += addBoxPart(verts, indices, [0, 14.75, 0.78], [1.75, 1.9, 0.42], idxHead); // Back hair
  if (isJP) {
    cHair += addCapsuleLimb(verts, indices, [1.05, 15.3, 0.3], [1.65, 10.6, 0.55], 0.34, 0.22, 8, idxHead, idxUpperBody2);
    cHair += addCapsuleLimb(verts, indices, [-1.05, 15.3, 0.3], [-1.65, 10.6, 0.55], 0.34, 0.22, 8, idxHead, idxUpperBody2);
  } else {
    cHair += addBoxPart(verts, indices, [0.95, 14.6, 0.1], [0.28, 1.65, 1.15], idxHead);
    cHair += addBoxPart(verts, indices, [-0.95, 14.6, 0.1], [0.28, 1.65, 1.15], idxHead);
  }
  pushMat('髪', 'Hair', hairCol, cHair);

  // 3. Eyes & Mouth (with vertex tags for facial morph targets!)
  let cFace = 0;
  cFace += addBoxPart(verts, indices, [0.42, 14.98, -0.79], [0.36, 0.34, 0.06], idxHead, idxHead, 1, 'eyeL');
  cFace += addBoxPart(verts, indices, [-0.42, 14.98, -0.79], [0.36, 0.34, 0.06], idxHead, idxHead, 1, 'eyeR');
  cFace += addBoxPart(verts, indices, [0.42, 15.32, -0.8], [0.42, 0.07, 0.05], idxHead, idxHead, 1, 'browL');
  cFace += addBoxPart(verts, indices, [-0.42, 15.32, -0.8], [0.42, 0.07, 0.05], idxHead, idxHead, 1, 'browR');
  cFace += addBoxPart(verts, indices, [0, 14.42, -0.79], [0.34, 0.08, 0.06], idxHead, idxHead, 1, 'mouth');
  pushMat('顔パーツ', 'FacialFeatures', [0.14, 0.18, 0.26, 1], cFace);

  // 4. Outfit Upper (Jacket / Bodice + Sleeves)
  const topCol: [number, number, number, number] = isJP
    ? [0.88, 0.91, 0.95, 1]
    : isCustom
      ? [0.22, 0.25, 0.32, 1]
      : [0.28, 0.42, 0.62, 1];
  let cTop = 0;
  cTop += addBoxPart(verts, indices, [0, 12.25, 0], [2.45, 2.15, 1.32], idxUpperBody2, idxUpperBody, 0.85);
  cTop += addBoxPart(verts, indices, [0, 10.35, 0], [2.05, 1.85, 1.18], idxUpperBody, idxLowerBody, 0.8);
  // Upper arms & forearms
  cTop += addCapsuleLimb(verts, indices, [shoulderX, shoulderY, 0], [elbowLX, elbowLY, 0.08], 0.38, 0.32, 10, armL.arm, armL.elbow);
  cTop += addCapsuleLimb(verts, indices, [elbowLX, elbowLY, 0.08], [wristLX, wristLY, 0], 0.31, 0.24, 10, armL.elbow, armL.wrist);
  cTop += addCapsuleLimb(verts, indices, [-shoulderX, shoulderY, 0], [-elbowLX, elbowLY, 0.08], 0.38, 0.32, 10, armR.arm, armR.elbow);
  cTop += addCapsuleLimb(verts, indices, [-elbowLX, elbowLY, 0.08], [-wristLX, wristLY, 0], 0.31, 0.24, 10, armR.elbow, armR.wrist);
  pushMat('衣装上', 'OutfitTop', topCol, cTop);

  // 5. Outfit Lower (Skirt / Trousers & Accent Tie)
  const skirtCol: [number, number, number, number] = isJP
    ? [0.14, 0.17, 0.24, 1]
    : isCustom
      ? [0.58, 0.16, 0.22, 1]
      : [0.16, 0.2, 0.27, 1];
  let cLower = 0;
  cLower += addBoxPart(verts, indices, [0, 8.85, 0], [2.35, 1.4, 1.45], idxLowerBody);
  cLower += addCapsuleLimb(verts, indices, [0.9, 8.75, 0], [0.9, 6.2, 0], 0.58, 0.49, 10, legL.leg, legL.knee);
  cLower += addCapsuleLimb(verts, indices, [-0.9, 8.75, 0], [-0.9, 6.2, 0], 0.58, 0.49, 10, legR.leg, legR.knee);
  // Collar tie
  cLower += addBoxPart(verts, indices, [0, 12.45, -0.72], [0.32, 1.35, 0.14], idxUpperBody2);
  pushMat('衣装下', 'OutfitLower', skirtCol, cLower);

  // 6. Boots
  let cBoots = 0;
  cBoots += addCapsuleLimb(verts, indices, [0.9, 4.75, -0.05], [0.9, 0.85, 0.05], 0.44, 0.36, 10, legL.knee, legL.ankle);
  cBoots += addCapsuleLimb(verts, indices, [-0.9, 4.75, -0.05], [-0.9, 0.85, 0.05], 0.44, 0.36, 10, legR.knee, legR.ankle);
  cBoots += addBoxPart(verts, indices, [0.9, 0.42, -0.36], [0.76, 0.84, 1.45], legL.ankle, legL.toe, 0.85);
  cBoots += addBoxPart(verts, indices, [-0.9, 0.42, -0.36], [0.76, 0.84, 1.45], legR.ankle, legR.toe, 0.85);
  pushMat('靴', 'Boots', [0.11, 0.13, 0.18, 1], cBoots);

  // Build facial morphs targeting tagged face vertices
  interface MorphSpec {
    name: string;
    en: string;
    panel: number; // 1=eyebrow, 2=eye, 3=mouth, 4=other
    offsets: Array<{ vIdx: number; d: Vec3 }>;
  }

  const collectVerts = (tag: VertexRec['tag']) =>
    verts.map((v, i) => (v.tag === tag ? i : -1)).filter((i) => i >= 0);

  const eyeLV = collectVerts('eyeL');
  const eyeRV = collectVerts('eyeR');
  const mouthV = collectVerts('mouth');
  const browLV = collectVerts('browL');
  const browRV = collectVerts('browR');

  const scaleTagY = (vIndices: number[], centerY: number, scaleDelta: number, shiftY = 0) =>
    vIndices.map((vIdx) => ({
      vIdx,
      d: [0, (verts[vIdx].pos[1] - centerY) * scaleDelta + shiftY, 0] as Vec3,
    }));

  const morphs: MorphSpec[] = [
    {
      name: isJP ? 'まばたき' : isCustom ? 'EyesClosed' : 'Blink',
      en: 'Blink',
      panel: 2,
      offsets: [...scaleTagY(eyeLV, 14.98, -0.88), ...scaleTagY(eyeRV, 14.98, -0.88)],
    },
    {
      name: isJP ? 'ウィンク' : isCustom ? 'WinkLeft' : 'WinkL',
      en: 'WinkL',
      panel: 2,
      offsets: scaleTagY(eyeLV, 14.98, -0.88),
    },
    {
      name: isJP ? 'ウィンク右' : isCustom ? 'WinkRight' : 'WinkR',
      en: 'WinkR',
      panel: 2,
      offsets: scaleTagY(eyeRV, 14.98, -0.88),
    },
    {
      name: isJP ? '笑い' : isCustom ? 'HappyEyes' : 'Smile',
      en: 'Smile',
      panel: 2,
      offsets: [
        ...scaleTagY(eyeLV, 14.98, -0.72, 0.04),
        ...scaleTagY(eyeRV, 14.98, -0.72, 0.04),
        ...mouthV.map((vIdx) => ({
          vIdx,
          d: [verts[vIdx].pos[0] * 0.35, 0.04, 0] as Vec3,
        })),
      ],
    },
    {
      name: isJP ? 'あ' : isCustom ? 'MouthOpen' : 'MouthA',
      en: 'A',
      panel: 3,
      offsets: scaleTagY(mouthV, 14.42, 2.2, -0.04),
    },
    {
      name: isJP ? 'い' : 'MouthI',
      en: 'I',
      panel: 3,
      offsets: mouthV.map((vIdx) => ({
        vIdx,
        d: [verts[vIdx].pos[0] * 0.45, 0, 0] as Vec3,
      })),
    },
    {
      name: isJP ? 'お' : 'MouthO',
      en: 'O',
      panel: 3,
      offsets: scaleTagY(mouthV, 14.42, 1.6, -0.02),
    },
    {
      name: isJP ? 'にこり' : isCustom ? 'HappyMouth' : 'Grin',
      en: 'Happy',
      panel: 3,
      offsets: mouthV.map((vIdx) => ({
        vIdx,
        d: [verts[vIdx].pos[0] * 0.4, 0.05, 0] as Vec3,
      })),
    },
    {
      name: isJP ? '困る' : 'Sad',
      en: 'Sad',
      panel: 1,
      offsets: [
        ...browLV.map((vIdx) => ({ vIdx, d: [0, verts[vIdx].pos[0] < 0.42 ? 0.06 : -0.05, 0] as Vec3 })),
        ...browRV.map((vIdx) => ({ vIdx, d: [0, verts[vIdx].pos[0] > -0.42 ? 0.06 : -0.05, 0] as Vec3 })),
      ],
    },
    {
      name: isJP ? '怒り' : isCustom ? 'BrowsDown' : 'Angry',
      en: 'Angry',
      panel: 1,
      offsets: [
        ...browLV.map((vIdx) => ({ vIdx, d: [0, -0.08, 0] as Vec3 })),
        ...browRV.map((vIdx) => ({ vIdx, d: [0, -0.08, 0] as Vec3 })),
      ],
    },
    {
      name: isJP ? '上' : 'BrowUp',
      en: 'Up',
      panel: 1,
      offsets: [
        ...browLV.map((vIdx) => ({ vIdx, d: [0, 0.1, 0] as Vec3 })),
        ...browRV.map((vIdx) => ({ vIdx, d: [0, 0.1, 0] as Vec3 })),
      ],
    },
  ];

  // Serialize to binary PMX 2.0 (UTF-8, index size 2)
  const w = new BinaryWriter();
  w.writeAscii('PMX ');
  w.writeFloat32(2.0);
  w.writeUint8(8); // globals count
  w.writeUint8(1); // UTF-8
  w.writeUint8(0); // additional vec4
  w.writeUint8(2); // vertex index size (uint16)
  w.writeUint8(1); // texture index size
  w.writeUint8(1); // material index size
  w.writeUint8(2); // bone index size (int16)
  w.writeUint8(2); // morph index size
  w.writeUint8(1); // rigid body index size

  const meta = BUILTIN_MODEL_PRESETS.find((p) => p.id === presetId)!;
  w.writePMXTextUtf8(meta.title);
  w.writePMXTextUtf8(meta.title);
  w.writePMXTextUtf8(meta.subtitle);
  w.writePMXTextUtf8(meta.subtitle);

  // Vertices
  w.writeInt32(verts.length);
  for (const v of verts) {
    w.writeVec3(v.pos);
    w.writeVec3(v.norm);
    w.writeVec2(v.uv[0], v.uv[1]);
    if (v.w0 >= 0.999 || v.b0 === v.b1) {
      w.writeUint8(0); // BDEF1
      w.writeInt16(v.b0);
    } else {
      w.writeUint8(1); // BDEF2
      w.writeInt16(v.b0);
      w.writeInt16(v.b1);
      w.writeFloat32(v.w0);
    }
    w.writeFloat32(1.0); // edge scale
  }

  // Indices
  w.writeInt32(indices.length);
  for (const idx of indices) {
    w.writeUint16(idx);
  }

  // Textures (0)
  w.writeInt32(0);

  // Materials
  w.writeInt32(materials.length);
  for (const m of materials) {
    w.writePMXTextUtf8(m.name);
    w.writePMXTextUtf8(m.en);
    w.writeVec4(m.diffuse);
    w.writeVec3([0.25, 0.25, 0.25]);
    w.writeFloat32(8.0);
    w.writeVec3(m.ambient);
    w.writeUint8(0x1f);
    w.writeVec4([0.04, 0.06, 0.1, 1.0]);
    w.writeFloat32(0.8);
    w.writeUint8(0xff); // tex -1
    w.writeUint8(0xff); // sphere -1
    w.writeUint8(0);
    w.writeUint8(1);
    w.writeUint8(0);
    w.writePMXTextUtf8('');
    w.writeInt32(m.faceCount);
  }

  // Bones
  w.writeInt32(bones.length);
  for (const b of bones) {
    w.writePMXTextUtf8(b.name);
    w.writePMXTextUtf8(b.en);
    w.writeVec3(b.pos);
    w.writeInt16(b.parent);
    w.writeInt32(0); // deform layer
    w.writeUint16(b.flags);
    if ((b.flags & 0x0001) !== 0) {
      w.writeInt16(b.tailBone ?? -1);
    } else {
      w.writeVec3(b.tailOffset ?? [0, 0.5, 0]);
    }
    if ((b.flags & 0x0100) !== 0 || (b.flags & 0x0200) !== 0) {
      w.writeInt16(b.inheritParent ?? -1);
      w.writeFloat32(b.inheritRatio ?? 0);
    }
    if ((b.flags & 0x0020) !== 0) {
      w.writeInt16(b.ikTarget ?? -1);
      w.writeInt32(b.ikLoops ?? 40);
      w.writeFloat32(b.ikLimit ?? 2.0);
      const links = b.ikLinks ?? [];
      w.writeInt32(links.length);
      for (const lk of links) {
        w.writeInt16(lk.boneIndex);
        w.writeUint8(lk.hasLimits ? 1 : 0);
        if (lk.hasLimits) {
          w.writeVec3(lk.min);
          w.writeVec3(lk.max);
        }
      }
    }
  }

  // Morphs
  w.writeInt32(morphs.length);
  for (const m of morphs) {
    w.writePMXTextUtf8(m.name);
    w.writePMXTextUtf8(m.en);
    w.writeUint8(m.panel);
    w.writeUint8(1); // vertex morph
    w.writeInt32(m.offsets.length);
    for (const o of m.offsets) {
      w.writeUint16(o.vIdx);
      w.writeVec3(o.d);
    }
  }

  // Display frames (0) + Rigid bodies (0) + Joints (0)
  w.writeInt32(0);
  w.writeInt32(0);
  w.writeInt32(0);

  return w.toArrayBuffer();
}
