import * as THREE from 'three';
import { clamp, decomposeSwingTwist, degToRad, mmdVecToThree } from './mmdCoordinates';
import type {
  BoneMappingResult,
  BoneTransform,
  HandPoseAnalysis,
  ModelCalibrationProfile,
  PMXModelData,
  Pose2DAnalysis,
  Pose3DReconstruction,
  RetargetedPose,
  SkeletonAnalysis,
  StandardBoneRole,
  Vec3,
} from './types';

export interface RetargetOptions {
  useIK: boolean;
  mirror: boolean;
  poseStrength: number; // 0..1
  distributeTwist: boolean;
  calibration?: ModelCalibrationProfile | null;
}

function mirrorVecX(v: Vec3): Vec3 {
  return [-v[0], v[1], v[2]];
}

/**
 * Model-aware quaternion retargeting engine.
 * Reads rest-pose directions, hierarchy, local axes, twist bones, and IK configs
 * directly from the target PMX/PMD model—never assuming a fixed rest pose or naming convention.
 */
export function retargetPoseToModel(
  model: PMXModelData,
  skeleton: SkeletonAnalysis,
  mapping: BoneMappingResult,
  pose3D: Pose3DReconstruction,
  pose2D: Pose2DAnalysis | null,
  options: RetargetOptions
): RetargetedPose {
  const transforms: Record<number, BoneTransform> = {};
  const strength = clamp(options.poseStrength, 0, 1);
  const calibration = options.calibration ?? null;

  const getMappedIdx = (role: StandardBoneRole): number | null => {
    const calEntry = calibration?.anatomicalMapping[role];
    if (calEntry && calEntry.boneIndex !== undefined) {
      return calEntry.boneIndex;
    }
    const entry = mapping.entries[role];
    return entry && entry.boneIndex !== null ? entry.boneIndex : null;
  };

  // Helper to get joint position (handling optional pose mirroring across YZ plane)
  const getJointPos = (name: string): THREE.Vector3 | null => {
    const swapSide = (n: string) => {
      if (!options.mirror) return n;
      if (n.startsWith('left')) return 'right' + n.slice(4);
      if (n.startsWith('right')) return 'left' + n.slice(5);
      return n;
    };
    const j = pose3D.joints[swapSide(name)];
    if (!j) return null;
    const p = options.mirror ? mirrorVecX(j.position) : j.position;
    return new THREE.Vector3(p[0], p[1], p[2]);
  };

  // Build world-space rest positions & world-space posed transforms recursively
  const worldQuats = model.bones.map(() => new THREE.Quaternion());
  const localQuats = model.bones.map(() => new THREE.Quaternion());
  const localTrans = model.bones.map(() => new THREE.Vector3());

  // Compute rest-pose bone vectors in Three.js space from calibration profile if available
  const restDirsThree = (calibration?.restDirections ?? skeleton.restBoneDirs).map((d) =>
    mmdVecToThree(d).normalize()
  );
  const localAxesSource = calibration?.localAxes ?? skeleton.localBases;

  const getParentWorldQuat = (boneIdx: number): THREE.Quaternion => {
    const p = model.bones[boneIdx]?.parentIndex ?? -1;
    if (p < 0 || p >= model.bones.length) return new THREE.Quaternion();
    return worldQuats[p].clone();
  };

  const setBoneWorldRotation = (
    boneIdx: number | null,
    targetWorldDir: THREE.Vector3,
    source: BoneTransform['source'] = 'retargeted',
    rollAxisSign = 0,
    rollAngleRad = 0
  ) => {
    if (boneIdx === null || boneIdx < 0 || boneIdx >= model.bones.length) return;
    const bone = model.bones[boneIdx];
    if (!bone.rotatable) return;

    const parentWorldQ = getParentWorldQuat(boneIdx);
    const currentRestDir = restDirsThree[boneIdx].clone().applyQuaternion(parentWorldQ).normalize();
    const desiredDir = targetWorldDir.clone().normalize();

    if (currentRestDir.lengthSq() < 1e-6 || desiredDir.lengthSq() < 1e-6) return;

    // Minimal arc rotation from current world direction to desired world direction
    const deltaWorld = new THREE.Quaternion().setFromUnitVectors(currentRestDir, desiredDir);
    if (rollAxisSign !== 0 && Math.abs(rollAngleRad) > 1e-4) {
      const twistQ = new THREE.Quaternion().setFromAxisAngle(desiredDir, rollAngleRad * rollAxisSign);
      deltaWorld.premultiply(twistQ);
    }

    // Apply pose strength blend from identity
    const newWorldQ = deltaWorld.multiply(parentWorldQ).normalize();
    const localQ = parentWorldQ.clone().invert().multiply(newWorldQ).normalize();

    // Respect fixed-axis constraint if declared in PMX
    if (bone.hasFixedAxis) {
      const axisThree = mmdVecToThree(bone.fixedAxis).normalize();
      const { twist } = decomposeSwingTwist(localQ, axisThree);
      localQ.copy(twist);
    }

    const blendedLocal = new THREE.Quaternion().slerpQuaternions(
      new THREE.Quaternion(),
      localQ,
      strength
    );

    localQuats[boneIdx].copy(blendedLocal);
    worldQuats[boneIdx].copy(parentWorldQ).multiply(blendedLocal).normalize();

    transforms[boneIdx] = {
      boneIndex: boneIdx,
      boneName: bone.name,
      translation: [localTrans[boneIdx].x, localTrans[boneIdx].y, localTrans[boneIdx].z],
      quaternion: [blendedLocal.x, blendedLocal.y, blendedLocal.z, blendedLocal.w],
      source,
    };

    // Propagate world quaternion to unposed children
    const queue = [...skeleton.childrenByBone[boneIdx]];
    while (queue.length > 0) {
      const childIdx = queue.shift()!;
      const pIdx = model.bones[childIdx].parentIndex;
      worldQuats[childIdx].copy(worldQuats[pIdx]).multiply(localQuats[childIdx]).normalize();
      for (const gc of skeleton.childrenByBone[childIdx]) {
        queue.push(gc);
      }
    }
  };

  // 1. Center / Root offset (sitting/crouching pelvis vertical shift)
  const centerIdx = getMappedIdx('center');
  const pelvisJ = getJointPos('pelvis');
  let rootOffsetY = 0;
  if (centerIdx !== null && pelvisJ) {
    const centerRestY = model.bones[centerIdx].position[1];
    rootOffsetY = (pelvisJ.y - centerRestY) * strength;
    if (model.bones[centerIdx].translatable && Math.abs(rootOffsetY) > 0.02) {
      localTrans[centerIdx].set(0, rootOffsetY, 0);
      transforms[centerIdx] = {
        boneIndex: centerIdx,
        boneName: model.bones[centerIdx].name,
        translation: [0, rootOffsetY, 0],
        quaternion: [0, 0, 0, 1],
        source: 'retargeted',
      };
    }
  }

  // 2. Torso & Spine (distribute between upperBody and upperBody2 if present)
  const chestJ = getJointPos('chest');
  const neckJ = getJointPos('neck');
  const lShJ = getJointPos('leftShoulder');
  const rShJ = getJointPos('rightShoulder');
  const lHipJ = getJointPos('leftHip');
  const rHipJ = getJointPos('rightHip');

  const upperBodyIdx = getMappedIdx('upperBody');
  const upperBody2Idx = getMappedIdx('upperBody2');
  const waistIdx = getMappedIdx('waist');

  // Hip yaw/tilt for Lower Body
  if (waistIdx !== null && lHipJ && rHipJ) {
    const hipRightToLeft = lHipJ.clone().sub(rHipJ).normalize();
    const restHipAxis = new THREE.Vector3(1, 0, 0);
    const hipDelta = new THREE.Quaternion().setFromUnitVectors(restHipAxis, hipRightToLeft);
    const blended = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), hipDelta, strength * 0.65);
    localQuats[waistIdx].copy(blended);
    worldQuats[waistIdx].copy(getParentWorldQuat(waistIdx)).multiply(blended).normalize();
    transforms[waistIdx] = {
      boneIndex: waistIdx,
      boneName: model.bones[waistIdx].name,
      translation: [0, 0, 0],
      quaternion: [blended.x, blended.y, blended.z, blended.w],
      source: 'retargeted',
    };
  }

  if (pelvisJ && chestJ && neckJ) {
    const lowerSpineDir = chestJ.clone().sub(pelvisJ).normalize();
    const upperSpineDir = neckJ.clone().sub(chestJ).normalize();
    if (upperBody2Idx !== null) {
      setBoneWorldRotation(upperBodyIdx, lowerSpineDir);
      setBoneWorldRotation(upperBody2Idx, upperSpineDir);
    } else {
      const fullSpineDir = neckJ.clone().sub(pelvisJ).normalize();
      setBoneWorldRotation(upperBodyIdx, fullSpineDir);
    }

    // Apply shoulder-line yaw twist across upperBody2 / upperBody
    if (lShJ && rShJ && upperBody2Idx !== null) {
      const pWorld = getParentWorldQuat(upperBody2Idx);
      const currentX = new THREE.Vector3(1, 0, 0).applyQuaternion(pWorld).normalize();
      const targetX = lShJ.clone().sub(rShJ).normalize();
      const spineAxis = upperSpineDir.clone().normalize();
      const projCurr = currentX.clone().addScaledVector(spineAxis, -currentX.dot(spineAxis)).normalize();
      const projTarg = targetX.clone().addScaledVector(spineAxis, -targetX.dot(spineAxis)).normalize();
      if (projCurr.lengthSq() > 0.1 && projTarg.lengthSq() > 0.1) {
        const yawQ = new THREE.Quaternion().setFromUnitVectors(projCurr, projTarg);
        const existing = localQuats[upperBody2Idx].clone();
        const combined = existing.premultiply(
          new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), yawQ, strength * 0.75)
        );
        localQuats[upperBody2Idx].copy(combined);
        worldQuats[upperBody2Idx].copy(pWorld).multiply(combined).normalize();
        transforms[upperBody2Idx] = {
          boneIndex: upperBody2Idx,
          boneName: model.bones[upperBody2Idx].name,
          translation: [0, 0, 0],
          quaternion: [combined.x, combined.y, combined.z, combined.w],
          source: 'retargeted',
        };
      }
    }
  }

  // 3. Neck & Head
  const headJ = getJointPos('head');
  const headTopJ = getJointPos('headTop');
  const neckIdx = getMappedIdx('neck');
  const headIdx = getMappedIdx('head');

  if (neckJ && headJ) {
    const neckDir = headJ.clone().sub(neckJ).normalize();
    setBoneWorldRotation(neckIdx, neckDir);
  }
  if (headJ && headTopJ) {
    const headDir = headTopJ.clone().sub(headJ).normalize();
    setBoneWorldRotation(headIdx, headDir);
    if (pose2D?.expression && headIdx !== null) {
      const yaw = degToRad(pose2D.expression.headYawDeg * (options.mirror ? -1 : 1) * 0.35);
      const extraYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw * strength);
      const q = localQuats[headIdx].clone().multiply(extraYaw).normalize();
      localQuats[headIdx].copy(q);
      transforms[headIdx] = {
        boneIndex: headIdx,
        boneName: model.bones[headIdx].name,
        translation: [0, 0, 0],
        quaternion: [q.x, q.y, q.z, q.w],
        source: 'retargeted',
      };
    }
  }

  // 4. Arms + Twist Distribution + Hands + Fingers
  const retargetArmSide = (side: 'L' | 'R') => {
    const jPrefix = side === 'L' ? 'left' : 'right';
    const shPos = getJointPos(`${jPrefix}Shoulder`);
    const elbPos = getJointPos(`${jPrefix}Elbow`);
    const wriPos = getJointPos(`${jPrefix}Wrist`);
    if (!shPos || !elbPos || !wriPos) return;

    const shoulderIdx = getMappedIdx(side === 'L' ? 'shoulderL' : 'shoulderR');
    const armIdx = getMappedIdx(side === 'L' ? 'armL' : 'armR');
    const armTwistIdx = getMappedIdx(side === 'L' ? 'armTwistL' : 'armTwistR');
    const elbowIdx = getMappedIdx(side === 'L' ? 'elbowL' : 'elbowR');
    const wristTwistIdx = getMappedIdx(side === 'L' ? 'wristTwistL' : 'wristTwistR');
    const wristIdx = getMappedIdx(side === 'L' ? 'wristL' : 'wristR');

    const upperArmDir = elbPos.clone().sub(shPos).normalize();
    const forearmDir = wriPos.clone().sub(elbPos).normalize();

    // Subtle clavicle lift when arm is raised above shoulder height
    if (shoulderIdx !== null && upperArmDir.y > 0.15) {
      const shLift = clamp(upperArmDir.y * 0.28, 0, 0.25) * (side === 'L' ? 1 : -1) * strength;
      const shQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), shLift);
      localQuats[shoulderIdx].copy(shQ);
      worldQuats[shoulderIdx].copy(getParentWorldQuat(shoulderIdx)).multiply(shQ).normalize();
      transforms[shoulderIdx] = {
        boneIndex: shoulderIdx,
        boneName: model.bones[shoulderIdx].name,
        translation: [0, 0, 0],
        quaternion: [shQ.x, shQ.y, shQ.z, shQ.w],
        source: 'retargeted',
      };
    }

    // Upper Arm (handles A-pose vs T-pose rest dir automatically!)
    setBoneWorldRotation(armIdx, upperArmDir);

    // Elbow swing
    setBoneWorldRotation(elbowIdx, forearmDir);

    // Twist distribution across armTwist / wristTwist if present
    const handData: HandPoseAnalysis | undefined =
      pose2D === null
        ? undefined
        : options.mirror
          ? side === 'L'
            ? pose2D.rightHand
            : pose2D.leftHand
          : side === 'L'
            ? pose2D.leftHand
            : pose2D.rightHand;

    if (options.distributeTwist && handData && handData.visible) {
      const twistTotal = degToRad(clamp(handData.wristAngleDeg, -65, 65)) * 0.65 * strength;
      if (armTwistIdx !== null) {
        const axis = restDirsThree[armTwistIdx];
        const qTwist = new THREE.Quaternion().setFromAxisAngle(axis, twistTotal * 0.45);
        transforms[armTwistIdx] = {
          boneIndex: armTwistIdx,
          boneName: model.bones[armTwistIdx].name,
          translation: [0, 0, 0],
          quaternion: [qTwist.x, qTwist.y, qTwist.z, qTwist.w],
          source: 'twist-distributed',
        };
      }
      if (wristTwistIdx !== null) {
        const axis = restDirsThree[wristTwistIdx];
        const qTwist = new THREE.Quaternion().setFromAxisAngle(axis, twistTotal * 0.55);
        transforms[wristTwistIdx] = {
          boneIndex: wristTwistIdx,
          boneName: model.bones[wristTwistIdx].name,
          translation: [0, 0, 0],
          quaternion: [qTwist.x, qTwist.y, qTwist.z, qTwist.w],
          source: 'twist-distributed',
        };
      }
    }

    // Wrist orientation from palm/wrist hint
    if (wristIdx !== null && handData && handData.visible) {
      const pitch = degToRad(clamp(handData.wristAngleDeg * 0.35, -35, 35)) * strength;
      const palmYaw =
        handData.palmOrientation === 'forward'
          ? 0.25
          : handData.palmOrientation === 'backward'
            ? -0.25
            : 0;
      const qWrist = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(palmYaw * strength, 0, pitch * (side === 'L' ? 1 : -1))
      );
      transforms[wristIdx] = {
        boneIndex: wristIdx,
        boneName: model.bones[wristIdx].name,
        translation: [0, 0, 0],
        quaternion: [qWrist.x, qWrist.y, qWrist.z, qWrist.w],
        source: 'retargeted',
      };
    }

    // Finger bones mapped safely to available segments
    if (handData && handData.visible) {
      const curlAxis = new THREE.Vector3(0, 0, side === 'L' ? -1 : 1);
      const fingerGroups: Array<{ roles: StandardBoneRole[]; curl: number; maxRad: number }> = [
        {
          roles: side === 'L' ? ['thumb0L', 'thumb1L', 'thumb2L'] : ['thumb0R', 'thumb1R', 'thumb2R'],
          curl: handData.fingerCurl.thumb,
          maxRad: 0.75,
        },
        {
          roles: side === 'L' ? ['index1L', 'index2L', 'index3L'] : ['index1R', 'index2R', 'index3R'],
          curl: handData.fingerCurl.index,
          maxRad: 1.25,
        },
        {
          roles: side === 'L' ? ['middle1L', 'middle2L', 'middle3L'] : ['middle1R', 'middle2R', 'middle3R'],
          curl: handData.fingerCurl.middle,
          maxRad: 1.3,
        },
        {
          roles: side === 'L' ? ['ring1L', 'ring2L', 'ring3L'] : ['ring1R', 'ring2R', 'ring3R'],
          curl: handData.fingerCurl.ring,
          maxRad: 1.3,
        },
        {
          roles: side === 'L' ? ['pinky1L', 'pinky2L', 'pinky3L'] : ['pinky1R', 'pinky2R', 'pinky3R'],
          curl: handData.fingerCurl.pinky,
          maxRad: 1.25,
        },
      ];

      for (const fg of fingerGroups) {
        const ang = clamp(fg.curl, 0, 1) * fg.maxRad * strength;
        if (ang < 0.02) continue;
        for (const r of fg.roles) {
          const fIdx = getMappedIdx(r);
          if (fIdx === null) continue;
          const fb = model.bones[fIdx];
          if (!fb || !fb.rotatable) continue;
          // Use PMX bone's local Z axis when declared, else side-aware anatomical curl axis
          const perBoneAxis = fb.hasLocalAxis && localAxesSource[fIdx]
            ? mmdVecToThree(localAxesSource[fIdx].z).normalize()
            : curlAxis;
          const qF = new THREE.Quaternion().setFromAxisAngle(perBoneAxis, ang);
          transforms[fIdx] = {
            boneIndex: fIdx,
            boneName: fb.name,
            translation: [0, 0, 0],
            quaternion: [qF.x, qF.y, qF.z, qF.w],
            source: 'retargeted',
          };
        }
      }
    }
  };

  retargetArmSide('L');
  retargetArmSide('R');

  // 5. Legs (IK-aware: never double-apply IK target and direct leg/knee rotations!)
  const retargetLegSide = (side: 'L' | 'R') => {
    const jPrefix = side === 'L' ? 'left' : 'right';
    const hipPos = getJointPos(`${jPrefix}Hip`);
    const kneePos = getJointPos(`${jPrefix}Knee`);
    const anklePos = getJointPos(`${jPrefix}Ankle`);
    if (!hipPos || !kneePos || !anklePos) return;

    const legIdx = getMappedIdx(side === 'L' ? 'legL' : 'legR');
    const kneeIdx = getMappedIdx(side === 'L' ? 'kneeL' : 'kneeR');
    const ankleIdx = getMappedIdx(side === 'L' ? 'ankleL' : 'ankleR');
    const legIkIdx = getMappedIdx(side === 'L' ? 'legIkL' : 'legIkR');

    const useModelIK = options.useIK && skeleton.hasLegIK && legIkIdx !== null;

    if (useModelIK && legIkIdx !== null) {
      // Translate the Leg IK bone relative to its rest position; do NOT apply direct FK to leg/knee!
      const ikBone = model.bones[legIkIdx];
      const ikRestThree = mmdVecToThree(ikBone.position);
      const offset = anklePos.clone().sub(ikRestThree).multiplyScalar(strength);

      transforms[legIkIdx] = {
        boneIndex: legIkIdx,
        boneName: ikBone.name,
        translation: [offset.x, offset.y, offset.z],
        quaternion: [0, 0, 0, 1],
        source: 'ik',
      };
    } else {
      // Pure FK retargeting when model lacks Leg IK or FK mode selected
      const thighDir = kneePos.clone().sub(hipPos).normalize();
      const shinDir = anklePos.clone().sub(kneePos).normalize();
      setBoneWorldRotation(legIdx, thighDir, 'retargeted');
      setBoneWorldRotation(kneeIdx, shinDir, 'retargeted');
      if (ankleIdx !== null) {
        const footLevelQ = new THREE.Quaternion();
        transforms[ankleIdx] = {
          boneIndex: ankleIdx,
          boneName: model.bones[ankleIdx].name,
          translation: [0, 0, 0],
          quaternion: [footLevelQ.x, footLevelQ.y, footLevelQ.z, footLevelQ.w],
          source: 'retargeted',
        };
      }
    }
  };

  retargetLegSide('L');
  retargetLegSide('R');

  return {
    transforms,
    ikEnabled: options.useIK && skeleton.hasLegIK,
    mirrored: options.mirror,
    poseStrength: strength,
    rootOffsetY,
  };
}
