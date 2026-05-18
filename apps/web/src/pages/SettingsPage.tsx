import { Card, StatusDot, Button, PageHeader } from '@brickops/ui';
import { Smartphone, Moon, Sun, Monitor } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState, useEffect, useCallback, type CSSProperties } from 'react';

const API_BASE = 'http://localhost:3001';

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' };
const sectionTitle: CSSProperties = { fontSize: 'var(--bo-text-base)', fontWeight: 'var(--bo-weight-semibold)' as any, color: 'var(--bo-text)', marginBottom: 'var(--bo-space-3)' };
const row: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--bo-space-3)' };
const label: CSSProperties = { fontSize: 'var(--bo-text-sm)', color: 'var(--bo-text-secondary)' };
const mono: CSSProperties = { fontFamily: 'var(--bo-font-mono)', fontSize: 'var(--bo-text-sm)', color: 'var(--bo-text)', background: 'var(--bo-bg-surface)', padding: '4px 10px', borderRadius: 'var(--bo-radius-sm)' };
const qrBox: CSSProperties = { width: '200px', height: '200px', margin: '0 auto', borderRadius: 'var(--bo-radius-md)', border: '2px dashed var(--bo-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bo-text-tertiary)', fontSize: 'var(--bo-text-sm)', textAlign: 'center' };
const qrBoxActive: CSSProperties = { ...qrBox, border: '1px solid var(--bo-border)', borderStyle: 'solid' };
const themeGroup: CSSProperties = { display: 'flex', gap: 'var(--bo-space-2)' };
const themeBtn = (active: boolean): CSSProperties => ({ display: 'flex', alignItems: 'center', gap: '6px', padding: 'var(--bo-space-2) var(--bo-space-3)', borderRadius: 'var(--bo-radius-sm)', border: active ? '1px solid var(--bo-accent)' : '1px solid var(--bo-border)', background: active ? 'var(--bo-accent-bg)' : 'var(--bo-bg-raised)', color: active ? 'var(--bo-accent)' : 'var(--bo-text-secondary)', fontSize: 'var(--bo-text-sm)', cursor: 'pointer', minHeight: 'var(--bo-tap-target)' });

type ConnectionState = 'disconnected' | 'connecting' | 'open' | 'unknown';

interface WhatsAppStatus {
  connectionState: ConnectionState;
  operatorJid: string | null;
  gatewayRunning: boolean;
  qr: string | null;
}

export function SettingsPage() {
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/whatsapp/status`);
      if (res.ok) {
        const data = await res.json();
        setWaStatus(data);
      }
    } catch {
      setWaStatus({ connectionState: 'unknown', operatorJid: null, gatewayRunning: false, qr: null });
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Poll more frequently when not connected to catch QR updates
    const interval = setInterval(fetchStatus, waStatus?.connectionState === 'open' ? 10000 : 3000);
    return () => clearInterval(interval);
  }, [fetchStatus, waStatus?.connectionState]);

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      await fetch(`${API_BASE}/whatsapp/reconnect`, { method: 'POST' });
      setTimeout(fetchStatus, 2000);
      setTimeout(fetchStatus, 5000);
    } catch {
      // ignore
    } finally {
      setReconnecting(false);
    }
  };

  const connectionState = waStatus?.connectionState ?? 'unknown';
  const statusDotState = connectionState === 'open'
    ? 'connected'
    : connectionState === 'unknown'
      ? 'disconnected'
      : connectionState;

  return (
    <div style={pageStyle}>
      <PageHeader title="Settings" subtitle="Connection, providers, and appearance." />

      {/* WhatsApp Connection */}
      <div>
        <h2 style={sectionTitle}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--bo-space-2)' }}>
            <Smartphone size={18} /> WhatsApp
          </span>
        </h2>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}>
            <div style={row}>
              <span style={label}>Status</span>
              <StatusDot status={statusDotState} />
            </div>
            {connectionState !== 'open' && (
              <div style={waStatus?.qr ? qrBoxActive : qrBox}>
                {waStatus?.qr ? (
                  <QRCodeSVG value={waStatus.qr} size={180} />
                ) : (
                  <span>Waiting for QR code…</span>
                )}
              </div>
            )}
            <div style={row}>
              <span style={label}>Operator</span>
              <span style={mono}>{waStatus?.operatorJid ?? 'Not configured'}</span>
            </div>
            <Button
              variant="tonal"
              size="sm"
              fullWidth
              onClick={handleReconnect}
              disabled={reconnecting}
            >
              {reconnecting ? 'Reconnecting…' : 'Reconnect'}
            </Button>
          </div>
        </Card>
      </div>

      {/* Appearance */}
      <div>
        <h2 style={sectionTitle}>Appearance</h2>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}>
            <span style={label}>Theme</span>
            <div style={themeGroup}>
              <button style={themeBtn(theme === 'system')} onClick={() => setTheme('system')}><Monitor size={16} />System</button>
              <button style={themeBtn(theme === 'light')} onClick={() => setTheme('light')}><Sun size={16} />Light</button>
              <button style={themeBtn(theme === 'dark')} onClick={() => setTheme('dark')}><Moon size={16} />Dark</button>
            </div>
          </div>
        </Card>
      </div>

      {/* About */}
      <Card>
        <div style={{ ...row, opacity: 0.6 }}>
          <span style={label}>BrickOps</span>
          <span style={{ ...label, fontFamily: 'var(--bo-font-mono)' }}>v0.1.0-alpha</span>
        </div>
      </Card>
    </div>
  );
}
