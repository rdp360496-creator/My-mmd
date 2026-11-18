import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { FacialExpressionAnalysis, MorphMappingEntry, PMXModelData } from '../engine/types';

interface ExpressionsViewProps {
  model: PMXModelData | null;
  expression: FacialExpressionAnalysis | null;
  morphEntries: MorphMappingEntry[];
  morphWeights: Record<string, number>;
  expressionStrength: number;
  warnings: string[];
  onExpressionStrengthChange: (strength: number) => void;
  onMorphWeightChange: (morphName: string, weight: number) => void;
  onResetMorphs: () => void;
  onReapplyDetectedExpression: () => void;
}

export const ExpressionsView: React.FC<ExpressionsViewProps> = ({
  model,
  expression,
  morphEntries,
  morphWeights,
  expressionStrength,
  warnings,
  onExpressionStrengthChange,
  onMorphWeightChange,
  onResetMorphs,
  onReapplyDetectedExpression,
}) => {
  if (!model) {
    return <div className="p-8 text-sm text-slate-400">Import an MMD model to edit facial morphs.</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0D1117] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#222B38]">
          <div>
            <h1 className="text-lg font-semibold text-white">Facial Expression & Morph Retargeting</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Target Model: {model.name} · {model.morphs.length} available morphs
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onResetMorphs}
              className="px-3 py-2 text-xs font-medium bg-[#161D27] hover:bg-[#1E2735] border border-[#2A3548] rounded text-slate-200"
            >
              Clear Morphs
            </button>
            <button
              type="button"
              onClick={onReapplyDetectedExpression}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-sky-500 hover:bg-sky-400 text-slate-950 rounded"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Re-Apply AI Expression
            </button>
          </div>
        </div>

        {warnings.length > 0 && (
          <div className="space-y-1.5">
            {warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded border border-amber-500/40 bg-amber-500/10 text-xs text-amber-200"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* AI Facial Telemetry */}
          <div className="bg-[#11161E] border border-[#222B38] rounded-md p-4 space-y-4">
            <h2 className="text-sm font-semibold text-white">Detected Reference Expression</h2>
            {expression ? (
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Dominant Expression</span>
                  <span className="font-medium text-sky-300 capitalize">
                    {expression.dominantExpression}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Face Confidence</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {Math.round(expression.faceConfidence * 100)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Eye Openness (L / R)</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {Math.round(expression.leftEyeOpen * 100)}% /{' '}
                    {Math.round(expression.rightEyeOpen * 100)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Smile / Mouth Open</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {Math.round(expression.smileIntensity * 100)}% /{' '}
                    {Math.round(expression.mouthOpen * 100)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Head Yaw / Pitch / Roll</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {expression.headYawDeg}° / {expression.headPitchDeg}° / {expression.headRollDeg}°
                  </span>
                </div>

                <div className="pt-3 border-t border-[#222B38]">
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-300 font-medium">Expression Strength</span>
                    <span className="font-mono tabular-nums text-sky-300">
                      {Math.round(expressionStrength * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={expressionStrength}
                    onChange={(e) => onExpressionStrengthChange(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-[#1D2634] rounded cursor-pointer"
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Analyze a reference image to extract facial expression metrics.</p>
            )}
          </div>

          {/* Semantic Morph Mapping */}
          <div className="lg:col-span-2 bg-[#11161E] border border-[#222B38] rounded-md p-4 space-y-3">
            <h2 className="text-sm font-semibold text-white">Target Model Morph Weights</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {morphEntries.map((entry) => {
                const currentWeight = entry.targetMorphName
                  ? morphWeights[entry.targetMorphName] ?? 0
                  : 0;
                return (
                  <div
                    key={entry.semanticKey}
                    className="p-3 rounded bg-[#0D1218] border border-[#1E2736] space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-200">{entry.label}</span>
                      <span className="font-mono tabular-nums text-sky-300">
                        {entry.available ? currentWeight.toFixed(2) : 'Unavailable'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {entry.available
                        ? `Mapped to: ${entry.targetMorphName}`
                        : entry.note}
                    </div>
                    <input
                      type="range"
                      disabled={!entry.available}
                      min={0}
                      max={1}
                      step={0.02}
                      value={currentWeight}
                      onChange={(e) => {
                        if (entry.targetMorphName) {
                          onMorphWeightChange(entry.targetMorphName, parseFloat(e.target.value));
                        }
                      }}
                      className="w-full h-1.5 bg-[#1D2634] rounded cursor-pointer disabled:opacity-35"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
