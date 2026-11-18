import { computeSkeletonSignature } from './modelCalibration';
import type {
  BoneMappingEntry,
  BoneMappingResult,
  MappingValidationIssue,
  MappingValidationReport,
  PMXBone,
  PMXModelData,
  SkeletonAnalysis,
  StandardBoneRole,
} from './types';

export interface RoleDefinition {
  role: StandardBoneRole;
  label: string;
  required: boolean;
  aliases: string[];
  expectedSide?: 'L' | 'R' | 'center';
}

export const STANDARD_BONE_ROLES: RoleDefinition[] = [
  { role: 'allParents', label: 'All Parents / Root', required: false, expectedSide: 'center', aliases: ['全ての親', 'allparents', 'root', 'modelroot'] },
  { role: 'center', label: 'Center', required: true, expectedSide: 'center', aliases: ['センター', 'center', 'pelvisroot', 'hips', 'pelvis'] },
  { role: 'groove', label: 'Groove', required: false, expectedSide: 'center', aliases: ['グルーブ', 'groove'] },
  { role: 'waist', label: 'Lower Body / Waist', required: true, expectedSide: 'center', aliases: ['下半身', 'lowerbody', 'waist', 'hipbase', 'lower_body'] },
  { role: 'upperBody', label: 'Upper Body', required: true, expectedSide: 'center', aliases: ['上半身', 'upperbody', 'upper_body', 'spine', 'spine_core'] },
  { role: 'upperBody2', label: 'Upper Body 2 / Chest', required: false, expectedSide: 'center', aliases: ['上半身2', 'upperbody2', 'upper_body2', 'chest', 'chest_upper', 'spine2'] },
  { role: 'upperBody3', label: 'Upper Body 3', required: false, expectedSide: 'center', aliases: ['上半身3', 'upperbody3', 'spine3'] },
  { role: 'neck', label: 'Neck', required: true, expectedSide: 'center', aliases: ['首', 'neck', 'cervical'] },
  { role: 'head', label: 'Head', required: true, expectedSide: 'center', aliases: ['頭', 'head', 'skull'] },
  { role: 'eyeL', label: 'Eye (L)', required: false, expectedSide: 'L', aliases: ['左目', 'eye_l', 'lefteye', 'eye.l'] },
  { role: 'eyeR', label: 'Eye (R)', required: false, expectedSide: 'R', aliases: ['右目', 'eye_r', 'righteye', 'eye.r'] },

  { role: 'shoulderL', label: 'Shoulder (L)', required: false, expectedSide: 'L', aliases: ['左肩', 'shoulder_l', 'leftshoulder', 'clavicle_l', 'shoulder.l'] },
  { role: 'armL', label: 'Arm (L)', required: true, expectedSide: 'L', aliases: ['左腕', 'arm_l', 'leftarm', 'upperarm_l', 'arm.l'] },
  { role: 'armTwistL', label: 'Arm Twist (L)', required: false, expectedSide: 'L', aliases: ['左腕捩', 'armtwist_l', 'leftarmtwist', 'armtwist.l'] },
  { role: 'elbowL', label: 'Elbow (L)', required: true, expectedSide: 'L', aliases: ['左ひじ', '左肘', 'elbow_l', 'leftelbow', 'forearm_l', 'elbow.l'] },
  { role: 'wristTwistL', label: 'Wrist Twist (L)', required: false, expectedSide: 'L', aliases: ['左手捩', 'wristtwist_l', 'leftwristtwist', 'forearmtwist_l'] },
  { role: 'wristL', label: 'Wrist / Hand (L)', required: true, expectedSide: 'L', aliases: ['左手首', 'wrist_l', 'leftwrist', 'hand_l', 'wrist.l'] },

  { role: 'shoulderR', label: 'Shoulder (R)', required: false, expectedSide: 'R', aliases: ['右肩', 'shoulder_r', 'rightshoulder', 'clavicle_r', 'shoulder.r'] },
  { role: 'armR', label: 'Arm (R)', required: true, expectedSide: 'R', aliases: ['右腕', 'arm_r', 'rightarm', 'upperarm_r', 'arm.r'] },
  { role: 'armTwistR', label: 'Arm Twist (R)', required: false, expectedSide: 'R', aliases: ['右腕捩', 'armtwist_r', 'rightarmtwist', 'armtwist.r'] },
  { role: 'elbowR', label: 'Elbow (R)', required: true, expectedSide: 'R', aliases: ['右ひじ', '右肘', 'elbow_r', 'rightelbow', 'forearm_r', 'elbow.r'] },
  { role: 'wristTwistR', label: 'Wrist Twist (R)', required: false, expectedSide: 'R', aliases: ['右手捩', 'wristtwist_r', 'rightwristtwist', 'forearmtwist_r'] },
  { role: 'wristR', label: 'Wrist / Hand (R)', required: true, expectedSide: 'R', aliases: ['右手首', 'wrist_r', 'rightwrist', 'hand_r', 'wrist.r'] },

  // Left fingers
  { role: 'thumb0L', label: 'Thumb 0 (L)', required: false, expectedSide: 'L', aliases: ['左親指０', '左親指0', 'thumb0_l', 'thumb_l'] },
  { role: 'thumb1L', label: 'Thumb 1 (L)', required: false, expectedSide: 'L', aliases: ['左親指１', '左親指1', 'thumb1_l'] },
  { role: 'thumb2L', label: 'Thumb 2 (L)', required: false, expectedSide: 'L', aliases: ['左親指２', '左親指2', 'thumb2_l'] },
  { role: 'index1L', label: 'Index 1 (L)', required: false, expectedSide: 'L', aliases: ['左人指１', '左人指1', 'index1_l', 'index_l'] },
  { role: 'index2L', label: 'Index 2 (L)', required: false, expectedSide: 'L', aliases: ['左人指２', '左人指2', 'index2_l'] },
  { role: 'index3L', label: 'Index 3 (L)', required: false, expectedSide: 'L', aliases: ['左人指３', '左人指3', 'index3_l'] },
  { role: 'middle1L', label: 'Middle 1 (L)', required: false, expectedSide: 'L', aliases: ['左中指１', '左中指1', 'middle1_l', 'otherfingers_l'] },
  { role: 'middle2L', label: 'Middle 2 (L)', required: false, expectedSide: 'L', aliases: ['左中指２', '左中指2', 'middle2_l'] },
  { role: 'middle3L', label: 'Middle 3 (L)', required: false, expectedSide: 'L', aliases: ['左中指３', '左中指3', 'middle3_l'] },
  { role: 'ring1L', label: 'Ring 1 (L)', required: false, expectedSide: 'L', aliases: ['左薬指１', '左薬指1', 'ring1_l'] },
  { role: 'ring2L', label: 'Ring 2 (L)', required: false, expectedSide: 'L', aliases: ['左薬指２', '左薬指2', 'ring2_l'] },
  { role: 'ring3L', label: 'Ring 3 (L)', required: false, expectedSide: 'L', aliases: ['左薬指３', '左薬指3', 'ring3_l'] },
  { role: 'pinky1L', label: 'Pinky 1 (L)', required: false, expectedSide: 'L', aliases: ['左小指１', '左小指1', 'pinky1_l', 'little1_l'] },
  { role: 'pinky2L', label: 'Pinky 2 (L)', required: false, expectedSide: 'L', aliases: ['左小指２', '左小指2', 'pinky2_l', 'little2_l'] },
  { role: 'pinky3L', label: 'Pinky 3 (L)', required: false, expectedSide: 'L', aliases: ['左小指３', '左小指3', 'pinky3_l', 'little3_l'] },

  // Right fingers
  { role: 'thumb0R', label: 'Thumb 0 (R)', required: false, expectedSide: 'R', aliases: ['右親指０', '右親指0', 'thumb0_r', 'thumb_r'] },
  { role: 'thumb1R', label: 'Thumb 1 (R)', required: false, expectedSide: 'R', aliases: ['右親指１', '右親指1', 'thumb1_r'] },
  { role: 'thumb2R', label: 'Thumb 2 (R)', required: false, expectedSide: 'R', aliases: ['右親指２', '右親指2', 'thumb2_r'] },
  { role: 'index1R', label: 'Index 1 (R)', required: false, expectedSide: 'R', aliases: ['右人指１', '右人指1', 'index1_r', 'index_r'] },
  { role: 'index2R', label: 'Index 2 (R)', required: false, expectedSide: 'R', aliases: ['右人指２', '右人指2', 'index2_r'] },
  { role: 'index3R', label: 'Index 3 (R)', required: false, expectedSide: 'R', aliases: ['右人指３', '右人指3', 'index3_r'] },
  { role: 'middle1R', label: 'Middle 1 (R)', required: false, expectedSide: 'R', aliases: ['右中指１', '右中指1', 'middle1_r', 'otherfingers_r'] },
  { role: 'middle2R', label: 'Middle 2 (R)', required: false, expectedSide: 'R', aliases: ['右中指２', '右中指2', 'middle2_r'] },
  { role: 'middle3R', label: 'Middle 3 (R)', required: false, expectedSide: 'R', aliases: ['右中指３', '右中指3', 'middle3_r'] },
  { role: 'ring1R', label: 'Ring 1 (R)', required: false, expectedSide: 'R', aliases: ['右薬指１', '右薬指1', 'ring1_r'] },
  { role: 'ring2R', label: 'Ring 2 (R)', required: false, expectedSide: 'R', aliases: ['右薬指２', '右薬指2', 'ring2_r'] },
  { role: 'ring3R', label: 'Ring 3 (R)', required: false, expectedSide: 'R', aliases: ['右薬指３', '右薬指3', 'ring3_r'] },
  { role: 'pinky1R', label: 'Pinky 1 (R)', required: false, expectedSide: 'R', aliases: ['右小指１', '右小指1', 'pinky1_r', 'little1_r'] },
  { role: 'pinky2R', label: 'Pinky 2 (R)', required: false, expectedSide: 'R', aliases: ['右小指２', '右小指2', 'pinky2_r', 'little2_r'] },
  { role: 'pinky3R', label: 'Pinky 3 (R)', required: false, expectedSide: 'R', aliases: ['右小指３', '右小指3', 'pinky3_r', 'little3_r'] },

  // Legs
  { role: 'legL', label: 'Leg / Thigh (L)', required: true, expectedSide: 'L', aliases: ['左足', 'leg_l', 'leftleg', 'thigh_l', 'leg.l'] },
  { role: 'kneeL', label: 'Knee / Shin (L)', required: true, expectedSide: 'L', aliases: ['左ひざ', '左膝', 'knee_l', 'leftknee', 'shin_l', 'knee.l'] },
  { role: 'ankleL', label: 'Ankle / Foot (L)', required: true, expectedSide: 'L', aliases: ['左足首', 'ankle_l', 'leftankle', 'foot_l', 'ankle.l'] },
  { role: 'toeL', label: 'Toe (L)', required: false, expectedSide: 'L', aliases: ['左つま先', 'toe_l', 'lefttoe', 'toetip_l'] },
  { role: 'legIkL', label: 'Leg IK (L)', required: false, expectedSide: 'L', aliases: ['左足ｉｋ', '左足ik', 'legik_l', 'leftlegik', 'footik_l'] },
  { role: 'toeIkL', label: 'Toe IK (L)', required: false, expectedSide: 'L', aliases: ['左つま先ｉｋ', '左つま先ik', 'toeik_l', 'lefttoeik'] },

  { role: 'legR', label: 'Leg / Thigh (R)', required: true, expectedSide: 'R', aliases: ['右足', 'leg_r', 'rightleg', 'thigh_r', 'leg.r'] },
  { role: 'kneeR', label: 'Knee / Shin (R)', required: true, expectedSide: 'R', aliases: ['右ひざ', '右膝', 'knee_r', 'rightknee', 'shin_r', 'knee.r'] },
  { role: 'ankleR', label: 'Ankle / Foot (R)', required: true, expectedSide: 'R', aliases: ['右足首', 'ankle_r', 'rightankle', 'foot_r', 'ankle.r'] },
  { role: 'toeR', label: 'Toe (R)', required: false, expectedSide: 'R', aliases: ['右つま先', 'toe_r', 'righttoe', 'toetip_r'] },
  { role: 'legIkR', label: 'Leg IK (R)', required: false, expectedSide: 'R', aliases: ['右足ｉｋ', '右足ik', 'legik_r', 'rightlegik', 'footik_r'] },
  { role: 'toeIkR', label: 'Toe IK (R)', required: false, expectedSide: 'R', aliases: ['右つま先ｉｋ', '右つま先ik', 'toeik_r', 'righttoeik'] },
];

const ROLE_DEF_MAP: Record<StandardBoneRole, RoleDefinition> = STANDARD_BONE_ROLES.reduce(
  (acc, def) => {
    acc[def.role] = def;
    return acc;
  },
  {} as Record<StandardBoneRole, RoleDefinition>
);

function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function matchesSide(bone: PMXBone, expectedSide?: 'L' | 'R' | 'center'): boolean {
  if (!expectedSide || expectedSide === 'center') return true;
  if (expectedSide === 'L') return bone.position[0] >= -0.05;
  return bone.position[0] <= 0.05;
}

function isDescendant(
  model: PMXModelData,
  ancestorIdx: number,
  nodeIdx: number
): boolean {
  let curr = nodeIdx;
  let guard = 0;
  while (curr >= 0 && curr < model.bones.length && guard++ < model.bones.length) {
    if (curr === ancestorIdx) return true;
    curr = model.bones[curr].parentIndex;
  }
  return false;
}

function isTwistOrHelperBone(
  bone: PMXBone,
  model: PMXModelData,
  skeleton: SkeletonAnalysis
): boolean {
  if (bone.inheritRotation && bone.inheritParentIndex >= 0) return true;
  if (bone.hasFixedAxis) return true;
  if (/捩|twist|roll|helper|dummy|補助/i.test(`${bone.name} ${bone.englishName}`)) return true;
  if (!bone.visible && skeleton.restBoneLengths[bone.index] < 0.35) return true;

  // Geometric twist/roll detection: short offset stub sitting collinearly between parent and single child
  const len = skeleton.restBoneLengths[bone.index];
  if (bone.tailMode === 'offset' && len < 0.75 && bone.parentIndex >= 0) {
    const children = skeleton.childrenByBone[bone.index];
    if (children.length === 1) {
      const p = model.bones[bone.parentIndex];
      const c = model.bones[children[0]];
      if (p && c) {
        const v1x = bone.position[0] - p.position[0];
        const v1y = bone.position[1] - p.position[1];
        const v1z = bone.position[2] - p.position[2];
        const v2x = c.position[0] - bone.position[0];
        const v2y = c.position[1] - bone.position[1];
        const v2z = c.position[2] - bone.position[2];
        const l1 = Math.hypot(v1x, v1y, v1z);
        const l2 = Math.hypot(v2x, v2y, v2z);
        if (l1 > 0.35 && l2 > 0.35) {
          const dot = (v1x * v2x + v1y * v2y + v1z * v2z) / (l1 * l2);
          if (dot > 0.94) return true;
        }
      }
    }
  }
  return false;
}

function buildTopologicalCandidates(
  model: PMXModelData,
  skeleton: SkeletonAnalysis,
  usedBoneIndices: Set<number>
): Partial<Record<StandardBoneRole, { bone: PMXBone; score: number; signals: string[]; reason: string }>> {
  const result: Partial<
    Record<StandardBoneRole, { bone: PMXBone; score: number; signals: string[]; reason: string }>
  > = {};

  const assign = (
    role: StandardBoneRole,
    bone: PMXBone | undefined,
    score: number,
    signals: string[],
    reason: string
  ) => {
    if (!bone || usedBoneIndices.has(bone.index) || result[role]) return;
    result[role] = { bone, score, signals, reason };
  };

  // 1. Structural IK Leg Discovery (works even with completely obfuscated bone names!)
  for (const b of model.bones) {
    if (!b.isIK || b.ikLinks.length < 2) continue;
    if (b.position[1] > 4.0) continue; // Leg IK targets sit near feet
    const side: 'L' | 'R' | null =
      b.position[0] > 0.15 ? 'L' : b.position[0] < -0.15 ? 'R' : null;
    if (!side) continue;

    const ikRole: StandardBoneRole = side === 'L' ? 'legIkL' : 'legIkR';
    const ankleRole: StandardBoneRole = side === 'L' ? 'ankleL' : 'ankleR';
    const kneeRole: StandardBoneRole = side === 'L' ? 'kneeL' : 'kneeR';
    const legRole: StandardBoneRole = side === 'L' ? 'legL' : 'legR';

    assign(
      ikRole,
      b,
      0.92,
      ['ik-chain', 'spatial-position', 'bone-flags'],
      `Structural IK solver near foot elevation with ${b.ikLinks.length} leg links.`
    );

    const targetBone = model.bones[b.ikTargetIndex];
    if (targetBone && matchesSide(targetBone, side)) {
      assign(
        ankleRole,
        targetBone,
        0.9,
        ['ik-target', 'spatial-position', 'hierarchy'],
        `IK target bone of ${b.name} at ankle elevation.`
      );
    }

    // Sort IK link bones by Y descending: higher Y = thigh (leg), lower Y = knee
    const linkBones = b.ikLinks
      .map((lk) => model.bones[lk.boneIndex])
      .filter((lb): lb is PMXBone => Boolean(lb) && matchesSide(lb, side))
      .sort((a, c) => c.position[1] - a.position[1]);

    if (linkBones.length >= 2) {
      assign(
        legRole,
        linkBones[0],
        0.88,
        ['ik-chain-link', 'spatial-position', 'hierarchy'],
        `Proximal link in ${b.name} IK chain (thigh elevation y=${linkBones[0].position[1].toFixed(1)}).`
      );
      assign(
        kneeRole,
        linkBones[1],
        0.88,
        ['ik-chain-link', 'spatial-position', 'hierarchy'],
        `Distal hinge link in ${b.name} IK chain (knee elevation y=${linkBones[1].position[1].toFixed(1)}).`
      );
    }
  }

  // 2. FK Leg chain discovery if legs aren't already solved by IK
  const solveFKLeg = (side: 'L' | 'R') => {
    const legRole: StandardBoneRole = side === 'L' ? 'legL' : 'legR';
    const kneeRole: StandardBoneRole = side === 'L' ? 'kneeL' : 'kneeR';
    const ankleRole: StandardBoneRole = side === 'L' ? 'ankleL' : 'ankleR';
    if (result[legRole] && result[kneeRole] && result[ankleRole]) return;

    const thighCandidates = model.bones.filter((b) => {
      if (usedBoneIndices.has(b.index) || b.isIK) return false;
      const sideOk = side === 'L' ? b.position[0] > 0.25 : b.position[0] < -0.25;
      if (!sideOk) return false;
      const dir = skeleton.restBoneDirs[b.index];
      return b.position[1] >= 5.5 && b.position[1] <= 11.5 && dir[1] < -0.6;
    });

    for (const thigh of thighCandidates) {
      const children = skeleton.childrenByBone[thigh.index]
        .map((ci) => model.bones[ci])
        .filter((cb) => cb && !cb.isIK && cb.position[1] < thigh.position[1] - 1.0);
      if (children.length === 0) continue;
      const knee = children[0];
      const kneeChildren = skeleton.childrenByBone[knee.index]
        .map((ci) => model.bones[ci])
        .filter((cb) => cb && !cb.isIK && cb.position[1] < knee.position[1] - 1.0);
      if (kneeChildren.length === 0) continue;
      const ankle = kneeChildren[0];

      assign(
        legRole,
        thigh,
        0.78,
        ['hierarchy-chain', 'spatial-position', 'bone-direction'],
        `Downward lateral kinematic root chain -> ${knee.name} -> ${ankle.name}.`
      );
      assign(
        kneeRole,
        knee,
        0.78,
        ['hierarchy-chain', 'spatial-position', 'bone-direction'],
        `Mid-leg descending joint between ${thigh.name} and ${ankle.name}.`
      );
      assign(
        ankleRole,
        ankle,
        0.76,
        ['hierarchy-chain', 'spatial-position'],
        `Distal foot joint descending from ${knee.name}.`
      );
      break;
    }
  };
  solveFKLeg('L');
  solveFKLeg('R');

  // 3. Midline Spine / Pelvis / Neck / Head structural chain
  const midlineBones = model.bones.filter(
    (b) =>
      !usedBoneIndices.has(b.index) &&
      !b.isIK &&
      b.rotatable &&
      Math.abs(b.position[0]) <= 0.3 &&
      b.position[1] >= 4.0
  );

  // Center / Pelvis / Waist: lowest central joints near hip elevation (y ~ 7..11) that branch
  const hipMidlines = midlineBones
    .filter((b) => b.position[1] >= 6.0 && b.position[1] <= 11.0)
    .sort((a, c) => skeleton.depthByBone[a.index] - skeleton.depthByBone[c.index]);

  const centerCandidate = hipMidlines.find((b) => b.translatable) ?? hipMidlines[0];
  if (centerCandidate) {
    assign(
      'center',
      centerCandidate,
      0.76,
      ['spatial-position', 'hierarchy-depth', 'bone-flags'],
      `Central pelvis-level root bone (y=${centerCandidate.position[1].toFixed(1)}).`
    );
  }

  // Waist: hip-level midline bone with downward leg children or downward tail
  const waistCandidate = midlineBones.find((b) => {
    if (b.index === result.center?.bone.index) return false;
    const hasLegChild = skeleton.childrenByBone[b.index].some(
      (ci) =>
        ci === result.legL?.bone.index ||
        ci === result.legR?.bone.index ||
        model.bones[ci].position[1] < b.position[1] - 0.5
    );
    return hasLegChild && b.position[1] >= 7.0 && b.position[1] <= 11.5;
  });
  if (waistCandidate) {
    assign(
      'waist',
      waistCandidate,
      0.78,
      ['hierarchy-branching', 'spatial-position'],
      `Midline pelvic bone branching to lower limbs.`
    );
  }

  // Ascending torso chain toward head (score true midline cranial bones over accessory leaves above head)
  const cranialPool = midlineBones.filter(
    (b) =>
      b.position[1] >= 13.0 &&
      Math.abs(b.position[0]) <= 0.15 &&
      skeleton.restBoneDirs[b.index][1] > 0.35
  );
  const cranialIds = new Set(cranialPool.map((b) => b.index));
  const scoreCranial = (b: PMXBone): number => {
    let s = 0;
    const childBones = skeleton.childrenByBone[b.index]
      .map((ci) => model.bones[ci])
      .filter((cb): cb is PMXBone => Boolean(cb));
    const hasSymmetricEyes = childBones.some((c1) =>
      childBones.some(
        (c2) =>
          c1.index !== c2.index &&
          Math.abs(c1.position[0]) > 0.08 &&
          Math.abs(c1.position[0] + c2.position[0]) < 0.15 &&
          Math.abs(c1.position[1] - c2.position[1]) < 0.15
      )
    );
    if (hasSymmetricEyes) s += 50;
    const p = b.parentIndex >= 0 ? model.bones[b.parentIndex] : undefined;
    if (p && Math.abs(p.position[0]) <= 0.15 && p.position[1] >= 12.0 && p.position[1] < b.position[1]) {
      s += 25;
      const gp = p.parentIndex >= 0 ? model.bones[p.parentIndex] : undefined;
      if (gp && Math.abs(gp.position[0]) <= 0.15 && gp.position[1] >= 9.5) {
        s += 15;
      }
    }
    if (cranialIds.has(b.parentIndex)) s -= 40;
    return s;
  };
  const headCandidate = [...cranialPool].sort((a, c) => {
    const diff = scoreCranial(c) - scoreCranial(a);
    if (diff !== 0) return diff;
    return c.position[1] - a.position[1];
  })[0];

  if (headCandidate) {
    const neckBone =
      headCandidate.parentIndex >= 0 ? model.bones[headCandidate.parentIndex] : undefined;
    assign(
      'head',
      headCandidate,
      0.8,
      ['spatial-position', 'bone-direction', 'hierarchy'],
      `Anatomical midline cranial bone (y=${headCandidate.position[1].toFixed(1)}).`
    );
    if (neckBone && Math.abs(neckBone.position[0]) <= 0.3 && neckBone.position[1] >= 12.0) {
      assign(
        'neck',
        neckBone,
        0.79,
        ['hierarchy-parent', 'spatial-position'],
        `Direct midline parent of head bone "${headCandidate.name}".`
      );
      const spineTop =
        neckBone.parentIndex >= 0 ? model.bones[neckBone.parentIndex] : undefined;
      if (spineTop && Math.abs(spineTop.position[0]) <= 0.3 && spineTop.position[1] >= 10.0) {
        const spineParent =
          spineTop.parentIndex >= 0 ? model.bones[spineTop.parentIndex] : undefined;
        if (
          spineParent &&
          spineParent.index !== result.center?.bone.index &&
          spineParent.index !== result.waist?.bone.index &&
          Math.abs(spineParent.position[0]) <= 0.3 &&
          spineParent.position[1] >= 8.0 &&
          spineParent.position[1] < spineTop.position[1] - 0.5
        ) {
          assign(
            'upperBody2',
            spineTop,
            0.76,
            ['hierarchy-chain', 'spatial-position'],
            `Upper chest parent of neck "${neckBone.name}" branching toward arms.`
          );
          assign(
            'upperBody',
            spineParent,
            0.77,
            ['hierarchy-chain', 'spatial-position'],
            `Lower torso spine bone below "${spineTop.name}".`
          );
        } else {
          assign(
            'upperBody',
            spineTop,
            0.76,
            ['hierarchy-chain', 'spatial-position'],
            `Primary upper-torso spine parent of "${neckBone.name}".`
          );
        }
      }
    }
  }

  // 4. Arm Kinematic Chain Discovery (Shoulder -> Arm -> ArmTwist -> Elbow -> WristTwist -> Wrist)
  const solveArmChain = (side: 'L' | 'R') => {
    const sign = side === 'L' ? 1 : -1;
    const armRole: StandardBoneRole = side === 'L' ? 'armL' : 'armR';
    const elbowRole: StandardBoneRole = side === 'L' ? 'elbowL' : 'elbowR';
    const wristRole: StandardBoneRole = side === 'L' ? 'wristL' : 'wristR';
    const shoulderRole: StandardBoneRole = side === 'L' ? 'shoulderL' : 'shoulderR';
    const armTwistRole: StandardBoneRole = side === 'L' ? 'armTwistL' : 'armTwistR';
    const wristTwistRole: StandardBoneRole = side === 'L' ? 'wristTwistL' : 'wristTwistR';

    if (result[armRole] && result[elbowRole] && result[wristRole]) return;

    // Find lateral arm chain starting near upper torso (y ~ 11..16, |x| ~ 0.3..1.8)
    const armRoots = model.bones
      .filter((b) => {
        if (usedBoneIndices.has(b.index) || b.isIK || !b.rotatable) return false;
        const x = b.position[0] * sign;
        const dir = skeleton.restBoneDirs[b.index];
        return (
          x >= 0.25 &&
          x <= 2.2 &&
          b.position[1] >= 11.0 &&
          b.position[1] <= 16.5 &&
          dir[0] * sign > 0.35 &&
          Math.abs(dir[2]) < 0.5
        );
      })
      .sort((a, c) => Math.abs(a.position[0]) - Math.abs(c.position[0]));

    if (armRoots.length === 0) return;

    // Walk primary outward chain from the innermost lateral arm root
    const fullChain: PMXBone[] = [];
    let curr: PMXBone | undefined = armRoots[0];
    const seen = new Set<number>();

    while (curr && !seen.has(curr.index)) {
      seen.add(curr.index);
      fullChain.push(curr);
      const children: PMXBone[] = skeleton.childrenByBone[curr.index]
        .map((ci) => model.bones[ci])
        .filter((cb): cb is PMXBone => Boolean(cb) && !cb.isIK && cb.position[0] * sign >= curr!.position[0] * sign - 0.15);
      if (children.length === 0) break;
      if (children.length > 2) {
        // Likely reached wrist branching into fingers!
        break;
      }
      // Prefer the non-twist child continuing furthest outward
      children.sort((a, c) => {
        const twA = isTwistOrHelperBone(a, model, skeleton) ? 1 : 0;
        const twC = isTwistOrHelperBone(c, model, skeleton) ? 1 : 0;
        if (twA !== twC) return twA - twC;
        return c.position[0] * sign - a.position[0] * sign;
      });
      curr = children[0];
    }

    const primaryJoints = fullChain.filter((b) => !isTwistOrHelperBone(b, model, skeleton));
    if (primaryJoints.length >= 4) {
      // [Shoulder, UpperArm, Elbow, Wrist]
      assign(shoulderRole, primaryJoints[0], 0.76, ['hierarchy-chain', 'spatial-position'], 'Innermost lateral clavicle/shoulder link.');
      assign(armRole, primaryJoints[1], 0.82, ['hierarchy-chain', 'bone-direction', 'spatial-position'], 'Upper arm joint descending laterally.');
      assign(elbowRole, primaryJoints[2], 0.83, ['hierarchy-chain', 'spatial-position', 'parent-child'], 'Mid-arm elbow hinge between upper arm and wrist.');
      assign(wristRole, primaryJoints[3], 0.81, ['hierarchy-chain', 'hierarchy-branching'], 'Distal wrist joint at end of forearm.');
    } else if (primaryJoints.length === 3) {
      // [UpperArm, Elbow, Wrist]
      assign(armRole, primaryJoints[0], 0.8, ['hierarchy-chain', 'bone-direction', 'spatial-position'], 'Upper arm root extending laterally.');
      assign(elbowRole, primaryJoints[1], 0.82, ['hierarchy-chain', 'spatial-position', 'parent-child'], 'Mid-arm elbow hinge joint.');
      assign(wristRole, primaryJoints[2], 0.8, ['hierarchy-chain', 'spatial-position'], 'Distal wrist joint.');
    }

    // Identify any twist bones along the chain
    const twistJoints = fullChain.filter((b) => isTwistOrHelperBone(b, model, skeleton));
    for (const tw of twistJoints) {
      const armBone = result[armRole]?.bone;
      const elbBone = result[elbowRole]?.bone;
      if (armBone && isDescendant(model, armBone.index, tw.index) && (!elbBone || !isDescendant(model, elbBone.index, tw.index))) {
        assign(armTwistRole, tw, 0.75, ['twist-flag', 'hierarchy-chain'], 'Upper-arm axial twist helper.');
      } else if (elbBone && isDescendant(model, elbBone.index, tw.index)) {
        assign(wristTwistRole, tw, 0.75, ['twist-flag', 'hierarchy-chain'], 'Forearm axial twist helper.');
      }
    }
  };
  solveArmChain('L');
  solveArmChain('R');

  return result;
}

export function buildBoneMapping(
  model: PMXModelData,
  skeleton: SkeletonAnalysis,
  overrides: Partial<Record<StandardBoneRole, number | null>> = {}
): BoneMappingResult {
  const entries = {} as Record<StandardBoneRole, BoneMappingEntry>;
  const usedBoneIndices = new Set<number>();

  // Pass 1: Apply manual overrides first (allow intentional or erroneous user picks to be validated!)
  for (const def of STANDARD_BONE_ROLES) {
    if (Object.prototype.hasOwnProperty.call(overrides, def.role)) {
      const idx = overrides[def.role];
      if (idx === null || idx === undefined || idx < 0 || idx >= model.bones.length) {
        entries[def.role] = {
          role: def.role,
          label: def.label,
          boneIndex: null,
          boneName: null,
          englishBoneName: null,
          confidence: 'unmapped',
          confidenceScore: 0,
          signalsUsed: ['manual-override'],
          reason: 'Explicitly unmapped by user.',
        };
      } else {
        const b = model.bones[idx];
        usedBoneIndices.add(idx);
        entries[def.role] = {
          role: def.role,
          label: def.label,
          boneIndex: b.index,
          boneName: b.name,
          englishBoneName: b.englishName,
          confidence: 'manual',
          confidenceScore: 1.0,
          signalsUsed: ['manual-override'],
          reason: 'Manually assigned in Bone Mapping Editor.',
        };
      }
    }
  }

  // Pass 2: Exact JP / EN alias matching + spatial side guard
  for (const def of STANDARD_BONE_ROLES) {
    if (entries[def.role]) continue;

    let found: PMXBone | undefined;
    let matchReason = '';
    const signals: string[] = [];

    for (const b of model.bones) {
      if (usedBoneIndices.has(b.index)) continue;
      if (!matchesSide(b, def.expectedSide)) continue;
      const nJp = normalizeName(b.name);
      const nEn = normalizeName(b.englishName);
      if (def.aliases.includes(nJp)) {
        found = b;
        signals.push('jp-alias', 'spatial-side');
        matchReason = `Exact Japanese/canonical alias match ("${b.name}").`;
        break;
      }
      if (nEn && def.aliases.includes(nEn)) {
        found = b;
        signals.push('en-alias', 'spatial-side');
        matchReason = `Exact English alias match ("${b.englishName}").`;
        break;
      }
    }

    if (found) {
      usedBoneIndices.add(found.index);
      entries[def.role] = {
        role: def.role,
        label: def.label,
        boneIndex: found.index,
        boneName: found.name,
        englishBoneName: found.englishName,
        confidence: 'high',
        confidenceScore: 0.98,
        signalsUsed: signals,
        reason: matchReason,
      };
    }
  }

  // Pass 3: Structural Topology + IK Chain + Spatial Graph Solver (for unfamiliar/custom names)
  const topoMatches = buildTopologicalCandidates(model, skeleton, usedBoneIndices);
  for (const def of STANDARD_BONE_ROLES) {
    if (entries[def.role]) continue;
    const cand = topoMatches[def.role];
    if (cand && !usedBoneIndices.has(cand.bone.index)) {
      usedBoneIndices.add(cand.bone.index);
      entries[def.role] = {
        role: def.role,
        label: def.label,
        boneIndex: cand.bone.index,
        boneName: cand.bone.name,
        englishBoneName: cand.bone.englishName,
        confidence: cand.score >= 0.85 ? 'high' : cand.score >= 0.65 ? 'medium' : 'low',
        confidenceScore: Number(cand.score.toFixed(2)),
        signalsUsed: cand.signals,
        reason: cand.reason,
      };
    }
  }

  // Pass 4: Fuzzy substring + topological fallback (mark < 0.55 as UNMAPPED rather than guessing!)
  for (const def of STANDARD_BONE_ROLES) {
    if (entries[def.role]) continue;

    let bestBone: PMXBone | null = null;
    let bestScore = 0;
    let reason = '';
    const bestSignals: string[] = [];

    for (const b of model.bones) {
      if (usedBoneIndices.has(b.index)) continue;
      if (!matchesSide(b, def.expectedSide)) continue;

      const combined = `${normalizeName(b.name)} ${normalizeName(b.englishName)}`;
      let score = 0;
      const signals: string[] = [];

      for (const alias of def.aliases) {
        if (alias.length >= 3 && combined.includes(alias)) {
          score += 0.65;
          signals.push('substring-alias');
          break;
        }
      }

      if (def.role === 'upperBody' && b.position[1] > 7 && b.position[1] < 12 && Math.abs(b.position[0]) < 0.25) {
        if (skeleton.childrenByBone[b.index].length > 0 && /spine|torso|chest|body/i.test(combined)) {
          score += 0.3;
          signals.push('torso-topology');
        }
      }
      if ((def.role === 'legIkL' || def.role === 'legIkR') && b.isIK && b.ikLinks.length >= 1) {
        score += 0.35;
        signals.push('ik-flag');
      }
      if ((def.role === 'toeIkL' || def.role === 'toeIkR') && b.isIK && /toe|つま先/i.test(combined)) {
        score += 0.35;
        signals.push('ik-flag');
      }

      if (score > bestScore) {
        bestScore = score;
        bestBone = b;
        bestSignals.splice(0, bestSignals.length, ...signals);
        reason = `Multi-signal heuristic match (${Math.round(Math.min(1, score) * 100)}%).`;
      }
    }

    if (bestBone && bestScore >= 0.55) {
      usedBoneIndices.add(bestBone.index);
      const clampedScore = Math.min(1, Number(bestScore.toFixed(2)));
      entries[def.role] = {
        role: def.role,
        label: def.label,
        boneIndex: bestBone.index,
        boneName: bestBone.name,
        englishBoneName: bestBone.englishName,
        confidence: clampedScore >= 0.85 ? 'high' : clampedScore >= 0.65 ? 'medium' : 'low',
        confidenceScore: clampedScore,
        signalsUsed: bestSignals,
        reason,
      };
    } else {
      entries[def.role] = {
        role: def.role,
        label: def.label,
        boneIndex: null,
        boneName: null,
        englishBoneName: null,
        confidence: 'unmapped',
        confidenceScore: 0,
        signalsUsed: [],
        reason: def.required
          ? 'UNKNOWN / UNMAPPED — No confident structural or alias match; assign manually in Bone Mapping Editor.'
          : 'Optional bone not present in target skeleton.',
      };
    }
  }

  let mappedCount = 0;
  const lowConfidenceRoles: StandardBoneRole[] = [];
  const unmappedRequiredRoles: StandardBoneRole[] = [];

  for (const def of STANDARD_BONE_ROLES) {
    const entry = entries[def.role];
    if (entry.boneIndex !== null) {
      mappedCount++;
      if (entry.confidence === 'low' || entry.confidence === 'medium') {
        lowConfidenceRoles.push(def.role);
      }
    } else if (def.required) {
      unmappedRequiredRoles.push(def.role);
    }
  }

  const partialResult: BoneMappingResult = {
    modelKey: `${model.name}::${model.bones.length}`,
    skeletonSignature: computeSkeletonSignature(model),
    entries,
    mappedCount,
    lowConfidenceRoles,
    unmappedRequiredRoles,
    validationReport: {
      valid: true,
      hasCriticalWarnings: false,
      successfullyMapped: [],
      unmappedBones: [],
      lowConfidenceMappings: [],
      manuallyCorrectedMappings: [],
      unsupportedStructures: [],
      unknownModelBones: [],
      issues: [],
    },
  };

  partialResult.validationReport = validateBoneMapping(model, skeleton, partialResult);
  return partialResult;
}

export function validateBoneMapping(
  model: PMXModelData,
  skeleton: SkeletonAnalysis,
  mapping: BoneMappingResult
): MappingValidationReport {
  const issues: MappingValidationIssue[] = [];
  const successfullyMapped: StandardBoneRole[] = [];
  const unmappedBones: StandardBoneRole[] = [];
  const lowConfidenceMappings: StandardBoneRole[] = [];
  const manuallyCorrectedMappings: StandardBoneRole[] = [];
  const unsupportedStructures: string[] = [];

  const rolesByBoneIndex = new Map<number, StandardBoneRole[]>();

  for (const def of STANDARD_BONE_ROLES) {
    const entry = mapping.entries[def.role];
    if (!entry || entry.boneIndex === null) {
      unmappedBones.push(def.role);
      if (def.required) {
        issues.push({
          id: `missing-${def.role}`,
          severity: 'critical',
          category: 'missing-required',
          role: def.role,
          message: `Required anatomical role "${def.label}" is UNMAPPED.`,
        });
      }
      continue;
    }

    const list = rolesByBoneIndex.get(entry.boneIndex) ?? [];
    list.push(def.role);
    rolesByBoneIndex.set(entry.boneIndex, list);

    if (entry.confidence === 'manual') {
      manuallyCorrectedMappings.push(def.role);
    } else if (entry.confidence === 'low' || entry.confidence === 'medium') {
      lowConfidenceMappings.push(def.role);
      if (def.required && entry.confidence === 'low') {
        issues.push({
          id: `lowconf-${def.role}`,
          severity: 'critical',
          category: 'low-confidence',
          role: def.role,
          boneName: entry.boneName ?? undefined,
          message: `Required role "${def.label}" has low-confidence mapping (${Math.round(entry.confidenceScore * 100)}%) to "${entry.boneName}". Review before pose transfer.`,
        });
      }
    }
    successfullyMapped.push(def.role);

    const bone = model.bones[entry.boneIndex];
    if (!bone) continue;

    // Left / Right spatial sanity check
    if (def.expectedSide === 'L' && bone.position[0] < -0.2) {
      issues.push({
        id: `side-${def.role}`,
        severity: 'critical',
        category: 'side-mismatch',
        role: def.role,
        boneName: bone.name,
        message: `Left role "${def.label}" is mapped to "${bone.name}" at X=${bone.position[0].toFixed(2)} (anatomical right side).`,
      });
    } else if (def.expectedSide === 'R' && bone.position[0] > 0.2) {
      issues.push({
        id: `side-${def.role}`,
        severity: 'critical',
        category: 'side-mismatch',
        role: def.role,
        boneName: bone.name,
        message: `Right role "${def.label}" is mapped to "${bone.name}" at X=${bone.position[0].toFixed(2)} (anatomical left side).`,
      });
    }

    // Local axis sanity check
    if (bone.hasLocalAxis) {
      const lxLen = Math.hypot(...bone.localAxisX);
      const lzLen = Math.hypot(...bone.localAxisZ);
      if (lxLen < 1e-4 || lzLen < 1e-4) {
        issues.push({
          id: `axis-${def.role}`,
          severity: 'warning',
          category: 'local-axis-invalid',
          role: def.role,
          boneName: bone.name,
          message: `Bone "${bone.name}" declares local axes with degenerate zero-length vector.`,
        });
      }
    }

    // Unusual bone rest orientation check
    const dir = skeleton.restBoneDirs[bone.index];
    if ((def.role === 'armL' || def.role === 'armR') && dir && dir[1] > 0.7) {
      issues.push({
        id: `orient-${def.role}`,
        severity: 'warning',
        category: 'unusual-orientation',
        role: def.role,
        boneName: bone.name,
        message: `Upper arm "${bone.name}" points sharply upward at rest (dir.y=${dir[1].toFixed(2)}). Verify A/T-pose orientation.`,
      });
    }
    if ((def.role === 'legL' || def.role === 'legR') && dir && dir[1] > 0.2) {
      issues.push({
        id: `orient-${def.role}`,
        severity: 'warning',
        category: 'unusual-orientation',
        role: def.role,
        boneName: bone.name,
        message: `Thigh bone "${bone.name}" does not point downward at rest (dir.y=${dir[1].toFixed(2)}).`,
      });
    }
  }

  // Duplicate bone assignment check
  rolesByBoneIndex.forEach((roles, boneIdx) => {
    if (roles.length > 1) {
      const bName = model.bones[boneIdx]?.name ?? `#${boneIdx}`;
      issues.push({
        id: `dup-${boneIdx}`,
        severity: 'critical',
        category: 'duplicate-mapping',
        boneName: bName,
        message: `Bone "${bName}" (#${boneIdx}) is assigned to multiple roles: ${roles.map((r) => ROLE_DEF_MAP[r].label).join(', ')}.`,
      });
    }
  });

  // Parent-child anatomical hierarchy checks
  const hierarchyPairs: Array<[StandardBoneRole, StandardBoneRole]> = [
    ['armL', 'elbowL'],
    ['elbowL', 'wristL'],
    ['armR', 'elbowR'],
    ['elbowR', 'wristR'],
    ['legL', 'kneeL'],
    ['kneeL', 'ankleL'],
    ['legR', 'kneeR'],
    ['kneeR', 'ankleR'],
    ['neck', 'head'],
  ];
  for (const [parentRole, childRole] of hierarchyPairs) {
    const pIdx = mapping.entries[parentRole]?.boneIndex;
    const cIdx = mapping.entries[childRole]?.boneIndex;
    if (pIdx !== null && pIdx !== undefined && cIdx !== null && cIdx !== undefined) {
      if (!isDescendant(model, pIdx, cIdx)) {
        issues.push({
          id: `hier-${parentRole}-${childRole}`,
          severity: 'critical',
          category: 'hierarchy-invalid',
          role: childRole,
          boneName: model.bones[cIdx]?.name,
          message: `Parent-child mismatch: "${ROLE_DEF_MAP[childRole].label}" (${model.bones[cIdx]?.name}) is not a descendant of "${ROLE_DEF_MAP[parentRole].label}" (${model.bones[pIdx]?.name}).`,
        });
      }
    }
  }

  // Twist bone validity checks
  const twistChecks: Array<[StandardBoneRole, StandardBoneRole]> = [
    ['armTwistL', 'armL'],
    ['armTwistR', 'armR'],
    ['wristTwistL', 'elbowL'],
    ['wristTwistR', 'elbowR'],
  ];
  for (const [twRole, parentLimb] of twistChecks) {
    const twIdx = mapping.entries[twRole]?.boneIndex;
    const limbIdx = mapping.entries[parentLimb]?.boneIndex;
    if (twIdx !== null && twIdx !== undefined) {
      const twBone = model.bones[twIdx];
      if (twBone && !twBone.rotatable) {
        issues.push({
          id: `twist-norot-${twRole}`,
          severity: 'warning',
          category: 'twist-invalid',
          role: twRole,
          boneName: twBone.name,
          message: `Twist bone "${twBone.name}" is flagged non-rotatable in PMX.`,
        });
      }
      if (limbIdx !== null && limbIdx !== undefined && !isDescendant(model, limbIdx, twIdx)) {
        issues.push({
          id: `twist-hier-${twRole}`,
          severity: 'warning',
          category: 'twist-invalid',
          role: twRole,
          boneName: twBone?.name,
          message: `Twist bone "${twBone?.name}" does not descend from "${model.bones[limbIdx]?.name}".`,
        });
      }
    }
  }

  // IK bone validity checks
  for (const ikRole of ['legIkL', 'legIkR', 'toeIkL', 'toeIkR'] as StandardBoneRole[]) {
    const idx = mapping.entries[ikRole]?.boneIndex;
    if (idx !== null && idx !== undefined) {
      const b = model.bones[idx];
      if (b && (!b.isIK || b.ikLinks.length === 0)) {
        issues.push({
          id: `ik-invalid-${ikRole}`,
          severity: 'critical',
          category: 'ik-invalid',
          role: ikRole,
          boneName: b.name,
          message: `IK role "${ROLE_DEF_MAP[ikRole].label}" is mapped to "${b.name}", which lacks a PMX IK chain.`,
        });
      }
    }
  }

  // Unsupported anatomical structures & missing fingers
  if (!skeleton.hasLegIK) unsupportedStructures.push('Leg IK chains (legs use FK rotations)');
  if (!skeleton.hasUpperBody2) unsupportedStructures.push('UpperBody2 / Chest split spine');
  if (!skeleton.hasTwistBones) unsupportedStructures.push('Arm/Wrist twist helper bones');
  if (skeleton.fingerCoverage !== 'full') {
    const msg =
      skeleton.fingerCoverage === 'partial'
        ? 'Partial finger rig (available finger groups mapped; missing phalanges skipped)'
        : 'No finger bones in PMX rig';
    unsupportedStructures.push(msg);
    issues.push({
      id: 'missing-fingers',
      severity: 'info',
      category: 'missing-fingers',
      message: msg,
    });
  }

  // Unknown / unmapped non-standard model bones preserved for export fidelity
  const mappedIndices = new Set<number>(Array.from(rolesByBoneIndex.keys()));
  const unknownModelBones = model.bones
    .filter((b) => !mappedIndices.has(b.index))
    .map((b) => ({ index: b.index, name: b.name, englishName: b.englishName }));

  const hasCriticalWarnings = issues.some((i) => i.severity === 'critical');

  return {
    valid: !hasCriticalWarnings,
    hasCriticalWarnings,
    successfullyMapped,
    unmappedBones,
    lowConfidenceMappings,
    manuallyCorrectedMappings,
    unsupportedStructures,
    unknownModelBones,
    issues,
  };
}
