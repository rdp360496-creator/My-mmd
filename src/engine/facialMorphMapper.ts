import { clamp } from './mmdCoordinates';
import type { FacialExpressionAnalysis, MorphMappingEntry, PMXModelData } from './types';

interface MorphRule {
  semanticKey: string;
  label: string;
  aliases: string[];
}

const MORPH_RULES: MorphRule[] = [
  { semanticKey: 'blink', label: 'Both Eyes Blink', aliases: ['まばたき', 'blink', 'eyesclosed', 'close'] },
  { semanticKey: 'winkL', label: 'Left Eye Wink', aliases: ['ウィンク', 'ウィンク２', 'winkl', 'winkleft', 'wink_l'] },
  { semanticKey: 'winkR', label: 'Right Eye Wink', aliases: ['ウィンク右', 'ウインク右', 'winkr', 'winkright', 'wink_r'] },
  { semanticKey: 'smile', label: 'Eye / Face Smile', aliases: ['笑い', 'にこり', 'happyeyes', 'smile', 'happy'] },
  { semanticKey: 'grin', label: 'Mouth Smile / Grin', aliases: ['にこり', '口角上げ', 'happymouth', 'grin', 'smilemouth'] },
  { semanticKey: 'mouthA', label: 'Mouth Open (A)', aliases: ['あ', 'あ２', 'moutha', 'mouthopen', 'a', 'open'] },
  { semanticKey: 'mouthI', label: 'Mouth Wide (I)', aliases: ['い', 'mouthi', 'i'] },
  { semanticKey: 'mouthO', label: 'Mouth Round (O / Surprised)', aliases: ['お', 'moutho', 'o', 'surprised'] },
  { semanticKey: 'sad', label: 'Eyebrow Sad / Worried', aliases: ['困る', '哀', 'sad', 'worried', 'trouble'] },
  { semanticKey: 'angry', label: 'Eyebrow Angry', aliases: ['怒り', '怒', 'browsdown', 'angry'] },
  { semanticKey: 'browUp', label: 'Eyebrow Raised', aliases: ['上', 'にやり', 'browup', 'up', 'surprise'] },
];

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_.-]+/g, '');
}

export function mapFacialExpressionToMorphs(
  model: PMXModelData,
  expression: FacialExpressionAnalysis | null,
  strengthMultiplier = 1.0
): {
  entries: MorphMappingEntry[];
  weights: Record<string, number>;
  warnings: string[];
} {
  const warnings: string[] = [];
  const entries: MorphMappingEntry[] = [];
  const weights: Record<string, number> = {};

  if (expression && !expression.faceVisible) {
    warnings.push(
      expression.warning ||
        'Reference face is obscured or low-resolution; keeping neutral morph weights unless manually adjusted.'
    );
  } else if (expression && expression.faceConfidence < 0.55) {
    warnings.push(
      expression.warning ||
        `Low facial landmark confidence (${Math.round(expression.faceConfidence * 100)}%). Review eye/mouth sliders before export.`
    );
  }

  for (const rule of MORPH_RULES) {
    const matched = model.morphs.find((m) => {
      const mJp = norm(m.name);
      const mEn = norm(m.englishName);
      return rule.aliases.some((a) => mJp === norm(a) || mEn === norm(a));
    });

    let weight = 0;
    if (expression && expression.faceVisible) {
      const s = clamp(strengthMultiplier, 0, 1.5);
      switch (rule.semanticKey) {
        case 'blink': {
          const bothClosed =
            1 - Math.max(expression.leftEyeOpen, expression.rightEyeOpen);
          weight = bothClosed > 0.2 ? clamp(bothClosed * s, 0, 1) : 0;
          break;
        }
        case 'winkL': {
          const diff = expression.rightEyeOpen - expression.leftEyeOpen;
          weight = diff > 0.3 ? clamp((1 - expression.leftEyeOpen) * s, 0, 1) : 0;
          break;
        }
        case 'winkR': {
          const diff = expression.leftEyeOpen - expression.rightEyeOpen;
          weight = diff > 0.3 ? clamp((1 - expression.rightEyeOpen) * s, 0, 1) : 0;
          break;
        }
        case 'smile': {
          weight = clamp(expression.smileIntensity * 0.85 * s, 0, 1);
          break;
        }
        case 'grin': {
          weight = clamp(expression.smileIntensity * s, 0, 1);
          break;
        }
        case 'mouthA': {
          weight =
            expression.dominantExpression === 'surprised'
              ? clamp(expression.mouthOpen * 0.45 * s, 0, 1)
              : clamp(expression.mouthOpen * s, 0, 1);
          break;
        }
        case 'mouthO': {
          weight =
            expression.dominantExpression === 'surprised'
              ? clamp(expression.mouthOpen * 0.85 * s, 0, 1)
              : 0;
          break;
        }
        case 'sad': {
          weight =
            expression.dominantExpression === 'sad' || expression.dominantExpression === 'thoughtful'
              ? clamp(0.45 * s, 0, 1)
              : 0;
          break;
        }
        case 'angry': {
          weight =
            expression.dominantExpression === 'angry' || expression.browIntensity < -0.25
              ? clamp(Math.abs(expression.browIntensity) * s, 0, 1)
              : 0;
          break;
        }
        case 'browUp': {
          weight =
            expression.browIntensity > 0.2
              ? clamp(expression.browIntensity * s, 0, 1)
              : 0;
          break;
        }
      }
    }

    if (matched) {
      weights[matched.name] = Number(weight.toFixed(3));
      entries.push({
        semanticKey: rule.semanticKey,
        label: rule.label,
        targetMorphIndex: matched.index,
        targetMorphName: matched.name,
        weight: weights[matched.name],
        available: true,
      });
    } else {
      entries.push({
        semanticKey: rule.semanticKey,
        label: rule.label,
        targetMorphIndex: null,
        targetMorphName: null,
        weight: 0,
        available: false,
        note: 'No matching morph on target model.',
      });
      if (weight > 0.25) {
        warnings.push(
          `Detected "${rule.label}" (${Math.round(weight * 100)}%) but model lacks a matching morph.`
        );
      }
    }
  }

  return { entries, weights, warnings };
}
