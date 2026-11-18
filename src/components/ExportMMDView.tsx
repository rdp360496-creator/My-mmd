import React, { useMemo, useState } from 'react';
import {
  Download,
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  FolderOpen,
  PackageCheck,
  Terminal,
  Copy,
  Check,
} from 'lucide-react';
import { auditEntireModelNamesForVMD, validateModelNamesForVMD } from '../engine/vmdExporter';
import type {
  MappingValidationReport,
  MMDIntegrationConfig,
  PMXModelData,
  RetargetedPose,
} from '../engine/types';

interface ExportMMDViewProps {
  model: PMXModelData | null;
  pose: RetargetedPose | null;
  morphWeights: Record<string, number>;
  poseName: string;
  vmdFrameNumber: number;
  mmdConfig: MMDIntegrationConfig;
  lastExportSummary: string | null;
  mappingValidation?: MappingValidationReport | null;
  onOpenMapping?: () => void;
  onPoseNameChange: (name: string) => void;
  onFrameNumberChange: (frame: number) => void;
  onExportVPD: () => void;
  onExportFullVMD: (allowSkipLongNames: boolean) => void;
  onExportFaceVMD: (allowSkipLongNames: boolean) => void;
  onExportProject: () => void;
  onExportAll: (allowSkipLongNames: boolean) => void;
  onImportProject: (file: File) => void;
  onImportVPD: (file: File) => void;
}

export const ExportMMDView: React.FC<ExportMMDViewProps> = ({
  model,
  pose,
  morphWeights,
  poseName,
  vmdFrameNumber,
  mmdConfig,
  lastExportSummary,
  mappingValidation,
  onOpenMapping,
  onPoseNameChange,
  onFrameNumberChange,
  onExportVPD,
  onExportFullVMD,
  onExportFaceVMD,
  onExportProject,
  onExportAll,
  onImportProject,
  onImportVPD,
}) => {
  const [allowSkipLongNames, setAllowSkipLongNames] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const vmdNameChecks = useMemo(() => {
    if (!model || !pose) return [];
    return validateModelNamesForVMD(model, pose, morphWeights);
  }, [model, pose, morphWeights]);

  const modelWideLongNames = useMemo(() => {
    if (!model) return [];
    return auditEntireModelNamesForVMD(model);
  }, [model]);

  const invalidNames = vmdNameChecks.filter((item) => !item.valid);

  if (!model || !pose) {
    return (
      <div className="p-8 text-sm text-slate-400">
        Load a target MMD model and pose to configure VPD/VMD export.
      </div>
    );
  }

  const mmdLaunchCommand = `start "" "${mmdConfig.mmdExePath}" && explorer "${mmdConfig.exportDirectory}"`;

  const handleDownloadLauncher = () => {
    const batLines = [
      '@echo off',
      'echo Launching MikuMikuDance and Export Folder...',
      `if exist "${mmdConfig.exportDirectory}" start "" explorer "${mmdConfig.exportDirectory}"`,
      `if exist "${mmdConfig.mmdExePath}" (`,
      `  start "" "${mmdConfig.mmdExePath}"`,
      ') else (',
      `  echo MMD executable not found at: ${mmdConfig.mmdExePath}`,
      '  pause',
      ')',
    ].join('\r\n');
    const blob = new Blob([batLines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Launch_MMD_${poseName || 'Studio'}.bat`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleCopyLaunchCommand = async () => {
    try {
      await navigator.clipboard.writeText(mmdLaunchCommand);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 1800);
    } catch {
      // Clipboard API unavailable in restricted context
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0D1117] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#222B38]">
          <div>
            <h1 className="text-lg font-semibold text-white">MMD Export & Project Interchange</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Genuine Shift_JIS VPD static poses, binary VMD 0002 motion/morph keyframes, and .mmdpose.json projects
            </p>
          </div>
          <button
            type="button"
            onClick={() => onExportAll(allowSkipLongNames)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded transition-colors whitespace-nowrap"
          >
            <PackageCheck className="w-4 h-4" />
            Export All Files
          </button>
        </div>

        {mappingValidation?.hasCriticalWarnings && (
          <div
            data-testid="export-mapping-warning"
            className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-md bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                Bone mapping validation has {mappingValidation.issues.filter((i) => i.severity === 'critical').length} critical issue(s) and {mappingValidation.lowConfidenceMappings.length} low-confidence mapping(s). Exported bone names may not align cleanly with "{model.name}".
              </span>
            </div>
            {onOpenMapping && (
              <button
                type="button"
                onClick={onOpenMapping}
                className="px-3 py-1.5 text-[11px] font-semibold bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/50 text-rose-100 rounded whitespace-nowrap"
              >
                Fix Bone Mapping
              </button>
            )}
          </div>
        )}

        {/* Export Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#11161E] border border-[#222B38] rounded-md p-4 space-y-4">
            <h2 className="text-sm font-semibold text-white">Export Parameters</h2>

            <div className="space-y-1.5">
              <label htmlFor="export-pose-name" className="block text-xs font-medium text-slate-300">
                Pose / Motion Base Name
              </label>
              <input
                id="export-pose-name"
                type="text"
                value={poseName}
                onChange={(e) => onPoseNameChange(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-[#0B0F14] border border-[#2A3548] rounded text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="export-vmd-frame" className="block text-xs font-medium text-slate-300">
                VMD Target Keyframe Number
              </label>
              <input
                id="export-vmd-frame"
                type="number"
                min={0}
                max={99999}
                value={vmdFrameNumber}
                onChange={(e) => onFrameNumberChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-[#0B0F14] border border-[#2A3548] rounded text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={allowSkipLongNames}
                onChange={(e) => setAllowSkipLongNames(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Safely exclude bones/morphs exceeding VMD&apos;s 15-byte Shift_JIS limit (never silently truncate)
              </span>
            </label>
          </div>

          {/* VMD 15-byte Validation Status */}
          <div className="bg-[#11161E] border border-[#222B38] rounded-md p-4 space-y-3">
            <h2 className="text-sm font-semibold text-white">Shift_JIS & VMD 15-Byte Validator</h2>
            {invalidNames.length === 0 ? (
              <div className="flex items-start gap-2 p-3 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                <div>
                  <div className="font-medium">All {vmdNameChecks.length} active bone/morph names fit cleanly</div>
                  <div className="text-[11px] opacity-85 mt-0.5">
                    Every active transform and facial morph fits within MMD&apos;s 15-byte Shift_JIS field without truncation.
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-start gap-2 p-3 rounded bg-amber-500/10 border border-amber-500/40 text-xs text-amber-200">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <div className="font-medium">{invalidNames.length} active name(s) exceed 15-byte VMD limit</div>
                    <div className="text-[11px] opacity-90 mt-0.5">
                      VPD export handles long bone names safely. For VMD, enable safe exclusion or rename the bone in PMX Editor.
                    </div>
                  </div>
                </div>
                <ul className="text-[11px] font-mono text-amber-300 space-y-1 max-h-24 overflow-y-auto">
                  {invalidNames.map((n) => (
                    <li key={`${n.kind}-${n.name}`}>
                      [{n.kind}] {n.name} ({n.byteLength} bytes)
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {modelWideLongNames.length > 0 && (
              <div className="p-2.5 rounded bg-[#0E131B] border border-amber-500/30 text-[11px] text-amber-200 space-y-1">
                <div className="font-medium">
                  Model Rig Note: {modelWideLongNames.length} rig item(s) on &ldquo;{model.name}&rdquo; exceed 15 Shift_JIS bytes
                </div>
                <ul className="font-mono text-amber-300/90 space-y-0.5">
                  {modelWideLongNames.map((item) => (
                    <li key={`rig-${item.kind}-${item.name}`}>
                      [{item.kind}] {item.name} ({item.byteLength} bytes)
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Export Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={onExportVPD}
            className="flex flex-col items-start p-4 rounded-md bg-[#141B26] hover:bg-[#1B2433] border border-sky-500/40 text-left transition-colors"
          >
            <Download className="w-4 h-4 text-sky-400 mb-2" />
            <span className="text-xs font-semibold text-white">Export VPD Pose</span>
            <span className="text-[11px] text-slate-400 mt-0.5">{poseName}.vpd (Static Bones)</span>
          </button>

          <button
            type="button"
            onClick={() => onExportFullVMD(allowSkipLongNames)}
            className="flex flex-col items-start p-4 rounded-md bg-[#141B26] hover:bg-[#1B2433] border border-[#283447] text-left transition-colors"
          >
            <Download className="w-4 h-4 text-sky-400 mb-2" />
            <span className="text-xs font-semibold text-white">Export Full VMD</span>
            <span className="text-[11px] text-slate-400 mt-0.5">{poseName}_Full.vmd (Body + Face)</span>
          </button>

          <button
            type="button"
            onClick={() => onExportFaceVMD(allowSkipLongNames)}
            className="flex flex-col items-start p-4 rounded-md bg-[#141B26] hover:bg-[#1B2433] border border-[#283447] text-left transition-colors"
          >
            <Download className="w-4 h-4 text-sky-400 mb-2" />
            <span className="text-xs font-semibold text-white">Export Facial VMD</span>
            <span className="text-[11px] text-slate-400 mt-0.5">{poseName}_Face.vmd (Morphs Only)</span>
          </button>

          <button
            type="button"
            onClick={onExportProject}
            className="flex flex-col items-start p-4 rounded-md bg-[#141B26] hover:bg-[#1B2433] border border-[#283447] text-left transition-colors"
          >
            <FileCode2 className="w-4 h-4 text-emerald-400 mb-2" />
            <span className="text-xs font-semibold text-white">Save .mmdpose.json</span>
            <span className="text-[11px] text-slate-400 mt-0.5">Full Editable Studio Project</span>
          </button>
        </div>

        {lastExportSummary && (
          <div className="px-4 py-3 rounded bg-[#141B26] border border-sky-500/40 text-xs text-sky-200">
            {lastExportSummary}
          </div>
        )}

        {/* Reload VPD / Project + MMD Launch Integration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#11161E] border border-[#222B38] rounded-md p-4 space-y-3">
            <h2 className="text-sm font-semibold text-white">Reopen Pose & MMD Integration</h2>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#18202C] hover:bg-[#222D3D] border border-[#2A3548] rounded text-slate-200 cursor-pointer">
                <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
                Load .mmdpose.json
                <input
                  type="file"
                  accept=".json,.mmdpose.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onImportProject(f);
                    e.target.value = '';
                  }}
                />
              </label>

              <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#18202C] hover:bg-[#222D3D] border border-[#2A3548] rounded text-slate-200 cursor-pointer">
                <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                Load .vpd onto Model
                <input
                  type="file"
                  accept=".vpd"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onImportVPD(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            <div className="pt-2 border-t border-[#1D2634] space-y-2">
              <div className="text-[11px] text-slate-400 space-y-0.5">
                <div>
                  MMD Target: <span className="font-mono text-slate-300">{mmdConfig.mmdExePath}</span>
                </div>
                <div>
                  Export Folder: <span className="font-mono text-slate-300">{mmdConfig.exportDirectory}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleDownloadLauncher}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[#18202C] hover:bg-[#222D3D] border border-[#2A3548] rounded text-slate-200"
                >
                  <Terminal className="w-3.5 h-3.5 text-sky-400" />
                  Download MMD Launcher (.bat)
                </button>
                <button
                  type="button"
                  onClick={handleCopyLaunchCommand}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[#18202C] hover:bg-[#222D3D] border border-[#2A3548] rounded text-slate-200"
                >
                  {copiedCmd ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  {copiedCmd ? 'Copied Command' : 'Copy Launch Command'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-[#11161E] border border-[#222B38] rounded-md p-4 space-y-2.5 text-xs text-slate-300">
            <h2 className="text-sm font-semibold text-white">Loading into MikuMikuDance</h2>
            <div className="space-y-1">
              <div className="font-medium text-sky-300">For VPD (Static Pose):</div>
              <ol className="list-decimal list-inside space-y-0.5 text-slate-400">
                <li>Open MikuMikuDance and load your target PMX/PMD model.</li>
                <li>Go to File &rarr; Load Pose Data (.vpd).</li>
                <li>Select the exported <span className="font-mono text-slate-200">{poseName}.vpd</span> file.</li>
              </ol>
            </div>
            <div className="space-y-1 pt-1">
              <div className="font-medium text-sky-300">For VMD (Body + Facial Morphs):</div>
              <ol className="list-decimal list-inside space-y-0.5 text-slate-400">
                <li>Load the target model in MMD and select frame {vmdFrameNumber}.</li>
                <li>Go to File &rarr; Load Motion Data (.vmd) and select <span className="font-mono text-slate-200">{poseName}_Full.vmd</span>.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
