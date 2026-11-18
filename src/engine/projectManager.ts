import type { MMDIntegrationConfig, ProjectFile } from './types';

const PROJECT_BACKUP_KEY = 'mmd_pose_ai_autobackup_v1';
const CONFIG_STORAGE_KEY = 'mmd_pose_ai_integration_config_v1';
const MAPPING_STORAGE_KEY = 'mmd_pose_ai_bone_mappings_v1';

export const DEFAULT_MMD_CONFIG: MMDIntegrationConfig = {
  mmdExePath: 'C:\\Program Files\\MikuMikuDance\\MikuMikuDance.exe',
  exportDirectory: 'C:\\Users\\Public\\Documents\\MMD_Pose_AI\\Exports',
  autoDetectedPath: 'C:\\Program Files\\MikuMikuDance\\MikuMikuDance.exe',
  rememberDirectory: true,
  cloudVisionConsent: false,
  hardwareProfile: 'auto-webgl',
  inferenceQuality: 'balanced',
};

export const COMMON_MMD_PATHS = [
  'C:\\Program Files\\MikuMikuDance\\MikuMikuDance.exe',
  'C:\\Program Files (x86)\\MikuMikuDance\\MikuMikuDance.exe',
  'C:\\MikuMikuDance_v932x64\\MikuMikuDance.exe',
  'D:\\MMD\\MikuMikuDance\\MikuMikuDance.exe',
];

export function serializeProjectFile(project: ProjectFile): string {
  return JSON.stringify(project, null, 2);
}

export function parseProjectFile(jsonText: string): ProjectFile {
  const parsed = JSON.parse(jsonText) as ProjectFile;
  if (!parsed || parsed.schemaVersion !== '1.0.0' || !parsed.modelFileName) {
    throw new Error('Invalid .mmdpose.json project file: missing schemaVersion or modelFileName.');
  }
  return parsed;
}

export function saveProjectAutoBackup(project: ProjectFile): void {
  try {
    localStorage.setItem(PROJECT_BACKUP_KEY, JSON.stringify(project));
  } catch {
    // Ignore storage quota issues when large images are present; retry without embedded image
    try {
      const compact: ProjectFile = { ...project, referenceImageDataUrl: undefined };
      localStorage.setItem(PROJECT_BACKUP_KEY, JSON.stringify(compact));
    } catch {
      // ignore
    }
  }
}

export function loadProjectAutoBackup(): ProjectFile | null {
  try {
    const raw = localStorage.getItem(PROJECT_BACKUP_KEY);
    if (!raw) return null;
    return parseProjectFile(raw);
  } catch {
    return null;
  }
}

export function saveIntegrationConfig(config: MMDIntegrationConfig): void {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export function loadIntegrationConfig(): MMDIntegrationConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MMD_CONFIG };
    return { ...DEFAULT_MMD_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_MMD_CONFIG };
  }
}

export function saveCustomBoneMappings(
  modelKey: string,
  overrides: Record<string, number | null>
): void {
  try {
    const raw = localStorage.getItem(MAPPING_STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, Record<string, number | null>>) : {};
    map[modelKey] = overrides;
    localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function loadCustomBoneMappings(modelKey: string): Record<string, number | null> {
  try {
    const raw = localStorage.getItem(MAPPING_STORAGE_KEY);
    if (!raw) return {};
    const map = JSON.parse(raw) as Record<string, Record<string, number | null>>;
    return map[modelKey] ?? {};
  } catch {
    return {};
  }
}
