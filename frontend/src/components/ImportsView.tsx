import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  History, 
  UploadCloud, 
  AlertOctagon, 
  CheckCircle,
  HelpCircle
} from 'lucide-react';

interface ImportLog {
  id: string;
  filename: string;
  importType: 'employees' | 'orders';
  importedByName: string;
  status: 'success' | 'failed' | 'partial';
  totalRows: number;
  successRows: number;
  errorRows: number;
  errorsLog: string[] | null;
  createdAt: string;
}

interface ImportsViewProps {
  token: string;
}

export default function ImportsView({ token }: ImportsViewProps) {
  const [importType, setImportType] = useState<'employees' | 'orders'>('orders');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [importHistory, setImportHistory] = useState<ImportLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Result of current upload
  const [uploadResult, setUploadResult] = useState<{
    status: 'success' | 'failed' | 'partial';
    totalRows: number;
    successRows: number;
    errorRows: number;
    errorsLog: string[];
  } | null>(null);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    fetchHistory();
  }, [token]);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/imports/history', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setImportHistory(data);
    } catch (err) {
      console.error('Błąd pobierania historii importów:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setUploadError('');
      setUploadResult(null);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError('');
    setUploadResult(null);

    if (!selectedFile) {
      setUploadError('Wybierz plik Excel (.xlsx) przed rozpoczęciem importu.');
      return;
    }

    setIsUploading(true);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const url = importType === 'employees' ? '/api/imports/employees' : '/api/imports/orders';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Błąd importowania pliku.');
      }

      setUploadResult(data);
      setSelectedFile(null);
      
      // Reset file input element
      const fileInput = document.getElementById('file-upload-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      fetchHistory();
    } catch (err: any) {
      setUploadError(err.message || 'Wystąpił błąd podczas wysyłania pliku.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const url = importType === 'employees' ? '/api/imports/template/employees' : '/api/imports/template/orders';
    
    // Create an anchor and click it to download file
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', importType === 'employees' ? 'szablon_pracownicy.xlsx' : 'szablon_zlecen.xlsx');
    // Attach JWT token in URL query if we had authorization, but wait: since templates are downloadable, let's pass token as query parameter or headers.
    // Wait, let's fetch it or just request using a fetch with Authorization headers and convert to blob! That is extremely robust and bypasses login locks.
    fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
      if (!res.ok) throw new Error();
      return res.blob();
    })
    .then(blob => {
      const blobUrl = window.URL.createObjectURL(blob);
      link.href = blobUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    })
    .catch(() => alert('Nie udało się pobrać szablonu.'));
  };

  return (
    <div>
      {/* Tytuł */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', flexShrink: 0 }}>
        <FileSpreadsheet size={28} />
        <h2 style={{ fontFamily: 'var(--font-header)', fontSize: '1.8rem', margin: 0 }}>
          Import danych z plików Excel
        </h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Left Card: Upload Form */}
        <div className="card">
          <h3 className="card-title">Kreator Importu</h3>
          
          <form onSubmit={handleUploadSubmit}>
            <div className="form-group">
              <label className="form-label">Typ importowanych danych</label>
              <div style={{ display: 'flex', gap: '1.5rem', margin: '0.5rem 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600 }}>
                  <input
                    type="radio"
                    name="importType"
                    checked={importType === 'orders'}
                    onChange={() => {
                      setImportType('orders');
                      setSelectedFile(null);
                      setUploadResult(null);
                      setUploadError('');
                    }}
                    style={{ width: '18px', height: '18px' }}
                  />
                  Zlecenia produkcyjne
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600 }}>
                  <input
                    type="radio"
                    name="importType"
                    checked={importType === 'employees'}
                    onChange={() => {
                      setImportType('employees');
                      setSelectedFile(null);
                      setUploadResult(null);
                      setUploadError('');
                    }}
                    style={{ width: '18px', height: '18px' }}
                  />
                  Pracownicy warsztatu
                </label>
              </div>
            </div>

            <div style={{ margin: '1.25rem 0' }}>
              <button 
                type="button" 
                className="btn btn-secondary btn-sm" 
                onClick={handleDownloadTemplate}
                style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
              >
                <Download size={14} />
                Pobierz oficjalny szablon Excel (.xlsx)
              </button>
            </div>

            {/* Custom drag-n-drop looking area */}
            <div style={{
              border: '2px dashed var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: '2rem 1.5rem',
              textAlign: 'center',
              backgroundColor: 'var(--bg-tertiary)',
              cursor: 'pointer',
              position: 'relative',
              transition: 'border-color var(--transition-fast)'
            }}>
              <input
                id="file-upload-input"
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  cursor: 'pointer'
                }}
              />
              <UploadCloud size={40} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                {selectedFile ? selectedFile.name : 'Wybierz plik Excel z komputera'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Obsługiwane formaty: .xlsx, .xls (maks. 5MB)
              </div>
            </div>

            {uploadError && (
              <div className="alert alert-danger" style={{ marginTop: '1rem', padding: '0.75rem', fontSize: '0.85rem' }}>
                {uploadError}
              </div>
            )}

            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: '100%', marginTop: '1.25rem' }}
              disabled={isUploading || !selectedFile}
            >
              {isUploading ? 'Przetwarzanie danych...' : 'Rozpocznij import danych'}
            </button>
          </form>

          {/* Render Current Upload Statistics */}
          {uploadResult && (
            <div style={{ 
              marginTop: '1.5rem', 
              padding: '1rem', 
              borderRadius: 'var(--radius-md)',
              border: `1px solid var(--${uploadResult.status === 'success' ? 'success' : uploadResult.status === 'partial' ? 'warning' : 'danger'}-border)`,
              backgroundColor: `var(--${uploadResult.status === 'success' ? 'success' : uploadResult.status === 'partial' ? 'warning' : 'danger'}-bg)`,
              fontSize: '0.9rem'
            }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                {uploadResult.status === 'success' ? (
                  <>
                    <CheckCircle size={18} style={{ color: 'var(--success-color)' }} />
                    Import zakończony sukcesem!
                  </>
                ) : (
                  <>
                    <AlertOctagon size={18} style={{ color: `var(--${uploadResult.status === 'partial' ? 'warning' : 'danger'}-color)` }} />
                    {uploadResult.status === 'partial' ? 'Import zakończony z ostrzeżeniami' : 'Import zakończony niepowodzeniem'}
                  </>
                )}
              </h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', margin: '0.5rem 0' }}>
                <div>Wiersze w pliku: <strong>{uploadResult.totalRows}</strong></div>
                <div style={{ color: 'var(--success-color)' }}>Zaimportowane/Zaktualizowane: <strong>{uploadResult.successRows}</strong></div>
                <div style={{ color: 'var(--danger-color)' }}>Błędne (pominięte): <strong>{uploadResult.errorRows}</strong></div>
              </div>

              {uploadResult.errorsLog && Array.isArray(uploadResult.errorsLog) && uploadResult.errorsLog.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Log błędów wierszy:</div>
                  <div style={{ 
                    maxHeight: '120px', 
                    overflowY: 'auto', 
                    fontSize: '0.8rem', 
                    backgroundColor: 'var(--bg-secondary)', 
                    padding: '0.5rem', 
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    marginTop: '0.25rem',
                    fontFamily: 'monospace',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.2rem'
                  }}>
                    {uploadResult.errorsLog.map((log, i) => (
                      <div key={i} style={{ color: 'var(--danger-color)' }}>{log}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Card: History list */}
        <div className="card">
          <h3 className="card-title">
            <History size={18} />
            Historia Importów
          </h3>

          {loadingHistory ? (
            <div style={{ padding: '2rem 0', textAlign: 'center' }}>Ładowanie logów...</div>
          ) : (Array.isArray(importHistory) ? importHistory : []).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
              Brak historii importu danych.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '0.25rem' }}>
              {Array.isArray(importHistory) && importHistory.map(log => {
                const badgeClass = log.status === 'success' ? 'badge-open' : log.status === 'partial' ? 'badge-suspended' : 'badge-closed';
                const typeLabel = log.importType === 'employees' ? 'Pracownicy' : 'Zlecenia';
                return (
                  <div key={log.id} style={{ 
                    padding: '0.75rem', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: 'var(--radius-md)', 
                    backgroundColor: 'var(--bg-tertiary)',
                    fontSize: '0.85rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <span className={`badge ${badgeClass}`} style={{ fontSize: '0.65rem' }}>{log.status === 'success' ? 'Sukces' : log.status === 'partial' ? 'Ostrzeżenia' : 'Błąd'}</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{log.filename}</strong>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      <div>Typ: <strong>{typeLabel}</strong></div>
                      <div>Wiersze: <strong>{log.successRows} / {log.totalRows}</strong></div>
                      <div>Wykonał: <strong>{log.importedByName}</strong></div>
                      <div>Data: <strong>{new Date(log.createdAt).toLocaleString('pl-PL')}</strong></div>
                    </div>
                    
                    {Array.isArray(log.errorsLog) && log.errorsLog.length > 0 && (
                      <details style={{ marginTop: '0.5rem', cursor: 'pointer' }}>
                        <summary style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--danger-color)' }}>Pokaż błędy ({ log.errorsLog.length })</summary>
                        <div style={{ 
                          fontSize: '0.75rem', 
                          backgroundColor: 'var(--bg-secondary)', 
                          padding: '0.4rem', 
                          borderRadius: 'var(--radius-sm)', 
                          marginTop: '0.25rem', 
                          fontFamily: 'monospace',
                          maxHeight: '80px',
                          overflowY: 'auto'
                        }}>
                          { log.errorsLog.map((err, i) => <div key={i} style={{ color: 'var(--danger-color)' }}>{err}</div>) }
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Guide section */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 className="card-title" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <HelpCircle size={18} style={{ color: 'var(--info-color)' }} />
          Zasady Importowania Plików
        </h3>
        <ul style={{ paddingLeft: '1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.5rem' }}>
          <li>Zawsze używaj pobranego szablonu Excel. Zmiana kolejności lub nazw nagłówków kolumn może uszkodzić proces importu.</li>
          <li><strong>Detekcja duplikatów</strong>: Pracownicy są identyfikowani po Imieniu i Nazwisku, a Zlecenia po unikalnym Numerze zlecenia.</li>
          <li>W przypadku wykrycia istniejącego zlecenia system zaktualizuje jego parametry (Produkt, Konto, Budżet) i ustawi status na Otwarte.</li>
          <li>W przypadku wykrycia usuniętego wcześniej pracownika lub zlecenia, system automatycznie przywróci go do stanu aktywnego (Soft delete restore).</li>
        </ul>
      </div>
    </div>
  );
}
