'use client';

import { type CSSProperties, useEffect, useRef, useState } from 'react';

interface SignatureCanvasProps {
  label?: string;
  value?: string | null;
  onChange: (base64DataUrl: string | null) => void;
  width?: number;
  height?: number;
}

export default function SignatureCanvas({
  label = 'Digital Signature',
  value,
  onChange,
  width = 460,
  height = 140,
}: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(!value);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#f5a623'; // Amber brand accent
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        setIsEmpty(false);
      };
      img.src = value;
    }
  }, [value]);

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    const mouseEvent = e as React.MouseEvent<HTMLCanvasElement>;
    return {
      x: mouseEvent.clientX - rect.left,
      y: mouseEvent.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setIsEmpty(false);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas && !isEmpty) {
      onChange(canvas.toDataURL('image/png'));
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    onChange(null);
  };

  return (
    <div style={s.container}>
      <div style={s.head}>
        <span style={s.label}>{label}</span>
        {!isEmpty && (
          <button type="button" onClick={handleClear} style={s.clearBtn}>
            ✕ Clear Signature
          </button>
        )}
      </div>
      <div style={s.canvasWrap}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={s.canvas}
        />
        {isEmpty && <div style={s.placeholder}>Sign here with mouse or touch</div>}
      </div>
    </div>
  );
}

const s = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    width: '100%',
  } as CSSProperties,
  head: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as CSSProperties,
  label: {
    fontSize: 12.5,
    fontWeight: 600,
    color: 'var(--text)',
  } as CSSProperties,
  clearBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--bad)',
    fontSize: 12,
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: 4,
  } as CSSProperties,
  canvasWrap: {
    position: 'relative',
    border: '1px dashed var(--border-strong)',
    borderRadius: 10,
    background: 'var(--panel-2)',
    overflow: 'hidden',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  } as CSSProperties,
  canvas: {
    width: '100%',
    height: 140,
    cursor: 'crosshair',
    touchAction: 'none',
  } as CSSProperties,
  placeholder: {
    position: 'absolute',
    pointerEvents: 'none',
    color: 'var(--muted)',
    fontSize: 13,
    opacity: 0.5,
  } as CSSProperties,
};
