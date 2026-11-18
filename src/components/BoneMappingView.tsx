import React, { useState } from 'react';
import { Save, RotateCcw, AlertTriangle, CheckCircle2, ShieldAlert, Cpu } from 'lucide-react';
import { STANDARD_BONE_ROLES } from '../engine/boneMappingEngine';
import type {
  BoneMappingResult,
  ModelCalibrationProfile,
  PMXModelData,
  SkeletonAnalysis,
  StandardBoneRole,
} from '../engine/types';

interface BoneMappingViewProps {
  model: PMXModelData | null;
  skeleton: SkeletonAnalysis | null;
  mapping: BoneMappingResult | null;
  calibration: ModelCalibrationProfile | null;
  calibrationNotice: string | null;
  onOverrideRole: (role: StandardBoneRole, boneIndex: number | null) => void;
  onResetMappings: () => void;
  onSaveCustomMapping: () => void;
}

export const BoneMappingView: React.FC<BoneMappingViewProps> = ({
  model,
  skeleton,
  mapping,
  calibration,
  calibrationNotice,
  onOverrideRole,
  onResetMappings,
  onSaveCustomMapping,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'issues' | 'mapped'>('all');
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(100);
  const [confidenceDisplayMode, setConfidenceDisplayMode] = useState<'hide' | 'highlight'>('hide');
  const [savedNotice, setSavedNotice] = useState(false);

  if (!model || !skeleton || !mapping) {
    return (
      <div className="p-8 text-sm text-slate-400">Import an MMD model to inspect bone mappings.</div>
    );
  }

  const report = mapping.validationReport;

  const isBelowThreshold = (score: number) =>
    confidenceThreshold < 100 && Math.round(score * 100) < confidenceThreshold;

  const baseRows = STANDARD_BONE_ROLES.filter((def) => {
    const entry = mapping.entries[def.role];
    if (filterMode === 'issues') {
      return (
        (def.required && entry.boneIndex === null) ||
        entry.confidence === 'low' ||
        entry.confidence === 'medium' ||
        report.issues.some((i) => i.role === def.role)
      );
    }
    if (filterMode === 'mapped') {
      return entry.boneIndex !== null;
    }
    return true;
  });

  const belowThresholdCount = baseRows.filter((def) =>
    isBelowThreshold(mapping.entries[def.role].confidenceScore)
  ).length;

  const rows =
    confidenceThreshold < 100 && confidenceDisplayMode === 'hide'
      ? baseRows.filter((def) => isBelowThreshold(mapping.entries[def.role].confidenceScore))
      : baseRows;

  return (
    <div className="h-full overflow-y-auto bg-[#0D1117] p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#222B38]">
          <div>
            <h1 className="text-lg font-semibold text-white">Model-Aware Bone Mapping & Calibration</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {model.name} · {skeleton.restPoseType} ({skeleton.armRestAngleDeg}°) ·{' '}
              {mapping.mappedCount} of {STANDARD_BONE_ROLES.length} roles mapped
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center p-1 bg-[#141A23] border border-[#222B38] rounded-md">
              {(
                [
                  { id: 'all', label: 'All Roles' },
                  { id: 'issues', label: 'Needs Review' },
                  { id: 'mapped', label: 'Mapped' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterMode(f.id)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    filterMode === f.id ? 'bg-[#222D3D] text-sky-300' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onResetMappings}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#161D27] hover:bg-[#1E2735] border border-[#2A3548] text-slate-200 rounded whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Auto-Detect
            </button>

            <button
              type="button"
              onClick={() => {
                onSaveCustomMapping();
                setSavedNotice(true);
                setTimeout(() => setSavedNotice(false), 2000);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-sky-500 hover:bg-sky-400 text-slate-950 rounded whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              {savedNotice ? 'Calibration Saved' : 'Save Calibration'}
            </button>
          </div>
        </div>

        {/* Calibration Profile Summary */}
        {calibration && (
          <div className="bg-[#11161E] border border-[#222B38] rounded-md p-4 space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold text-white">
                <Cpu className="w-4 h-4 text-sky-400" />
                <span>Active Model Calibration Profile</span>
              </div>
              <span className="font-mono text-[11px] text-slate-400">
                Sig: {calibration.skeletonSignature}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] text-slate-300">
              <div>
                <span className="text-slate-400 block">Model Identity</span>
                <span className="font-mono truncate block">{calibration.fileName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Coordinate Transfer</span>
                <span className="font-mono">
                  {calibration.coordinateConversion.sourceSpace} &rarr; {calibration.coordinateConversion.targetSpace}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">IK Chains Detected</span>
                <span className="font-mono tabular-nums">{calibration.ikConfiguration.length}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Preserved Unmapped Bones</span>
                <span className="font-mono tabular-nums">{report.unknownModelBones.length}</span>
              </div>
            </div>
            {calibrationNotice && (
              <p className="text-[11px] text-sky-300 pt-1 border-t border-[#1D2532]">
                {calibrationNotice}
              </p>
            )}
          </div>
        )}

        {/* Mapping Validation Report */}
        <div className="bg-[#11161E] border border-[#222B38] rounded-md p-4 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Bone Mapping Validation Report</h2>
            <span
              className={`font-mono text-[11px] ${
                report.hasCriticalWarnings ? 'text-rose-300' : 'text-emerald-400'
              }`}
            >
              {report.hasCriticalWarnings ? 'Critical Mapping Review Required' : 'Mapping Validated'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
            <div className="p-2.5 rounded bg-[#0C1118] border border-[#1E2634]">
              <div className="text-slate-400">Mapped</div>
              <div className="text-base font-mono tabular-nums font-semibold text-emerald-300">
                {report.successfullyMapped.length}
              </div>
            </div>
            <div className="p-2.5 rounded bg-[#0C1118] border border-[#1E2634]">
              <div className="text-slate-400">Unmapped Roles</div>
              <div className="text-base font-mono tabular-nums font-semibold text-slate-200">
                {report.unmappedBones.length}
              </div>
            </div>
            <div className="p-2.5 rounded bg-[#0C1118] border border-[#1E2634]">
              <div className="text-slate-400">Low / Med Conf.</div>
              <div className="text-base font-mono tabular-nums font-semibold text-amber-300">
                {report.lowConfidenceMappings.length}
              </div>
            </div>
            <div className="p-2.5 rounded bg-[#0C1118] border border-[#1E2634]">
              <div className="text-slate-400">Manual Edits</div>
              <div className="text-base font-mono tabular-nums font-semibold text-sky-300">
                {report.manuallyCorrectedMappings.length}
              </div>
            </div>
            <div className="p-2.5 rounded bg-[#0C1118] border border-[#1E2634]">
              <div className="text-slate-400">Unsupported</div>
              <div className="text-base font-mono tabular-nums font-semibold text-slate-300">
                {report.unsupportedStructures.length}
              </div>
            </div>
          </div>

          {report.unsupportedStructures.length > 0 && (
            <div className="text-[11px] text-slate-400">
              <span className="text-slate-300 font-medium">Unsupported / Optional Rig Features: </span>
              {report.unsupportedStructures.join(' · ')}
            </div>
          )}

          {report.issues.length === 0 ? (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>
                All required anatomical bones, parent-child chains, L/R assignments, IK links, and local axes passed validation on &ldquo;{model.name}&rdquo;.
              </span>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {report.issues.map((issue) => (
                <div
                  key={issue.id}
                  className={`flex items-start gap-2 px-3 py-2 rounded border ${
                    issue.severity === 'critical'
                      ? 'border-rose-500/50 bg-rose-500/10 text-rose-200'
                      : issue.severity === 'warning'
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                        : 'border-[#283448] bg-[#0D1219] text-slate-300'
                  }`}
                >
                  {issue.severity === 'critical' ? (
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  )}
                  <div>
                    <span className="font-mono uppercase text-[10px] mr-2 opacity-80">
                      [{issue.category}]
                    </span>
                    <span>{issue.message}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Confidence Score Filter Toolbar */}
        <div
          data-testid="confidence-filter-bar"
          className="flex flex-wrap items-center justify-between gap-4 px-4 py-2.5 bg-[#11161E] border border-[#222B38] rounded-md text-xs"
        >
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="confidence-filter-slider" className="font-medium text-slate-300 whitespace-nowrap">
              Confidence Filter
            </label>
            <input
              id="confidence-filter-slider"
              type="range"
              min={5}
              max={100}
              step={5}
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
              className="w-40 h-1.5 bg-[#1D2634] rounded cursor-pointer accent-sky-400"
            />
            <span
              data-testid="confidence-threshold-readout"
              className={`font-mono tabular-nums text-[11px] min-w-[78px] ${
                confidenceThreshold < 100 ? 'text-amber-300 font-semibold' : 'text-slate-400'
              }`}
            >
              {confidenceThreshold >= 100 ? 'All (≤ 100%)' : `< ${confidenceThreshold}%`}
            </span>

            <div className="flex items-center p-0.5 bg-[#0D1218] border border-[#242E3E] rounded">
              {(
                [
                  { id: 'hide', label: 'Hide ≥' },
                  { id: 'highlight', label: 'Highlight <' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setConfidenceDisplayMode(m.id)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                    confidenceDisplayMode === m.id
                      ? 'bg-[#222D3D] text-sky-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono tabular-nums">
            <span data-testid="confidence-filter-count">
              {rows.length} shown
              {confidenceThreshold < 100 ? ` · ${belowThresholdCount} < ${confidenceThreshold}%` : ''}
            </span>
            {confidenceThreshold < 100 && (
              <button
                type="button"
                onClick={() => setConfidenceThreshold(100)}
                className="font-sans px-2 py-0.5 text-[11px] rounded bg-[#18202C] hover:bg-[#222D3D] border border-[#2A3548] text-slate-200"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Mapping Table */}
        <div className="border border-[#222B38] rounded-md overflow-hidden bg-[#11161E]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#222B38] bg-[#151B25] text-slate-400">
                <th className="py-2.5 px-4 font-medium">Standard Anatomical Role</th>
                <th className="py-2.5 px-4 font-medium">Target PMX Bone</th>
                <th className="py-2.5 px-4 font-medium">Confidence</th>
                <th className="py-2.5 px-4 font-medium">Recognition Signals & Basis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C2430]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 px-4 text-center text-slate-400">
                    No bone mappings match confidence &lt; {confidenceThreshold}% in the current view.{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setConfidenceThreshold(100);
                        setFilterMode('all');
                      }}
                      className="text-sky-300 hover:underline ml-1"
                    >
                      Show all mappings
                    </button>
                  </td>
                </tr>
              ) : (
                rows.map((def) => {
                  const entry = mapping.entries[def.role];
                  const hasIssue = report.issues.some(
                    (i) => i.role === def.role && i.severity === 'critical'
                  );
                  const belowConf = isBelowThreshold(entry.confidenceScore);
                  const rowHighlightClass = hasIssue
                    ? 'bg-rose-500/5 hover:bg-rose-500/10'
                    : confidenceThreshold < 100 && confidenceDisplayMode === 'highlight'
                      ? belowConf
                        ? 'bg-amber-500/10 hover:bg-amber-500/15 border-l-2 border-l-amber-400'
                        : 'opacity-45 hover:opacity-80 hover:bg-[#161D28]'
                      : 'hover:bg-[#161D28]';
                  return (
                    <tr key={def.role} className={rowHighlightClass}>
                      <td className="py-2.5 px-4 font-medium text-slate-200 whitespace-nowrap">
                        {def.label}
                        {def.required && <span className="text-sky-400 ml-1">*</span>}
                      </td>
                    <td className="py-2 px-4">
                      <select
                        aria-label={`Map bone for ${def.label}`}
                        value={entry.boneIndex === null ? '' : String(entry.boneIndex)}
                        onChange={(e) => {
                          const val = e.target.value;
                          onOverrideRole(def.role, val === '' ? null : Number(val));
                        }}
                        className="w-full max-w-xs px-2.5 py-1.5 text-xs bg-[#0B0F14] border border-[#2A3548] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                      >
                        <option value="">-- UNKNOWN / Unmapped --</option>
                        {model.bones.map((b) => (
                          <option key={b.index} value={b.index}>
                            #{b.index} {b.name}
                            {b.englishName && b.englishName !== b.name ? ` (${b.englishName})` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums whitespace-nowrap">
                      <span
                        className={
                          entry.confidence === 'high' || entry.confidence === 'manual'
                            ? 'text-emerald-400'
                            : entry.confidence === 'medium'
                              ? 'text-amber-300'
                              : entry.confidence === 'low'
                                ? 'text-rose-300'
                                : 'text-slate-500'
                        }
                      >
                        {entry.confidence === 'unmapped'
                          ? 'UNMAPPED'
                          : `${entry.confidence} (${Math.round(entry.confidenceScore * 100)}%)`}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">
                      <div>{entry.reason}</div>
                      {entry.signalsUsed.length > 0 && (
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                          Signals: {entry.signalsUsed.join(', ')}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
