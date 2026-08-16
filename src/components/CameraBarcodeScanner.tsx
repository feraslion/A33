/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, Check, Search, Barcode, Flashlight, RefreshCw, AlertCircle } from 'lucide-react';
import { playScanBeep } from '../utils/barcodeService';

interface CameraBarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  isRtl: boolean;
}

export default function CameraBarcodeScanner({
  isOpen,
  onClose,
  onScan,
  isRtl
}: CameraBarcodeScannerProps) {
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setCameraActive(true);
      } else {
        setCameraError(isRtl ? 'الكاميرا غير مدعومة في هذا المتصفح' : 'Camera not supported in this browser');
      }
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setCameraError(isRtl ? 'تعذر الوصول إلى الكاميرا. يرجى إدخال الباركود يدوياً أو استخدام ماسح USB.' : 'Camera access unavailable. Please use manual entry or hardware scanner.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    playScanBeep(true);
    onScan(manualCode.trim());
    setManualCode('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4">
        
        <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-3">
          <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
            <Barcode className="w-5 h-5 text-indigo-600" />
            {isRtl ? 'الماسح الضوئي للكاميرا والباركود' : 'Barcode & Camera Scanner'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder Area */}
        <div className="relative bg-black rounded-xl overflow-hidden aspect-4/3 flex items-center justify-center border-2 border-indigo-500/50">
          {cameraActive ? (
            <video ref={videoRef} className="w-full h-full object-cover" />
          ) : (
            <div className="text-center p-4 space-y-2 text-gray-400">
              <Camera className="w-10 h-10 mx-auto text-gray-500 animate-pulse" />
              <p className="text-xs">{cameraError || (isRtl ? 'جاري تهيئة الكاميرا...' : 'Initializing camera stream...')}</p>
            </div>
          )}

          {/* Laser targeting guide line */}
          <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)] animate-pulse" />

          {/* Scanner Corner Brackets */}
          <div className="absolute inset-8 pointer-events-none border-2 border-indigo-400/60 rounded-lg" />
        </div>

        {/* Manual Barcode Input Fallback */}
        <form onSubmit={handleManualSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
              {isRtl ? 'أو أدخل رقم الباركود / SKU يدوياً:' : 'Or Enter Barcode / SKU Manually:'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                placeholder={isRtl ? 'امسح بالجهاز أو اكتب الكود...' : 'Scan with gun or type SKU...'}
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                className="flex-1 px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-mono font-bold outline-hidden focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer shadow-sm"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>

        <div className="text-[11px] text-gray-400 text-center">
          {isRtl
            ? 'نصيحة: يمكنك أيضاً استخدام قارئ الباركود اللاسلكي أو الـ USB في أي مكان بالنظام مباشرة.'
            : 'Tip: Handheld USB & Bluetooth barcode scanners are automatically captured anywhere.'}
        </div>

      </div>
    </div>
  );
}
