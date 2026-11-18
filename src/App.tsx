import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Box,
  Compass,
  Download,
  Eye,
  FolderUp,
  Grid3X3,
  Layers,
  Move,
  Rotate3D,
  RotateCcw,
  Sparkles,
  Upload,
} from 'lucide-react';
import { Viewport3D, type CameraPreset, type ViewportRenderMode } from './components/Viewport3D';
import { ReferencePanel } from './components/ReferencePanel';
import { InspectorPanel } from './components/InspectorPanel';
import { BoneMappingView } from './components/BoneMappingView';
import { ExpressionsView } from './components/ExpressionsView';
import { ExportMMDView } from './components/ExportMMDView';
import { SettingsView } from './components/SettingsView';
import { parseMMDModel } from './engine/pmxParser';
import {
  BUILTIN_MODEL_PRESETS,
  buildSamplePMXBuffer,
  type BuiltInModelPresetId,
} from './engine/samplePmxBuilder';
import { analyzeSkeleton } from './engine/skeletonAnalyzer';
import { buildBoneMapping } from './engine/boneMappingEngine';
import {
  BUILTIN_REFERENCE_PRESETS,
  analyzeImageLocally,
} from './engine/localVisionAnalyzer';
import { reconstruct3DPose } from './engine/pose3DReconstructor';
import { retargetPoseToModel } from './engine/retargetingEngine';
import { autoCorrectPose, validateRetargetedPose } from './engine/poseValidator';
import { mapFacialExpressionToMorphs } from './engine/facialMorphMapper';
import { applyParsedVPDToPose, exportVPD, parseVPD } from './engine/vpdExporter';
import { exportVMD } from './engine/vmdExporter';
import {
  buildModelCalibrationProfile,
  loadVerifiedCalibrationProfile,
  saveCalibrationProfile,
} from './engine/modelCalibration';
import {
  loadIntegrationConfig,
  parseProjectFile,
  saveCustomBoneMappings,
  saveIntegrationConfig,
  saveProjectAutoBackup,
  serializeProjectFile,
} from './engine/projectManager';
import type {
  BoneTransform,
  MMDIntegrationConfig,
  PMXModelData,
  Pose2DAnalysis,
  Pose3DReconstruction,
  ProjectFile,
  RetargetedPose,
  StandardBoneRole,
  ValidationReport,
} from './engine/types';

type StudioSection = 'studio' | 'mapping' | 'expressions' | 'export' | 'settings';

function triggerDownload(data: Uint8Array | string, fileName: string, mimeType: string) {
  const blob =
    typeof data === 'string'
      ? new Blob([data], { type: mimeType })
      : new Blob([new Uint8Array(data)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [section, setSection] = useState<StudioSection>('studio');

  // Model & Texture State
  const [activeModelPresetId, setActiveModelPresetId] = useState<BuiltInModelPresetId | null>(
    'yuki-jp-apose'
  );
  const [model, setModel] = useState<PMXModelData | null>(() => {
    const buf = buildSamplePMXBuffer('yuki-jp-apose');
    return parseMMDModel(buf, 'yuki_standard_apose.pmx');
  });
  const [textureMapByFile, setTextureMapByFile] = useState<Record<string, string>>({});
  const [mappingOverrides, setMappingOverrides] = useState<
    Partial<Record<StandardBoneRole, number | null>>
  >({});

  // Reference Image & Analysis State
  const [activeRefPresetId, setActiveRefPresetId] = useState<string | null>(
    BUILTIN_REFERENCE_PRESETS[0].id
  );
  const [refImageUrl, setRefImageUrl] = useState<string>(BUILTIN_REFERENCE_PRESETS[0].imageUrl);
  const [refImageName, setRefImageName] = useState<string>(BUILTIN_REFERENCE_PRESETS[0].title);
  const [pose2D, setPose2D] = useState<Pose2DAnalysis | null>(
    BUILTIN_REFERENCE_PRESETS[0].analysis
  );
  const [depthVariant, setDepthVariant] = useState<'primary' | 'alternate'>('primary');
  const [pose3D, setPose3D] = useState<Pose3DReconstruction | null>(() =>
    reconstruct3DPose(BUILTIN_REFERENCE_PRESETS[0].analysis, 'primary')
  );

  // Retargeted Pose, Undo/Redo, Morphs & Validation
  const [pose, setPose] = useState<RetargetedPose | null>(null);
  const [undoStack, setUndoStack] = useState<RetargetedPose[]>([]);
  const [redoStack, setRedoStack] = useState<RetargetedPose[]>([]);
  const [morphWeights, setMorphWeights] = useState<Record<string, number>>({});
  const [expressionStrength, setExpressionStrength] = useState(1.0);
  const [validation, setValidation] = useState<ValidationReport | null>(null);

  // Viewport State
  const [selectedBoneIndex, setSelectedBoneIndex] = useState<number | null>(null);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [showReprojection, setShowReprojection] = useState(false);
  const [showBones, setShowBones] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [renderMode, setRenderMode] = useState<ViewportRenderMode>('shaded');
  const [gizmoMode, setGizmoMode] = useState<'rotate' | 'translate'>('rotate');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('perspective');
  const [cameraResetNonce, setCameraResetNonce] = useState(0);
  const [showRefOverlay, setShowRefOverlay] = useState(false);
  const [refOverlayOpacity, setRefOverlayOpacity] = useState(0.35);

  // Export & Integration State
  const [poseName, setPoseName] = useState('StandingWave_01');
  const [vmdFrameNumber, setVmdFrameNumber] = useState(0);
  const [mmdConfig, setMmdConfig] = useState<MMDIntegrationConfig>(() => loadIntegrationConfig());
  const [hasServerGeminiKey, setHasServerGeminiKey] = useState(false);

  // Status / Error Feedback
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('Ready');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastExportSummary, setLastExportSummary] = useState<string | null>(null);
  const [calibrationNotice, setCalibrationNotice] = useState<string | null>(null);

  const modelInputRef = useRef<HTMLInputElement | null>(null);

  // Derived Skeleton, Mapping & Calibration Profile
  const skeleton = useMemo(() => (model ? analyzeSkeleton(model) : null), [model]);
  const mapping = useMemo(
    () => (model && skeleton ? buildBoneMapping(model, skeleton, mappingOverrides) : null),
    [model, skeleton, mappingOverrides]
  );
  const calibration = useMemo(
    () =>
      model && skeleton && mapping
        ? buildModelCalibrationProfile(model, skeleton, mapping, mappingOverrides)
        : null,
    [model, skeleton, mapping, mappingOverrides]
  );

  const morphMapping = useMemo(() => {
    if (!model) return { entries: [], weights: {}, warnings: [] };
    return mapFacialExpressionToMorphs(model, pose2D?.expression ?? null, expressionStrength);
  }, [model, pose2D, expressionStrength]);

  // Check server health for optional Gemini Vision availability
  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.hasGeminiKey === 'boolean') {
          setHasServerGeminiKey(d.hasGeminiKey);
        }
      })
      .catch(() => {});
  }, []);

  // Load verified calibration profile on initial mount
  useEffect(() => {
    if (!model) return;
    const res = loadVerifiedCalibrationProfile(model);
    if (res.status === 'matched' && res.profile) {
      setMappingOverrides(res.profile.userCorrectedMappings);
      setCalibrationNotice(
        `Restored verified calibration profile for "${model.name}" (${res.profile.skeletonSignature}).`
      );
    } else if (res.status === 'mismatched') {
      setMappingOverrides({});
      setCalibrationNotice(
        `Calibration mismatch detected for "${model.name}": ${res.reason} Generated fresh profile.`
      );
    } else {
      setCalibrationNotice(
        `Created new calibration profile for "${model.name}" (${model.bones.length} bones analyzed).`
      );
    }
    // Only on initial mount; subsequent model switches use applyLoadedModelWithCalibration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist active model calibration profile whenever mapping or calibration updates
  useEffect(() => {
    if (calibration) {
      saveCalibrationProfile(calibration);
    }
  }, [calibration]);

  // Run retargeting whenever model, skeleton, mapping, or pose3D updates
  const runRetargetPipeline = useCallback(
    (
      nextPose2D: Pose2DAnalysis | null,
      nextPose3D: Pose3DReconstruction | null,
      options?: { useIK?: boolean; mirror?: boolean; poseStrength?: number }
    ) => {
      if (!model || !skeleton || !mapping || !nextPose3D) return;
      const retargeted = retargetPoseToModel(model, skeleton, mapping, nextPose3D, nextPose2D, {
        useIK: options?.useIK ?? pose?.ikEnabled ?? skeleton.hasLegIK,
        mirror: options?.mirror ?? pose?.mirrored ?? false,
        poseStrength: options?.poseStrength ?? pose?.poseStrength ?? 1.0,
        distributeTwist: true,
        calibration,
      });
      const morphRes = mapFacialExpressionToMorphs(
        model,
        nextPose2D?.expression ?? null,
        expressionStrength
      );
      const report = validateRetargetedPose(
        model,
        skeleton,
        mapping,
        retargeted,
        morphRes.weights
      );
      setPose(retargeted);
      setMorphWeights(morphRes.weights);
      setValidation(report);
    },
    [
      model,
      skeleton,
      mapping,
      calibration,
      pose?.ikEnabled,
      pose?.mirrored,
      pose?.poseStrength,
      expressionStrength,
    ]
  );

  // Initial retargeting on first mount & when switching models or mapping
  useEffect(() => {
    if (model && skeleton && mapping && pose3D) {
      runRetargetPipeline(pose2D, pose3D);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, mapping, calibration]);

  // Auto-backup project snapshot to localStorage
  useEffect(() => {
    if (!model) return;
    const project: ProjectFile = {
      schemaVersion: '1.0.0',
      savedAt: new Date().toISOString(),
      projectName: poseName,
      modelFileName: model.fileName,
      modelName: model.name,
      referenceImageName: refImageName,
      pose2D,
      pose3D,
      boneMappingOverrides: mappingOverrides,
      retargetedPose: pose,
      morphWeights,
      validation,
      exportSettings: {
        poseName,
        includeFaceInFullVmd: true,
        useShiftJis: true,
        vmdFrameNumber,
      },
    };
    saveProjectAutoBackup(project);
  }, [model, poseName, refImageName, pose2D, pose3D, mappingOverrides, pose, morphWeights, validation, vmdFrameNumber]);

  const pushUndoState = useCallback((current: RetargetedPose | null) => {
    if (!current) return;
    setUndoStack((prev) => [...prev.slice(-24), current]);
    setRedoStack([]);
  }, []);

  // Handlers
  const applyLoadedModelWithCalibration = useCallback(
    (parsed: PMXModelData, presetId: BuiltInModelPresetId | null, baseStatus: string) => {
      const calRes = loadVerifiedCalibrationProfile(parsed);
      if (calRes.status === 'matched' && calRes.profile) {
        setMappingOverrides(calRes.profile.userCorrectedMappings);
        const notice = `Loaded verified calibration profile for "${parsed.name}" (${calRes.profile.skeletonSignature}).`;
        setCalibrationNotice(notice);
        setStatusMessage(`${baseStatus} · Restored saved calibration`);
      } else if (calRes.status === 'mismatched') {
        setMappingOverrides({});
        const notice = `Calibration mismatch for "${parsed.name}": ${calRes.reason} Generated fresh profile.`;
        setCalibrationNotice(notice);
        setStatusMessage(notice);
      } else {
        setMappingOverrides({});
        setCalibrationNotice(
          `Analyzed "${parsed.name}" (${parsed.bones.length} bones) and created new calibration profile.`
        );
        setStatusMessage(baseStatus);
      }
      setActiveModelPresetId(presetId);
      setModel(parsed);
      setSelectedBoneIndex(null);
      setUndoStack([]);
      setRedoStack([]);
    },
    []
  );

  const handleSelectModelPreset = (presetId: BuiltInModelPresetId) => {
    try {
      setErrorMessage(null);
      const desc = BUILTIN_MODEL_PRESETS.find((p) => p.id === presetId)!;
      const buf = buildSamplePMXBuffer(presetId);
      const parsed = parseMMDModel(buf, desc.fileName);
      applyLoadedModelWithCalibration(
        parsed,
        presetId,
        `Loaded ${parsed.name} (${parsed.bones.length} bones)`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load built-in model.');
    }
  };

  const handleImportModelFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMessage(null);
    const arr = Array.from(files);
    const modelFile = arr.find((f) => /\.(pmx|pmd)$/i.test(f.name));
    const texFiles = arr.filter((f) => /\.(png|jpe?g|tga|bmp|webp)$/i.test(f.name));

    if (texFiles.length > 0) {
      const nextTex: Record<string, string> = { ...textureMapByFile };
      for (const tf of texFiles) {
        nextTex[tf.name.toLowerCase()] = URL.createObjectURL(tf);
      }
      setTextureMapByFile(nextTex);
    }

    if (!modelFile) {
      if (texFiles.length > 0) {
        setStatusMessage(`Loaded ${texFiles.length} texture file(s) onto active model.`);
      } else {
        setErrorMessage('Please select a .pmx or .pmd character model file.');
      }
      return;
    }

    try {
      const buf = await modelFile.arrayBuffer();
      const parsed = parseMMDModel(buf, modelFile.name);
      applyLoadedModelWithCalibration(
        parsed,
        null,
        `Imported ${parsed.name} (${parsed.format}, ${parsed.bones.length} bones, ${parsed.morphs.length} morphs)`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : `Failed to parse "${modelFile.name}".`
      );
    }
  };

  const handleAnalyzeReference = async (overrideSubjectId?: number) => {
    setErrorMessage(null);
    setIsAnalyzing(true);
    setStatusMessage('Analyzing reference image...');
    try {
      let analysis: Pose2DAnalysis;

      if (mmdConfig.cloudVisionConsent) {
        // Convert imageUrl to base64
        const resp = await fetch(refImageUrl);
        const blob = await resp.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Failed to read image for analysis.'));
          reader.readAsDataURL(blob);
        });

        const apiResp = await fetch('/api/analyze-pose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: blob.type || 'image/jpeg',
            targetSubjectId: overrideSubjectId ?? pose2D?.selectedSubjectId ?? 1,
          }),
        });
        const payload = await apiResp.json();
        if (!apiResp.ok) {
          throw new Error(payload.error || 'Cloud Vision AI analysis failed.');
        }
        analysis = payload as Pose2DAnalysis;
      } else {
        analysis = await analyzeImageLocally(
          refImageUrl,
          activeRefPresetId ?? undefined,
          overrideSubjectId ?? pose2D?.selectedSubjectId ?? 1
        );
      }

      const reconstructed = reconstruct3DPose(analysis, depthVariant);
      setPose2D(analysis);
      setPose3D(reconstructed);
      runRetargetPipeline(analysis, reconstructed);
      setStatusMessage(
        `Pose analyzed (${analysis.provider === 'gemini-vision' ? 'Cloud Vision AI' : 'Local Vision'}) and retargeted to ${model?.name ?? 'model'}`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Reference analysis failed.');
      setStatusMessage('Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSelectReferencePreset = async (presetId: string) => {
    const preset = BUILTIN_REFERENCE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setErrorMessage(null);
    setActiveRefPresetId(preset.id);
    setRefImageUrl(preset.imageUrl);
    setRefImageName(preset.title);
    setPoseName(preset.id.replace(/[^a-z0-9]+/gi, '_') + '_01');
    const analysis = await analyzeImageLocally(preset.imageUrl, preset.id, 1);
    const reconstructed = reconstruct3DPose(analysis, depthVariant);
    setPose2D(analysis);
    setPose3D(reconstructed);
    runRetargetPipeline(analysis, reconstructed);
    setStatusMessage(`Loaded reference "${preset.title}"`);
  };

  const handleUploadReferenceImage = async (file: File) => {
    setErrorMessage(null);
    const url = URL.createObjectURL(file);
    setActiveRefPresetId(null);
    setRefImageUrl(url);
    setRefImageName(file.name);
    setPoseName(file.name.replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_') || 'CustomPose');
    try {
      const analysis = await analyzeImageLocally(url, undefined, 1);
      const reconstructed = reconstruct3DPose(analysis, depthVariant);
      setPose2D(analysis);
      setPose3D(reconstructed);
      runRetargetPipeline(analysis, reconstructed);
      setStatusMessage(`Imported "${file.name}" — local landmarks initialized`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load reference image.');
    }
  };

  const handleSelectSubject = async (subjectId: number) => {
    if (activeRefPresetId && !mmdConfig.cloudVisionConsent) {
      const analysis = await analyzeImageLocally(refImageUrl, activeRefPresetId, subjectId);
      const reconstructed = reconstruct3DPose(analysis, depthVariant);
      setPose2D(analysis);
      setPose3D(reconstructed);
      runRetargetPipeline(analysis, reconstructed);
      setStatusMessage(`Switched target to Subject #${subjectId}`);
      return;
    }
    await handleAnalyzeReference(subjectId);
  };

  const handleUpdateLandmark = (name: string, x: number, y: number) => {
    if (!pose2D) return;
    const next2D: Pose2DAnalysis = {
      ...pose2D,
      provider: 'manual-landmarks',
      landmarks: {
        ...pose2D.landmarks,
        [name]: {
          ...(pose2D.landmarks[name] ?? { name, confidence: 1 }),
          x,
          y,
          confidence: 1,
          occluded: false,
        },
      },
    };
    const next3D = reconstruct3DPose(next2D, depthVariant);
    setPose2D(next2D);
    setPose3D(next3D);
    runRetargetPipeline(next2D, next3D);
  };

  const handleBoneTransformChange = (boneIndex: number, next: Partial<BoneTransform>) => {
    if (!pose || !model || !skeleton || !mapping) return;
    const bone = model.bones[boneIndex];
    if (!bone) return;
    pushUndoState(pose);

    const existing = pose.transforms[boneIndex] ?? {
      boneIndex,
      boneName: bone.name,
      translation: [0, 0, 0] as [number, number, number],
      quaternion: [0, 0, 0, 1] as [number, number, number, number],
      source: 'manual' as const,
    };

    const updated: RetargetedPose = {
      ...pose,
      transforms: {
        ...pose.transforms,
        [boneIndex]: { ...existing, ...next, boneIndex, boneName: bone.name },
      },
    };
    setPose(updated);
    setValidation(validateRetargetedPose(model, skeleton, mapping, updated, morphWeights));
  };

  const handleResetBone = (boneIndex: number) => {
    if (!pose || !model || !skeleton || !mapping) return;
    pushUndoState(pose);
    const nextTransforms = { ...pose.transforms };
    delete nextTransforms[boneIndex];
    const updated = { ...pose, transforms: nextTransforms };
    setPose(updated);
    setValidation(validateRetargetedPose(model, skeleton, mapping, updated, morphWeights));
  };

  const handleResetLimb = (boneIndex: number) => {
    if (!pose || !model || !skeleton || !mapping) return;
    pushUndoState(pose);
    const nextTransforms = { ...pose.transforms };
    const queue = [boneIndex];
    while (queue.length > 0) {
      const idx = queue.shift()!;
      delete nextTransforms[idx];
      for (const child of skeleton.childrenByBone[idx] ?? []) {
        queue.push(child);
      }
    }
    const updated = { ...pose, transforms: nextTransforms };
    setPose(updated);
    setValidation(validateRetargetedPose(model, skeleton, mapping, updated, morphWeights));
  };

  const handleResetAllPose = () => {
    if (!pose || !model || !skeleton || !mapping) return;
    pushUndoState(pose);
    const cleared: RetargetedPose = {
      ...pose,
      transforms: {},
      rootOffsetY: 0,
    };
    setPose(cleared);
    setValidation(validateRetargetedPose(model, skeleton, mapping, cleared, morphWeights));
    setStatusMessage('Reset model to rest pose');
  };

  const handleUndo = () => {
    if (undoStack.length === 0 || !pose) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((r) => [...r, pose]);
    setPose(prev);
    if (model && skeleton && mapping) {
      setValidation(validateRetargetedPose(model, skeleton, mapping, prev, morphWeights));
    }
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || !pose) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, pose]);
    setPose(next);
    if (model && skeleton && mapping) {
      setValidation(validateRetargetedPose(model, skeleton, mapping, next, morphWeights));
    }
  };

  const handleAutoCorrect = () => {
    if (!model || !skeleton || !mapping || !pose) return;
    pushUndoState(pose);
    const res = autoCorrectPose(model, skeleton, mapping, pose, morphWeights);
    setPose(res.pose);
    setValidation(res.report);
    setStatusMessage(
      res.report.correctedCount > 0
        ? `Auto-corrected ${res.report.correctedCount} joint/IK constraint issue(s)`
        : 'All joint constraints are already valid'
    );
  };

  const handleExportVPD = () => {
    if (!model || !pose) return;
    setErrorMessage(null);
    const res = exportVPD(model, pose, poseName);
    triggerDownload(res.bytes, res.fileName, 'text/plain;charset=shift_jis');
    const summary = `Exported ${res.fileName} (${res.boneCount} bones, Shift_JIS)`;
    setLastExportSummary(summary);
    setStatusMessage(summary);
  };

  const handleExportFullVMD = (allowSkipLongNames = false) => {
    if (!model || !pose) return;
    setErrorMessage(null);
    const res = exportVMD(model, pose, morphWeights, {
      poseName,
      mode: 'full',
      frameNumber: vmdFrameNumber,
      allowSkipLongNames,
    });
    if (res.errors.length > 0) {
      setErrorMessage(res.errors[0]);
      setSection('export');
      return;
    }
    triggerDownload(res.bytes, res.fileName, 'application/octet-stream');
    const summary = `Exported ${res.fileName} (${res.boneFrames} bone frames, ${res.morphFrames} morph frames)`;
    setLastExportSummary(summary);
    setStatusMessage(summary);
  };

  const handleExportFaceVMD = (allowSkipLongNames = false) => {
    if (!model || !pose) return;
    setErrorMessage(null);
    const res = exportVMD(model, pose, morphWeights, {
      poseName,
      mode: 'face',
      frameNumber: vmdFrameNumber,
      allowSkipLongNames,
    });
    if (res.errors.length > 0) {
      setErrorMessage(res.errors[0]);
      setSection('export');
      return;
    }
    triggerDownload(res.bytes, res.fileName, 'application/octet-stream');
    const summary = `Exported ${res.fileName} (${res.morphFrames} facial morph frames)`;
    setLastExportSummary(summary);
    setStatusMessage(summary);
  };

  const handleExportProject = () => {
    if (!model) return;
    const project: ProjectFile = {
      schemaVersion: '1.0.0',
      savedAt: new Date().toISOString(),
      projectName: poseName,
      modelFileName: model.fileName,
      modelName: model.name,
      referenceImageName: refImageName,
      pose2D,
      pose3D,
      boneMappingOverrides: mappingOverrides,
      retargetedPose: pose,
      morphWeights,
      validation,
      exportSettings: {
        poseName,
        includeFaceInFullVmd: true,
        useShiftJis: true,
        vmdFrameNumber,
      },
    };
    const json = serializeProjectFile(project);
    triggerDownload(json, `${poseName}.mmdpose.json`, 'application/json');
    setLastExportSummary(`Saved project ${poseName}.mmdpose.json`);
  };

  const handleExportAll = (allowSkipLongNames = false) => {
    if (!model || !pose) return;
    handleExportVPD();
    handleExportFullVMD(allowSkipLongNames);
    handleExportFaceVMD(allowSkipLongNames);
    handleExportProject();
    const summary = `Exported ${poseName}.vpd, _Full.vmd, _Face.vmd, and .mmdpose.json`;
    setLastExportSummary(summary);
    setStatusMessage(summary);
  };

  const handleImportProject = async (file: File) => {
    try {
      setErrorMessage(null);
      const txt = await file.text();
      const proj = parseProjectFile(txt);
      if (proj.pose2D) setPose2D(proj.pose2D);
      if (proj.pose3D) setPose3D(proj.pose3D);
      if (proj.boneMappingOverrides) setMappingOverrides(proj.boneMappingOverrides);
      if (proj.retargetedPose) setPose(proj.retargetedPose);
      if (proj.morphWeights) setMorphWeights(proj.morphWeights);
      if (proj.validation) setValidation(proj.validation);
      setPoseName(proj.exportSettings.poseName || proj.projectName);
      setVmdFrameNumber(proj.exportSettings.vmdFrameNumber ?? 0);
      setStatusMessage(`Loaded project "${proj.projectName}"`);
      setSection('studio');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load .mmdpose.json project.');
    }
  };

  const handleImportVPD = async (file: File) => {
    if (!model) return;
    try {
      setErrorMessage(null);
      const buf = await file.arrayBuffer();
      const decoder = new TextDecoder('shift_jis');
      const text = decoder.decode(buf);
      const parsed = parseVPD(text);
      const loadedPose = applyParsedVPDToPose(model, parsed);
      pushUndoState(pose);
      setPose(loadedPose);
      if (skeleton && mapping) {
        setValidation(validateRetargetedPose(model, skeleton, mapping, loadedPose, morphWeights));
      }
      setStatusMessage(`Loaded VPD "${file.name}" (${parsed.bones.length} bones applied)`);
      setSection('studio');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to parse VPD file.');
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0B0F14] text-slate-100">
      {/* Top Bar Contract: 3 zones (Wordmark — Nav Links — Primary CTA) */}
      <header className="h-12 shrink-0 flex items-center justify-between gap-8 px-4 bg-[#10151D] border-b border-[#222B38]">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setSection('studio');
          }}
          className="text-sm font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          MMD Pose AI
        </a>

        <nav className="flex items-center gap-6 text-xs font-medium text-slate-400 overflow-x-auto">
          {(
            [
              { id: 'studio', label: 'Studio' },
              { id: 'mapping', label: 'Bone Mapping' },
              { id: 'expressions', label: 'Expressions' },
              { id: 'export', label: 'Export & MMD' },
              { id: 'settings', label: 'Settings' },
            ] as Array<{ id: StudioSection; label: string }>
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                section === item.id
                  ? 'text-sky-300 border-sky-400'
                  : 'border-transparent hover:text-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            disabled={isAnalyzing}
            onClick={() => {
              setSection('studio');
              handleAnalyzeReference();
            }}
            className="px-3.5 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze Reference'}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {section === 'studio' && (
          <div className="grid grid-cols-1 lg:grid-cols-[330px_1fr_320px] h-full min-h-0">
            {/* LEFT PANEL: Reference Image & 2D Landmarks */}
            <ReferencePanel
              imageUrl={refImageUrl}
              imageName={refImageName}
              presets={BUILTIN_REFERENCE_PRESETS}
              activePresetId={activeRefPresetId}
              pose2D={pose2D}
              pose3D={pose3D}
              showLandmarks={showLandmarks}
              showReprojectionOverlay={showReprojection}
              onToggleLandmarks={() => setShowLandmarks((v) => !v)}
              onToggleReprojection={() => setShowReprojection((v) => !v)}
              onSelectPreset={handleSelectReferencePreset}
              onUploadImage={handleUploadReferenceImage}
              onSelectSubject={handleSelectSubject}
              onUpdateLandmark={handleUpdateLandmark}
            />

            {/* CENTER PANEL: 3D Character Viewport + Toolbar */}
            <div className="relative flex flex-col min-w-0 min-h-0 bg-[#0C1118]">
              {/* Viewport Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#11161E] border-b border-[#222B38] z-10">
                {/* Model Switcher + PMX/PMD Upload */}
                <div className="flex items-center gap-2">
                  <label htmlFor="model-select" className="sr-only">
                    Target MMD Model
                  </label>
                  <select
                    id="model-select"
                    value={activeModelPresetId ?? 'uploaded'}
                    onChange={(e) => {
                      if (e.target.value !== 'uploaded') {
                        handleSelectModelPreset(e.target.value as BuiltInModelPresetId);
                      }
                    }}
                    className="px-2.5 py-1 text-xs bg-[#171E29] text-slate-100 border border-[#2A3548] rounded focus:outline-none focus:border-sky-500 max-w-[230px]"
                  >
                    {BUILTIN_MODEL_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.restPoseLabel} · {p.namingStyle})
                      </option>
                    ))}
                    {!activeModelPresetId && model && (
                      <option value="uploaded">Imported: {model.name}</option>
                    )}
                  </select>

                  <input
                    ref={modelInputRef}
                    type="file"
                    multiple
                    accept=".pmx,.pmd,.png,.jpg,.jpeg,.tga,.bmp,.webp"
                    className="hidden"
                    onChange={(e) => {
                      handleImportModelFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => modelInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-[#18202C] hover:bg-[#222D3D] border border-[#2A3548] text-slate-200 rounded whitespace-nowrap"
                  >
                    <FolderUp className="w-3.5 h-3.5 text-sky-400" />
                    Import PMX/PMD
                  </button>
                </div>

                {/* Camera Presets + Gizmo & Display Toggles */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="flex items-center bg-[#0D1218] border border-[#242E3E] rounded p-0.5">
                    {(['perspective', 'front', 'back', 'left', 'right', 'top'] as CameraPreset[]).map(
                      (cam) => (
                        <button
                          key={cam}
                          type="button"
                          onClick={() => {
                            setCameraPreset(cam);
                            setCameraResetNonce((n) => n + 1);
                          }}
                          className={`px-2 py-0.5 text-[11px] font-medium rounded capitalize whitespace-nowrap ${
                            cameraPreset === cam
                              ? 'bg-[#222D3D] text-sky-300'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {cam === 'perspective' ? 'Persp' : cam}
                        </button>
                      )
                    )}
                  </div>

                  <button
                    type="button"
                    aria-label="Toggle rotate or translate gizmo"
                    title="Gizmo Mode (Rotate / Translate)"
                    onClick={() => setGizmoMode((m) => (m === 'rotate' ? 'translate' : 'rotate'))}
                    className="p-1.5 rounded bg-[#171E29] border border-[#263142] text-slate-200 hover:border-sky-500/60"
                  >
                    {gizmoMode === 'rotate' ? (
                      <Rotate3D className="w-3.5 h-3.5 text-sky-400" />
                    ) : (
                      <Move className="w-3.5 h-3.5 text-amber-400" />
                    )}
                  </button>

                  <button
                    type="button"
                    aria-label="Cycle viewport render mode"
                    title={`Render Mode: ${renderMode}`}
                    onClick={() =>
                      setRenderMode((m) =>
                        m === 'shaded' ? 'wireframe' : m === 'wireframe' ? 'skeleton' : 'shaded'
                      )
                    }
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-[#171E29] border border-[#263142] text-slate-200 hover:border-sky-500/60"
                  >
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    <span className="capitalize">{renderMode}</span>
                  </button>

                  <button
                    type="button"
                    aria-label="Toggle skeleton overlay"
                    title="Toggle Bones"
                    onClick={() => setShowBones((v) => !v)}
                    className={`p-1.5 rounded border ${
                      showBones
                        ? 'bg-sky-500/15 border-sky-500/50 text-sky-300'
                        : 'bg-[#171E29] border-[#263142] text-slate-400'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    aria-label="Toggle ground grid"
                    title="Toggle Ground Grid"
                    onClick={() => setShowGrid((v) => !v)}
                    className={`p-1.5 rounded border ${
                      showGrid
                        ? 'bg-sky-500/15 border-sky-500/50 text-sky-300'
                        : 'bg-[#171E29] border-[#263142] text-slate-400'
                    }`}
                  >
                    <Grid3X3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    aria-label="Toggle coordinate axes"
                    title="Toggle Coordinate Axes"
                    onClick={() => setShowAxes((v) => !v)}
                    className={`p-1.5 rounded border ${
                      showAxes
                        ? 'bg-sky-500/15 border-sky-500/50 text-sky-300'
                        : 'bg-[#171E29] border-[#263142] text-slate-400'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    aria-label="Reset camera view"
                    title="Reset Camera"
                    onClick={() => {
                      setCameraPreset('perspective');
                      setCameraResetNonce((n) => n + 1);
                    }}
                    className="p-1.5 rounded bg-[#171E29] border border-[#263142] text-slate-300 hover:text-white"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    aria-label="Toggle translucent reference overlay"
                    title="Toggle Reference Comparison Overlay"
                    onClick={() => setShowRefOverlay((v) => !v)}
                    className={`px-2 py-1 text-[11px] font-medium rounded border whitespace-nowrap ${
                      showRefOverlay
                        ? 'bg-sky-500/15 border-sky-500/60 text-sky-200'
                        : 'bg-[#171E29] border-[#263142] text-slate-300 hover:text-white'
                    }`}
                  >
                    Compare
                  </button>

                  {showRefOverlay && (
                    <input
                      type="range"
                      aria-label="Reference overlay opacity"
                      min={0.15}
                      max={0.75}
                      step={0.05}
                      value={refOverlayOpacity}
                      onChange={(e) => setRefOverlayOpacity(parseFloat(e.target.value))}
                      className="w-16 h-1.5 bg-[#1D2634] rounded cursor-pointer"
                    />
                  )}
                </div>
              </div>

              {/* Critical Bone Mapping Warning Banner */}
              {mapping?.validationReport.hasCriticalWarnings && (
                <div
                  data-testid="mapping-warning-banner"
                  className="flex items-center justify-between gap-3 px-3 py-2 bg-rose-950/60 border-b border-rose-500/40 text-xs text-rose-200 z-10"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="truncate">
                      {mapping.validationReport.issues.filter((i) => i.severity === 'critical').length} critical · {mapping.validationReport.lowConfidenceMappings.length} low-confidence mapping issue(s). Review before retargeting or exporting.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSection('mapping')}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/50 text-rose-100 rounded whitespace-nowrap shrink-0"
                  >
                    Review Bone Mapping
                  </button>
                </div>
              )}

              {/* 3D Canvas */}
              <div className="relative flex-1 min-h-0">
                <Viewport3D
                  model={model}
                  skeleton={skeleton}
                  mapping={mapping}
                  pose={pose}
                  morphWeights={morphWeights}
                  selectedBoneIndex={selectedBoneIndex}
                  onSelectBone={setSelectedBoneIndex}
                  onBoneTransformChange={handleBoneTransformChange}
                  showBones={showBones}
                  showAxes={showAxes}
                  showGrid={showGrid}
                  renderMode={renderMode}
                  gizmoMode={gizmoMode}
                  cameraPreset={cameraPreset}
                  cameraResetNonce={cameraResetNonce}
                  textureMapByFile={textureMapByFile}
                  refOverlayUrl={refImageUrl}
                  showRefOverlay={showRefOverlay}
                  refOverlayOpacity={refOverlayOpacity}
                />

                {/* Quiet HUD caption bottom-left of viewport */}
                {model && skeleton && (
                  <div className="pointer-events-none absolute left-3 bottom-3 px-2.5 py-1.5 rounded bg-[#0E131B]/90 border border-[#253042] text-[11px] text-slate-300">
                    <span className="font-semibold text-white">{model.name}</span>
                    <span className="mx-1.5 text-slate-500">·</span>
                    <span>
                      {skeleton.restPoseType} ({skeleton.armRestAngleDeg}°)
                    </span>
                    <span className="mx-1.5 text-slate-500">·</span>
                    <span className="font-mono tabular-nums">
                      {pose ? Object.keys(pose.transforms).length : 0} active bones
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT PANEL: Rig, Bone Editor, Morphs, Validation */}
            <InspectorPanel
              model={model}
              skeleton={skeleton}
              mapping={mapping}
              pose={pose}
              pose2D={pose2D}
              morphWeights={morphWeights}
              validation={validation}
              selectedBoneIndex={selectedBoneIndex}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              depthVariant={depthVariant}
              onSelectBone={setSelectedBoneIndex}
              onBoneTransformChange={handleBoneTransformChange}
              onResetBone={handleResetBone}
              onResetLimb={handleResetLimb}
              onResetAllPose={handleResetAllPose}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onToggleMirror={() => {
                if (!pose3D || !pose) return;
                pushUndoState(pose);
                runRetargetPipeline(pose2D, pose3D, { mirror: !pose.mirrored });
              }}
              onToggleIK={() => {
                if (!pose3D || !pose) return;
                pushUndoState(pose);
                runRetargetPipeline(pose2D, pose3D, { useIK: !pose.ikEnabled });
              }}
              onPoseStrengthChange={(val) => {
                if (!pose3D || !pose) return;
                runRetargetPipeline(pose2D, pose3D, { poseStrength: val });
              }}
              onToggleDepthVariant={() => {
                if (!pose2D) return;
                const nextVar = depthVariant === 'primary' ? 'alternate' : 'primary';
                setDepthVariant(nextVar);
                const next3D = reconstruct3DPose(pose2D, nextVar);
                setPose3D(next3D);
                runRetargetPipeline(pose2D, next3D);
              }}
              onMorphWeightChange={(mName, weight) => {
                setMorphWeights((prev) => ({ ...prev, [mName]: weight }));
              }}
              onAutoCorrect={handleAutoCorrect}
            />
          </div>
        )}

        {section === 'mapping' && (
          <BoneMappingView
            model={model}
            skeleton={skeleton}
            mapping={mapping}
            calibration={calibration}
            calibrationNotice={calibrationNotice}
            onOverrideRole={(role, boneIndex) => {
              setMappingOverrides((prev) => ({ ...prev, [role]: boneIndex }));
            }}
            onResetMappings={() => {
              setMappingOverrides({});
              if (model) {
                saveCustomBoneMappings(`${model.name}::${model.bones.length}`, {});
                setCalibrationNotice(
                  `Reset manual overrides to multi-signal auto-detection for "${model.name}".`
                );
                setStatusMessage(`Re-ran automatic bone recognition for "${model.name}"`);
              }
            }}
            onSaveCustomMapping={() => {
              if (model && calibration) {
                saveCustomBoneMappings(`${model.name}::${model.bones.length}`, mappingOverrides);
                saveCalibrationProfile(calibration);
                setCalibrationNotice(
                  `Saved calibration profile for "${model.name}" (${calibration.skeletonSignature}).`
                );
                setStatusMessage(`Saved calibration profile for "${model.name}"`);
              }
            }}
          />
        )}

        {section === 'expressions' && (
          <ExpressionsView
            model={model}
            expression={pose2D?.expression ?? null}
            morphEntries={morphMapping.entries}
            morphWeights={morphWeights}
            expressionStrength={expressionStrength}
            warnings={morphMapping.warnings}
            onExpressionStrengthChange={(val) => {
              setExpressionStrength(val);
              if (model && pose2D?.expression) {
                const res = mapFacialExpressionToMorphs(model, pose2D.expression, val);
                setMorphWeights(res.weights);
              }
            }}
            onMorphWeightChange={(mName, w) =>
              setMorphWeights((prev) => ({ ...prev, [mName]: w }))
            }
            onResetMorphs={() => setMorphWeights({})}
            onReapplyDetectedExpression={() => {
              if (model && pose2D?.expression) {
                const res = mapFacialExpressionToMorphs(model, pose2D.expression, expressionStrength);
                setMorphWeights(res.weights);
              }
            }}
          />
        )}

        {section === 'export' && (
          <ExportMMDView
            model={model}
            pose={pose}
            morphWeights={morphWeights}
            poseName={poseName}
            vmdFrameNumber={vmdFrameNumber}
            mmdConfig={mmdConfig}
            lastExportSummary={lastExportSummary}
            mappingValidation={mapping?.validationReport ?? null}
            onOpenMapping={() => setSection('mapping')}
            onPoseNameChange={setPoseName}
            onFrameNumberChange={setVmdFrameNumber}
            onExportVPD={handleExportVPD}
            onExportFullVMD={handleExportFullVMD}
            onExportFaceVMD={handleExportFaceVMD}
            onExportProject={handleExportProject}
            onExportAll={handleExportAll}
            onImportProject={handleImportProject}
            onImportVPD={handleImportVPD}
          />
        )}

        {section === 'settings' && (
          <SettingsView
            config={mmdConfig}
            hasServerGeminiKey={hasServerGeminiKey}
            onUpdateConfig={(patch) => {
              const next = { ...mmdConfig, ...patch };
              setMmdConfig(next);
              saveIntegrationConfig(next);
            }}
          />
        )}
      </main>

      {/* Bottom Action & Status Bar */}
      <footer className="h-11 shrink-0 flex items-center justify-between gap-4 px-4 bg-[#10151D] border-t border-[#222B38] text-xs">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => modelInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#18202C] hover:bg-[#212B3B] border border-[#2A3548] rounded text-slate-200 whitespace-nowrap"
          >
            <Box className="w-3.5 h-3.5 text-sky-400" />
            Import Model
          </button>
          <button
            type="button"
            onClick={() => handleAutoCorrect()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#18202C] hover:bg-[#212B3B] border border-[#2A3548] rounded text-slate-200 whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Auto Correct
          </button>
          <button
            type="button"
            onClick={handleExportVPD}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#18202C] hover:bg-[#212B3B] border border-[#2A3548] rounded text-slate-200 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            Export VPD
          </button>
          <button
            type="button"
            onClick={() => handleExportFullVMD(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#18202C] hover:bg-[#212B3B] border border-[#2A3548] rounded text-slate-200 whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            Export VMD
          </button>
        </div>

        <div className="flex items-center gap-3 min-w-0">
          {errorMessage ? (
            <span className="text-rose-300 truncate">{errorMessage}</span>
          ) : (
            <span className="text-slate-400 truncate">{statusMessage}</span>
          )}
        </div>
      </footer>
    </div>
  );
}
