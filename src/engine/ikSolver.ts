import * as THREE from 'three';
import { mmdVecToThree } from './mmdCoordinates';
import type { PMXModelData } from './types';

/**
 * Runtime CCD / Analytical IK solver for Three.js Bones matching MMD's IK chain specification.
 * Used for 3D viewport preview so Leg IK target translations bend knees realistically without
 * writing conflicting FK rotations back into the exported pose transforms.
 */
export function solveModelIKOnBones(model: PMXModelData, bones: THREE.Bone[]): void {
  if (bones.length === 0) return;

  // Update world matrices before solving IK
  bones[0].updateMatrixWorld(true);

  const worldPosTarget = new THREE.Vector3();
  const worldPosLink = new THREE.Vector3();
  const worldPosEffector = new THREE.Vector3();
  const parentWorldQuat = new THREE.Quaternion();
  const invParentQuat = new THREE.Quaternion();
  const toEffector = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const deltaWorld = new THREE.Quaternion();
  const linkWorldQuat = new THREE.Quaternion();
  const euler = new THREE.Euler();

  for (const ikBoneData of model.bones) {
    if (!ikBoneData.isIK || ikBoneData.ikTargetIndex < 0 || ikBoneData.ikLinks.length === 0) {
      continue;
    }
    const ikBone = bones[ikBoneData.index];
    const effectorBone = bones[ikBoneData.ikTargetIndex];
    if (!ikBone || !effectorBone) continue;

    ikBone.updateMatrixWorld(true);
    ikBone.getWorldPosition(worldPosTarget);

    const loops = Math.min(ikBoneData.ikLoopCount || 25, 40);
    const maxStep = Math.min(ikBoneData.ikLimitAngle || 2.0, 1.5);

    for (let iter = 0; iter < loops; iter++) {
      effectorBone.updateMatrixWorld(true);
      effectorBone.getWorldPosition(worldPosEffector);
      if (worldPosEffector.distanceToSquared(worldPosTarget) < 1e-4) break;

      for (const link of ikBoneData.ikLinks) {
        const linkBone = bones[link.boneIndex];
        if (!linkBone) continue;

        linkBone.updateMatrixWorld(true);
        linkBone.getWorldPosition(worldPosLink);
        effectorBone.getWorldPosition(worldPosEffector);

        toEffector.copy(worldPosEffector).sub(worldPosLink);
        toTarget.copy(worldPosTarget).sub(worldPosLink);

        if (toEffector.lengthSq() < 1e-6 || toTarget.lengthSq() < 1e-6) continue;
        toEffector.normalize();
        toTarget.normalize();

        let angle = Math.acos(THREE.MathUtils.clamp(toEffector.dot(toTarget), -1, 1));
        if (angle < 1e-4) continue;
        angle = Math.min(angle, maxStep);

        const axis = new THREE.Vector3().crossVectors(toEffector, toTarget);
        if (axis.lengthSq() < 1e-6) {
          // If collinear (straight rest leg), kick knee forward slightly in Three.js (+Z)
          axis.set(1, 0, 0);
        } else {
          axis.normalize();
        }

        deltaWorld.setFromAxisAngle(axis, angle);
        linkBone.getWorldQuaternion(linkWorldQuat);
        linkWorldQuat.premultiply(deltaWorld).normalize();

        if (linkBone.parent && linkBone.parent instanceof THREE.Bone) {
          linkBone.parent.getWorldQuaternion(parentWorldQuat);
          invParentQuat.copy(parentWorldQuat).invert();
          linkBone.quaternion.copy(invParentQuat).multiply(linkWorldQuat).normalize();
        } else {
          linkBone.quaternion.copy(linkWorldQuat);
        }

        // Enforce MMD IK angle limits (e.g., knee only bends backward)
        if (link.hasLimits) {
          const minThree = mmdVecToThree(link.minAngle);
          const maxThree = mmdVecToThree(link.maxAngle);
          const minX = Math.min(minThree.x, maxThree.x);
          const maxX = Math.max(minThree.x, maxThree.x);
          const minY = Math.min(minThree.y, maxThree.y);
          const maxY = Math.max(minThree.y, maxThree.y);
          const minZ = Math.min(minThree.z, maxThree.z);
          const maxZ = Math.max(minThree.z, maxThree.z);

          euler.setFromQuaternion(linkBone.quaternion, 'YXZ');
          // MMD knees bend around X (in Three.js positive X bends shin backward toward -Z)
          euler.x = THREE.MathUtils.clamp(euler.x, -maxX, -minX);
          euler.y = THREE.MathUtils.clamp(euler.y, minY, maxY);
          euler.z = THREE.MathUtils.clamp(euler.z, minZ, maxZ);
          linkBone.quaternion.setFromEuler(euler);
        }

        linkBone.updateMatrixWorld(true);
      }
    }
  }
}
