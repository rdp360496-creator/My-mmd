import React, { useRef, useState } from 'react';
import {
  RotateCw,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Upload,
  Users,
  Eye,
  EyeOff,
  Crop,
} from 'lucide-react';
import type { Pose2DAnalysis, Pose3DReconstruction } from '../engine/types';
import type { BuiltInReferencePreset } from '../engine/localVisionAnalyzer';

interface ReferencePanelProps {
  imageUrl: string;
  imageName: string;
  presets: BuiltInReferencePreset[];
  activePresetId: string | null;
  pose2D: Pose2DAnalysis | null;
  pose3D: Pose3DReconstruction | null;
  showLandmarks: boolean;
  showReprojectionOverlay: boolean;
  onToggleLandmarks: () => void;
  onToggleReprojection: () => void;
  onSelectPreset: (presetId: string) => void;
  onUploadImage: (file: File) => void;
  onSelectSubject: (subjectId: number) => void;
  onUpdateLandmark: (name: string, x: number, y: number) => void;
}

const SKELETON_EDGES: Array<[string, string]> = [
  ['nose', 'neck'],
  ['neck', 'leftShoulder'],
  ['neck', 'rightShoulder'],
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
];

const REPROJ_EDGES: Array<[string, string]> = [
  ['head', 'neck'],
  ['neck', 'leftShoulder'],
  ['neck', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['neck', 'pelvis'],
  ['pelvis', 'leftHip'],
  ['pelvis', 'rightHip'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
];

export const ReferencePanel: React.FC<ReferencePanelProps> = ({
  imageUrl,
  imageName,
  presets,
  activePresetId,
  pose2D,
  pose3D,
  showLandmarks,
  showReprojectionOverlay,
  onToggleLandmarks,
  onToggleReprojection,
  onSelectPreset,
  onUploadImage,
  onSelectSubject,
  onUpdateLandmark,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotationDeg, setRotationDeg] = useState(0);
  const [cropFocus, setCropFocus] = useState(false);
  const [draggingLandmark, setDraggingLandmark] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && /^image\/(png|jpeg|jpg|webp)$/i.test(f.type)) {
      onUploadImage(f);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingLandmark && stageRef.current) {
      const rect = stageRef.current.getBoundingClientRect();
      const nx = Math.max(0.01, Math.min(0.99, (e.clientX - rect.left) / rect.width));
      const ny = Math.max(0.01, Math.min(0.99, (e.clientY - rect.top) / rect.height));
      onUpdateLandmark(draggingLandmark, nx, ny);
      return;
    }
    if (isPanning) {
      setPan({
        x: panStartRef.current.px + (e.clientX - panStartRef.current.x),
        y: panStartRef.current.py + (e.clientY - panStartRef.current.y),
      });
    }
  };

  const handlePointerUp = () => {
    setDraggingLandmark(null);
    setIsPanning(false);
  };

  const selectedSubject =
    pose2D?.subjects.find((s) => s.id === pose2D.selectedSubjectId) ?? pose2D?.subjects[0];

  const cropStyle =
    cropFocus && selectedSubject
      ? {
          transformOrigin: `${((selectedSubject.bbox[0] + selectedSubject.bbox[2]) / 2) * 100}% ${((selectedSubject.bbox[1] + selectedSubject.bbox[3]) / 2) * 100}%`,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${Math.max(zoom, 1.55)}) rotate(${rotationDeg}deg)`,
        }
      : {
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotationDeg}deg)`,
        };

  return (
    <div className="flex flex-col h-full bg-[#11161E] border-r border-[#222B38] select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#222B38]">
        <div>
          <h2 className="text-xs font-semibold text-slate-200 tracking-tight">Reference Image</h2>
          <p className="text-[11px] text-slate-400 truncate max-w-[190px]">{imageName}</p>
        </div>
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadImage(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#1B2330] hover:bg-[#242F40] border border-[#2D384B] rounded transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5 text-sky-400" />
            Import
          </button>
        </div>
      </div>

      {/* Preset Reference Selector */}
      <div className="px-3 py-2 border-b border-[#222B38] bg-[#0E131A]">
        <label htmlFor="ref-preset-select" className="block text-[11px] font-medium text-slate-400 mb-1">
          Sample Reference Library
        </label>
        <select
          id="ref-preset-select"
          value={activePresetId ?? 'custom'}
          onChange={(e) => {
            if (e.target.value !== 'custom') onSelectPreset(e.target.value);
          }}
          className="w-full px-2.5 py-1.5 text-xs bg-[#161C26] text-slate-100 border border-[#2A3446] rounded focus:outline-none focus:border-sky-500"
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
          {!activePresetId && <option value="custom">Uploaded: {imageName}</option>}
        </select>
      </div>

      {/* Multi-person subject selector when >1 subject detected */}
      {pose2D && pose2D.subjects.length > 1 && (
        <div className="px-3 py-2 border-b border-[#222B38] bg-[#151B26]">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-sky-300 mb-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>{pose2D.subjects.length} Subjects Detected — Select Target</span>
          </div>
          <div className="flex flex-col gap-1">
            {pose2D.subjects.map((sub) => {
              const active = sub.id === pose2D.selectedSubjectId;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => onSelectSubject(sub.id)}
                  className={`flex items-center justify-between px-2.5 py-1.5 text-xs rounded border text-left transition-colors ${
                    active
                      ? 'bg-sky-500/15 border-sky-500/60 text-sky-100 font-medium'
                      : 'bg-[#11161E] border-[#263040] text-slate-300 hover:bg-[#1B2330]'
                  }`}
                >
                  <span className="truncate">{sub.label}</span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400 ml-2 shrink-0">
                    {Math.round(sub.confidence * 100)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Interactive Image + 2D Landmark Stage */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className={`relative flex-1 overflow-hidden bg-[#090D12] flex items-center justify-center ${
          dragOver ? 'ring-2 ring-inset ring-sky-400' : ''
        }`}
      >
        <div
          ref={stageRef}
          onPointerDown={(e) => {
            if (draggingLandmark) return;
            setIsPanning(true);
            panStartRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          }}
          style={cropStyle}
          className="relative max-w-full max-h-full cursor-grab active:cursor-grabbing transition-transform duration-100"
        >
          <img
            src={imageUrl}
            alt={imageName}
            referrerPolicy="no-referrer"
            draggable={false}
            className="block max-h-[54vh] w-auto object-contain rounded border border-[#222B38]"
          />

          {/* Detected Subject Bounding Boxes */}
          {pose2D && showLandmarks && (
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              {pose2D.subjects.map((sub) => {
                const isSel = sub.id === pose2D.selectedSubjectId;
                const [xmin, ymin, xmax, ymax] = sub.bbox;
                return (
                  <rect
                    key={sub.id}
                    x={xmin * 100}
                    y={ymin * 100}
                    width={(xmax - xmin) * 100}
                    height={(ymax - ymin) * 100}
                    fill="none"
                    stroke={isSel ? '#38bdf8' : '#64748b'}
                    strokeWidth={isSel ? 0.55 : 0.35}
                    strokeDasharray={isSel ? undefined : '1.5 1.5'}
                  />
                );
              })}

              {/* 2D Detected Skeleton Edges */}
              {SKELETON_EDGES.map(([a, b]) => {
                const la = pose2D.landmarks[a];
                const lb = pose2D.landmarks[b];
                if (!la || !lb) return null;
                const isLeft = a.startsWith('left') || b.startsWith('left');
                const isRight = a.startsWith('right') || b.startsWith('right');
                const stroke = isLeft ? '#38bdf8' : isRight ? '#f59e0b' : '#cbd5e1';
                return (
                  <line
                    key={`${a}-${b}`}
                    x1={la.x * 100}
                    y1={la.y * 100}
                    x2={lb.x * 100}
                    y2={lb.y * 100}
                    stroke={stroke}
                    strokeWidth={0.75}
                    strokeOpacity={0.9}
                  />
                );
              })}

              {/* 3D-to-2D Reprojection Overlay */}
              {showReprojectionOverlay &&
                pose3D &&
                REPROJ_EDGES.map(([a, b]) => {
                  const pa = pose3D.projected2D[a];
                  const pb = pose3D.projected2D[b];
                  if (!pa || !pb) return null;
                  return (
                    <line
                      key={`reproj-${a}-${b}`}
                      x1={pa.x * 100}
                      y1={pa.y * 100}
                      x2={pb.x * 100}
                      y2={pb.y * 100}
                      stroke="#34d399"
                      strokeWidth={0.65}
                      strokeDasharray="1.4 1"
                    />
                  );
                })}
            </svg>
          )}

          {/* Draggable 2D Landmark Handles */}
          {pose2D &&
            showLandmarks &&
            Object.values(pose2D.landmarks).map((lm) => {
              const isLeft = lm.name.startsWith('left');
              const isRight = lm.name.startsWith('right');
              const colorClass = lm.occluded
                ? 'bg-amber-400 border-slate-950'
                : isLeft
                  ? 'bg-sky-400 border-slate-950'
                  : isRight
                    ? 'bg-amber-400 border-slate-950'
                    : 'bg-slate-100 border-slate-950';
              return (
                <button
                  key={lm.name}
                  type="button"
                  aria-label={`Drag landmark ${lm.name}`}
                  title={`${lm.name} (${Math.round(lm.confidence * 100)}%${lm.occluded ? ', occluded' : ''}) — drag to adjust`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDraggingLandmark(lm.name);
                  }}
                  style={{ left: `${lm.x * 100}%`, top: `${lm.y * 100}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border ${colorClass} hover:scale-150 transition-transform cursor-move`}
                />
              );
            })}
        </div>
      </div>

      {/* Image Transform & Overlay Controls */}
      <div className="px-3 py-2 border-t border-[#222B38] bg-[#0E131A] flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Zoom out image"
            onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.2).toFixed(2))))}
            className="p-1.5 text-slate-300 hover:text-white bg-[#171E29] border border-[#263142] rounded"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Zoom in image"
            onClick={() => setZoom((z) => Math.min(3, Number((z + 0.2).toFixed(2))))}
            className="p-1.5 text-slate-300 hover:text-white bg-[#171E29] border border-[#263142] rounded"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Rotate reference image"
            onClick={() => setRotationDeg((r) => (r + 90) % 360)}
            className="p-1.5 text-slate-300 hover:text-white bg-[#171E29] border border-[#263142] rounded"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Crop to selected subject"
            onClick={() => setCropFocus((c) => !c)}
            className={`p-1.5 border rounded ${
              cropFocus
                ? 'bg-sky-500/20 border-sky-500 text-sky-200'
                : 'text-slate-300 hover:text-white bg-[#171E29] border-[#263142]'
            }`}
          >
            <Crop className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Reset image view"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
              setRotationDeg(0);
              setCropFocus(false);
            }}
            className="p-1.5 text-slate-300 hover:text-white bg-[#171E29] border border-[#263142] rounded"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleLandmarks}
            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border whitespace-nowrap ${
              showLandmarks
                ? 'bg-sky-500/15 border-sky-500/60 text-sky-200'
                : 'bg-[#171E29] border-[#263142] text-slate-400'
            }`}
          >
            {showLandmarks ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            2D Rig
          </button>
          <button
            type="button"
            onClick={onToggleReprojection}
            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border whitespace-nowrap ${
              showReprojectionOverlay
                ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-200'
                : 'bg-[#171E29] border-[#263142] text-slate-400'
            }`}
          >
            3D Proj
          </button>
        </div>
      </div>

      {/* Analysis Summary Footer */}
      {pose2D && (
        <div className="px-3.5 py-2 border-t border-[#222B38] bg-[#11161E] text-[11px] text-slate-300 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span>
              Orientation:{' '}
              <strong className="text-slate-200 font-medium">
                {selectedSubject?.facingDirection ?? 'front'}
              </strong>{' '}
              · {selectedSubject?.poseType ?? 'standing'}
            </span>
            <span className="font-mono tabular-nums text-sky-300">
              {pose2D.provider === 'gemini-vision'
                ? 'Cloud Vision'
                : pose2D.provider === 'manual-landmarks'
                  ? 'Manual Edit'
                  : 'Local Vision'}
            </span>
          </div>
          <p className="text-slate-400 leading-snug line-clamp-2">{pose2D.depthHints.poseSummary}</p>
        </div>
      )}
    </div>
  );
};
