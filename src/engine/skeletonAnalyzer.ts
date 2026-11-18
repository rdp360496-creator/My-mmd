import type {
  BoneVisualCategory,
  ExtractedBoneDetails,
  MorphPanelCategory,
  PMXBone,
  PMXModelData,
  RestPoseType,
  SkeletonAnalysis,
  Vec3,
} from './types';

function normalizeVec(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-6) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function classifyBoneVisualCategory(
  bone: PMXBone,
  childrenCount: number,
  ikControlledIndices: Set<number>
): BoneVisualCategory {
  const txt = `${bone.name} ${bone.englishName}`.toLowerCase();
  if (bone.isIK || /ｉｋ|\bik\b/i.test(txt)) return 'ik';
  if (/捩|twist|roll/i.test(txt)) return 'twist';
  if (/親指|人指|中指|薬指|小指|thumb|index|middle|ring|pinky|little|finger/i.test(txt)) {
    return 'finger';
  }
  if (/頭|首|目|head|neck|eye|skull|cervical/i.test(txt)) return 'head-neck';
  if (/肩|腕|ひじ|肘|手首|shoulder|clavicle|arm|elbow|forearm|wrist|hand/i.test(txt)) {
    return 'arm';
  }
  if (/足|ひざ|膝|つま先|leg|thigh|knee|shin|ankle|foot|toe/i.test(txt) || ikControlledIndices.has(bone.index)) {
    return 'leg';
  }
  if (/全ての親|センター|グルーブ|上半身|下半身|腰|allparents|center|pelvis|groove|waist|lowerbody|upperbody|spine|chest/i.test(txt)) {
    return 'torso';
  }
  if (!bone.visible || !bone.rotatable || bone.inheritRotation || bone.inheritTranslation || childrenCount === 0) {
    // Helper or accessory / unknown classification
    if (/先|dummy|helper|sub|補助|ダミー/i.test(txt) || !bone.visible || bone.inheritRotation) {
      return 'helper';
    }
  }
  return 'unknown';
}

export function analyzeSkeleton(model: PMXModelData): SkeletonAnalysis {
  const n = model.bones.length;
  const childrenByBone: number[][] = Array.from({ length: n }, () => []);
  const depthByBone: number[] = new Array(n).fill(0);
  const warnings: string[] = [];

  for (let i = 0; i < n; i++) {
    const p = model.bones[i].parentIndex;
    if (p >= 0 && p < n && p !== i) {
      childrenByBone[p].push(i);
    }
  }

  // Compute depths via BFS from roots
  const visited = new Set<number>();
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (model.bones[i].parentIndex < 0 || model.bones[i].parentIndex >= n) {
      depthByBone[i] = 0;
      queue.push(i);
      visited.add(i);
    }
  }
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const c of childrenByBone[curr]) {
      if (!visited.has(c)) {
        visited.add(c);
        depthByBone[c] = depthByBone[curr] + 1;
        queue.push(c);
      }
    }
  }

  // IK controlled bones
  const ikControlledBoneIndices = new Set<number>();
  let hasLegIK = false;
  for (const b of model.bones) {
    if (b.isIK && b.ikLinks.length > 0) {
      if (
        /足|leg|foot|toe|つま先/i.test(b.name) ||
        /leg|foot|toe/i.test(b.englishName) ||
        (b.position[1] <= 3.5 && b.ikLinks.length >= 2)
      ) {
        hasLegIK = true;
      }
      for (const lk of b.ikLinks) {
        if (lk.boneIndex >= 0 && lk.boneIndex < n) {
          ikControlledBoneIndices.add(lk.boneIndex);
        }
      }
    }
  }

  // Compute rest-pose bone directions, lengths, local bases, and full ExtractedBoneDetails
  const restBoneDirs: Vec3[] = [];
  const restBoneLengths: number[] = [];
  const localBases: Array<{ x: Vec3; y: Vec3; z: Vec3 }> = [];
  const boneDetails: ExtractedBoneDetails[] = [];

  for (let i = 0; i < n; i++) {
    const b = model.bones[i];
    const hasParent = b.parentIndex >= 0 && b.parentIndex < n && b.parentIndex !== i;
    const parentBone = hasParent ? model.bones[b.parentIndex] : null;
    const localPosition: Vec3 = parentBone
      ? [
          b.position[0] - parentBone.position[0],
          b.position[1] - parentBone.position[1],
          b.position[2] - parentBone.position[2],
        ]
      : [...b.position];

    let vec: Vec3 = [0, 0.4, 0];
    let tailWorldPosition: Vec3 = [b.position[0], b.position[1] + 0.4, b.position[2]];

    if (b.tailMode === 'bone' && b.tailBoneIndex >= 0 && b.tailBoneIndex < n) {
      const tb = model.bones[b.tailBoneIndex];
      tailWorldPosition = [...tb.position];
      vec = [
        tb.position[0] - b.position[0],
        tb.position[1] - b.position[1],
        tb.position[2] - b.position[2],
      ];
    } else if (Math.hypot(b.tailOffset[0], b.tailOffset[1], b.tailOffset[2]) > 1e-4) {
      vec = [...b.tailOffset];
      tailWorldPosition = [
        b.position[0] + b.tailOffset[0],
        b.position[1] + b.tailOffset[1],
        b.position[2] + b.tailOffset[2],
      ];
    } else if (childrenByBone[i].length > 0) {
      const child = model.bones[childrenByBone[i][0]];
      tailWorldPosition = [...child.position];
      vec = [
        child.position[0] - b.position[0],
        child.position[1] - b.position[1],
        child.position[2] - b.position[2],
      ];
    }

    const len = Math.hypot(vec[0], vec[1], vec[2]);
    const dir = len > 1e-5 ? normalizeVec(vec) : ([0, 1, 0] as Vec3);
    restBoneDirs.push(dir);
    restBoneLengths.push(len);

    let basis: { x: Vec3; y: Vec3; z: Vec3 };
    if (b.hasLocalAxis) {
      const lx = normalizeVec(b.localAxisX);
      const lz = normalizeVec(b.localAxisZ);
      const ly = normalizeVec(cross(lz, lx));
      basis = { x: lx, y: ly, z: lz };
    } else {
      const refUp: Vec3 = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [0, 0, -1];
      const lz = normalizeVec(cross(dir, refUp));
      const ly = normalizeVec(cross(lz, dir));
      basis = { x: dir, y: ly, z: lz };
    }
    localBases.push(basis);

    boneDetails.push({
      index: b.index,
      name: b.name,
      englishName: b.englishName,
      parentIndex: b.parentIndex,
      parentName: parentBone ? parentBone.name : null,
      childIndices: [...childrenByBone[i]],
      localPosition,
      worldPosition: [...b.position],
      tailWorldPosition,
      orientation: dir,
      length: len,
      localAxisX: basis.x,
      localAxisY: basis.y,
      localAxisZ: basis.z,
      deformationLayer: b.transformLevel,
      visualCategory: classifyBoneVisualCategory(b, childrenByBone[i].length, ikControlledBoneIndices),
    });
  }

  // Detect A-Pose vs T-Pose from upper arm bones (by name or topological candidate)
  let armRestAngleDeg = 35;
  const armBone = model.bones.find(
    (b) =>
      /^(左腕|arm_?l|left\s*arm|upperarm_?l)$/i.test(b.name.trim()) ||
      /^(arm_?l|left\s*arm)$/i.test(b.englishName.trim())
  );
  if (armBone) {
    const dir = restBoneDirs[armBone.index];
    const horiz = Math.hypot(dir[0], dir[2]);
    const angleRad = Math.atan2(-dir[1], horiz);
    armRestAngleDeg = Math.round((angleRad * 180) / Math.PI);
  } else {
    const candidate = model.bones.find((b) => {
      if (b.position[0] <= 0.7 || b.position[1] < 8) return false;
      const d = restBoneDirs[b.index];
      return d[0] > 0.45 && Math.abs(d[2]) < 0.4;
    });
    if (candidate) {
      const dir = restBoneDirs[candidate.index];
      const horiz = Math.hypot(dir[0], dir[2]);
      armRestAngleDeg = Math.round((Math.atan2(-dir[1], horiz) * 180) / Math.PI);
    } else {
      warnings.push('Could not automatically measure upper-arm rest angle; defaulting to 35° A-Pose.');
    }
  }

  let restPoseType: RestPoseType = 'Custom';
  if (Math.abs(armRestAngleDeg) <= 12) {
    restPoseType = 'T-Pose';
  } else if (armRestAngleDeg >= 15 && armRestAngleDeg <= 60) {
    restPoseType = 'A-Pose';
  }

  const hasUpperBody2 = model.bones.some((b) =>
    /上半身2|upperbody2|chest|spine2/i.test(`${b.name} ${b.englishName}`)
  );
  const hasShoulderBones = model.bones.some((b) =>
    /肩|shoulder|clavicle/i.test(`${b.name} ${b.englishName}`)
  );
  const hasTwistBones = model.bones.some((b) =>
    /捩|twist|roll/i.test(`${b.name} ${b.englishName}`)
  );

  // Finger coverage
  const fingerBones = model.bones.filter((b) =>
    /親指|人指|中指|薬指|小指|thumb|index|middle|ring|pinky|little|finger/i.test(
      `${b.name} ${b.englishName}`
    )
  );
  const fingerCoverage =
    fingerBones.length >= 20 ? 'full' : fingerBones.length > 0 ? 'partial' : 'none';

  if (fingerCoverage !== 'full') {
    warnings.push(
      fingerCoverage === 'partial'
        ? `Partial finger rig detected (${fingerBones.length} finger bones). Finger retargeting will map available segments.`
        : 'No finger bones detected; hand finger poses will be skipped.'
    );
  }
  if (!hasLegIK) {
    warnings.push('No Leg IK chains detected; legs will be retargeted using FK joint rotations.');
  }

  const morphCategories: Record<MorphPanelCategory, number[]> = {
    system: [],
    eyebrow: [],
    eye: [],
    mouth: [],
    other: [],
  };
  for (const m of model.morphs) {
    morphCategories[m.panel].push(m.index);
  }

  return {
    modelName: model.name,
    boneCount: n,
    morphCount: model.morphs.length,
    restPoseType,
    armRestAngleDeg,
    hasUpperBody2,
    hasShoulderBones,
    hasTwistBones,
    hasLegIK,
    fingerCoverage,
    childrenByBone,
    depthByBone,
    restBoneDirs,
    restBoneLengths,
    localBases,
    boneDetails,
    ikControlledBoneIndices,
    morphCategories,
    warnings,
  };
}
