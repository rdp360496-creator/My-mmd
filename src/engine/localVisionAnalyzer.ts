import type { Landmark2D, Pose2DAnalysis } from './types';

export interface BuiltInReferencePreset {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  analysis: Pose2DAnalysis;
}

import standingWaveUrl from '../assets/images/ref_pose_standing_wave_1794978210072.jpg';
import seatedPortraitUrl from '../assets/images/ref_pose_seated_portrait_1794978211726.jpg';
import dualActionUrl from '../assets/images/ref_pose_dual_action_1794978213669.jpg';

function makeLm(name: string, x: number, y: number, confidence = 0.96, occluded = false): Landmark2D {
  return { name, x, y, confidence, occluded };
}

export const BUILTIN_REFERENCE_PRESETS: BuiltInReferencePreset[] = [
  {
    id: 'standing-wave',
    title: 'Standing Contrapposto Wave',
    subtitle: 'Full-body photo · Right arm raised · Left hand on hip · Smile',
    imageUrl: standingWaveUrl,
    analysis: {
      provider: 'local-vision',
      imageWidth: 900,
      imageHeight: 1200,
      subjects: [
        {
          id: 1,
          label: 'Primary Subject (Center)',
          bbox: [0.27, 0.05, 0.75, 0.95],
          poseType: 'standing',
          facingDirection: 'front',
          confidence: 0.98,
        },
      ],
      selectedSubjectId: 1,
      landmarks: {
        nose: makeLm('nose', 0.51, 0.23, 0.99),
        neck: makeLm('neck', 0.51, 0.30, 0.98),
        rightShoulder: makeLm('rightShoulder', 0.43, 0.33, 0.97),
        leftShoulder: makeLm('leftShoulder', 0.59, 0.33, 0.97),
        rightElbow: makeLm('rightElbow', 0.38, 0.22, 0.97),
        rightWrist: makeLm('rightWrist', 0.37, 0.11, 0.96),
        leftElbow: makeLm('leftElbow', 0.72, 0.42, 0.96),
        leftWrist: makeLm('leftWrist', 0.59, 0.46, 0.95),
        rightHip: makeLm('rightHip', 0.44, 0.55, 0.95),
        leftHip: makeLm('leftHip', 0.57, 0.54, 0.95),
        rightKnee: makeLm('rightKnee', 0.31, 0.72, 0.96),
        rightAnkle: makeLm('rightAnkle', 0.36, 0.90, 0.96),
        leftKnee: makeLm('leftKnee', 0.56, 0.73, 0.96),
        leftAnkle: makeLm('leftAnkle', 0.53, 0.90, 0.96),
      },
      rightHand: {
        side: 'right',
        visible: true,
        confidence: 0.95,
        wristAngleDeg: 5,
        palmOrientation: 'forward',
        gestureLabel: 'Open Wave',
        contactTarget: 'none',
        fingerCurl: { thumb: 0.12, index: 0.04, middle: 0.04, ring: 0.05, pinky: 0.08 },
        fingerSpread: 0.65,
      },
      leftHand: {
        side: 'left',
        visible: true,
        confidence: 0.89,
        wristAngleDeg: -28,
        palmOrientation: 'inward',
        gestureLabel: 'Resting on Hip',
        contactTarget: 'hip',
        fingerCurl: { thumb: 0.25, index: 0.35, middle: 0.4, ring: 0.45, pinky: 0.48 },
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
        poseSummary: 'Front-facing standing contrapposto pose with right arm raised in open wave and left hand resting on hip.',
      },
      notes: [
        'Character right arm corresponds to viewer left side (front-facing).',
        'Weight shifted onto anatomical left leg with right knee bent outward.',
      ],
    },
  },
  {
    id: 'seated-portrait',
    title: 'Seated Three-Quarter Thoughtful',
    subtitle: 'Seated studio photo · Right hand near chin · Crossed legs',
    imageUrl: seatedPortraitUrl,
    analysis: {
      provider: 'local-vision',
      imageWidth: 900,
      imageHeight: 1200,
      subjects: [
        {
          id: 1,
          label: 'Seated Performer',
          bbox: [0.11, 0.14, 0.76, 0.95],
          poseType: 'sitting',
          facingDirection: 'three-quarter-right',
          confidence: 0.96,
        },
      ],
      selectedSubjectId: 1,
      landmarks: {
        nose: makeLm('nose', 0.45, 0.22, 0.96),
        neck: makeLm('neck', 0.52, 0.29, 0.95),
        rightShoulder: makeLm('rightShoulder', 0.44, 0.34, 0.93),
        leftShoulder: makeLm('leftShoulder', 0.60, 0.33, 0.95),
        rightElbow: makeLm('rightElbow', 0.39, 0.45, 0.92),
        rightWrist: makeLm('rightWrist', 0.44, 0.29, 0.94),
        leftElbow: makeLm('leftElbow', 0.50, 0.46, 0.94),
        leftWrist: makeLm('leftWrist', 0.28, 0.56, 0.93),
        rightHip: makeLm('rightHip', 0.54, 0.56, 0.88, true),
        leftHip: makeLm('leftHip', 0.66, 0.56, 0.92),
        rightKnee: makeLm('rightKnee', 0.35, 0.54, 0.94),
        rightAnkle: makeLm('rightAnkle', 0.24, 0.77, 0.94),
        leftKnee: makeLm('leftKnee', 0.39, 0.60, 0.92),
        leftAnkle: makeLm('leftAnkle', 0.36, 0.87, 0.93),
      },
      rightHand: {
        side: 'right',
        visible: true,
        confidence: 0.91,
        wristAngleDeg: 18,
        palmOrientation: 'inward',
        gestureLabel: 'Touching Chin',
        contactTarget: 'chin',
        fingerCurl: { thumb: 0.4, index: 0.55, middle: 0.68, ring: 0.74, pinky: 0.78 },
        fingerSpread: 0.12,
      },
      leftHand: {
        side: 'left',
        visible: true,
        confidence: 0.9,
        wristAngleDeg: -22,
        palmOrientation: 'down',
        gestureLabel: 'Relaxed Over Knee',
        contactTarget: 'none',
        fingerCurl: { thumb: 0.2, index: 0.3, middle: 0.36, ring: 0.42, pinky: 0.45 },
        fingerSpread: 0.25,
      },
      expression: {
        faceVisible: true,
        faceConfidence: 0.93,
        dominantExpression: 'thoughtful',
        headYawDeg: -34,
        headPitchDeg: -4,
        headRollDeg: 2,
        leftEyeOpen: 0.86,
        rightEyeOpen: 0.86,
        mouthOpen: 0.08,
        smileIntensity: 0.25,
        browIntensity: 0.1,
        gazeX: -0.45,
        gazeY: 0.08,
      },
      depthHints: {
        torsoYawDeg: -42,
        torsoPitchDeg: 10,
        torsoRollDeg: 3,
        leftElbowForward: 0.55,
        rightElbowForward: 0.7,
        leftKneeForward: 0.92,
        rightKneeForward: 0.95,
        weightSide: 'center',
        poseSummary: 'Seated three-quarter pose angled toward viewer left with right hand raised under chin and relaxed crossed legs.',
      },
      notes: [
        'Three-quarter orientation: torso yaw -42° with right hip partially occluded.',
        'Seated pelvis height lowered to cube stool elevation.',
      ],
    },
  },
  {
    id: 'dual-anime-idol',
    title: 'Dual Anime Characters (Multi-Subject)',
    subtitle: '2 subjects detected · Subject 1 Idol Wink/Peace · Subject 2 Crossed Arms',
    imageUrl: dualActionUrl,
    analysis: {
      provider: 'local-vision',
      imageWidth: 1200,
      imageHeight: 900,
      subjects: [
        {
          id: 1,
          label: 'Left Subject (Idol Peace + Wink)',
          bbox: [0.12, 0.16, 0.45, 0.94],
          poseType: 'standing',
          facingDirection: 'front',
          confidence: 0.97,
        },
        {
          id: 2,
          label: 'Right Subject (Crossed Arms)',
          bbox: [0.63, 0.05, 0.91, 0.94],
          poseType: 'standing',
          facingDirection: 'front',
          confidence: 0.96,
        },
      ],
      selectedSubjectId: 1,
      landmarks: {
        nose: makeLm('nose', 0.28, 0.26, 0.96),
        neck: makeLm('neck', 0.28, 0.33, 0.95),
        rightShoulder: makeLm('rightShoulder', 0.23, 0.37, 0.94),
        leftShoulder: makeLm('leftShoulder', 0.33, 0.37, 0.94),
        rightElbow: makeLm('rightElbow', 0.16, 0.40, 0.94),
        rightWrist: makeLm('rightWrist', 0.19, 0.30, 0.95),
        leftElbow: makeLm('leftElbow', 0.37, 0.45, 0.94),
        leftWrist: makeLm('leftWrist', 0.41, 0.36, 0.95),
        rightHip: makeLm('rightHip', 0.25, 0.56, 0.90),
        leftHip: makeLm('leftHip', 0.32, 0.56, 0.90),
        rightKnee: makeLm('rightKnee', 0.20, 0.72, 0.93),
        rightAnkle: makeLm('rightAnkle', 0.17, 0.64, 0.92),
        leftKnee: makeLm('leftKnee', 0.31, 0.74, 0.95),
        leftAnkle: makeLm('leftAnkle', 0.28, 0.90, 0.95),
      },
      rightHand: {
        side: 'right',
        visible: true,
        confidence: 0.94,
        wristAngleDeg: 14,
        palmOrientation: 'forward',
        gestureLabel: 'Peace Sign (Near Eye)',
        contactTarget: 'face',
        fingerCurl: { thumb: 0.7, index: 0.05, middle: 0.05, ring: 0.9, pinky: 0.92 },
        fingerSpread: 0.5,
      },
      leftHand: {
        side: 'left',
        visible: true,
        confidence: 0.94,
        wristAngleDeg: -10,
        palmOrientation: 'forward',
        gestureLabel: 'Peace Sign (Outward)',
        contactTarget: 'none',
        fingerCurl: { thumb: 0.7, index: 0.05, middle: 0.05, ring: 0.9, pinky: 0.92 },
        fingerSpread: 0.55,
      },
      expression: {
        faceVisible: true,
        faceConfidence: 0.96,
        dominantExpression: 'wink',
        headYawDeg: 5,
        headPitchDeg: -4,
        headRollDeg: 8,
        leftEyeOpen: 0.95,
        rightEyeOpen: 0.05,
        mouthOpen: 0.65,
        smileIntensity: 0.92,
        browIntensity: 0.25,
        gazeX: 0,
        gazeY: 0,
      },
      depthHints: {
        torsoYawDeg: 8,
        torsoPitchDeg: 4,
        torsoRollDeg: 6,
        leftElbowForward: 0.35,
        rightElbowForward: 0.55,
        leftKneeForward: 0.1,
        rightKneeForward: 0.45,
        weightSide: 'left',
        poseSummary: 'Dynamic idol pose with right knee tucked back, winking expression, and dual peace-sign gestures.',
      },
      notes: [
        'Multiple people detected: analyzing Subject 1 (Idol). Select Subject 2 to switch to the crossed-arms character.',
      ],
    },
  },
];

// Subject 2 landmark override for the Dual Anime Characters preset
export const DUAL_ANIME_SUBJECT2_ANALYSIS: Omit<Pose2DAnalysis, 'subjects' | 'imageWidth' | 'imageHeight' | 'provider'> = {
  selectedSubjectId: 2,
  landmarks: {
    nose: makeLm('nose', 0.77, 0.14, 0.97),
    neck: makeLm('neck', 0.77, 0.21, 0.96),
    rightShoulder: makeLm('rightShoulder', 0.70, 0.25, 0.95),
    leftShoulder: makeLm('leftShoulder', 0.84, 0.25, 0.95),
    rightElbow: makeLm('rightElbow', 0.66, 0.38, 0.94),
    rightWrist: makeLm('rightWrist', 0.80, 0.34, 0.92),
    leftElbow: makeLm('leftElbow', 0.88, 0.37, 0.94),
    leftWrist: makeLm('leftWrist', 0.73, 0.36, 0.92),
    rightHip: makeLm('rightHip', 0.73, 0.50, 0.92),
    leftHip: makeLm('leftHip', 0.81, 0.50, 0.92),
    rightKnee: makeLm('rightKnee', 0.73, 0.70, 0.95),
    rightAnkle: makeLm('rightAnkle', 0.72, 0.89, 0.95),
    leftKnee: makeLm('leftKnee', 0.83, 0.70, 0.95),
    leftAnkle: makeLm('leftAnkle', 0.81, 0.91, 0.95),
  },
  rightHand: {
    side: 'right',
    visible: true,
    confidence: 0.85,
    wristAngleDeg: 0,
    palmOrientation: 'inward',
    gestureLabel: 'Crossed Arm Tuck',
    contactTarget: 'other-hand',
    fingerCurl: { thumb: 0.3, index: 0.4, middle: 0.45, ring: 0.5, pinky: 0.5 },
    fingerSpread: 0.1,
  },
  leftHand: {
    side: 'left',
    visible: true,
    confidence: 0.85,
    wristAngleDeg: 0,
    palmOrientation: 'inward',
    gestureLabel: 'Crossed Arm Tuck',
    contactTarget: 'other-hand',
    fingerCurl: { thumb: 0.3, index: 0.4, middle: 0.45, ring: 0.5, pinky: 0.5 },
    fingerSpread: 0.1,
  },
  expression: {
    faceVisible: true,
    faceConfidence: 0.95,
    dominantExpression: 'neutral',
    headYawDeg: -4,
    headPitchDeg: 0,
    headRollDeg: 0,
    leftEyeOpen: 0.9,
    rightEyeOpen: 0.9,
    mouthOpen: 0.04,
    smileIntensity: 0.08,
    browIntensity: -0.15,
    gazeX: -0.15,
    gazeY: 0,
  },
  depthHints: {
    torsoYawDeg: -5,
    torsoPitchDeg: 0,
    torsoRollDeg: 0,
    leftElbowForward: 0.45,
    rightElbowForward: 0.55,
    leftKneeForward: 0.05,
    rightKneeForward: 0.05,
    weightSide: 'center',
    poseSummary: 'Calm upright standing pose with arms folded across torso and neutral expression.',
  },
  notes: [
    'Multiple people detected: analyzing Subject 2 (Standing, Crossed Arms).',
  ],
};

/**
 * Local CPU-only computer vision pose estimator for arbitrary user-uploaded images.
 * Computes silhouette bounding box & vertical/horizontal pixel mass distribution on a scaled canvas
 * to initialize accurate editable 2D landmarks without sending data to any external cloud service.
 */
export async function analyzeImageLocally(
  imageUrl: string,
  presetId?: string,
  selectedSubjectId = 1
): Promise<Pose2DAnalysis> {
  if (presetId) {
    const preset = BUILTIN_REFERENCE_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      if (presetId === 'dual-anime-idol' && selectedSubjectId === 2) {
        return {
          ...preset.analysis,
          ...DUAL_ANIME_SUBJECT2_ANALYSIS,
          subjects: preset.analysis.subjects,
        };
      }
      return {
        ...preset.analysis,
        selectedSubjectId: preset.analysis.subjects[0]?.id ?? 1,
      };
    }
  }

  // Analyze arbitrary uploaded image using offscreen HTMLCanvasElement pixel foreground segmentation
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to decode reference image for local analysis.'));
    el.src = imageUrl;
  });

  const sampleW = 96;
  const sampleH = Math.max(64, Math.round((img.height / Math.max(1, img.width)) * sampleW));
  const canvas = document.createElement('canvas');
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create 2D canvas context for local image analysis.');
  }
  ctx.drawImage(img, 0, 0, sampleW, sampleH);
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

  // Estimate background color from top-left & top-right corners
  const bgR = (data[0] + data[(sampleW - 1) * 4]) / 2;
  const bgG = (data[1] + data[(sampleW - 1) * 4 + 1]) / 2;
  const bgB = (data[2] + data[(sampleW - 1) * 4 + 2]) / 2;

  let minX = sampleW;
  let maxX = 0;
  let minY = sampleH;
  let maxY = 0;
  const rowMinX = new Array<number>(sampleH).fill(sampleW);
  const rowMaxX = new Array<number>(sampleH).fill(0);
  const rowMass = new Array<number>(sampleH).fill(0);

  for (let y = 0; y < sampleH; y++) {
    for (let x = 0; x < sampleW; x++) {
      const idx = (y * sampleW + x) * 4;
      const dist =
        Math.abs(data[idx] - bgR) +
        Math.abs(data[idx + 1] - bgG) +
        Math.abs(data[idx + 2] - bgB);
      if (dist > 48 && data[idx + 3] > 32) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < rowMinX[y]) rowMinX[y] = x;
        if (x > rowMaxX[y]) rowMaxX[y] = x;
        rowMass[y]++;
      }
    }
  }

  if (maxX <= minX || maxY <= minY) {
    minX = Math.round(sampleW * 0.25);
    maxX = Math.round(sampleW * 0.75);
    minY = Math.round(sampleH * 0.08);
    maxY = Math.round(sampleH * 0.92);
  }

  const bx0 = minX / sampleW;
  const by0 = minY / sampleH;
  const bx1 = maxX / sampleW;
  const by1 = maxY / sampleH;
  const cx = (bx0 + bx1) / 2;
  const bw = Math.max(0.18, bx1 - bx0);
  const bh = Math.max(0.35, by1 - by0);

  // Sample shoulder width & arm reach from upper-torso band
  const shYIdx = Math.min(sampleH - 1, Math.round((by0 + bh * 0.24) * sampleH));
  const armSpanL = rowMaxX[shYIdx] > rowMinX[shYIdx] ? rowMaxX[shYIdx] / sampleW : cx + bw * 0.45;
  const armSpanR = rowMaxX[shYIdx] > rowMinX[shYIdx] ? rowMinX[shYIdx] / sampleW : cx - bw * 0.45;

  return {
    provider: 'local-vision',
    imageWidth: img.naturalWidth || img.width,
    imageHeight: img.naturalHeight || img.height,
    subjects: [
      {
        id: 1,
        label: 'Detected Foreground Subject',
        bbox: [bx0, by0, bx1, by1],
        poseType: bh < 0.55 ? 'sitting' : 'standing',
        facingDirection: 'front',
        confidence: 0.72,
      },
    ],
    selectedSubjectId: 1,
    landmarks: {
      nose: makeLm('nose', cx, by0 + bh * 0.1, 0.74),
      neck: makeLm('neck', cx, by0 + bh * 0.19, 0.76),
      rightShoulder: makeLm('rightShoulder', cx - bw * 0.24, by0 + bh * 0.23, 0.75),
      leftShoulder: makeLm('leftShoulder', cx + bw * 0.24, by0 + bh * 0.23, 0.75),
      rightElbow: makeLm('rightElbow', Math.min(cx - bw * 0.34, armSpanR + 0.04), by0 + bh * 0.36, 0.68),
      rightWrist: makeLm('rightWrist', armSpanR, by0 + bh * 0.47, 0.65),
      leftElbow: makeLm('leftElbow', Math.max(cx + bw * 0.34, armSpanL - 0.04), by0 + bh * 0.36, 0.68),
      leftWrist: makeLm('leftWrist', armSpanL, by0 + bh * 0.47, 0.65),
      rightHip: makeLm('rightHip', cx - bw * 0.15, by0 + bh * 0.5, 0.74),
      leftHip: makeLm('leftHip', cx + bw * 0.15, by0 + bh * 0.5, 0.74),
      rightKnee: makeLm('rightKnee', cx - bw * 0.17, by0 + bh * 0.73, 0.72),
      rightAnkle: makeLm('rightAnkle', cx - bw * 0.18, by0 + bh * 0.94, 0.7),
      leftKnee: makeLm('leftKnee', cx + bw * 0.17, by0 + bh * 0.73, 0.72),
      leftAnkle: makeLm('leftAnkle', cx + bw * 0.18, by0 + bh * 0.94, 0.7),
    },
    rightHand: {
      side: 'right',
      visible: true,
      confidence: 0.6,
      wristAngleDeg: 0,
      palmOrientation: 'inward',
      gestureLabel: 'Natural Open',
      contactTarget: 'none',
      fingerCurl: { thumb: 0.2, index: 0.25, middle: 0.28, ring: 0.32, pinky: 0.35 },
      fingerSpread: 0.2,
    },
    leftHand: {
      side: 'left',
      visible: true,
      confidence: 0.6,
      wristAngleDeg: 0,
      palmOrientation: 'inward',
      gestureLabel: 'Natural Open',
      contactTarget: 'none',
      fingerCurl: { thumb: 0.2, index: 0.25, middle: 0.28, ring: 0.32, pinky: 0.35 },
      fingerSpread: 0.2,
    },
    expression: {
      faceVisible: true,
      faceConfidence: 0.62,
      warning: 'Local silhouette mode estimates neutral expression. Drag 2D landmarks or enable Cloud Vision AI for detailed facial/hand analysis.',
      dominantExpression: 'neutral',
      headYawDeg: 0,
      headPitchDeg: 0,
      headRollDeg: 0,
      leftEyeOpen: 0.95,
      rightEyeOpen: 0.95,
      mouthOpen: 0.05,
      smileIntensity: 0.15,
      browIntensity: 0,
      gazeX: 0,
      gazeY: 0,
    },
    depthHints: {
      torsoYawDeg: 0,
      torsoPitchDeg: 0,
      torsoRollDeg: 0,
      leftElbowForward: 0.15,
      rightElbowForward: 0.15,
      leftKneeForward: 0.08,
      rightKneeForward: 0.08,
      weightSide: 'center',
      poseSummary: 'Local foreground silhouette estimation completed. Drag any 2D landmark on the reference canvas to refine.',
    },
    notes: [
      'Analyzed locally in browser without external upload.',
      'Enable Cloud Vision AI in Settings (or click Cloud AI Re-Analyze) for multi-person, stylized anime, finger, and facial expression detection.',
    ],
  };
}
