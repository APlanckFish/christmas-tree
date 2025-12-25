import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface QRCodeGeneratorProps {
  url: string;
  size?: number;
  margin?: number;
  backgroundColor?: string;
  foregroundColor?: string;
  className?: string;
}

export function QRCodeGenerator({ 
  url, 
  size = 256, 
  margin = 2,
  backgroundColor = '#ffffff',
  foregroundColor = '#000000',
  className = ''
}: QRCodeGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const generateQRCode = async () => {
      if (!canvasRef.current) return;
      
      try {
        await QRCode.toCanvas(canvasRef.current, url, {
          errorCorrectionLevel: 'H',
          margin,
          width: size,
          color: {
            dark: foregroundColor,
            light: backgroundColor
          }
        });
      } catch (error) {
        console.error('Failed to generate QR code:', error);
      }
    };

    generateQRCode();
  }, [url, size, margin, backgroundColor, foregroundColor]);

  return (
    <div className={`qrcode-container ${className}`}>
      <canvas ref={canvasRef} className="qrcode-canvas" />
    </div>
  );
}
