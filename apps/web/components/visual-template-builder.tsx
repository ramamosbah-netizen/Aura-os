'use client';

import React, { useState, useRef, useEffect, type CSSProperties } from 'react';
import { 
  Type, 
  Image as ImageIcon, 
  Table, 
  Stamp, 
  Signature, 
  Move, 
  Save, 
  Eye, 
  Settings, 
  Trash2,
  Maximize2,
  Minimize2,
  FileText
} from 'lucide-react';
import jsPDF from 'jspdf';

export type ComponentType = 'header' | 'footer' | 'body' | 'signature' | 'stamp' | 'table' | 'image';

export interface TemplateElement {
  id: string;
  type: ComponentType;
  x: number;
  y: number;
  content: string;
  fontSize?: number;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  category: string;
  elements: TemplateElement[];
  status: string;
}

const DOCUMENT_CATEGORIES = [
  'Purchase Order',
  'Supplier Invoice',
  'Interim Payment Certificate',
  'Purchase Request',
  'Subcontract Agreement'
];

const AVAILABLE_VARIABLES = [
  { name: '{{ProjectName}}', desc: 'Active project title' },
  { name: '{{ProjectNumber}}', desc: 'Project unique reference' },
  { name: '{{ClientName}}', desc: 'Client account title' },
  { name: '{{SupplierName}}', desc: 'Vendor or subcontractor name' },
  { name: '{{PurchaseOrderNumber}}', desc: 'PO unique ID' },
  { name: '{{TotalAmount}}', desc: 'Total transaction value' },
  { name: '{{InvoiceNumber}}', desc: 'Vendor invoice reference' },
  { name: '{{ClaimNumber}}', desc: 'Progress claim sequence number' },
  { name: '{{WorkCompleted}}', desc: 'Completed work gross valuation' },
  { name: '{{RetentionAmount}}', desc: 'Withheld retention value' },
  { name: '{{NetCertified}}', desc: 'Net certified payable amount' },
  { name: '{{CurrentDate}}', desc: 'Generation date (YYYY-MM-DD)' },
  { name: '{{GeneratedBy}}', desc: 'Name of compiling agent' }
];

interface VisualTemplateBuilderProps {
  initialTemplate?: DocumentTemplate;
  onSave?: (template: Omit<DocumentTemplate, 'id'> & { id?: string }) => Promise<void>;
  onClose?: () => void;
}

export default function VisualTemplateBuilder({ 
  initialTemplate, 
  onSave, 
  onClose 
}: VisualTemplateBuilderProps) {
  const [elements, setElements] = useState<TemplateElement[]>(initialTemplate?.elements || []);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState<string>(initialTemplate?.name || 'New Template Layout');
  const [category, setCategory] = useState<string>(initialTemplate?.category || DOCUMENT_CATEGORIES[0]);
  const [status, setStatus] = useState<string>(initialTemplate?.status || 'draft');
  const [zoom, setZoom] = useState<number>(0.75); // Scaled for fit
  const [saveLoading, setSaveLoading] = useState<boolean>(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  // A4 sizing: 794px width x 1123px height matches A4 aspect ratio at 96 DPI
  const A4_WIDTH = 794;
  const A4_HEIGHT = 1123;

  const addElement = (type: ComponentType, contentText?: string) => {
    const newElement: TemplateElement = {
      id: Math.random().toString(36).substring(7),
      type,
      x: 60,
      y: 120,
      content: contentText || `New ${type} block`,
      fontSize: type === 'header' ? 18 : type === 'footer' ? 10 : 12
    };
    setElements([...elements, newElement]);
    setSelectedElementId(newElement.id);
  };

  const updateElement = (id: string, updates: Partial<TemplateElement>) => {
    setElements(elements.map(el => el.id === id ? { ...el, ...updates } : el));
  };

  const removeElement = (id: string) => {
    setElements(elements.filter(el => el.id !== id));
    setSelectedElementId(null);
  };

  const selectedElement = elements.find(el => el.id === selectedElementId);

  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>, elId: string) => {
    e.preventDefault();
    setSelectedElementId(elId);

    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const rect = canvasElement.getBoundingClientRect();
    const currentEl = elements.find(el => el.id === elId);
    if (!currentEl) return;

    // Calculate mouse position relative to elements left/top coordinate inside scaled canvas
    const startX = (e.clientX - rect.left) / zoom - currentEl.x;
    const startY = (e.clientY - rect.top) / zoom - currentEl.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      let newX = (moveEvent.clientX - rect.left) / zoom - startX;
      let newY = (moveEvent.clientY - rect.top) / zoom - startY;

      // Restrict boundaries
      newX = Math.max(0, Math.min(newX, A4_WIDTH - 60));
      newY = Math.max(0, Math.min(newY, A4_HEIGHT - 30));

      updateElement(elId, { x: Math.round(newX), y: Math.round(newY) });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handlePreviewPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const scale = 210 / A4_WIDTH;

    elements.forEach((el) => {
      const xMm = el.x * scale;
      const yMm = el.y * scale;

      if (el.type === 'image') {
        doc.rect(xMm, yMm, 40, 20);
        doc.setFontSize(8);
        doc.text('[Logo Placeholder]', xMm + 2, yMm + 10);
      } else if (el.type === 'table') {
        doc.rect(xMm, yMm, 150, 30);
        doc.setFontSize(8);
        doc.text('[Schedule of Items Table Grid]', xMm + 2, yMm + 15);
      } else if (el.type === 'stamp') {
        doc.rect(xMm, yMm, 22, 22);
        doc.setFontSize(8);
        doc.text('APPROVED', xMm + 3, yMm + 10);
        doc.text('AURA OS', xMm + 3, yMm + 15);
      } else {
        doc.setFontSize(el.fontSize || 12);
        let text = el.content;
        // Inject sample variables data
        text = text.replace('{{ProjectName}}', 'Al Habtoor City ELV Installation');
        text = text.replace('{{ProjectNumber}}', 'PRJ-2026-904');
        text = text.replace('{{ClientName}}', 'Al Habtoor Group');
        text = text.replace('{{SupplierName}}', 'Dubai Technical Equipment LLC');
        text = text.replace('{{PurchaseOrderNumber}}', 'PO-99104-2026');
        text = text.replace('{{TotalAmount}}', 'AED 430,750.00');
        text = text.replace('{{InvoiceNumber}}', 'INV-2026-8802');
        text = text.replace('{{ClaimNumber}}', 'CLAIM-003');
        text = text.replace('{{WorkCompleted}}', 'AED 120,000.00');
        text = text.replace('{{RetentionAmount}}', 'AED 12,000.00');
        text = text.replace('{{NetCertified}}', 'AED 108,000.00');
        text = text.replace('{{CurrentDate}}', new Date().toLocaleDateString());
        text = text.replace('{{GeneratedBy}}', 'ERP Admin Agent');

        doc.text(text, xMm, yMm + 3);
      }
    });

    doc.output('dataurlnewwindow');
  };

  const handleSaveClick = async () => {
    if (!onSave) return;
    setSaveLoading(true);
    try {
      await onSave({
        id: initialTemplate?.id,
        name: templateName,
        category,
        elements,
        status
      });
    } catch (e) {
      console.error(e);
      alert('Save operation failed.');
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div style={s.layout}>
      {/* Header bar */}
      <div style={s.toolbar}>
        <div style={s.toolbarLeft}>
          <FileText style={{ color: 'var(--accent)' }} className="w-5 h-5" />
          <span style={s.title}>{initialTemplate ? 'Edit Print Template' : 'Design Document Template'}</span>
        </div>
        <div style={s.zoomControls}>
          <button style={s.zoomBtn} onClick={() => setZoom(prev => Math.max(0.4, prev - 0.05))}>
            <Minimize2 className="w-4 h-4" />
          </button>
          <span style={s.zoomVal}>{Math.round(zoom * 100)}%</span>
          <button style={s.zoomBtn} onClick={() => setZoom(prev => Math.min(1.5, prev + 0.05))}>
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
        <div style={s.actions}>
          <button style={s.previewBtn} onClick={handlePreviewPDF}>
            <Eye className="w-4 h-4" /> Preview PDF
          </button>
          <button style={s.saveBtn} onClick={handleSaveClick} disabled={saveLoading}>
            <Save className="w-4 h-4" /> {saveLoading ? 'Saving...' : 'Save Layout'}
          </button>
          {onClose && (
            <button style={s.closeBtn} onClick={onClose}>
              Cancel
            </button>
          )}
        </div>
      </div>

      <div style={s.workspace}>
        {/* Left Side: Elements and Variables */}
        <div style={s.sidebar}>
          <div style={s.sectionHeader}>Toolbox Elements</div>
          <div style={s.toolboxGrid}>
            <button style={s.toolBtn} onClick={() => addElement('header', 'DOCUMENT HEADING')}>
              <Type className="w-4 h-4" /> Heading
            </button>
            <button style={s.toolBtn} onClick={() => addElement('body', 'Normal description text body.')}>
              <Type className="w-4 h-4" /> Text Body
            </button>
            <button style={s.toolBtn} onClick={() => addElement('footer', 'Footer details · Page 1 of 1')}>
              <Type className="w-4 h-4" /> Footer
            </button>
            <button style={s.toolBtn} onClick={() => addElement('table', 'ITEMS_TABLE')}>
              <Table className="w-4 h-4" /> Item Grid
            </button>
            <button style={s.toolBtn} onClick={() => addElement('image', 'LOGO')}>
              <ImageIcon className="w-4 h-4" /> Logo Box
            </button>
            <button style={s.toolBtn} onClick={() => addElement('stamp', 'APPROVED STAMP')}>
              <Stamp className="w-4 h-4" /> Stamp Box
            </button>
            <button style={s.toolBtn} onClick={() => addElement('signature', 'Authorized Signatory')}>
              <Signature className="w-4 h-4" /> Signature
            </button>
          </div>

          <div style={{ ...s.sectionHeader, marginTop: 24 }}>Document Data Variables</div>
          <div style={s.varContainer}>
            {AVAILABLE_VARIABLES.map(v => (
              <div 
                key={v.name} 
                style={s.varCard} 
                onClick={() => addElement('body', v.name)}
                title={`Click to add variable: ${v.desc}`}
              >
                <div style={s.varName}>{v.name}</div>
                <div style={s.varDesc}>{v.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Center: Scrollable A4 Sheet View */}
        <div style={s.canvasContainer}>
          <div 
            ref={canvasRef}
            style={{
              ...s.canvas,
              width: A4_WIDTH,
              height: A4_HEIGHT,
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
            }}
          >
            {elements.map(el => {
              const isSelected = el.id === selectedElementId;
              return (
                <div
                  key={el.id}
                  onMouseDown={(e) => handleDragStart(e, el.id)}
                  style={{
                    ...s.canvasElement,
                    left: el.x,
                    top: el.y,
                    fontSize: el.fontSize || 12,
                    borderColor: isSelected ? 'var(--accent)' : 'transparent',
                    boxShadow: isSelected ? '0 0 0 2px rgba(91, 140, 255, 0.4)' : 'none',
                    fontWeight: el.type === 'header' ? 'bold' : 'normal',
                  }}
                >
                  <div style={s.dragHandle}>
                    <Move className="w-3 h-3 text-slate-400" />
                  </div>
                  {el.type === 'image' && (
                    <div style={s.elPlaceholder}>
                      <ImageIcon className="w-5 h-5 text-slate-400" />
                      <span style={{ fontSize: 9 }}>[Logo Image Box]</span>
                    </div>
                  )}
                  {el.type === 'table' && (
                    <div style={{ ...s.elPlaceholder, minWidth: 200, height: 60 }}>
                      <Table className="w-5 h-5 text-slate-400" />
                      <span style={{ fontSize: 9 }}>[Itemized Data Table Grid]</span>
                    </div>
                  )}
                  {el.type === 'stamp' && (
                    <div style={{ ...s.elPlaceholder, width: 80, height: 80 }}>
                      <Stamp className="w-6 h-6 text-emerald-600" />
                      <span style={{ fontSize: 9, color: 'var(--good)' }}>[STAMP]</span>
                    </div>
                  )}
                  {el.type !== 'image' && el.type !== 'table' && el.type !== 'stamp' && (
                    <div style={{ whiteSpace: 'nowrap' }}>{el.content}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Properties & Global parameters */}
        <div style={s.sidebar}>
          <div style={s.sectionHeader}>Template Details</div>
          <div style={s.formGroup}>
            <label style={s.label}>Template Name</label>
            <input 
              type="text" 
              style={s.input} 
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Apply Category</label>
            <select 
              style={s.select}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {DOCUMENT_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Status</label>
            <select 
              style={s.select}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div style={{ ...s.sectionHeader, marginTop: 32 }}>Element Properties</div>
          {selectedElement ? (
            <div style={s.properties}>
              <div style={s.formGroup}>
                <label style={s.label}>Content Text</label>
                <textarea 
                  style={s.textarea} 
                  rows={3}
                  value={selectedElement.content}
                  onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })}
                />
              </div>
              <div style={s.formRow}>
                <div style={s.formGroup}>
                  <label style={s.label}>Font Size (px)</label>
                  <input 
                    type="number" 
                    style={s.input}
                    value={selectedElement.fontSize || 12}
                    onChange={(e) => updateElement(selectedElement.id, { fontSize: Number(e.target.value) || 12 })}
                  />
                </div>
              </div>
              <div style={s.coordText}>
                X: {selectedElement.x}px · Y: {selectedElement.y}px
              </div>
              <button 
                style={s.deleteBtn}
                onClick={() => removeElement(selectedElement.id)}
              >
                <Trash2 className="w-4 h-4" /> Delete Element
              </button>
            </div>
          ) : (
            <div style={s.hint}>Select an element on the A4 page canvas to customize properties.</div>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  layout: {
    display: 'flex',
    flexDirection: 'column',
    height: '92vh',
    background: 'var(--bg)',
    color: 'var(--text)',
    overflow: 'hidden',
  } as CSSProperties,
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    background: 'var(--panel)',
    borderBottom: '1px solid var(--border)',
    zIndex: 10,
  } as CSSProperties,
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  } as CSSProperties,
  title: {
    fontSize: 16,
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as CSSProperties,
  zoomControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'var(--panel-2)',
    padding: '4px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
  } as CSSProperties,
  zoomBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  } as CSSProperties,
  zoomVal: {
    fontSize: 12,
    fontMono: 'true',
    fontWeight: 600,
    width: 40,
    textAlign: 'center',
  } as CSSProperties,
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  } as CSSProperties,
  previewBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text)',
    cursor: 'pointer',
  } as CSSProperties,
  saveBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'var(--accent)',
    border: 'none',
    padding: '8px 16px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    color: '#0b0e14',
    cursor: 'pointer',
  } as CSSProperties,
  closeBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--muted)',
    cursor: 'pointer',
  } as CSSProperties,
  workspace: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  } as CSSProperties,
  sidebar: {
    width: 320,
    background: 'var(--panel)',
    borderRight: '1px solid var(--border)',
    borderLeft: '1px solid var(--border)',
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
  } as CSSProperties,
  sectionHeader: {
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: 800,
    color: 'var(--muted)',
    letterSpacing: 1,
    marginBottom: 12,
    borderBottom: '1px solid var(--border)',
    paddingBottom: 6,
  } as CSSProperties,
  toolboxGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
  } as CSSProperties,
  toolBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    padding: '10px 12px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text)',
    cursor: 'pointer',
    textAlign: 'left',
  } as CSSProperties,
  varContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: 300,
    overflowY: 'auto',
  } as CSSProperties,
  varCard: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    padding: '8px 12px',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as CSSProperties,
  varName: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: 'var(--accent)',
    fontWeight: 700,
  } as CSSProperties,
  varDesc: {
    fontSize: 10,
    color: 'var(--muted)',
    marginTop: 2,
  } as CSSProperties,
  canvasContainer: {
    flex: 1,
    background: '#090b10',
    padding: 40,
    overflow: 'auto',
    display: 'flex',
    justifyContent: 'center',
  } as CSSProperties,
  canvas: {
    background: '#ffffff',
    color: '#000000',
    position: 'relative',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    border: '1px solid #d1d5db',
  } as CSSProperties,
  canvasElement: {
    position: 'absolute',
    border: '1px dashed #9ca3af',
    padding: '4px 8px',
    cursor: 'move',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    userSelect: 'none',
    backgroundColor: 'rgba(243, 244, 246, 0.85)',
    borderRadius: 4,
  } as CSSProperties,
  dragHandle: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'move',
  } as CSSProperties,
  elPlaceholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    color: '#4b5563',
    padding: '4px 8px',
  } as CSSProperties,
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 16,
  } as CSSProperties,
  formRow: {
    display: 'flex',
    gap: 12,
  } as CSSProperties,
  label: {
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: 700,
    color: 'var(--muted)',
  } as CSSProperties,
  input: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 12px',
    color: 'var(--text)',
    fontSize: 13,
    outline: 'none',
  } as CSSProperties,
  select: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 12px',
    color: 'var(--text)',
    fontSize: 13,
    outline: 'none',
  } as CSSProperties,
  textarea: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 12px',
    color: 'var(--text)',
    fontSize: 13,
    outline: 'none',
    resize: 'vertical',
  } as CSSProperties,
  properties: {
    display: 'flex',
    flexDirection: 'column',
  } as CSSProperties,
  coordText: {
    fontSize: 11,
    color: 'var(--muted)',
    fontFamily: 'monospace',
    marginBottom: 16,
  } as CSSProperties,
  deleteBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    background: 'rgba(255, 107, 107, 0.1)',
    border: '1px solid rgba(255, 107, 107, 0.3)',
    borderRadius: 8,
    padding: '10px',
    color: 'var(--bad)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,
  hint: {
    fontSize: 12,
    color: 'var(--muted)',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '20px 0',
  } as CSSProperties,
};
