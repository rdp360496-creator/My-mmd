import React from 'react';
import { FolderCheck, Cpu, ShieldCheck } from 'lucide-react';
import { COMMON_MMD_PATHS } from '../engine/projectManager';
import type { MMDIntegrationConfig } from '../engine/types';

interface SettingsViewProps {
  config: MMDIntegrationConfig;
  hasServerGeminiKey: boolean;
  onUpdateConfig: (next: Partial<MMDIntegrationConfig>) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  config,
  hasServerGeminiKey,
  onUpdateConfig,
}) => {
  return (
    <div className="h-full overflow-y-auto bg-[#0D1117] p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="pb-4 border-b border-[#222B38]">
          <h1 className="text-lg font-semibold text-white">MMD Integration & AI Engine Settings</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure MikuMikuDance Windows paths, hardware inference mode, and optional Cloud Vision AI consent
          </p>
        </div>

        {/* MMD Installation Paths */}
        <div className="bg-[#11161E] border border-[#222B38] rounded-md p-4 space-y-4">
          <div className="flex items-center gap-2">
            <FolderCheck className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-semibold text-white">MikuMikuDance Installation</h2>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mmd-exe-path" className="block text-xs font-medium text-slate-300">
              MikuMikuDance Executable Path
            </label>
            <input
              id="mmd-exe-path"
              type="text"
              value={config.mmdExePath}
              onChange={(e) => onUpdateConfig({ mmdExePath: e.target.value })}
              className="w-full px-3 py-1.5 text-xs font-mono bg-[#0B0F14] border border-[#2A3548] rounded text-slate-100"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {COMMON_MMD_PATHS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onUpdateConfig({ mmdExePath: p })}
                  className="px-2 py-1 text-[11px] font-mono bg-[#161D28] hover:bg-[#1E2836] border border-[#273244] rounded text-slate-300"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mmd-export-dir" className="block text-xs font-medium text-slate-300">
              Remembered Export Directory
            </label>
            <input
              id="mmd-export-dir"
              type="text"
              value={config.exportDirectory}
              onChange={(e) => onUpdateConfig({ exportDirectory: e.target.value })}
              className="w-full px-3 py-1.5 text-xs font-mono bg-[#0B0F14] border border-[#2A3548] rounded text-slate-100"
            />
          </div>
        </div>

        {/* AI Inference & Privacy */}
        <div className="bg-[#11161E] border border-[#222B38] rounded-md p-4 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-semibold text-white">AI Reference Analysis & Privacy</h2>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={config.cloudVisionConsent}
              onChange={(e) => onUpdateConfig({ cloudVisionConsent: e.target.checked })}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium block">
                Allow Cloud Vision AI analysis for complex photos & stylized illustrations
              </span>
              <span className="text-slate-400 block mt-0.5">
                When disabled, all reference images remain strictly local in your browser. When enabled, clicking Analyze Reference can send the image to the server-side Gemini Vision route ({hasServerGeminiKey ? 'API key configured' : 'API key not set'}).
              </span>
            </span>
          </label>
        </div>

        {/* Hardware & Performance */}
        <div className="bg-[#11161E] border border-[#222B38] rounded-md p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-semibold text-white">Hardware & Inference Profile</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="hw-profile" className="block text-xs font-medium text-slate-300">
                Compute Backend
              </label>
              <select
                id="hw-profile"
                value={config.hardwareProfile}
                onChange={(e) =>
                  onUpdateConfig({
                    hardwareProfile: e.target.value as MMDIntegrationConfig['hardwareProfile'],
                  })
                }
                className="w-full px-3 py-1.5 text-xs bg-[#0B0F14] border border-[#2A3548] rounded text-slate-100"
              >
                <option value="auto-webgl">Auto-Detect (WebGL / GPU + CPU Fallback)</option>
                <option value="cpu-safe">Low-VRAM / CPU Safe Mode</option>
                <option value="cuda-local-service">Local Python CUDA Service (Desktop)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="inf-quality" className="block text-xs font-medium text-slate-300">
                Reconstruction Quality
              </label>
              <select
                id="inf-quality"
                value={config.inferenceQuality}
                onChange={(e) =>
                  onUpdateConfig({
                    inferenceQuality: e.target.value as MMDIntegrationConfig['inferenceQuality'],
                  })
                }
                className="w-full px-3 py-1.5 text-xs bg-[#0B0F14] border border-[#2A3548] rounded text-slate-100"
              >
                <option value="fast">Fast (Real-Time Interactive)</option>
                <option value="balanced">Balanced (Recommended)</option>
                <option value="high">High Precision (Multi-Pass IK & Depth)</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
