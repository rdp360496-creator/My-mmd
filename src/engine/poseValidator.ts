import * as THREE from 'three';
import { clamp, radToDeg } from './mmdCoordinates';
import { validateVMDName } from './shiftJis';
import type {
  BoneMappingResult,
  PMXModelData,
  RetargetedPose,
  SkeletonAnalysis,
  StandardBoneRole,
  ValidationIssue,
  ValidationReport,
} from './types';

function clampQuaternionSwing(qArr: [number, number, number, number], maxDeg: number): {
  clamped: [number, number, number, number];
  wasClamped: boolean;
  angleDeg: number;
} {
  const q = new THREE.Quaternion(qArr[0], qArr[1], qArr[2], qArr[3]).normalize();
  const halfAngle = Math.acos(clamp(Math.abs(q.w), -1, 1));
  const angleDeg = radToDeg(halfAngle * 2);
  if (angleDeg <= maxDeg) {
    return { clamped: [q.x, q.y, q.z, q.w], wasClamped: false, angleDeg };
  }
  const factor = maxDeg / Math.max(angleDeg, 1e-4);
  const res = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), q, factor).normalize();
  return { clamped: [res.x, res.y, res.z, res.w], wasClamped: true, angleDeg };
}

export function validateRetargetedPose(
  model: PMXModelData,
  skeleton: SkeletonAnalysis,
  mapping: BoneMappingResult,
  pose: RetargetedPose,
  morphWeights: Record<string, number>
): ValidationReport {
  const issues: ValidationIssue[] = [];
  let checkedBones = 0;

  const getRoleTransform = (role: StandardBoneRole) => {
    const idx = mapping.entries[role]?.boneIndex;
    if (idx === null || idx === undefined) return null;
    return { idx, transform: pose.transforms[idx], bone: model.bones[idx] };
  };

  // 1. Check IK conflict (both Leg IK translation and direct FK Leg/Knee rotation applied)
  if (pose.ikEnabled && skeleton.hasLegIK) {
    const conflictRoles: StandardBoneRole[] = ['legL', 'kneeL', 'legR', 'kneeR'];
    for (const r of conflictRoles) {
      const rt = getRoleTransform(r);
      if (rt?.transform && rt.transform.source !== 'ik') {
        const ang = radToDeg(
          2 * Math.acos(clamp(Math.abs(rt.transform.quaternion[3]), -1, 1))
        );
        if (ang > 2.5) {
          issues.push({
            id: `ik-conflict-${r}`,
            severity: 'warning',
            category: 'ik-conflict',
            boneName: rt.bone.name,
            message: `Both Leg IK and direct FK rotation (${ang.toFixed(1)}°) are active on "${rt.bone.name}". Auto-correct will clear conflicting FK transforms.`,
            autoCorrectible: true,
          });
        }
      }
    }
  }

  // 2. Check joint angular limits across key anatomical roles
  const limitChecks: Array<{ role: StandardBoneRole; maxDeg: number; label: string }> = [
    { role: 'upperBody', maxDeg: 55, label: 'Upper Body bend/twist' },
    { role: 'upperBody2', maxDeg: 48, label: 'Chest twist' },
    { role: 'neck', maxDeg: 45, label: 'Neck rotation' },
    { role: 'head', maxDeg: 65, label: 'Head orientation' },
    { role: 'shoulderL', maxDeg: 35, label: 'Left Shoulder elevation' },
    { role: 'shoulderR', maxDeg: 35, label: 'Right Shoulder elevation' },
    { role: 'armL', maxDeg: 155, label: 'Left Upper Arm swing' },
    { role: 'armR', maxDeg: 155, label: 'Right Upper Arm swing' },
    { role: 'elbowL', maxDeg: 148, label: 'Left Elbow bend' },
    { role: 'elbowR', maxDeg: 148, label: 'Right Elbow bend' },
    { role: 'wristL', maxDeg: 85, label: 'Left Wrist bend' },
    { role: 'wristR', maxDeg: 85, label: 'Right Wrist bend' },
    { role: 'kneeL', maxDeg: 150, label: 'Left Knee bend' },
    { role: 'kneeR', maxDeg: 150, label: 'Right Knee bend' },
  ];

  for (const check of limitChecks) {
    const rt = getRoleTransform(check.role);
    if (!rt?.transform) continue;
    checkedBones++;
    const q = new THREE.Quaternion(...rt.transform.quaternion).normalize();
    const angleDeg = radToDeg(2 * Math.acos(clamp(Math.abs(q.w), -1, 1)));
    if (angleDeg > check.maxDeg) {
      issues.push({
        id: `limit-${check.role}`,
        severity: 'warning',
        category: 'joint-limit',
        boneName: rt.bone.name,
        message: `${check.label} (${angleDeg.toFixed(1)}°) exceeds anatomical comfort limit (${check.maxDeg}°).`,
        autoCorrectible: true,
      });
    }
  }

  // 3. Check FK knee reversed bend (positive vs negative X in Three.js)
  for (const side of ['L', 'R'] as const) {
    const kneeRole: StandardBoneRole = side === 'L' ? 'kneeL' : 'kneeR';
    const rt = getRoleTransform(kneeRole);
    if (rt?.transform && !pose.ikEnabled) {
      const euler = new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion(...rt.transform.quaternion),
        'YXZ'
      );
      if (euler.x < -0.15) {
        issues.push({
          id: `knee-reverse-${side}`,
          severity: 'error',
          category: 'orientation',
          boneName: rt.bone.name,
          message: `Reversed knee bend detected on "${rt.bone.name}" (${radToDeg(euler.x).toFixed(1)}°).`,
          autoCorrectible: true,
        });
      }
    }
  }

  // 4. Check ground penetration on Leg IK targets
  for (const side of ['L', 'R'] as const) {
    const ikRole: StandardBoneRole = side === 'L' ? 'legIkL' : 'legIkR';
    const rt = getRoleTransform(ikRole);
    if (rt?.transform) {
      const finalY = rt.bone.position[1] + rt.transform.translation[1];
      if (finalY < 0.2) {
        issues.push({
          id: `ground-${side}`,
          severity: 'warning',
          category: 'ground-contact',
          boneName: rt.bone.name,
          message: `Foot IK target "${rt.bone.name}" penetrates floor plane (Y=${finalY.toFixed(2)}).`,
          autoCorrectible: true,
        });
      }
    }
  }

  // 5. Check VMD 15-byte Shift_JIS safety on active bones & morphs
  for (const t of Object.values(pose.transforms)) {
    const check = validateVMDName(t.boneName, 15);
    if (!check.valid) {
      issues.push({
        id: `vmd-bone-${t.boneIndex}`,
        severity: 'warning',
        category: 'vmd-limit',
        boneName: t.boneName,
        message: `Bone "${t.boneName}" (${check.byteLength} bytes) exceeds VMD 15-byte Shift_JIS limit. VPD works, or skip in VMD export.`,
        autoCorrectible: false,
      });
    }
  }
  for (const [mName, w] of Object.entries(morphWeights)) {
    if (Math.abs(w) <= 1e-4) continue;
    const check = validateVMDName(mName, 15);
    if (!check.valid) {
      issues.push({
        id: `vmd-morph-${mName}`,
        severity: 'warning',
        category: 'vmd-limit',
        boneName: mName,
        message: `Morph "${mName}" (${check.byteLength} bytes) exceeds VMD 15-byte limit.`,
        autoCorrectible: false,
      });
    }
  }

  const hasErrors = issues.some((i) => i.severity === 'error');
  return {
    valid: !hasErrors && issues.length === 0,
    issues,
    checkedBones: Math.max(checkedBones, Object.keys(pose.transforms).length),
    correctedCount: 0,
  };
}

export function autoCorrectPose(
  model: PMXModelData,
  skeleton: SkeletonAnalysis,
  mapping: BoneMappingResult,
  pose: RetargetedPose,
  morphWeights: Record<string, number>
): { pose: RetargetedPose; report: ValidationReport } {
  const nextTransforms = { ...pose.transforms };
  let correctedCount = 0;

  const getIdx = (role: StandardBoneRole) => mapping.entries[role]?.boneIndex ?? null;

  // 1. Resolve IK conflicts
  if (pose.ikEnabled && skeleton.hasLegIK) {
    for (const r of ['legL', 'kneeL', 'legR', 'kneeR'] as StandardBoneRole[]) {
      const idx = getIdx(r);
      if (idx !== null && nextTransforms[idx] && nextTransforms[idx].source !== 'ik') {
        delete nextTransforms[idx];
        correctedCount++;
      }
    }
  }

  // 2. Clamp joint angular limits
  const limitChecks: Array<{ role: StandardBoneRole; maxDeg: number }> = [
    { role: 'upperBody', maxDeg: 55 },
    { role: 'upperBody2', maxDeg: 48 },
    { role: 'neck', maxDeg: 45 },
    { role: 'head', maxDeg: 65 },
    { role: 'shoulderL', maxDeg: 35 },
    { role: 'shoulderR', maxDeg: 35 },
    { role: 'armL', maxDeg: 155 },
    { role: 'armR', maxDeg: 155 },
    { role: 'elbowL', maxDeg: 148 },
    { role: 'elbowR', maxDeg: 148 },
    { role: 'wristL', maxDeg: 85 },
    { role: 'wristR', maxDeg: 85 },
    { role: 'kneeL', maxDeg: 150 },
    { role: 'kneeR', maxDeg: 150 },
  ];

  for (const c of limitChecks) {
    const idx = getIdx(c.role);
    if (idx === null || !nextTransforms[idx]) continue;
    const res = clampQuaternionSwing(nextTransforms[idx].quaternion, c.maxDeg);
    if (res.wasClamped) {
      nextTransforms[idx] = {
        ...nextTransforms[idx],
        quaternion: res.clamped,
      };
      correctedCount++;
    }
  }

  // 3. Fix reversed FK knees
  if (!pose.ikEnabled) {
    for (const r of ['kneeL', 'kneeR'] as StandardBoneRole[]) {
      const idx = getIdx(r);
      if (idx === null || !nextTransforms[idx]) continue;
      const euler = new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion(...nextTransforms[idx].quaternion),
        'YXZ'
      );
      if (euler.x < 0) {
        euler.x = Math.abs(euler.x) * 0.6;
        euler.z = 0;
        const q = new THREE.Quaternion().setFromEuler(euler).normalize();
        nextTransforms[idx] = {
          ...nextTransforms[idx],
          quaternion: [q.x, q.y, q.z, q.w],
        };
        correctedCount++;
      }
    }
  }

  // 4. Clamp floor penetration on Leg IK targets
  for (const r of ['legIkL', 'legIkR'] as StandardBoneRole[]) {
    const idx = getIdx(r);
    if (idx === null || !nextTransforms[idx]) continue;
    const restY = model.bones[idx].position[1];
    const finalY = restY + nextTransforms[idx].translation[1];
    if (finalY < 0.75) {
      const t = [...nextTransforms[idx].translation] as [number, number, number];
      t[1] = 0.75 - restY;
      nextTransforms[idx] = {
        ...nextTransforms[idx],
        translation: t,
      };
      correctedCount++;
    }
  }

  const correctedPose: RetargetedPose = {
    ...pose,
    transforms: nextTransforms,
  };
  const report = validateRetargetedPose(model, skeleton, mapping, correctedPose, morphWeights);
  report.correctedCount = correctedCount;

  return { pose: correctedPose, report };
}
