import { clamp, degToRad } from './mmdCoordinates';
import type { Pose2DAnalysis, Pose3DJoint, Pose3DReconstruction, Vec3 } from './types';

// Standard anatomical segment proportions (Three.js world units matching ~15.8 MMD height)
const SEGMENT_LENGTHS = {
  pelvisHalfWidth: 0.9,
  torsoLower: 1.85,
  torsoUpper: 2.35,
  neck: 0.95,
  head: 1.55,
  shoulderOffset: 1.48,
  upperArm: 2.45,
  forearm: 2.25,
  thigh: 3.95,
  shin: 3.9,
  foot: 1.05,
};

function norm3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-6) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

/**
 * Reconstructs a plausible 3D anatomical skeleton from 2D landmarks, orientation cues,
 * and depth hints. Uses Three.js right-handed space:
 *   +X = Character's anatomical LEFT
 *   +Y = Up
 *   +Z = Forward (toward camera for front-facing pose)
 */
export function reconstruct3DPose(
  analysis: Pose2DAnalysis,
  depthVariant: 'primary' | 'alternate' = 'primary'
): Pose3DReconstruction {
  const lm = analysis.landmarks;
  const warnings: string[] = [];
  const depthFlip = depthVariant === 'alternate' ? -1 : 1;

  const subject =
    analysis.subjects.find((s) => s.id === analysis.selectedSubjectId) ?? analysis.subjects[0];
  const facing = subject?.facingDirection ?? 'front';

  // Determine image-to-anatomical scale from shoulder/hip span or torso height
  const lSh = lm.leftShoulder ?? { x: 0.57, y: 0.3, confidence: 0.5 };
  const rSh = lm.rightShoulder ?? { x: 0.43, y: 0.3, confidence: 0.5 };
  const lHip = lm.leftHip ?? { x: 0.54, y: 0.52, confidence: 0.5 };
  const rHip = lm.rightHip ?? { x: 0.46, y: 0.52, confidence: 0.5 };

  const midSh2D = { x: (lSh.x + rSh.x) / 2, y: (lSh.y + rSh.y) / 2 };
  const midHip2D = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };
  const torso2D = Math.hypot(midSh2D.x - midHip2D.x, midSh2D.y - midHip2D.y) || 0.22;
  const worldPerNorm = (SEGMENT_LENGTHS.torsoLower + SEGMENT_LENGTHS.torsoUpper) / torso2D;

  // Verify anatomical Left vs Right consistency against facing direction:
  // When facing camera ('front'), character's anatomical LEFT (+X) appears on image RIGHT (larger x).
  const isBackFacing = facing === 'back';
  if (!isBackFacing && lSh.x < rSh.x - 0.12) {
    warnings.push(
      'Detected crossed shoulders or unusual yaw; preserving anatomical left/right assignment from torso orientation.'
    );
  }

  const yawRad = degToRad(analysis.depthHints.torsoYawDeg);
  const pitchRad = degToRad(analysis.depthHints.torsoPitchDeg);

  // Pelvis root
  const isSitting = subject?.poseType === 'sitting';
  const isCrouching = subject?.poseType === 'crouching' || subject?.poseType === 'kneeling';
  const basePelvisY = isSitting ? 6.1 : isCrouching ? 5.6 : 8.85;
  const pelvisPos: Vec3 = [0, basePelvisY, 0];

  // Torso direction from 2D spine + depth pitch
  const spineDx = (midSh2D.x - midHip2D.x) * worldPerNorm;
  const spineDy = -(midSh2D.y - midHip2D.y) * worldPerNorm;
  const spineDz = Math.sin(pitchRad) * (SEGMENT_LENGTHS.torsoLower + SEGMENT_LENGTHS.torsoUpper) * 0.7;
  const spineDir = norm3([spineDx, Math.max(0.5, spineDy), spineDz]);

  const chestPos = add3(pelvisPos, scale3(spineDir, SEGMENT_LENGTHS.torsoLower));
  const neckBasePos = add3(chestPos, scale3(spineDir, SEGMENT_LENGTHS.torsoUpper));

  // Head direction from nose/head landmark + head yaw/pitch
  const nose = lm.nose ?? lm.head ?? { x: midSh2D.x, y: midSh2D.y - 0.12, confidence: 0.5 };
  const headDx = (nose.x - midSh2D.x) * worldPerNorm;
  const headDy = Math.max(0.4, -(nose.y - midSh2D.y) * worldPerNorm);
  const headDz =
    Math.sin(degToRad(analysis.expression.headPitchDeg)) * -1.1 +
    Math.cos(degToRad(analysis.expression.headYawDeg)) * 0.25;
  const neckDir = norm3([headDx * 0.6, headDy, headDz * 0.3]);
  const headPos = add3(neckBasePos, scale3(neckDir, SEGMENT_LENGTHS.neck));
  const headTopPos = add3(headPos, scale3(neckDir, SEGMENT_LENGTHS.head));

  // Shoulder & Hip lateral axes respecting torso yaw & roll
  const shDy = -(lSh.y - rSh.y) * worldPerNorm;
  const shLateralDir = norm3([
    Math.cos(yawRad) * (isBackFacing ? -1 : 1),
    clamp(shDy / 3.0, -0.45, 0.45),
    -Math.sin(yawRad) * (isBackFacing ? -1 : 1),
  ]);

  const hipDy = -(lHip.y - rHip.y) * worldPerNorm;
  const hipLateralDir = norm3([
    Math.cos(yawRad * 0.7) * (isBackFacing ? -1 : 1),
    clamp(hipDy / 2.2, -0.35, 0.35),
    -Math.sin(yawRad * 0.7) * (isBackFacing ? -1 : 1),
  ]);

  const leftShoulderPos = add3(neckBasePos, scale3(shLateralDir, SEGMENT_LENGTHS.shoulderOffset));
  const rightShoulderPos = add3(neckBasePos, scale3(shLateralDir, -SEGMENT_LENGTHS.shoulderOffset));
  const leftHipPos = add3(pelvisPos, scale3(hipLateralDir, SEGMENT_LENGTHS.pelvisHalfWidth));
  const rightHipPos = add3(pelvisPos, scale3(hipLateralDir, -SEGMENT_LENGTHS.pelvisHalfWidth));

  // Solve 3D limb chain preserving exact anatomical segment lengths + recovering missing Z from foreshortening
  const solveLimbSegment = (
    parent3D: Vec3,
    parent2DKey: string,
    child2DKey: string,
    segLen: number,
    depthBias: number,
    fallbackDir: Vec3
  ): { pos: Vec3; conf: number; occluded: boolean } => {
    const p2 = lm[parent2DKey];
    const c2 = lm[child2DKey];
    if (!p2 || !c2) {
      return { pos: add3(parent3D, scale3(fallbackDir, segLen)), conf: 0.3, occluded: true };
    }
    const dx = (c2.x - p2.x) * worldPerNorm;
    const dy = -(c2.y - p2.y) * worldPerNorm;
    const planarSq = dx * dx + dy * dy;
    const maxPlanar = segLen * 0.985;
    let clampedDx = dx;
    let clampedDy = dy;
    if (Math.sqrt(planarSq) > maxPlanar) {
      const s = maxPlanar / Math.sqrt(planarSq);
      clampedDx *= s;
      clampedDy *= s;
    }
    const remSq = Math.max(0, segLen * segLen - (clampedDx * clampedDx + clampedDy * clampedDy));
    const dz = Math.sqrt(remSq) * (depthBias >= 0 ? 1 : -1) * (Math.abs(depthBias) > 0.15 ? 1 : 0.45);
    const dir = norm3([clampedDx, clampedDy, dz]);
    return {
      pos: add3(parent3D, scale3(dir, segLen)),
      conf: Math.min(p2.confidence, c2.confidence),
      occluded: Boolean(c2.occluded),
    };
  };

  // Arms
  const lElb = solveLimbSegment(
    leftShoulderPos,
    'leftShoulder',
    'leftElbow',
    SEGMENT_LENGTHS.upperArm,
    analysis.depthHints.leftElbowForward * depthFlip,
    [0.7, -0.7, 0.1]
  );
  const lWri = solveLimbSegment(
    lElb.pos,
    'leftElbow',
    'leftWrist',
    SEGMENT_LENGTHS.forearm,
    (analysis.depthHints.leftElbowForward + 0.35) * depthFlip,
    [0.7, -0.6, 0.25]
  );

  const rElb = solveLimbSegment(
    rightShoulderPos,
    'rightShoulder',
    'rightElbow',
    SEGMENT_LENGTHS.upperArm,
    analysis.depthHints.rightElbowForward * depthFlip,
    [-0.7, -0.7, 0.1]
  );
  const rWri = solveLimbSegment(
    rElb.pos,
    'rightElbow',
    'rightWrist',
    SEGMENT_LENGTHS.forearm,
    (analysis.depthHints.rightElbowForward + 0.35) * depthFlip,
    [-0.7, -0.6, 0.25]
  );

  // Legs
  const lKnee = solveLimbSegment(
    leftHipPos,
    'leftHip',
    'leftKnee',
    SEGMENT_LENGTHS.thigh,
    (isSitting ? 1 : analysis.depthHints.leftKneeForward) * depthFlip,
    [0.05, -0.98, 0.15]
  );
  const lAnkle = solveLimbSegment(
    lKnee.pos,
    'leftKnee',
    'leftAnkle',
    SEGMENT_LENGTHS.shin,
    -0.25 * depthFlip,
    [0, -0.99, -0.1]
  );

  const rKnee = solveLimbSegment(
    rightHipPos,
    'rightHip',
    'rightKnee',
    SEGMENT_LENGTHS.thigh,
    (isSitting ? 1 : analysis.depthHints.rightKneeForward) * depthFlip,
    [-0.05, -0.98, 0.15]
  );
  const rAnkle = solveLimbSegment(
    rKnee.pos,
    'rightKnee',
    'rightAnkle',
    SEGMENT_LENGTHS.shin,
    -0.25 * depthFlip,
    [0, -0.99, -0.1]
  );

  // Ground contact normalization for standing poses
  let groundShiftY = 0;
  if (!isSitting && subject?.poseType !== 'jumping') {
    const minAnkleY = Math.min(lAnkle.pos[1], rAnkle.pos[1]);
    groundShiftY = 0.85 - minAnkleY;
  }

  const shift = (p: Vec3): Vec3 => [p[0], p[1] + groundShiftY, p[2]];

  const joints: Record<string, Pose3DJoint> = {
    pelvis: { name: 'pelvis', position: shift(pelvisPos), confidence: 0.95, occluded: false },
    chest: { name: 'chest', position: shift(chestPos), confidence: 0.92, occluded: false },
    neck: { name: 'neck', position: shift(neckBasePos), confidence: 0.92, occluded: false },
    head: { name: 'head', position: shift(headPos), confidence: nose.confidence, occluded: Boolean(nose.occluded) },
    headTop: { name: 'headTop', position: shift(headTopPos), confidence: nose.confidence, occluded: false },
    leftShoulder: { name: 'leftShoulder', position: shift(leftShoulderPos), confidence: lSh.confidence, occluded: Boolean(lSh.occluded) },
    leftElbow: { name: 'leftElbow', position: shift(lElb.pos), confidence: lElb.conf, occluded: lElb.occluded },
    leftWrist: { name: 'leftWrist', position: shift(lWri.pos), confidence: lWri.conf, occluded: lWri.occluded },
    rightShoulder: { name: 'rightShoulder', position: shift(rightShoulderPos), confidence: rSh.confidence, occluded: Boolean(rSh.occluded) },
    rightElbow: { name: 'rightElbow', position: shift(rElb.pos), confidence: rElb.conf, occluded: rElb.occluded },
    rightWrist: { name: 'rightWrist', position: shift(rWri.pos), confidence: rWri.conf, occluded: rWri.occluded },
    leftHip: { name: 'leftHip', position: shift(leftHipPos), confidence: lHip.confidence, occluded: Boolean(lHip.occluded) },
    leftKnee: { name: 'leftKnee', position: shift(lKnee.pos), confidence: lKnee.conf, occluded: lKnee.occluded },
    leftAnkle: { name: 'leftAnkle', position: shift(lAnkle.pos), confidence: lAnkle.conf, occluded: lAnkle.occluded },
    rightHip: { name: 'rightHip', position: shift(rightHipPos), confidence: rHip.confidence, occluded: Boolean(rHip.occluded) },
    rightKnee: { name: 'rightKnee', position: shift(rKnee.pos), confidence: rKnee.conf, occluded: rKnee.occluded },
    rightAnkle: { name: 'rightAnkle', position: shift(rAnkle.pos), confidence: rAnkle.conf, occluded: rAnkle.occluded },
  };

  // Reproject 3D joints back into 2D normalized image space for comparison overlay
  const projected2D: Record<string, { x: number; y: number }> = {};
  const pelvisShift3D = joints.pelvis.position;
  for (const [k, j] of Object.entries(joints)) {
    const rx = (j.position[0] - pelvisShift3D[0]) / worldPerNorm;
    const ry = -(j.position[1] - pelvisShift3D[1]) / worldPerNorm;
    projected2D[k] = {
      x: clamp(midHip2D.x + rx, 0, 1),
      y: clamp(midHip2D.y + ry, 0, 1),
    };
  }

  const occludedCount = Object.values(joints).filter((j) => j.occluded).length;
  if (occludedCount > 0) {
    warnings.push(
      `${occludedCount} occluded joint(s) estimated via anatomical limb-length priors. Toggle Alternate Depth or adjust manually if needed.`
    );
  }

  return {
    joints,
    projected2D,
    anatomicalFacing:
      facing === 'three-quarter-left' || facing === 'three-quarter-right'
        ? 'three-quarter'
        : facing,
    alternativeDepthAvailable: true,
    depthVariant,
    limbLengths: { ...SEGMENT_LENGTHS },
    warnings,
  };
}
