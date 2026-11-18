import React, { useMemo, useState } from 'react';
import * as THREE from 'three';
import {
  RotateCcw,
  Undo2,
  Redo2,
  FlipHorizontal2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Search,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { radToDeg, degToRad } from '../engine/mmdCoordinates';
import type {
  BoneMappingEntry,
  BoneMappingResult,
  BoneTransform,
  PMXModelData,
  Pose2DAnalysis,
  RetargetedPose,
  SkeletonAnalysis,
  ValidationReport,
} from '../engine/types';

type InspectorTab = 'rig' | 'bone' | 'face' | 'valid';

interface InspectorPanelProps {
  model: PMXModelData | null;
  skeleton: SkeletonAnalysis | null;
  mapping: BoneMappingResult | null;
  pose: RetargetedPose | null;
  pose2D: Pose2DAnalysis | null;
  morphWeights: Record<string, number>;
  validation: ValidationReport | null;
  selectedBoneIndex: number | null;
  canUndo: boolean;
  canRedo: boolean;
  depthVariant: 'primary' | 'alternate';
  onSelectBone: (idx: number | null) => void;
  onBoneTransformChange: (idx: number, next: Partial<BoneTransform>) => void;
  onResetBone: (idx: number) => void;
  onResetLimb: (idx: number) => void;
  onResetAllPose: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleMirror: () => void;
  onToggleIK: () => void;
  onPoseStrengthChange: (val: number) => void;
  onToggleDepthVariant: () => void;
  onMorphWeightChange: (morphName: string, weight: number) => void;
  onAutoCorrect: () => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  model,
  skeleton,
  mapping,
  pose,
  pose2D,
  morphWeights,
  validation,
  selectedBoneIndex,
  canUndo,
  canRedo,
  depthVariant,
  onSelectBone,
  onBoneTransformChange,
  onResetBone,
  onResetLimb,
  onResetAllPose,
  onUndo,
  onRedo,
  onToggleMirror,
  onToggleIK,
  onPoseStrengthChange,
  onToggleDepthVariant,
  onMorphWeightChange,
  onAutoCorrect,
}) => {
  const [tab, setTab] = useState<InspectorTab>('bone');
  const [boneFilter, setBoneFilter] = useState('');
  const [collapsedBones, setCollapsedBones] = useState<Set<number>>(new Set());

  const selectedBone =
    model && selectedBoneIndex !== null ? model.bones[selectedBoneIndex] ?? null : null;

  const selectedTransform =
    selectedBone && pose ? pose.transforms[selectedBone.index] ?? null : null;

  const selectedBoneDetails =
    selectedBone && skeleton ? skeleton.boneDetails[selectedBone.index] ?? null : null;

  const selectedMappingEntries = useMemo<BoneMappingEntry[]>(() => {
    if (!selectedBone || !mapping) return [];
    return Object.values(mapping.entries).filter((e) => e.boneIndex === selectedBone.index);
  }, [selectedBone, mapping]);

  const selectedEulerDeg = useMemo(() => {
    if (!selectedTransform) return { x: 0, y: 0, z: 0 };
    const q = new THREE.Quaternion(...selectedTransform.quaternion).normalize();
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    return {
      x: Number(radToDeg(e.x).toFixed(1)),
      y: Number(radToDeg(e.y).toFixed(1)),
      z: Number(radToDeg(e.z).toFixed(1)),
    };
  }, [selectedTransform]);

  const setEulerAxis = (axis: 'x' | 'y' | 'z', degVal: number) => {
    if (!selectedBone) return;
    const next = { ...selectedEulerDeg, [axis]: degVal };
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(degToRad(next.x), degToRad(next.y), degToRad(next.z), 'YXZ')
    );
    onBoneTransformChange(selectedBone.index, {
      boneIndex: selectedBone.index,
      boneName: selectedBone.name,
      translation: selectedTransform?.translation ?? [0, 0, 0],
      quaternion: [q.x, q.y, q.z, q.w],
      source: 'manual',
    });
  };

  const setTranslationAxis = (axisIdx: 0 | 1 | 2, val: number) => {
    if (!selectedBone || !selectedBone.translatable) return;
    const cur = [...(selectedTransform?.translation ?? [0, 0, 0])] as [number, number, number];
    cur[axisIdx] = val;
    onBoneTransformChange(selectedBone.index, {
      boneIndex: selectedBone.index,
      boneName: selectedBone.name,
      translation: cur,
      quaternion: selectedTransform?.quaternion ?? [0, 0, 0, 1],
      source: 'manual',
    });
  };

  const filteredBones = useMemo(() => {
    if (!model) return [];
    const q = boneFilter.trim().toLowerCase();
    if (!q) return model.bones;
    return model.bones.filter(
      (b) => b.name.toLowerCase().includes(q) || b.englishName.toLowerCase().includes(q)
    );
  }, [model, boneFilter]);

  // Flatten visible tree order when not filtering
  const treeRows = useMemo(() => {
    if (!model || !skeleton) return [];
    if (boneFilter.trim()) {
      return filteredBones.map((b) => ({ bone: b, depth: 0, hasChildren: false }));
    }
    const rows: Array<{ bone: typeof model.bones[0]; depth: number; hasChildren: boolean }> = [];
    const visit = (idx: number, depth: number) => {
      const b = model.bones[idx];
      if (!b) return;
      const children = skeleton.childrenByBone[idx] ?? [];
      rows.push({ bone: b, depth, hasChildren: children.length > 0 });
      if (!collapsedBones.has(idx)) {
        for (const c of children) visit(c, depth + 1);
      }
    };
    for (let i = 0; i < model.bones.length; i++) {
      if (model.bones[i].parentIndex < 0 || model.bones[i].parentIndex >= model.bones.length) {
        visit(i, 0);
      }
    }
    return rows;
  }, [model, skeleton, boneFilter, filteredBones, collapsedBones]);

  const issueCount = validation?.issues.length ?? 0;

  return (
    <div className="flex flex-col h-full bg-[#11161E] border-l border-[#222B38] text-slate-200">
      {/* Segmented Inspector Tabs */}
      <div className="grid grid-cols-4 border-b border-[#222B38] bg-[#0E131A] p-1 gap-1">
        {(
          [
            { id: 'bone', label: 'Bone' },
            { id: 'rig', label: 'Rig' },
            { id: 'face', label: 'Face' },
            { id: 'valid', label: issueCount > 0 ? `Check (${issueCount})` : 'Check' },
          ] as Array<{ id: InspectorTab; label: string }>
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-2 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              tab === t.id
                ? 'bg-[#1D2634] text-sky-300 border border-sky-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {/* BONE EDITOR TAB */}
        {tab === 'bone' && (
          <>
            {/* Global Pose Controls */}
            <div className="space-y-2.5 pb-3 border-b border-[#222B38]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">Pose Controls</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Undo pose edit"
                    disabled={!canUndo}
                    onClick={onUndo}
                    className="p-1.5 rounded bg-[#18202C] border border-[#283344] text-slate-300 hover:text-white disabled:opacity-35"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Redo pose edit"
                    disabled={!canRedo}
                    onClick={onRedo}
                    className="p-1.5 rounded bg-[#18202C] border border-[#283344] text-slate-300 hover:text-white disabled:opacity-35"
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Reset entire pose"
                    onClick={onResetAllPose}
                    className="p-1.5 rounded bg-[#18202C] border border-[#283344] text-slate-300 hover:text-white"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-400">Overall Pose Strength</span>
                  <span className="font-mono tabular-nums text-sky-300">
                    {Math.round((pose?.poseStrength ?? 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Overall Pose Strength"
                  min={0}
                  max={1}
                  step={0.05}
                  value={pose?.poseStrength ?? 1}
                  onChange={(e) => onPoseStrengthChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-[#1D2634] rounded cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={onToggleMirror}
                  className={`inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium rounded border transition-colors ${
                    pose?.mirrored
                      ? 'bg-sky-500/20 border-sky-500/60 text-sky-200'
                      : 'bg-[#171E29] border-[#263142] text-slate-300 hover:bg-[#1E2735]'
                  }`}
                >
                  <FlipHorizontal2 className="w-3.5 h-3.5" />
                  Mirror
                </button>
                <button
                  type="button"
                  onClick={onToggleIK}
                  disabled={!skeleton?.hasLegIK}
                  className={`px-2 py-1.5 text-xs font-medium rounded border transition-colors disabled:opacity-40 ${
                    pose?.ikEnabled
                      ? 'bg-sky-500/20 border-sky-500/60 text-sky-200'
                      : 'bg-[#171E29] border-[#263142] text-slate-300 hover:bg-[#1E2735]'
                  }`}
                >
                  {pose?.ikEnabled ? 'Leg IK: On' : 'Leg FK'}
                </button>
                <button
                  type="button"
                  onClick={onToggleDepthVariant}
                  className={`px-2 py-1.5 text-xs font-medium rounded border transition-colors ${
                    depthVariant === 'alternate'
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                      : 'bg-[#171E29] border-[#263142] text-slate-300 hover:bg-[#1E2735]'
                  }`}
                >
                  {depthVariant === 'alternate' ? 'Depth: Alt' : 'Depth: 1st'}
                </button>
              </div>
            </div>

            {/* Quick Bone Selector */}
            {model && model.bones.length > 0 && (
              <div className="space-y-1">
                <label htmlFor="quick-bone-select" className="block text-[11px] font-medium text-slate-400">
                  Active Joint
                </label>
                <select
                  id="quick-bone-select"
                  value={selectedBoneIndex === null ? '' : String(selectedBoneIndex)}
                  onChange={(e) => {
                    const val = e.target.value;
                    onSelectBone(val === '' ? null : Number(val));
                  }}
                  className="w-full px-2.5 py-1.5 text-xs bg-[#0D1218] border border-[#263142] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                >
                  <option value="">-- Click joint in 3D or choose bone --</option>
                  {model.bones
                    .filter((b) => b.visible)
                    .map((b) => (
                      <option key={b.index} value={b.index}>
                        #{b.index} {b.name}
                        {b.englishName && b.englishName !== b.name ? ` (${b.englishName})` : ''}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Selected Bone Transform Editor */}
            {selectedBone ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-xs font-semibold text-white truncate">
                      {selectedBone.name}
                    </h3>
                    <p className="text-[11px] text-slate-400 truncate">
                      {selectedBone.englishName || 'No English alias'} · #{selectedBone.index}
                      {selectedBone.isIK ? ' · IK Target' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onResetBone(selectedBone.index)}
                      className="px-2 py-1 text-[11px] font-medium bg-[#18202C] hover:bg-[#222D3D] border border-[#2A3548] rounded"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => onResetLimb(selectedBone.index)}
                      className="px-2 py-1 text-[11px] font-medium bg-[#18202C] hover:bg-[#222D3D] border border-[#2A3548] rounded"
                    >
                      Limb
                    </button>
                  </div>
                </div>

                {/* Rotation Euler Sliders + Numeric Inputs */}
                <div className="space-y-2">
                  <span className="block text-[11px] font-medium text-slate-400">
                    Local Rotation (Degrees)
                  </span>
                  {(['x', 'y', 'z'] as const).map((ax) => (
                    <div key={ax} className="grid grid-cols-[18px_1fr_58px] items-center gap-2">
                      <span
                        className={`text-xs font-mono font-semibold uppercase ${
                          ax === 'x'
                            ? 'text-rose-400'
                            : ax === 'y'
                              ? 'text-emerald-400'
                              : 'text-sky-400'
                        }`}
                      >
                        {ax}
                      </span>
                      <input
                        type="range"
                        aria-label={`Rotate ${selectedBone.name} ${ax.toUpperCase()}`}
                        min={-180}
                        max={180}
                        step={0.5}
                        disabled={!selectedBone.rotatable}
                        value={selectedEulerDeg[ax]}
                        onChange={(e) => setEulerAxis(ax, parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-[#1D2634] rounded cursor-pointer"
                      />
                      <input
                        type="number"
                        aria-label={`Numeric ${selectedBone.name} ${ax.toUpperCase()}`}
                        min={-180}
                        max={180}
                        step={1}
                        disabled={!selectedBone.rotatable}
                        value={selectedEulerDeg[ax]}
                        onChange={(e) =>
                          setEulerAxis(ax, Number.isFinite(parseFloat(e.target.value)) ? parseFloat(e.target.value) : 0)
                        }
                        className="px-1.5 py-1 text-xs font-mono tabular-nums text-right bg-[#0D1218] border border-[#263142] rounded text-slate-200"
                      />
                    </div>
                  ))}
                </div>

                {/* Translation Sliders (if bone permits translation) */}
                {selectedBone.translatable && (
                  <div className="space-y-2 pt-2 border-t border-[#222B38]">
                    <span className="block text-[11px] font-medium text-slate-400">
                      Local Translation (MMD Units)
                    </span>
                    {(['X', 'Y', 'Z'] as const).map((label, axIdx) => {
                      const val = Number(
                        (selectedTransform?.translation[axIdx] ?? 0).toFixed(2)
                      );
                      return (
                        <div key={label} className="grid grid-cols-[18px_1fr_58px] items-center gap-2">
                          <span className="text-xs font-mono text-slate-400">{label}</span>
                          <input
                            type="range"
                            aria-label={`Translate ${selectedBone.name} ${label}`}
                            min={-12}
                            max={12}
                            step={0.05}
                            value={val}
                            onChange={(e) =>
                              setTranslationAxis(axIdx as 0 | 1 | 2, parseFloat(e.target.value))
                            }
                            className="w-full h-1.5 bg-[#1D2634] rounded cursor-pointer"
                          />
                          <input
                            type="number"
                            step={0.1}
                            value={val}
                            onChange={(e) =>
                              setTranslationAxis(
                                axIdx as 0 | 1 | 2,
                                Number.isFinite(parseFloat(e.target.value))
                                  ? parseFloat(e.target.value)
                                  : 0
                              )
                            }
                            className="px-1.5 py-1 text-xs font-mono tabular-nums text-right bg-[#0D1218] border border-[#263142] rounded text-slate-200"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Complete PMX Bone Inspector Metadata */}
                <div className="pt-2.5 border-t border-[#222B38] space-y-2 text-[11px]">
                  <div className="font-semibold text-slate-300">PMX Bone Inspection</div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-slate-400">
                    <span>Anatomical Role</span>
                    <span className="text-right font-medium text-sky-300 truncate">
                      {selectedMappingEntries.length > 0
                        ? selectedMappingEntries.map((m) => m.label).join(', ')
                        : 'UNMAPPED / Custom'}
                    </span>

                    <span>Confidence</span>
                    <span className="text-right font-mono tabular-nums text-slate-200">
                      {selectedMappingEntries.length > 0
                        ? `${selectedMappingEntries[0].confidence} (${Math.round(selectedMappingEntries[0].confidenceScore * 100)}%)`
                        : 'unmapped'}
                    </span>

                    <span>Bone Type · Layer</span>
                    <span className="text-right font-mono text-slate-200">
                      {selectedBoneDetails?.visualCategory ?? 'unknown'} · Lv {selectedBone.transformLevel}
                    </span>

                    <span>Parent Bone</span>
                    <span className="text-right truncate">
                      {selectedBone.parentIndex >= 0 && model?.bones[selectedBone.parentIndex] ? (
                        <button
                          type="button"
                          onClick={() => onSelectBone(selectedBone.parentIndex)}
                          className="text-sky-300 hover:underline font-mono"
                        >
                          #{selectedBone.parentIndex} {model.bones[selectedBone.parentIndex].name}
                        </button>
                      ) : (
                        <span className="text-slate-500">None (Root)</span>
                      )}
                    </span>
                  </div>

                  {selectedBoneDetails && selectedBoneDetails.childIndices.length > 0 && (
                    <div className="text-slate-400">
                      <span className="block mb-1">Child Bones ({selectedBoneDetails.childIndices.length})</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedBoneDetails.childIndices.slice(0, 8).map((cIdx) => (
                          <button
                            key={cIdx}
                            type="button"
                            onClick={() => onSelectBone(cIdx)}
                            className="px-1.5 py-0.5 rounded bg-[#18202C] hover:bg-[#232F40] border border-[#2A3548] text-[10px] font-mono text-slate-200"
                          >
                            #{cIdx} {model?.bones[cIdx]?.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="font-mono tabular-nums text-slate-400 space-y-0.5 pt-1 border-t border-[#1C2430]">
                    <div>
                      World: [{selectedBone.position.map((v) => v.toFixed(2)).join(', ')}]
                    </div>
                    {selectedBoneDetails && (
                      <>
                        <div>
                          Local: [{selectedBoneDetails.localPosition.map((v) => v.toFixed(2)).join(', ')}] · Len {selectedBoneDetails.length.toFixed(2)}
                        </div>
                        <div>
                          Orient: [{selectedBoneDetails.orientation.map((v) => v.toFixed(2)).join(', ')}]
                        </div>
                        <div>
                          Local Axis X: [{selectedBoneDetails.localAxisX.map((v) => v.toFixed(2)).join(', ')}]
                        </div>
                        <div>
                          Local Axis Z: [{selectedBoneDetails.localAxisZ.map((v) => v.toFixed(2)).join(', ')}]
                        </div>
                      </>
                    )}
                    <div>
                      Quat: [{(selectedTransform?.quaternion ?? [0, 0, 0, 1]).map((v) => v.toFixed(3)).join(', ')}]
                    </div>
                    <div>
                      Constraints: {selectedBone.rotatable ? 'Rot' : 'NoRot'} ·{' '}
                      {selectedBone.translatable ? 'Trans' : 'NoTrans'}
                      {selectedBone.hasFixedAxis ? ' · FixedAxis' : ''}
                      {selectedBone.inheritRotation ? ` · Inherit(${selectedBone.inheritRatio.toFixed(2)})` : ''}
                    </div>
                    <div className={selectedBone.isIK ? 'text-amber-300' : 'text-slate-500'}>
                      {selectedBone.isIK
                        ? `IK Info: Target #${selectedBone.ikTargetIndex} (${model?.bones[selectedBone.ikTargetIndex]?.name ?? '?'}) · ${selectedBone.ikLinks.length} links · ${selectedBone.ikLoopCount} loops`
                        : 'IK Info: None (FK / Driven)'}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-[#263142] rounded">
                Click any joint sphere in the 3D viewport or select a bone in the Rig tree to edit transforms.
              </div>
            )}
          </>
        )}

        {/* RIG & SKELETON HIERARCHY TAB */}
        {tab === 'rig' && model && skeleton && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs pb-3 border-b border-[#222B38]">
              <div className="text-slate-400">Format</div>
              <div className="font-mono text-right text-slate-200">
                {model.format} v{model.version.toFixed(1)}
              </div>
              <div className="text-slate-400">Rest Pose</div>
              <div className="font-mono text-right text-sky-300">
                {skeleton.restPoseType} ({skeleton.armRestAngleDeg}°)
              </div>
              <div className="text-slate-400">Bones / Morphs</div>
              <div className="font-mono tabular-nums text-right text-slate-200">
                {skeleton.boneCount} / {skeleton.morphCount}
              </div>
              <div className="text-slate-400">Leg IK / Twist</div>
              <div className="font-mono text-right text-slate-200">
                {skeleton.hasLegIK ? 'IK' : 'FK'} · {skeleton.hasTwistBones ? 'Twist' : 'NoTwist'}
              </div>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search bones (JP or EN)..."
                value={boneFilter}
                onChange={(e) => setBoneFilter(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[#0D1218] border border-[#263142] rounded text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="max-h-[46vh] overflow-y-auto space-y-0.5 pr-1">
              {treeRows.map(({ bone, depth, hasChildren }) => {
                const isSel = bone.index === selectedBoneIndex;
                const isCollapsed = collapsedBones.has(bone.index);
                const hasPoseOffset = Boolean(pose?.transforms[bone.index]);
                return (
                  <div
                    key={bone.index}
                    style={{ paddingLeft: `${depth * 10 + 4}px` }}
                    className={`flex items-center gap-1 rounded text-xs ${
                      isSel
                        ? 'bg-sky-500/20 text-sky-100 border border-sky-500/40'
                        : 'hover:bg-[#19212E] text-slate-300'
                    }`}
                  >
                    {hasChildren ? (
                      <button
                        type="button"
                        aria-label={`Toggle children of ${bone.name}`}
                        onClick={() => {
                          setCollapsedBones((prev) => {
                            const next = new Set(prev);
                            if (next.has(bone.index)) next.delete(bone.index);
                            else next.add(bone.index);
                            return next;
                          });
                        }}
                        className="p-0.5 text-slate-400 hover:text-white"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onSelectBone(bone.index);
                        setTab('bone');
                      }}
                      className="flex-1 flex items-center justify-between py-1 pr-2 text-left truncate"
                    >
                      <span className="truncate">{bone.name}</span>
                      <span className="text-[10px] font-mono text-slate-400 ml-2 shrink-0">
                        {bone.isIK ? 'IK' : hasPoseOffset ? 'Posed' : ''}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* FACIAL MORPHS QUICK TAB */}
        {tab === 'face' && model && (
          <div className="space-y-3">
            {pose2D?.expression && (
              <div className="pb-2.5 border-b border-[#222B38] text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Detected Expression</span>
                  <span className="font-medium text-sky-300 capitalize">
                    {pose2D.expression.dominantExpression}
                  </span>
                </div>
                {pose2D.expression.warning && (
                  <p className="text-[11px] text-amber-300">{pose2D.expression.warning}</p>
                )}
              </div>
            )}

            {model.morphs.length === 0 ? (
              <p className="text-xs text-slate-400">This model does not contain facial morphs.</p>
            ) : (
              <div className="space-y-2.5">
                {model.morphs.map((m) => {
                  const val = morphWeights[m.name] ?? 0;
                  return (
                    <div key={m.index}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="truncate text-slate-200" title={m.englishName}>
                          {m.name}
                        </span>
                        <span className="font-mono tabular-nums text-sky-300 ml-2">
                          {val.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        aria-label={`Morph ${m.name}`}
                        min={0}
                        max={1}
                        step={0.02}
                        value={val}
                        onChange={(e) => onMorphWeightChange(m.name, parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-[#1D2634] rounded cursor-pointer"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* VALIDATION TAB */}
        {tab === 'valid' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#222B38]">
              <div>
                <h3 className="text-xs font-semibold text-slate-100">Pose Validation</h3>
                <p className="text-[11px] text-slate-400">
                  {validation
                    ? `${validation.checkedBones} active joints inspected`
                    : 'Run analysis to validate pose'}
                </p>
              </div>
              <button
                type="button"
                onClick={onAutoCorrect}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-sky-500 hover:bg-sky-400 text-slate-950 rounded transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Auto Correct
              </button>
            </div>

            {validation && validation.issues.length === 0 ? (
              <div className="flex items-start gap-2 p-3 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                <div>
                  <div className="font-medium">All joint constraints passed</div>
                  <div className="text-[11px] text-emerald-300/80 mt-0.5">
                    No IK conflicts, reversed knees, floor penetrations, or VMD byte-limit errors detected.
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {validation?.issues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`flex items-start gap-2 p-2.5 rounded border text-xs ${
                      issue.severity === 'error'
                        ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                        : 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="font-medium">
                        {issue.boneName ? `${issue.boneName} · ` : ''}
                        {issue.category}
                      </div>
                      <p className="text-[11px] opacity-90">{issue.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
