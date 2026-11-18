export type Vec3 = [number, number, number];
export type Quat4 = [number, number, number, number]; // [x, y, z, w]

export type StandardBoneRole =
  | 'allParents'
  | 'center'
  | 'groove'
  | 'waist'
  | 'upperBody'
  | 'upperBody2'
  | 'upperBody3'
  | 'neck'
  | 'head'
  | 'eyeL'
  | 'eyeR'
  | 'shoulderL'
  | 'shoulderR'
  | 'armL'
  | 'armR'
  | 'armTwistL'
  | 'armTwistR'
  | 'elbowL'
  | 'elbowR'
  | 'wristTwistL'
  | 'wristTwistR'
  | 'wristL'
  | 'wristR'
  | 'thumb0L'
  | 'thumb1L'
  | 'thumb2L'
  | 'index1L'
  | 'index2L'
  | 'index3L'
  | 'middle1L'
  | 'middle2L'
  | 'middle3L'
  | 'ring1L'
  | 'ring2L'
  | 'ring3L'
  | 'pinky1L'
  | 'pinky2L'
  | 'pinky3L'
  | 'thumb0R'
  | 'thumb1R'
  | 'thumb2R'
  | 'index1R'
  | 'index2R'
  | 'index3R'
  | 'middle1R'
  | 'middle2R'
  | 'middle3R'
  | 'ring1R'
  | 'ring2R'
  | 'ring3R'
  | 'pinky1R'
  | 'pinky2R'
  | 'pinky3R'
  | 'legL'
  | 'legR'
  | 'kneeL'
  | 'kneeR'
  | 'ankleL'
  | 'ankleR'
  | 'toeL'
  | 'toeR'
  | 'legIkL'
  | 'legIkR'
  | 'toeIkL'
  | 'toeIkR';

export interface PMXIKLink {
  boneIndex: number;
  hasLimits: boolean;
  minAngle: Vec3; // radians in MMD space
  maxAngle: Vec3; // radians in MMD space
}

export interface PMXBone {
  index: number;
  name: string;
  englishName: string;
  position: Vec3; // MMD space (X: +left/-right, Y: +up, Z: -front)
  parentIndex: number;
  transformLevel: number;
  flags: number;
  tailMode: 'offset' | 'bone';
  tailBoneIndex: number;
  tailOffset: Vec3;
  rotatable: boolean;
  translatable: boolean;
  visible: boolean;
  enabled: boolean;
  isIK: boolean;
  inheritRotation: boolean;
  inheritTranslation: boolean;
  inheritParentIndex: number;
  inheritRatio: number;
  hasFixedAxis: boolean;
  fixedAxis: Vec3;
  hasLocalAxis: boolean;
  localAxisX: Vec3;
  localAxisZ: Vec3;
  physicsAfterDeform: boolean;
  ikTargetIndex: number;
  ikLoopCount: number;
  ikLimitAngle: number;
  ikLinks: PMXIKLink[];
}

export type MorphPanelCategory = 'system' | 'eyebrow' | 'eye' | 'mouth' | 'other';
export type MorphType = 'group' | 'vertex' | 'bone' | 'uv' | 'material' | 'flip' | 'impulse';

export interface PMXVertexMorphOffset {
  vertexIndex: number;
  offset: Vec3;
}

export interface PMXGroupMorphOffset {
  morphIndex: number;
  ratio: number;
}

export interface PMXMorph {
  index: number;
  name: string;
  englishName: string;
  panel: MorphPanelCategory;
  type: MorphType;
  vertexOffsets: PMXVertexMorphOffset[];
  groupOffsets: PMXGroupMorphOffset[];
}

export interface PMXMaterial {
  name: string;
  englishName: string;
  diffuse: [number, number, number, number];
  specular: Vec3;
  specularity: number;
  ambient: Vec3;
  drawFlags: number;
  edgeColor: [number, number, number, number];
  edgeSize: number;
  textureIndex: number;
  sphereTextureIndex: number;
  sphereMode: number;
  toonFlag: number;
  toonIndex: number;
  faceCount: number;
}

export interface PMXModelData {
  format: 'PMX' | 'PMD';
  version: number;
  fileName: string;
  name: string;
  englishName: string;
  comment: string;
  englishComment: string;
  vertexCount: number;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  skinIndices: Uint16Array;
  skinWeights: Float32Array;
  indices: Uint32Array;
  textures: string[];
  materials: PMXMaterial[];
  bones: PMXBone[];
  morphs: PMXMorph[];
}

export type RestPoseType = 'A-Pose' | 'T-Pose' | 'Custom';

export type BoneVisualCategory =
  | 'head-neck'
  | 'torso'
  | 'arm'
  | 'leg'
  | 'finger'
  | 'twist'
  | 'ik'
  | 'helper'
  | 'unknown';

export interface ExtractedBoneDetails {
  index: number;
  name: string;
  englishName: string;
  parentIndex: number;
  parentName: string | null;
  childIndices: number[];
  localPosition: Vec3;
  worldPosition: Vec3;
  tailWorldPosition: Vec3;
  orientation: Vec3;
  length: number;
  localAxisX: Vec3;
  localAxisY: Vec3;
  localAxisZ: Vec3;
  deformationLayer: number;
  visualCategory: BoneVisualCategory;
}

export interface SkeletonAnalysis {
  modelName: string;
  boneCount: number;
  morphCount: number;
  restPoseType: RestPoseType;
  armRestAngleDeg: number; // 0 = horizontal T-pose, ~35-45 = A-pose
  hasUpperBody2: boolean;
  hasShoulderBones: boolean;
  hasTwistBones: boolean;
  hasLegIK: boolean;
  fingerCoverage: 'full' | 'partial' | 'none';
  childrenByBone: number[][];
  depthByBone: number[];
  restBoneDirs: Vec3[]; // unit direction in MMD space
  restBoneLengths: number[];
  localBases: Array<{ x: Vec3; y: Vec3; z: Vec3 }>;
  boneDetails: ExtractedBoneDetails[];
  ikControlledBoneIndices: Set<number>;
  morphCategories: Record<MorphPanelCategory, number[]>;
  warnings: string[];
}

export type MappingConfidence = 'high' | 'medium' | 'low' | 'manual' | 'unmapped';

export interface BoneMappingEntry {
  role: StandardBoneRole;
  label: string;
  boneIndex: number | null;
  boneName: string | null;
  englishBoneName: string | null;
  confidence: MappingConfidence;
  confidenceScore: number; // 0..1
  signalsUsed: string[];
  reason: string;
}

export interface MappingValidationIssue {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category:
    | 'missing-required'
    | 'duplicate-mapping'
    | 'side-mismatch'
    | 'hierarchy-invalid'
    | 'twist-invalid'
    | 'ik-invalid'
    | 'local-axis-invalid'
    | 'unusual-orientation'
    | 'missing-fingers'
    | 'low-confidence';
  role?: StandardBoneRole;
  boneName?: string;
  message: string;
}

export interface MappingValidationReport {
  valid: boolean;
  hasCriticalWarnings: boolean;
  successfullyMapped: StandardBoneRole[];
  unmappedBones: StandardBoneRole[];
  lowConfidenceMappings: StandardBoneRole[];
  manuallyCorrectedMappings: StandardBoneRole[];
  unsupportedStructures: string[];
  unknownModelBones: Array<{ index: number; name: string; englishName: string }>;
  issues: MappingValidationIssue[];
}

export interface BoneMappingResult {
  modelKey: string;
  skeletonSignature: string;
  entries: Record<StandardBoneRole, BoneMappingEntry>;
  mappedCount: number;
  lowConfidenceRoles: StandardBoneRole[];
  unmappedRequiredRoles: StandardBoneRole[];
  validationReport: MappingValidationReport;
}

export interface ModelCalibrationProfile {
  schemaVersion: '1.0.0';
  modelIdentityKey: string;
  skeletonSignature: string;
  modelName: string;
  fileName: string;
  format: 'PMX' | 'PMD';
  boneCount: number;
  morphCount: number;
  createdAt: string;
  updatedAt: string;
  restPoseType: RestPoseType;
  armRestAngleDeg: number;
  coordinateConversion: {
    sourceSpace: 'MMD-LH';
    targetSpace: 'ThreeJS-RH';
    zNegated: boolean;
    positionScale: number;
  };
  boneLengths: number[];
  restDirections: Vec3[];
  localAxes: Array<{ x: Vec3; y: Vec3; z: Vec3 }>;
  hierarchyParents: number[];
  rotationConstraints: Array<{
    boneIndex: number;
    rotatable: boolean;
    translatable: boolean;
    hasFixedAxis: boolean;
    fixedAxis: Vec3;
    inheritRotation: boolean;
    inheritParentIndex: number;
    inheritRatio: number;
  }>;
  ikConfiguration: Array<{
    ikBoneIndex: number;
    ikBoneName: string;
    targetBoneIndex: number;
    loopCount: number;
    limitAngle: number;
    links: PMXIKLink[];
  }>;
  anatomicalMapping: Partial<Record<StandardBoneRole, {
    boneIndex: number | null;
    boneName: string | null;
    confidence: MappingConfidence;
    confidenceScore: number;
  }>>;
  userCorrectedMappings: Partial<Record<StandardBoneRole, number | null>>;
}

export interface Landmark2D {
  name: string;
  x: number; // 0..1 normalized in image space
  y: number; // 0..1 normalized in image space
  confidence: number; // 0..1
  occluded?: boolean;
}

export interface DetectedSubject {
  id: number;
  label: string;
  bbox: [number, number, number, number]; // [xmin, ymin, xmax, ymax] normalized 0..1
  poseType: 'standing' | 'sitting' | 'crouching' | 'kneeling' | 'lying' | 'jumping' | 'dynamic';
  facingDirection: 'front' | 'back' | 'left' | 'right' | 'three-quarter-left' | 'three-quarter-right';
  confidence: number;
}

export interface HandPoseAnalysis {
  side: 'left' | 'right';
  visible: boolean;
  confidence: number;
  wristAngleDeg: number;
  palmOrientation: 'forward' | 'backward' | 'inward' | 'outward' | 'up' | 'down';
  gestureLabel: string;
  contactTarget: 'none' | 'face' | 'chin' | 'hip' | 'chest' | 'other-hand';
  fingerCurl: {
    thumb: number; // 0 = extended, 1 = curled
    index: number;
    middle: number;
    ring: number;
    pinky: number;
  };
  fingerSpread: number; // 0..1
}

export interface FacialExpressionAnalysis {
  faceVisible: boolean;
  faceConfidence: number;
  warning?: string;
  dominantExpression: 'neutral' | 'smile' | 'sad' | 'angry' | 'surprised' | 'thoughtful' | 'wink';
  headYawDeg: number;
  headPitchDeg: number;
  headRollDeg: number;
  leftEyeOpen: number; // 0 = closed, 1 = open
  rightEyeOpen: number;
  mouthOpen: number; // 0..1
  smileIntensity: number; // 0..1
  browIntensity: number; // -1 (furrowed) .. +1 (raised)
  gazeX: number; // -1..1
  gazeY: number; // -1..1
}

export interface Pose2DAnalysis {
  provider: 'local-vision' | 'gemini-vision' | 'manual-landmarks';
  imageWidth: number;
  imageHeight: number;
  subjects: DetectedSubject[];
  selectedSubjectId: number;
  landmarks: Record<string, Landmark2D>;
  leftHand: HandPoseAnalysis;
  rightHand: HandPoseAnalysis;
  expression: FacialExpressionAnalysis;
  depthHints: {
    torsoYawDeg: number;
    torsoPitchDeg: number;
    torsoRollDeg: number;
    leftElbowForward: number; // -1 back .. +1 forward
    rightElbowForward: number;
    leftKneeForward: number;
    rightKneeForward: number;
    weightSide: 'center' | 'left' | 'right';
    poseSummary: string;
  };
  notes: string[];
}

export interface Pose3DJoint {
  name: string;
  position: Vec3; // Three.js space (+X anatomical left, +Y up, +Z forward)
  confidence: number;
  occluded: boolean;
}

export interface Pose3DReconstruction {
  joints: Record<string, Pose3DJoint>;
  projected2D: Record<string, { x: number; y: number }>;
  anatomicalFacing: 'front' | 'back' | 'left' | 'right' | 'three-quarter';
  alternativeDepthAvailable: boolean;
  depthVariant: 'primary' | 'alternate';
  limbLengths: Record<string, number>;
  warnings: string[];
}

export interface BoneTransform {
  boneIndex: number;
  boneName: string;
  translation: Vec3; // Three.js local offset relative to rest
  quaternion: Quat4; // Three.js local quaternion [x, y, z, w]
  source: 'retargeted' | 'ik' | 'manual' | 'twist-distributed';
}

export interface RetargetedPose {
  transforms: Record<number, BoneTransform>;
  ikEnabled: boolean;
  mirrored: boolean;
  poseStrength: number;
  rootOffsetY: number;
}

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  category: 'joint-limit' | 'ik-conflict' | 'orientation' | 'ground-contact' | 'vmd-limit' | 'morph';
  boneName?: string;
  message: string;
  autoCorrectible: boolean;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
  checkedBones: number;
  correctedCount: number;
}

export interface MorphMappingEntry {
  semanticKey: string;
  label: string;
  targetMorphIndex: number | null;
  targetMorphName: string | null;
  weight: number;
  available: boolean;
  note?: string;
}

export interface ProjectFile {
  schemaVersion: '1.0.0';
  savedAt: string;
  projectName: string;
  modelFileName: string;
  modelName: string;
  referenceImageName: string;
  referenceImageDataUrl?: string;
  pose2D: Pose2DAnalysis | null;
  pose3D: Pose3DReconstruction | null;
  boneMappingOverrides: Partial<Record<StandardBoneRole, number | null>>;
  retargetedPose: RetargetedPose | null;
  morphWeights: Record<string, number>;
  validation: ValidationReport | null;
  exportSettings: {
    poseName: string;
    includeFaceInFullVmd: boolean;
    useShiftJis: boolean;
    vmdFrameNumber: number;
  };
}

export interface MMDIntegrationConfig {
  mmdExePath: string;
  exportDirectory: string;
  autoDetectedPath: string;
  rememberDirectory: boolean;
  cloudVisionConsent: boolean;
  hardwareProfile: 'auto-webgl' | 'cpu-safe' | 'cuda-local-service';
  inferenceQuality: 'fast' | 'balanced' | 'high';
}
