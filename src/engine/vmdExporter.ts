import { threeQuatToMmd, threeVecToMmd } from './mmdCoordinates';
import { decodeShiftJIS, encodeFixedShiftJIS, validateVMDName } from './shiftJis';
import type { PMXModelData, Quat4, RetargetedPose, Vec3 } from './types';

export interface VMDNameValidationItem {
  kind: 'bone' | 'morph';
  name: string;
  byteLength: number;
  valid: boolean;
  reason?: string;
}

export interface VMDExportOptions {
  poseName?: string;
  mode: 'full' | 'face';
  frameNumber?: number;
  allowSkipLongNames?: boolean;
}

export interface VMDExportResult {
  bytes: Uint8Array;
  fileName: string;
  boneFrames: number;
  morphFrames: number;
  warnings: string[];
  errors: string[];
  validationItems: VMDNameValidationItem[];
}

export interface ParsedVMDBoneFrame {
  boneName: string;
  frame: number;
  position: Vec3;
  quaternion: Quat4;
}

export interface ParsedVMDMorphFrame {
  morphName: string;
  frame: number;
  weight: number;
}

export interface ParsedVMD {
  header: string;
  modelName: string;
  boneFrames: ParsedVMDBoneFrame[];
  morphFrames: ParsedVMDMorphFrame[];
}

// Standard linear/smooth MMD Bezier interpolation block (64 bytes)
function createDefaultBezierInterpolation(): Uint8Array {
  const interp = new Uint8Array(64);
  for (let i = 0; i < 16; i++) {
    interp[i] = 20;
    interp[i + 16] = 20;
    interp[i + 32] = 107;
    interp[i + 48] = 107;
  }
  return interp;
}

export function validateModelNamesForVMD(
  model: PMXModelData,
  pose: RetargetedPose,
  morphWeights: Record<string, number>
): VMDNameValidationItem[] {
  const items: VMDNameValidationItem[] = [];

  for (const key of Object.keys(pose.transforms)) {
    const t = pose.transforms[Number(key)];
    if (!t) continue;
    const bone = model.bones[t.boneIndex];
    if (!bone) continue;
    const hasTrans = Math.hypot(t.translation[0], t.translation[1], t.translation[2]) > 1e-5;
    const hasRot =
      Math.abs(t.quaternion[0]) > 1e-5 ||
      Math.abs(t.quaternion[1]) > 1e-5 ||
      Math.abs(t.quaternion[2]) > 1e-5;
    if (!hasTrans && !hasRot && bone.index !== 1) continue;

    const v = validateVMDName(bone.name, 15);
    items.push({
      kind: 'bone',
      name: bone.name,
      byteLength: v.byteLength,
      valid: v.valid,
      reason: v.reason,
    });
  }

  for (const [morphName, weight] of Object.entries(morphWeights)) {
    if (Math.abs(weight) <= 1e-4) continue;
    const v = validateVMDName(morphName, 15);
    items.push({
      kind: 'morph',
      name: morphName,
      byteLength: v.byteLength,
      valid: v.valid,
      reason: v.reason,
    });
  }

  return items;
}

export function auditEntireModelNamesForVMD(model: PMXModelData): VMDNameValidationItem[] {
  const invalidItems: VMDNameValidationItem[] = [];
  for (const bone of model.bones) {
    const v = validateVMDName(bone.name, 15);
    if (!v.valid) {
      invalidItems.push({
        kind: 'bone',
        name: bone.name,
        byteLength: v.byteLength,
        valid: false,
        reason: v.reason,
      });
    }
  }
  for (const morph of model.morphs) {
    const v = validateVMDName(morph.name, 15);
    if (!v.valid) {
      invalidItems.push({
        kind: 'morph',
        name: morph.name,
        byteLength: v.byteLength,
        valid: false,
        reason: v.reason,
      });
    }
  }
  return invalidItems;
}

export function exportVMD(
  model: PMXModelData,
  pose: RetargetedPose,
  morphWeights: Record<string, number>,
  options: VMDExportOptions
): VMDExportResult {
  const poseName = options.poseName || 'Pose_01';
  const frame = options.frameNumber ?? 0;
  const warnings: string[] = [];
  const errors: string[] = [];
  const validationItems = validateModelNamesForVMD(model, pose, morphWeights);

  const boneEntries: Array<{ name: string; pos: Vec3; quat: Quat4 }> = [];
  if (options.mode === 'full') {
    for (const key of Object.keys(pose.transforms)) {
      const t = pose.transforms[Number(key)];
      if (!t) continue;
      const bone = model.bones[t.boneIndex];
      if (!bone) continue;

      const mmdPos = bone.translatable ? threeVecToMmd(t.translation) : ([0, 0, 0] as Vec3);
      const mmdQuat = bone.rotatable ? threeQuatToMmd(t.quaternion) : ([0, 0, 0, 1] as Quat4);

      const hasTrans = Math.hypot(mmdPos[0], mmdPos[1], mmdPos[2]) > 1e-5;
      const hasRot =
        Math.abs(mmdQuat[0]) > 1e-5 ||
        Math.abs(mmdQuat[1]) > 1e-5 ||
        Math.abs(mmdQuat[2]) > 1e-5;
      if (!hasTrans && !hasRot && bone.index !== 1) continue;

      const nameCheck = validateVMDName(bone.name, 15);
      if (!nameCheck.valid) {
        if (options.allowSkipLongNames) {
          warnings.push(`Skipped bone "${bone.name}": ${nameCheck.reason}`);
          continue;
        } else {
          errors.push(`Cannot export bone "${bone.name}" to VMD: ${nameCheck.reason}`);
          continue;
        }
      }

      boneEntries.push({ name: bone.name, pos: mmdPos, quat: mmdQuat });
    }
  }

  const morphEntries: Array<{ name: string; weight: number }> = [];
  for (const [morphName, weight] of Object.entries(morphWeights)) {
    if (Math.abs(weight) <= 1e-4) continue;
    const exists = model.morphs.some((m) => m.name === morphName);
    if (!exists) {
      warnings.push(`Skipped morph "${morphName}": not found on target model.`);
      continue;
    }
    const nameCheck = validateVMDName(morphName, 15);
    if (!nameCheck.valid) {
      if (options.allowSkipLongNames) {
        warnings.push(`Skipped morph "${morphName}": ${nameCheck.reason}`);
        continue;
      } else {
        errors.push(`Cannot export morph "${morphName}" to VMD: ${nameCheck.reason}`);
        continue;
      }
    }
    morphEntries.push({ name: morphName, weight });
  }

  // Binary layout:
  // Header: 30 bytes ("Vocaloid Motion Data 0002\0...")
  // Model Name: 20 bytes (Shift_JIS)
  // Bone Count: 4 bytes + 111 bytes * boneCount
  // Morph Count: 4 bytes + 23 bytes * morphCount
  // Camera/Light/Shadow/IK counts: 4 * 4 = 16 bytes (all 0)
  const totalSize =
    30 + 20 + 4 + boneEntries.length * 111 + 4 + morphEntries.length * 23 + 16;
  const buffer = new ArrayBuffer(totalSize);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let offset = 0;

  // 30-byte magic header
  const headerStr = 'Vocaloid Motion Data 0002';
  for (let i = 0; i < headerStr.length; i++) {
    bytes[offset + i] = headerStr.charCodeAt(i);
  }
  offset += 30;

  // 20-byte model name
  const modelNameEnc = encodeFixedShiftJIS(model.name, 20);
  bytes.set(modelNameEnc.bytes, offset);
  offset += 20;

  // Bone keyframes
  view.setUint32(offset, boneEntries.length, true);
  offset += 4;
  const defaultInterp = createDefaultBezierInterpolation();

  for (const b of boneEntries) {
    const boneNameEnc = encodeFixedShiftJIS(b.name, 15);
    bytes.set(boneNameEnc.bytes, offset);
    offset += 15;

    view.setUint32(offset, frame, true);
    offset += 4;

    view.setFloat32(offset, b.pos[0], true);
    view.setFloat32(offset + 4, b.pos[1], true);
    view.setFloat32(offset + 8, b.pos[2], true);
    offset += 12;

    view.setFloat32(offset, b.quat[0], true);
    view.setFloat32(offset + 4, b.quat[1], true);
    view.setFloat32(offset + 8, b.quat[2], true);
    view.setFloat32(offset + 12, b.quat[3], true);
    offset += 16;

    bytes.set(defaultInterp, offset);
    offset += 64;
  }

  // Morph keyframes
  view.setUint32(offset, morphEntries.length, true);
  offset += 4;
  for (const m of morphEntries) {
    const morphNameEnc = encodeFixedShiftJIS(m.name, 15);
    bytes.set(morphNameEnc.bytes, offset);
    offset += 15;

    view.setUint32(offset, frame, true);
    offset += 4;

    view.setFloat32(offset, m.weight, true);
    offset += 4;
  }

  // Camera (0), Light (0), SelfShadow (0), IK Show/Hide (0)
  offset += 16;

  const safeBase = poseName.replace(/[^\w\-一-龯ぁ-んァ-ヶ]/g, '_') || 'Pose_01';
  const suffix = options.mode === 'face' ? '_Face.vmd' : '_Full.vmd';

  return {
    bytes,
    fileName: `${safeBase}${suffix}`,
    boneFrames: boneEntries.length,
    morphFrames: morphEntries.length,
    warnings,
    errors,
    validationItems,
  };
}

export function parseVMD(bytes: Uint8Array): ParsedVMD {
  if (bytes.length < 54) {
    throw new Error('Invalid VMD file: smaller than minimum header size.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  const headerRaw = decodeShiftJIS(bytes.subarray(0, 30));
  if (!headerRaw.startsWith('Vocaloid Motion Data')) {
    throw new Error(`Invalid VMD magic header "${headerRaw}".`);
  }
  offset += 30;

  const modelName = decodeShiftJIS(bytes.subarray(offset, offset + 20));
  offset += 20;

  const boneCount = view.getUint32(offset, true);
  offset += 4;
  const boneFrames: ParsedVMDBoneFrame[] = [];
  for (let i = 0; i < boneCount; i++) {
    const boneName = decodeShiftJIS(bytes.subarray(offset, offset + 15));
    offset += 15;
    const frame = view.getUint32(offset, true);
    offset += 4;
    const px = view.getFloat32(offset, true);
    const py = view.getFloat32(offset + 4, true);
    const pz = view.getFloat32(offset + 8, true);
    offset += 12;
    const qx = view.getFloat32(offset, true);
    const qy = view.getFloat32(offset + 4, true);
    const qz = view.getFloat32(offset + 8, true);
    const qw = view.getFloat32(offset + 12, true);
    offset += 16;
    offset += 64; // interpolation
    boneFrames.push({
      boneName,
      frame,
      position: [px, py, pz],
      quaternion: [qx, qy, qz, qw],
    });
  }

  const morphCount = offset + 4 <= bytes.length ? view.getUint32(offset, true) : 0;
  offset += 4;
  const morphFrames: ParsedVMDMorphFrame[] = [];
  for (let i = 0; i < morphCount; i++) {
    const morphName = decodeShiftJIS(bytes.subarray(offset, offset + 15));
    offset += 15;
    const frame = view.getUint32(offset, true);
    offset += 4;
    const weight = view.getFloat32(offset, true);
    offset += 4;
    morphFrames.push({ morphName, frame, weight });
  }

  return {
    header: headerRaw,
    modelName,
    boneFrames,
    morphFrames,
  };
}
