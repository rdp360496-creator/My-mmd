import React, { useState } from 'react';
import { MonitorDown } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = true }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        data-testid="pwa-install-btn"
        onClick={install}
        className={
          compact
            ? 'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[#18202C] hover:bg-[#222D3D] border border-[#2A3548] text-sky-300 rounded transition-colors whitespace-nowrap shrink-0'
            : 'inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded transition-colors whitespace-nowrap'
        }
      >
        <MonitorDown className="w-3.5 h-3.5" />
        Install Web App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          data-testid="pwa-install-ios-btn"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[#18202C] hover:bg-[#222D3D] border border-[#2A3548] text-sky-300 rounded transition-colors whitespace-nowrap shrink-0"
        >
          <MonitorDown className="w-3.5 h-3.5" />
          Install App
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-sm rounded-md bg-[#11161E] border border-[#2A3548] p-5 text-xs text-slate-300 space-y-3">
              <h3 className="text-sm font-semibold text-white">Install MMD Pose AI on iPhone / iPad</h3>
              <p className="leading-relaxed">
                1. Tap the <strong className="text-white">Share</strong> button in Safari&apos;s toolbar.
                <br />
                2. Scroll down and select <strong className="text-white">Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2 rounded bg-[#1D2634] hover:bg-[#273346] text-slate-100 font-medium"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
