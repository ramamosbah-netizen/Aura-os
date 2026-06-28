'use client';

import React, { useState, useEffect, type CSSProperties } from 'react';
import VisualTemplateBuilder, { type DocumentTemplate } from '../../../components/visual-template-builder';
import { FileText, Plus, Trash2, Edit3, ArrowLeft, RefreshCw } from 'lucide-react';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTemplate, setActiveTemplate] = useState<DocumentTemplate | null>(null);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);

  // Form states for new template
  const [newName, setNewName] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('Purchase Order');

  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/templates');
      if (!res.ok) throw new Error('Failed to load templates.');
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message || 'API is offline or unreachable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          category: newCategory,
          elements: []
        })
      });
      if (!res.ok) throw new Error('Failed to create template');
      const created = await res.json();
      setTemplates([created, ...templates]);
      setActiveTemplate(created);
      setShowCreateModal(false);
      setNewName('');
    } catch (err: any) {
      alert(err.message || 'Failed to save template.');
    }
  };

  const handleSaveTemplate = async (updated: Omit<DocumentTemplate, 'id'> & { id?: string }) => {
    if (!updated.id) return;
    try {
      const res = await fetch(`/api/templates/${updated.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: updated.name,
          category: updated.category,
          elements: updated.elements,
          status: updated.status
        })
      });
      if (!res.ok) throw new Error('Failed to save layout');
      const saved = await res.json();
      
      // Update in local state list
      setTemplates(templates.map(t => t.id === saved.id ? saved : t));
      setActiveTemplate(null);
      alert('Template layout updated successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to update template.');
    }
  };

  const handleDeleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete template');
      setTemplates(templates.filter(t => t.id !== id));
      if (activeTemplate?.id === id) {
        setActiveTemplate(null);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete template.');
    }
  };

  if (activeTemplate) {
    return (
      <div style={st.fullscreenContainer}>
        <VisualTemplateBuilder 
          initialTemplate={activeTemplate} 
          onSave={handleSaveTemplate}
          onClose={() => setActiveTemplate(null)}
        />
      </div>
    );
  }

  return (
    <div style={st.page}>
      <div style={st.header}>
        <div>
          <h1 style={st.h1}>Platform · Document Templates</h1>
          <p style={st.sub}>
            Create and edit print layouts for purchase orders, supplier invoices, subcontract agreements, and progress claim certificates.
          </p>
        </div>
        <button style={st.createBtn} onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4" /> Create Template
        </button>
      </div>

      {loading ? (
        <div style={st.loading}>
          <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
          <span>Fetching templates...</span>
        </div>
      ) : error ? (
        <div style={st.errorBox}>
          <p style={{ margin: '0 0 10px', color: 'var(--bad)' }}>Error: {error}</p>
          <button style={st.retryBtn} onClick={fetchTemplates}>Retry</button>
        </div>
      ) : templates.length === 0 ? (
        <div style={st.emptyState}>
          <FileText className="w-12 h-12 text-slate-500 mb-4" />
          <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>No Templates Found</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 20px' }}>
            Get started by creating a visual layout from scratch.
          </p>
          <button style={st.createBtn} onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4" /> Create First Template
          </button>
        </div>
      ) : (
        <div style={st.grid}>
          {templates.map(t => (
            <div key={t.id} style={st.card} onClick={() => setActiveTemplate(t)}>
              <div style={st.cardHeader}>
                <div style={st.catBadge}>{t.category}</div>
                <div style={{
                  ...st.statusBadge,
                  background: t.status === 'active' ? 'rgba(62, 207, 142, 0.1)' : 'rgba(138, 147, 166, 0.1)',
                  color: t.status === 'active' ? 'var(--good)' : 'var(--muted)'
                }}>
                  {t.status}
                </div>
              </div>
              <div style={st.cardTitle}>{t.name}</div>
              <div style={st.cardSub}>{t.elements?.length || 0} layout elements defined</div>
              <div style={st.cardActions}>
                <button style={st.actionBtn} onClick={() => setActiveTemplate(t)}>
                  <Edit3 className="w-3.5 h-3.5" /> Edit
                </button>
                <button style={st.deleteActionBtn} onClick={(e) => handleDeleteTemplate(t.id, e)}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div style={st.modalOverlay}>
          <div style={st.modal}>
            <div style={st.modalHeader}>
              <h2 style={st.modalTitle}>New Document Template</h2>
            </div>
            <form onSubmit={handleCreateTemplate}>
              <div style={st.formGroup}>
                <label style={st.label}>Template Name</label>
                <input 
                  type="text" 
                  style={st.input} 
                  required
                  placeholder="e.g. Standard PO Layout"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div style={st.formGroup}>
                <label style={st.label}>Apply Category</label>
                <select 
                  style={st.select} 
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                >
                  <option value="Purchase Order">Purchase Order</option>
                  <option value="Supplier Invoice">Supplier Invoice</option>
                  <option value="Interim Payment Certificate">Interim Payment Certificate</option>
                  <option value="Purchase Request">Purchase Request</option>
                  <option value="Subcontract Agreement">Subcontract Agreement</option>
                </select>
              </div>
              <div style={st.modalFooter}>
                <button 
                  type="button" 
                  style={st.cancelBtn} 
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" style={st.submitBtn}>
                  Create & Open
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  fullscreenContainer: {
    margin: '-24px -24px -64px',
    height: '92vh',
  } as CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: 0, maxWidth: 680, lineHeight: 1.5 } as CSSProperties,
  createBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'var(--accent)',
    border: 'none',
    padding: '10px 18px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    color: '#0b0e14',
    cursor: 'pointer',
  } as CSSProperties,
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '80px 0',
    color: 'var(--muted)',
    fontSize: 14,
  } as CSSProperties,
  errorBox: {
    background: 'rgba(255, 107, 107, 0.1)',
    border: '1px solid rgba(255, 107, 107, 0.2)',
    borderRadius: 12,
    padding: 24,
    textAlign: 'center',
  } as CSSProperties,
  retryBtn: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 16px',
    color: 'var(--text)',
    cursor: 'pointer',
  } as CSSProperties,
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px dashed var(--border)',
    borderRadius: 14,
    padding: '60px 24px',
    textAlign: 'center',
    background: 'var(--panel)',
  } as CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 20,
  } as CSSProperties,
  card: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 20,
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  } as CSSProperties,
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as CSSProperties,
  catBadge: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--accent)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as CSSProperties,
  statusBadge: {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 99,
    textTransform: 'uppercase',
  } as CSSProperties,
  cardTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: 'var(--text)',
  } as CSSProperties,
  cardSub: {
    fontSize: 12,
    color: 'var(--muted)',
  } as CSSProperties,
  cardActions: {
    display: 'flex',
    gap: 8,
    marginTop: 8,
    borderTop: '1px solid var(--border)',
    paddingTop: 12,
  } as CSSProperties,
  actionBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '6px 0',
    color: 'var(--text)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,
  deleteActionBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    background: 'rgba(255, 107, 107, 0.05)',
    border: '1px solid rgba(255, 107, 107, 0.2)',
    borderRadius: 6,
    padding: '6px 0',
    color: 'var(--bad)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.65)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as CSSProperties,
  modal: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
  } as CSSProperties,
  modalHeader: {
    marginBottom: 20,
  } as CSSProperties,
  modalTitle: {
    fontSize: 18,
    fontWeight: 900,
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as CSSProperties,
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 16,
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
    padding: '10px 12px',
    color: 'var(--text)',
    fontSize: 13,
    outline: 'none',
  } as CSSProperties,
  select: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 12px',
    color: 'var(--text)',
    fontSize: 13,
    outline: 'none',
  } as CSSProperties,
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 24,
  } as CSSProperties,
  cancelBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 16px',
    color: 'var(--muted)',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
  } as CSSProperties,
  submitBtn: {
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    color: '#0b0e14',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  } as CSSProperties,
};
