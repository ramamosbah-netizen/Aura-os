'use client';

import { type CSSProperties, useRef, useState } from 'react';

export interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
}

interface FileAttachmentZoneProps {
  label?: string;
  attachments: AttachmentItem[];
  onChange: (attachments: AttachmentItem[]) => void;
  accept?: string;
  maxFiles?: number;
}

function getAdaptiveCompressParams(): { maxDimension: number; quality: number } {
  if (typeof navigator === 'undefined') return { maxDimension: 1200, quality: 0.75 };
  if (!navigator.onLine) return { maxDimension: 800, quality: 0.55 };
  const connection = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;
  const effectiveType = connection?.effectiveType || '4g';
  if (effectiveType === '2g' || effectiveType === 'slow-2g') return { maxDimension: 800, quality: 0.55 };
  if (effectiveType === '3g') return { maxDimension: 1000, quality: 0.65 };
  return { maxDimension: 1200, quality: 0.75 };
}

async function compressImage(file: File): Promise<{ dataUrl: string; size: number }> {
  return new Promise((resolve) => {
    const { maxDimension, quality } = getAdaptiveCompressParams();
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          const base64Length = compressedDataUrl.split(',')[1]?.length || 0;
          const compressedSize = Math.round((base64Length * 3) / 4);
          resolve({ dataUrl: compressedDataUrl, size: compressedSize });
          return;
        }
        resolve({ dataUrl: e.target?.result as string, size: file.size });
      };
      img.onerror = () => resolve({ dataUrl: e.target?.result as string, size: file.size });
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function FileAttachmentZone({
  label = 'Photos & Attachments',
  attachments,
  onChange,
  accept = 'image/*,application/pdf',
  maxFiles = 5,
}: FileAttachmentZoneProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const processFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    const newItems: AttachmentItem[] = [];

    for (const file of list) {
      if (attachments.length + newItems.length >= maxFiles) break;

      if (file.type.startsWith('image/')) {
        const { dataUrl, size } = await compressImage(file);
        newItems.push({
          id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          name: file.name, // Preserve original filename
          size, // Compressed size
          type: 'image/jpeg',
          dataUrl,
        });
      } else {
        // Non-image files (PDF, DOC, XLS): preserve untouched
        newItems.push({
          id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          name: file.name,
          size: file.size,
          type: file.type,
        });
      }
    }

    if (newItems.length > 0) {
      onChange([...attachments, ...newItems]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleRemove = (id: string) => {
    onChange(attachments.filter((a) => a.id !== id));
  };

  return (
    <div style={s.container}>
      <div style={s.head}>
        <span style={s.label}>{label}</span>
        <span style={s.count}>
          {attachments.length} / {maxFiles} files
        </span>
      </div>

      <div
        style={{
          ...s.dropzone,
          borderColor: dragActive ? 'var(--accent)' : 'var(--border)',
          background: dragActive ? 'var(--accent-soft)' : 'var(--panel-2)',
        }}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          style={{ display: 'none' }}
          onChange={(e) => e.target.files && processFiles(e.target.files)}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files && processFiles(e.target.files)}
        />

        <div style={s.dropText}>
          <span style={{ fontSize: 20 }}>📷</span>
          <span>Drag & drop photos or documents here, or use:</span>
        </div>

        <div style={s.btnRow}>
          <button
            type="button"
            style={s.btn}
            onClick={() => fileInputRef.current?.click()}
            disabled={attachments.length >= maxFiles}
          >
            📁 Browse files
          </button>
          <button
            type="button"
            style={s.btnAccent}
            onClick={() => cameraInputRef.current?.click()}
            disabled={attachments.length >= maxFiles}
          >
            📸 Take photo
          </button>
        </div>
      </div>

      {attachments.length > 0 && (
        <div style={s.grid}>
          {attachments.map((item) => (
            <div key={item.id} style={s.thumbCard}>
              {item.dataUrl ? (
                <img src={item.dataUrl} alt={item.name} style={s.imgPreview} />
              ) : (
                <div style={s.fileIcon}>📄</div>
              )}
              <div style={s.thumbMeta}>
                <span style={s.fileName} title={item.name}>
                  {item.name}
                </span>
                <span style={s.fileSize}>{(item.size / 1024).toFixed(1)} KB</span>
              </div>
              <button type="button" onClick={() => handleRemove(item.id)} style={s.removeBtn} title="Remove">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
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
  count: {
    fontSize: 12,
    color: 'var(--muted)',
  } as CSSProperties,
  dropzone: {
    border: '1px dashed var(--border)',
    borderRadius: 10,
    padding: '16px 14px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    textAlign: 'center',
    transition: 'all 0.15s ease',
  } as CSSProperties,
  dropText: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    fontSize: 12.5,
    color: 'var(--muted)',
  } as CSSProperties,
  btnRow: {
    display: 'flex',
    gap: 8,
  } as CSSProperties,
  btn: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    padding: '6px 12px',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,
  btnAccent: {
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 8,
    color: 'var(--accent-ink)',
    padding: '6px 12px',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
    gap: 10,
    marginTop: 4,
  } as CSSProperties,
  thumbCard: {
    position: 'relative',
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 6,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    overflow: 'hidden',
  } as CSSProperties,
  imgPreview: {
    width: '100%',
    height: 70,
    objectFit: 'cover',
    borderRadius: 6,
  } as CSSProperties,
  fileIcon: {
    height: 70,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
  } as CSSProperties,
  thumbMeta: {
    display: 'flex',
    flexDirection: 'column',
  } as CSSProperties,
  fileName: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as CSSProperties,
  fileSize: {
    fontSize: 10,
    color: 'var(--muted)',
  } as CSSProperties,
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    background: 'rgba(0,0,0,0.6)',
    border: 'none',
    color: '#fff',
    borderRadius: '50%',
    width: 20,
    height: 20,
    fontSize: 11,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as CSSProperties,
};
