import { cleanFloat, mmdQuatToThree, mmdVecToThree, threeQuatToMmd, threeVecToMmd } from './mmdCoordinates';
import { encodeShiftJIS } from './shiftJis';
import type { BoneTransform, PMXModelData, Quat4, RetargetedPose, Vec3 } from './types';

export interface VPDExportResult {
  content: string;
  bytes: Uint8Array;
  fileName: string;
  boneCount: number;
  warnings: string[];
}

export interface ParsedVPDBone {
  boneName: string;
  translation: Vec3;
  quaternion: Quat4;
}

export interface ParsedVPD {
  modelFileName: string;
  declaredBoneCount: number;
  bones: ParsedVPDBone[];
}

export function exportVPD(
  model: PMXModelData,
  pose: RetargetedPose,
  poseName = 'Pose_01'
): VPDExportResult {
  const warnings: string[] = [];
  const validTransforms: Array<{ name: string; trans: Vec3; quat: Quat4 }> = [];

  for (const key of Object.keys(pose.transforms)) {
    const t = pose.transforms[Number(key)];
    if (!t) continue;
    const bone = model.bones[t.boneIndex];
    if (!bone) {
      warnings.push(`Skipped bone index ${t.boneIndex}: not found in target model.`);
      continue;
    }

    // Only emit non-identity transforms or root/center bones to keep VPD clean & valid
    const mmdTrans = bone.translatable ? threeVecToMmd(t.translation) : ([0, 0, 0] as Vec3);
    const mmdQuat = bone.rotatable ? threeQuatToMmd(t.quaternion) : ([0, 0, 0, 1] as Quat4);

    const hasTrans = Math.hypot(mmdTrans[0], mmdTrans[1], mmdTrans[2]) > 1e-5;
    const hasRot = Math.abs(mmdQuat[0]) > 1e-5 || Math.abs(mmdQuat[1]) > 1e-5 || Math.abs(mmdQuat[2]) > 1e-5;

    if (!hasTrans && !hasRot && bone.index !== 1) continue;

    validTransforms.push({
      name: bone.name,
      trans: mmdTrans,
      quat: mmdQuat,
    });
  }

  // Ensure at least one bone (center) if pose is pure rest pose
  if (validTransforms.length === 0 && model.bones.length > 0) {
    const centerBone = model.bones.find((b) => /センター|center/i.test(b.name)) ?? model.bones[0];
    validTransforms.push({
      name: centerBone.name,
      trans: [0, 0, 0],
      quat: [0, 0, 0, 1],
    });
  }

  const osmName = model.fileName.replace(/\.(pmx|pmd)$/i, '.osm');
  const lines: string[] = [
    'Vocaloid Pose Data file',
    '',
    `${osmName};`,
    `${validTransforms.length};`,
    '',
  ];

  validTransforms.forEach((item, idx) => {
    lines.push(`Bone${idx}{${item.name}`);
    lines.push(
      `  ${cleanFloat(item.trans[0]).toFixed(6)},${cleanFloat(item.trans[1]).toFixed(6)},${cleanFloat(item.trans[2]).toFixed(6)};`
    );
    lines.push(
      `  ${cleanFloat(item.quat[0]).toFixed(6)},${cleanFloat(item.quat[1]).toFixed(6)},${cleanFloat(item.quat[2]).toFixed(6)},${cleanFloat(item.quat[3]).toFixed(6)};`
    );
    lines.push('}');
    lines.push('');
  });

  const content = lines.join('\r\n');
  const bytes = encodeShiftJIS(content);
  const safeBase = poseName.replace(/[^\w\-一-龯ぁ-んァ-ヶ]/g, '_') || 'Pose_01';

  return {
    content,
    bytes,
    fileName: `${safeBase}.vpd`,
    boneCount: validTransforms.length,
    warnings,
  };
}

export function parseVPD(text: string): ParsedVPD {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('Vocaloid Pose Data file')) {
    throw new Error('Invalid VPD file: missing "Vocaloid Pose Data file" header.');
  }

  const headerLines = normalized
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter((l) => l.length > 0);

  const modelFileName = (headerLines[1] ?? '').replace(/;$/, '');
  const declaredBoneCount = parseInt((headerLines[2] ?? '0').replace(/;$/, ''), 10);

  const bones: ParsedVPDBone[] = [];
  const blockRegex = /Bone\d+\{([^\n\r}]+)\s*([-\d.eE+,]+)\s*;\s*([-\d.eE+,]+)\s*;\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(normalized)) !== null) {
    const boneName = match[1].trim();
    const transParts = match[2].split(',').map((s) => parseFloat(s.trim()));
    const quatParts = match[3].split(',').map((s) => parseFloat(s.trim()));
    if (transParts.length === 3 && quatParts.length === 4) {
      bones.push({
        boneName,
        translation: [transParts[0], transParts[1], transParts[2]],
        quaternion: [quatParts[0], quatParts[1], quatParts[2], quatParts[3]],
      });
    }
  }

  return {
    modelFileName,
    declaredBoneCount: Number.isFinite(declaredBoneCount) ? declaredBoneCount : bones.length,
    bones,
  };
}

export function applyParsedVPDToPose(model: PMXModelData, parsed: ParsedVPD): RetargetedPose {
  const transforms: Record<number, BoneTransform> = {};
  for (const item of parsed.bones) {
    const bone = model.bones.find((b) => b.name === item.boneName || b.englishName === item.boneName);
    if (!bone) continue;
    const tVec = mmdVecToThree(item.translation);
    const qThree = mmdQuatToThree(item.quaternion);
    transforms[bone.index] = {
      boneIndex: bone.index,
      boneName: bone.name,
      translation: [tVec.x, tVec.y, tVec.z],
      quaternion: [qThree.x, qThree.y, qThree.z, qThree.w],
      source: 'manual',
    };
  }
  return {
    transforms,
    ikEnabled: true,
    mirrored: false,
    poseStrength: 1,
    rootOffsetY: 0,
  };
}
