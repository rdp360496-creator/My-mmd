import type {
  BoneMappingResult,
  ModelCalibrationProfile,
  PMXModelData,
  SkeletonAnalysis,
  StandardBoneRole,
} from './types';

const CALIBRATION_STORAGE_KEY = 'mmd_pose_ai_calibration_profiles_v1';

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function computeModelIdentityKey(model: PMXModelData): string {
  return `${model.name}::${model.fileName}`;
}

export function computeSkeletonSignature(model: PMXModelData): string {
  const boneDigest = model.bones
    .map(
      (b) =>
        `${b.index}:${b.name}:${b.parentIndex}:${b.position[0].toFixed(2)},${b.position[1].toFixed(2)},${b.position[2].toFixed(2)}:${b.isIK ? 1 : 0}:${b.ikTargetIndex}`
    )
    .join('|');
  return `${model.format}-${model.bones.length}-${model.morphs.length}-${fnv1aHex(boneDigest)}`;
}

export function buildModelCalibrationProfile(
  model: PMXModelData,
  skeleton: SkeletonAnalysis,
  mapping: BoneMappingResult,
  userOverrides: Partial<Record<StandardBoneRole, number | null>>,
  existingCreatedAt?: string
): ModelCalibrationProfile {
  const now = new Date().toISOString();
  const anatomicalMapping: ModelCalibrationProfile['anatomicalMapping'] = {};
  for (const [role, entry] of Object.entries(mapping.entries)) {
    anatomicalMapping[role as StandardBoneRole] = {
      boneIndex: entry.boneIndex,
      boneName: entry.boneName,
      confidence: entry.confidence,
      confidenceScore: entry.confidenceScore,
    };
  }

  return {
    schemaVersion: '1.0.0',
    modelIdentityKey: computeModelIdentityKey(model),
    skeletonSignature: computeSkeletonSignature(model),
    modelName: model.name,
    fileName: model.fileName,
    format: model.format,
    boneCount: model.bones.length,
    morphCount: model.morphs.length,
    createdAt: existingCreatedAt ?? now,
    updatedAt: now,
    restPoseType: skeleton.restPoseType,
    armRestAngleDeg: skeleton.armRestAngleDeg,
    coordinateConversion: {
      sourceSpace: 'MMD-LH',
      targetSpace: 'ThreeJS-RH',
      zNegated: true,
      positionScale: 1,
    },
    boneLengths: [...skeleton.restBoneLengths],
    restDirections: skeleton.restBoneDirs.map((d) => [...d]),
    localAxes: skeleton.localBases.map((b) => ({
      x: [...b.x],
      y: [...b.y],
      z: [...b.z],
    })),
    hierarchyParents: model.bones.map((b) => b.parentIndex),
    rotationConstraints: model.bones.map((b) => ({
      boneIndex: b.index,
      rotatable: b.rotatable,
      translatable: b.translatable,
      hasFixedAxis: b.hasFixedAxis,
      fixedAxis: [...b.fixedAxis],
      inheritRotation: b.inheritRotation,
      inheritParentIndex: b.inheritParentIndex,
      inheritRatio: b.inheritRatio,
    })),
    ikConfiguration: model.bones
      .filter((b) => b.isIK)
      .map((b) => ({
        ikBoneIndex: b.index,
        ikBoneName: b.name,
        targetBoneIndex: b.ikTargetIndex,
        loopCount: b.ikLoopCount,
        limitAngle: b.ikLimitAngle,
        links: b.ikLinks.map((lk) => ({ ...lk })),
      })),
    anatomicalMapping,
    userCorrectedMappings: { ...userOverrides },
  };
}

export function verifyCalibrationProfileCompatibility(
  profile: ModelCalibrationProfile,
  model: PMXModelData
): { compatible: boolean; reason: string } {
  const expectedSig = computeSkeletonSignature(model);
  if (profile.boneCount !== model.bones.length) {
    return {
      compatible: false,
      reason: `Bone count changed (${profile.boneCount} stored vs ${model.bones.length} imported).`,
    };
  }
  if (profile.skeletonSignature !== expectedSig) {
    return {
      compatible: false,
      reason: 'Skeleton hierarchy, bone names, or IK topology changed since calibration was saved.',
    };
  }
  return {
    compatible: true,
    reason: 'Verified model identity and skeleton signature match.',
  };
}

export function saveCalibrationProfile(profile: ModelCalibrationProfile): void {
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, ModelCalibrationProfile>) : {};
    map[profile.modelIdentityKey] = profile;
    localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

export function loadVerifiedCalibrationProfile(model: PMXModelData): {
  status: 'matched' | 'mismatched' | 'none';
  profile: ModelCalibrationProfile | null;
  reason: string;
} {
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY);
    if (!raw) return { status: 'none', profile: null, reason: 'No saved calibration profile.' };
    const map = JSON.parse(raw) as Record<string, ModelCalibrationProfile>;
    const key = computeModelIdentityKey(model);
    const stored = map[key];
    if (!stored) {
      return { status: 'none', profile: null, reason: 'First import for this model.' };
    }
    const check = verifyCalibrationProfileCompatibility(stored, model);
    if (!check.compatible) {
      return { status: 'mismatched', profile: null, reason: check.reason };
    }
    return { status: 'matched', profile: stored, reason: check.reason };
  } catch {
    return { status: 'none', profile: null, reason: 'Could not read stored calibration profiles.' };
  }
}
