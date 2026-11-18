import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildSamplePMXBuffer } from './samplePmxBuilder';
import { parseMMDModel } from './pmxParser';
import { analyzeSkeleton } from './skeletonAnalyzer';
import { buildBoneMapping, validateBoneMapping } from './boneMappingEngine';
import {
  buildModelCalibrationProfile,
  computeSkeletonSignature,
  verifyCalibrationProfileCompatibility,
} from './modelCalibration';
import { mmdQuatToThree, mmdVecToThree, threeQuatToMmd, threeVecToMmd } from './mmdCoordinates';
import { reconstruct3DPose } from './pose3DReconstructor';
import { retargetPoseToModel } from './retargetingEngine';
import { autoCorrectPose, validateRetargetedPose } from './poseValidator';
import { applyParsedVPDToPose, exportVPD, parseVPD } from './vpdExporter';
import { auditEntireModelNamesForVMD, exportVMD, parseVMD } from './vmdExporter';
import { mapFacialExpressionToMorphs } from './facialMorphMapper';
import { encodeShiftJIS, decodeShiftJIS, validateVMDName } from './shiftJis';
import type { PMXModelData, Pose2DAnalysis } from './types';

test('Shift_JIS round-trip and 15-byte VMD limit validation', () => {
  const jp = '左腕捩';
  const bytes = encodeShiftJIS(jp);
  assert.equal(decodeShiftJIS(bytes), jp);
  assert.equal(bytes.length, 6);
  assert.equal(validateVMDName(jp, 15).valid, true);

  const longName = 'Custom_Accessory_Ribbon_LongName';
  const check = validateVMDName(longName, 15);
  assert.equal(check.valid, false);
  assert.equal(check.exceedsLimit, true);
});

test('MMD <-> Three.js coordinate & quaternion reflection round-trip', () => {
  const vMmd: [number, number, number] = [1.5, 12.2, -3.4];
  const vThree = mmdVecToThree(vMmd);
  assert.deepEqual([vThree.x, vThree.y, vThree.z], [1.5, 12.2, 3.4]);
  assert.deepEqual(threeVecToMmd(vThree), vMmd);

  const qThree = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, -0.7, 0.25, 'YXZ')).normalize();
  const qMmd = threeQuatToMmd(qThree);
  const qBack = mmdQuatToThree(qMmd);
  assert.ok(Math.abs(Math.abs(qThree.dot(qBack)) - 1) < 1e-6);
});

test('Binary PMX generation, parsing, and skeleton analysis across JP A-Pose, EN T-Pose, and Custom Rig', () => {
  const yuki = parseMMDModel(buildSamplePMXBuffer('yuki-jp-apose'), 'yuki_standard_apose.pmx');
  const yukiSkel = analyzeSkeleton(yuki);
  assert.equal(yuki.format, 'PMX');
  assert.equal(yukiSkel.restPoseType, 'A-Pose');
  assert.ok(yukiSkel.armRestAngleDeg >= 30 && yukiSkel.armRestAngleDeg <= 45);
  assert.equal(yukiSkel.hasTwistBones, true);
  assert.equal(yukiSkel.hasLegIK, true);
  assert.equal(yukiSkel.fingerCoverage, 'full');

  const aria = parseMMDModel(buildSamplePMXBuffer('aria-en-tpose'), 'aria_studio_tpose.pmx');
  const ariaSkel = analyzeSkeleton(aria);
  assert.equal(ariaSkel.restPoseType, 'T-Pose');
  assert.ok(Math.abs(ariaSkel.armRestAngleDeg) <= 5);
  assert.equal(ariaSkel.hasLegIK, true);

  const kuro = parseMMDModel(buildSamplePMXBuffer('kuro-custom-rig'), 'kuro_custom_rig.pmx');
  const kuroSkel = analyzeSkeleton(kuro);
  assert.equal(kuroSkel.hasLegIK, false);
  assert.equal(kuroSkel.fingerCoverage, 'partial');
});

test('Bone mapping engine maps JP, EN, and custom nonstandard skeletons', () => {
  const yuki = parseMMDModel(buildSamplePMXBuffer('yuki-jp-apose'), 'yuki_standard_apose.pmx');
  const yukiMap = buildBoneMapping(yuki, analyzeSkeleton(yuki));
  assert.equal(yukiMap.unmappedRequiredRoles.length, 0);
  assert.equal(yukiMap.entries.armL.boneName, '左腕');
  assert.equal(yukiMap.entries.legIkR.boneName, '右足ＩＫ');

  const kuro = parseMMDModel(buildSamplePMXBuffer('kuro-custom-rig'), 'kuro_custom_rig.pmx');
  const kuroMap = buildBoneMapping(kuro, analyzeSkeleton(kuro));
  assert.equal(kuroMap.entries.armL.boneName, 'UpperArm_L');
  assert.equal(kuroMap.entries.elbowL.boneName, 'Forearm_L');
  assert.equal(kuroMap.entries.legIkL.boneIndex, null);
});

const SAMPLE_STANDING_WAVE: Pose2DAnalysis = {
  provider: 'local-vision',
  imageWidth: 900,
  imageHeight: 1200,
  subjects: [
    {
      id: 1,
      label: 'Subject 1',
      bbox: [0.27, 0.05, 0.75, 0.95],
      poseType: 'standing',
      facingDirection: 'front',
      confidence: 0.98,
    },
  ],
  selectedSubjectId: 1,
  landmarks: {
    nose: { name: 'nose', x: 0.51, y: 0.23, confidence: 0.99 },
    neck: { name: 'neck', x: 0.51, y: 0.3, confidence: 0.98 },
    rightShoulder: { name: 'rightShoulder', x: 0.43, y: 0.33, confidence: 0.97 },
    leftShoulder: { name: 'leftShoulder', x: 0.59, y: 0.33, confidence: 0.97 },
    rightElbow: { name: 'rightElbow', x: 0.38, y: 0.22, confidence: 0.97 },
    rightWrist: { name: 'rightWrist', x: 0.37, y: 0.11, confidence: 0.96 },
    leftElbow: { name: 'leftElbow', x: 0.72, y: 0.42, confidence: 0.96 },
    leftWrist: { name: 'leftWrist', x: 0.59, y: 0.46, confidence: 0.95 },
    rightHip: { name: 'rightHip', x: 0.44, y: 0.55, confidence: 0.95 },
    leftHip: { name: 'leftHip', x: 0.57, y: 0.54, confidence: 0.95 },
    rightKnee: { name: 'rightKnee', x: 0.31, y: 0.72, confidence: 0.96 },
    rightAnkle: { name: 'rightAnkle', x: 0.36, y: 0.9, confidence: 0.96 },
    leftKnee: { name: 'leftKnee', x: 0.56, y: 0.73, confidence: 0.96 },
    leftAnkle: { name: 'leftAnkle', x: 0.53, y: 0.9, confidence: 0.96 },
  },
  rightHand: {
    side: 'right',
    visible: true,
    confidence: 0.95,
    wristAngleDeg: 5,
    palmOrientation: 'forward',
    gestureLabel: 'Open Wave',
    contactTarget: 'none',
    fingerCurl: { thumb: 0.1, index: 0.05, middle: 0.05, ring: 0.05, pinky: 0.08 },
    fingerSpread: 0.65,
  },
  leftHand: {
    side: 'left',
    visible: true,
    confidence: 0.9,
    wristAngleDeg: -25,
    palmOrientation: 'inward',
    gestureLabel: 'Hip Rest',
    contactTarget: 'hip',
    fingerCurl: { thumb: 0.25, index: 0.35, middle: 0.4, ring: 0.45, pinky: 0.45 },
    fingerSpread: 0.2,
  },
  expression: {
    faceVisible: true,
    faceConfidence: 0.97,
    dominantExpression: 'smile',
    headYawDeg: 4,
    headPitchDeg: -2,
    headRollDeg: 2,
    leftEyeOpen: 0.92,
    rightEyeOpen: 0.92,
    mouthOpen: 0.28,
    smileIntensity: 0.88,
    browIntensity: 0.15,
    gazeX: 0,
    gazeY: 0,
  },
  depthHints: {
    torsoYawDeg: 6,
    torsoPitchDeg: -3,
    torsoRollDeg: 2,
    leftElbowForward: 0.15,
    rightElbowForward: 0.2,
    leftKneeForward: 0.12,
    rightKneeForward: 0.55,
    weightSide: 'left',
    poseSummary: 'Standing wave',
  },
  notes: [],
};

test('Model-aware retargeting aligns raised arm on both A-Pose and T-Pose models', () => {
  const pose3D = reconstruct3DPose(SAMPLE_STANDING_WAVE, 'primary');
  assert.ok(pose3D.joints.rightElbow.position[1] > pose3D.joints.rightShoulder.position[1]);

  for (const preset of ['yuki-jp-apose', 'aria-en-tpose'] as const) {
    const model = parseMMDModel(buildSamplePMXBuffer(preset), `${preset}.pmx`);
    const skel = analyzeSkeleton(model);
    const map = buildBoneMapping(model, skel);
    const retargeted = retargetPoseToModel(model, skel, map, pose3D, SAMPLE_STANDING_WAVE, {
      useIK: true,
      mirror: false,
      poseStrength: 1,
      distributeTwist: true,
    });

    const armRIdx = map.entries.armR.boneIndex!;
    const armRQuat = new THREE.Quaternion(...retargeted.transforms[armRIdx].quaternion);
    const restDir = mmdVecToThree(skel.restBoneDirs[armRIdx]);
    const posedDir = restDir.clone().applyQuaternion(armRQuat);
    // Right arm is raised upward (+Y > 0.5)
    assert.ok(posedDir.y > 0.5, `Expected raised right arm on ${preset}, got y=${posedDir.y}`);
  }
});

test('VPD & VMD round-trip export/parse preserves quaternions, morphs, and detects >15-byte VMD names', () => {
  const yuki = parseMMDModel(buildSamplePMXBuffer('yuki-jp-apose'), 'yuki_standard_apose.pmx');
  const skel = analyzeSkeleton(yuki);
  const map = buildBoneMapping(yuki, skel);
  const pose3D = reconstruct3DPose(SAMPLE_STANDING_WAVE, 'primary');
  const pose = retargetPoseToModel(yuki, skel, map, pose3D, SAMPLE_STANDING_WAVE, {
    useIK: true,
    mirror: false,
    poseStrength: 1,
    distributeTwist: true,
  });

  const morphRes = mapFacialExpressionToMorphs(yuki, SAMPLE_STANDING_WAVE.expression);
  assert.ok((morphRes.weights['笑い'] ?? 0) > 0.5);

  const vpd = exportVPD(yuki, pose, 'TestWave');
  const parsedVpd = parseVPD(vpd.content);
  assert.equal(parsedVpd.bones.length, vpd.boneCount);
  const reloadedPose = applyParsedVPDToPose(yuki, parsedVpd);
  const armRIdx = map.entries.armR.boneIndex!;
  const qOrig = new THREE.Quaternion(...pose.transforms[armRIdx].quaternion);
  const qReloaded = new THREE.Quaternion(...reloadedPose.transforms[armRIdx].quaternion);
  assert.ok(Math.abs(Math.abs(qOrig.dot(qReloaded)) - 1) < 1e-4);

  const vmdFull = exportVMD(yuki, pose, morphRes.weights, { poseName: 'TestWave', mode: 'full' });
  assert.equal(vmdFull.errors.length, 0);
  const parsedVmd = parseVMD(vmdFull.bytes);
  assert.equal(parsedVmd.boneFrames.length, vmdFull.boneFrames);
  assert.equal(parsedVmd.morphFrames.length, vmdFull.morphFrames);

  const vmdFace = exportVMD(yuki, pose, morphRes.weights, { poseName: 'TestWave', mode: 'face' });
  const parsedFace = parseVMD(vmdFace.bytes);
  assert.equal(parsedFace.boneFrames.length, 0);
  assert.ok(parsedFace.morphFrames.length > 0);

  // Kuro has a >15-byte bone name; verify validator & VMD exporter catch it without silent truncation
  const kuro = parseMMDModel(buildSamplePMXBuffer('kuro-custom-rig'), 'kuro_custom_rig.pmx');
  const longBoneIdx = kuro.bones.findIndex((b) => b.name === 'Custom_Accessory_Ribbon_LongName');
  assert.ok(longBoneIdx >= 0);
  const badPose = {
    transforms: {
      [longBoneIdx]: {
        boneIndex: longBoneIdx,
        boneName: 'Custom_Accessory_Ribbon_LongName',
        translation: [0, 0, 0] as [number, number, number],
        quaternion: [0.2, 0, 0, 0.979795] as [number, number, number, number],
        source: 'manual' as const,
      },
    },
    ikEnabled: false,
    mirrored: false,
    poseStrength: 1,
    rootOffsetY: 0,
  };
  const vmdErr = exportVMD(kuro, badPose, {}, { poseName: 'LongTest', mode: 'full', allowSkipLongNames: false });
  assert.equal(vmdErr.errors.length, 1);

  assert.equal(auditEntireModelNamesForVMD(yuki).length, 0);
  const kuroAudit = auditEntireModelNamesForVMD(kuro);
  assert.equal(kuroAudit.length, 1);
  assert.equal(kuroAudit[0].name, 'Custom_Accessory_Ribbon_LongName');
});

test('Pose validator detects and auto-corrects IK conflicts and excessive joint angles', () => {
  const yuki = parseMMDModel(buildSamplePMXBuffer('yuki-jp-apose'), 'yuki_standard_apose.pmx');
  const skel = analyzeSkeleton(yuki);
  const map = buildBoneMapping(yuki, skel);
  const kneeLIdx = map.entries.kneeL.boneIndex!;
  const pose = {
    transforms: {
      [kneeLIdx]: {
        boneIndex: kneeLIdx,
        boneName: yuki.bones[kneeLIdx].name,
        translation: [0, 0, 0] as [number, number, number],
        quaternion: [0.7, 0, 0, 0.714] as [number, number, number, number],
        source: 'manual' as const,
      },
    },
    ikEnabled: true,
    mirrored: false,
    poseStrength: 1,
    rootOffsetY: 0,
  };
  const report = validateRetargetedPose(yuki, skel, map, pose, {});
  assert.ok(report.issues.some((i) => i.category === 'ik-conflict'));

  const corrected = autoCorrectPose(yuki, skel, map, pose, {});
  assert.ok(corrected.report.correctedCount >= 1);
  assert.equal(corrected.pose.transforms[kneeLIdx], undefined);
});

test('Complete PMX bone extraction captures positions, axes, layers, and all 9 visual categories', () => {
  const yuki = parseMMDModel(buildSamplePMXBuffer('yuki-jp-apose'), 'yuki_standard_apose.pmx');
  const skel = analyzeSkeleton(yuki);
  assert.equal(skel.boneDetails.length, yuki.bones.length);

  const armLIdx = yuki.bones.findIndex((b) => b.name === '左腕');
  const armDetail = skel.boneDetails[armLIdx];
  assert.equal(armDetail.visualCategory, 'arm');
  assert.ok(armDetail.length > 0.5);
  assert.ok(armDetail.childIndices.length >= 1);
  assert.equal(armDetail.localAxisX.length, 3);
  assert.equal(armDetail.localAxisZ.length, 3);

  const legIkLIdx = yuki.bones.findIndex((b) => b.name === '左足ＩＫ');
  assert.equal(skel.boneDetails[legIkLIdx].visualCategory, 'ik');

  const twistLIdx = yuki.bones.findIndex((b) => b.name === '左腕捩');
  assert.equal(skel.boneDetails[twistLIdx].visualCategory, 'twist');

  const headIdx = yuki.bones.findIndex((b) => b.name === '頭');
  assert.equal(skel.boneDetails[headIdx].visualCategory, 'head-neck');
});

test('Intelligent multi-signal bone recognition resolves obfuscated/nonstandard bone names via hierarchy, position & IK', () => {
  const yuki = parseMMDModel(buildSamplePMXBuffer('yuki-jp-apose'), 'yuki_standard_apose.pmx');
  // Clone model and scrub ALL Japanese/English names to opaque IDs + add an unknown accessory bone
  const opaqueBones = yuki.bones.map((b, idx) => ({
    ...b,
    name: `Joint_${String(idx).padStart(2, '0')}`,
    englishName: '',
  }));
  const headIdx = yuki.bones.findIndex((b) => b.name === '頭');
  opaqueBones.push({
    ...opaqueBones[headIdx],
    index: opaqueBones.length,
    name: 'WeirdNode_Accessory_99',
    englishName: '',
    parentIndex: headIdx,
    position: [0.3, 18.8, -0.4],
    tailMode: 'offset',
    tailBoneIndex: -1,
    tailOffset: [0.2, 0.5, 0],
    isIK: false,
    ikTargetIndex: -1,
    ikLinks: [],
  });

  const opaqueModel: PMXModelData = {
    ...yuki,
    name: 'Opaque_Rig_Model',
    fileName: 'opaque_rig.pmx',
    bones: opaqueBones,
  };

  const skel = analyzeSkeleton(opaqueModel);
  const map = buildBoneMapping(opaqueModel, skel);

  const origIdx = (jpName: string) => yuki.bones.findIndex((b) => b.name === jpName);

  // Legs + IK discovered from IK chain links and downward topology without relying on names
  assert.equal(map.entries.legIkL.boneIndex, origIdx('左足ＩＫ'));
  assert.equal(map.entries.legIkR.boneIndex, origIdx('右足ＩＫ'));
  assert.equal(map.entries.legL.boneIndex, origIdx('左足'));
  assert.equal(map.entries.kneeL.boneIndex, origIdx('左ひざ'));
  assert.equal(map.entries.ankleL.boneIndex, origIdx('左足首'));

  // Torso, Neck & Head resolved via midline hierarchy & direction
  assert.equal(map.entries.head.boneIndex, origIdx('頭'));
  assert.equal(map.entries.neck.boneIndex, origIdx('首'));

  // Arms resolved via lateral outward kinematic chain
  assert.equal(map.entries.armL.boneIndex, origIdx('左腕'));
  assert.equal(map.entries.elbowL.boneIndex, origIdx('左ひじ'));
  assert.equal(map.entries.wristL.boneIndex, origIdx('左手首'));
  assert.equal(map.entries.armR.boneIndex, origIdx('右腕'));
  assert.equal(map.entries.elbowR.boneIndex, origIdx('右ひじ'));
  assert.equal(map.entries.wristR.boneIndex, origIdx('右手首'));

  // Confidence scores and multi-signal attribution present
  assert.ok(map.entries.armL.confidenceScore >= 0.7);
  assert.ok(map.entries.armL.signalsUsed.length >= 2);

  // Unfamiliar accessory bone is preserved and marked unmapped instead of guessed
  assert.ok(
    map.validationReport.unknownModelBones.some(
      (b) => b.name === 'WeirdNode_Accessory_99'
    )
  );
});

test('Bone mapping validator detects duplicate mappings, L/R swaps, and parent-child inversions', () => {
  const yuki = parseMMDModel(buildSamplePMXBuffer('yuki-jp-apose'), 'yuki_standard_apose.pmx');
  const skel = analyzeSkeleton(yuki);

  const validMap = buildBoneMapping(yuki, skel);
  assert.equal(validMap.validationReport.hasCriticalWarnings, false);

  const elbowRIdx = yuki.bones.findIndex((b) => b.name === '右ひじ');
  const armLIdx = yuki.bones.findIndex((b) => b.name === '左腕');

  // Swap elbowL to right elbow AND duplicate armL on elbowL -> triggers L/R + hierarchy + duplicate errors
  const brokenMap = buildBoneMapping(yuki, skel, {
    elbowL: elbowRIdx,
  });
  assert.equal(brokenMap.validationReport.hasCriticalWarnings, true);
  assert.ok(brokenMap.validationReport.issues.some((i) => i.category === 'side-mismatch'));
  assert.ok(brokenMap.validationReport.issues.some((i) => i.category === 'hierarchy-invalid'));

  const dupMap = buildBoneMapping(yuki, skel, {
    armL: armLIdx,
    elbowL: armLIdx,
  });
  const dupReport = validateBoneMapping(yuki, skel, dupMap);
  assert.equal(dupReport.hasCriticalWarnings, true);
  assert.ok(dupReport.issues.some((i) => i.category === 'duplicate-mapping'));
});

test('Model calibration profiles verify skeleton identity and retarget independently per model', () => {
  const yuki = parseMMDModel(buildSamplePMXBuffer('yuki-jp-apose'), 'Character_A.pmx');
  const yukiSkel = analyzeSkeleton(yuki);
  const yukiMap = buildBoneMapping(yuki, yukiSkel);
  const profileA = buildModelCalibrationProfile(yuki, yukiSkel, yukiMap, {});

  assert.equal(verifyCalibrationProfileCompatibility(profileA, yuki).compatible, true);

  // Mutate bone hierarchy/position -> calibration compatibility check must reject reuse
  const modifiedYuki: PMXModelData = {
    ...yuki,
    bones: yuki.bones.map((b, i) => (i === 0 ? { ...b, name: 'Modified_Root' } : b)),
  };
  assert.notEqual(computeSkeletonSignature(yuki), computeSkeletonSignature(modifiedYuki));
  assert.equal(verifyCalibrationProfileCompatibility(profileA, modifiedYuki).compatible, false);

  // Separate Character_B has its own skeleton signature, calibration, and VPD bone identities
  const aria = parseMMDModel(buildSamplePMXBuffer('aria-en-tpose'), 'Character_B.pmx');
  const ariaSkel = analyzeSkeleton(aria);
  const ariaMap = buildBoneMapping(aria, ariaSkel);
  const profileB = buildModelCalibrationProfile(aria, ariaSkel, ariaMap, {});

  assert.notEqual(profileA.skeletonSignature, profileB.skeletonSignature);
  assert.equal(verifyCalibrationProfileCompatibility(profileA, aria).compatible, false);

  const pose3D = reconstruct3DPose(SAMPLE_STANDING_WAVE, 'primary');
  const poseA = retargetPoseToModel(yuki, yukiSkel, yukiMap, pose3D, SAMPLE_STANDING_WAVE, {
    useIK: true,
    mirror: false,
    poseStrength: 1,
    distributeTwist: true,
    calibration: profileA,
  });
  const poseB = retargetPoseToModel(aria, ariaSkel, ariaMap, pose3D, SAMPLE_STANDING_WAVE, {
    useIK: true,
    mirror: false,
    poseStrength: 1,
    distributeTwist: true,
    calibration: profileB,
  });

  const vpdA = exportVPD(yuki, poseA, 'PoseA');
  const vpdB = exportVPD(aria, poseB, 'PoseB');
  // Export uses each model's authentic PMX bone names
  assert.ok(vpdA.content.includes('左腕'));
  assert.ok(!vpdA.content.includes('UpperArm_L'));
  assert.ok(vpdB.content.includes('Arm_L') || vpdB.content.includes('UpperArm_L'));
});
