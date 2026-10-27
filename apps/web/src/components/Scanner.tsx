import { Camera, Keyboard } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Input, Modal } from '@/components/ui';

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

/**
 * Camera barcode/QR scanner. Uses the native BarcodeDetector where the
 * browser has it (Chrome, Android) and falls back to ZXing elsewhere.
 * A typed-in code is always available as a fallback.
 */
export function ScannerModal({
  open,
  onClose,
  onScan,
  title = 'Scan barcode',
  hint = 'Point the camera at the product barcode',
  manualPlaceholder = 'Or type the barcode number',
}: {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  title?: string;
  hint?: string;
  manualPlaceholder?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);
  // Keep the latest callback without restarting the camera when the parent re-renders.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!open) return;
    handled.current = false;
    setError(null);
    let stopped = false;
    let stream: MediaStream | null = null;
    let zxingControls: { stop: () => void } | null = null;
    let frame = 0;

    const emit = (code: string) => {
      if (handled.current || stopped) return;
      handled.current = true;
      onScanRef.current(code.trim());
    };

    (async () => {
      try {
        if (window.BarcodeDetector) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (stopped || !videoRef.current) return;
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          const detector = new window.BarcodeDetector({ formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'upc_a'] });
          const tick = async () => {
            if (stopped || !videoRef.current) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes[0]) return emit(codes[0].rawValue);
            } catch {
              // keep trying on the next frame
            }
            frame = requestAnimationFrame(() => void tick());
          };
          void tick();
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const reader = new BrowserMultiFormatReader();
          if (stopped || !videoRef.current) return;
          zxingControls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
            if (result) emit(result.getText());
          });
        }
      } catch {
        setError('Camera is not available. Allow camera access or type the code below.');
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      zxingControls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={title} description={hint}>
      <div className="relative overflow-hidden rounded-2xl bg-slate-900">
        <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/70" />
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/90 p-6 text-center text-sm text-white">
            <Camera className="size-8 opacity-70" />
            {error}
          </div>
        )}
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (manual.trim()) {
            onScan(manual.trim());
            setManual('');
          }
        }}
      >
        <div className="relative flex-1">
          <Keyboard className="absolute top-2.5 left-3 size-5 text-slate-400" />
          <Input
            className="pl-10"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder={manualPlaceholder}
            autoFocus={Boolean(error)}
          />
        </div>
        <Button type="submit">Add</Button>
      </form>
    </Modal>
  );
}
