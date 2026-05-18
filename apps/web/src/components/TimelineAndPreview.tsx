import { type CSSProperties } from 'react';
import { Timeline, Button } from '@brickops/ui';
import type { TimelineEntry } from '@brickops/ui';
import { Activity, FileCode, TestTube, Play, CheckCircle2, XCircle, FlaskConical } from 'lucide-react';

const panel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
};

const tabBar: CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--bo-border)',
  flexShrink: 0,
};

const tabStyle = (active: boolean): CSSProperties => ({
  flex: 1,
  padding: 'var(--bo-space-2) var(--bo-space-2)',
  fontSize: 'var(--bo-text-xs)',
  fontWeight: active ? 600 : 400,
  color: active ? 'var(--bo-accent)' : 'var(--bo-text-secondary)',
  background: 'none', border: 'none',
  borderBottom: `2px solid ${active ? 'var(--bo-accent)' : 'transparent'}`,
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
});

const content: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: 'var(--bo-space-3)',
};

const fileChangeItem: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: 'var(--bo-space-1) 0',
  fontSize: 'var(--bo-text-xs)',
  fontFamily: 'var(--bo-font-mono)',
};

interface ChangedFile {
  path: string;
  action: 'written' | 'diff' | 'read' | 'deleted';
  timestamp: number;
}

interface TestResult {
  passed: number;
  failed: number;
  total: number;
}

interface TimelineAndPreviewProps {
  activeTab: 'timeline' | 'files' | 'tests';
  onTabChange: (tab: 'timeline' | 'files' | 'tests') => void;
  timelineEntries: TimelineEntry[];
  changedFiles: ChangedFile[];
  testResults: TestResult | null;
  previewRunning: boolean;
  previewUrl: string | null;
  onStartPreview: () => void;
  onFileClick: (path: string) => void;
}

export function TimelineAndPreview({
  activeTab, onTabChange, timelineEntries, changedFiles,
  testResults, previewRunning, previewUrl, onStartPreview, onFileClick,
}: TimelineAndPreviewProps) {
  return (
    <div style={panel}>
      <div style={tabBar}>
        <button style={tabStyle(activeTab === 'timeline')} onClick={() => onTabChange('timeline')}>
          <Activity size={12} /> Timeline
        </button>
        <button style={tabStyle(activeTab === 'files')} onClick={() => onTabChange('files')}>
          <FileCode size={12} /> Changes
        </button>
        <button style={tabStyle(activeTab === 'tests')} onClick={() => onTabChange('tests')}>
          <TestTube size={12} /> Preview
        </button>
      </div>
      <div style={content}>
        {activeTab === 'timeline' && (
          timelineEntries.length === 0 ? (
            <div style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-tertiary)', textAlign: 'center', paddingTop: 'var(--bo-space-4)' }}>
              No events yet. Send a message to start.
            </div>
          ) : (
            <Timeline entries={timelineEntries} />
          )
        )}
        {activeTab === 'files' && (
          changedFiles.length === 0 ? (
            <div style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-tertiary)', textAlign: 'center', paddingTop: 'var(--bo-space-4)' }}>
              No file changes detected.
            </div>
          ) : (
            changedFiles.map((f, i) => (
              <div key={`${f.path}-${i}`} style={fileChangeItem}>
                <span
                  style={{ color: f.action === 'written' ? 'var(--bo-success)' : f.action === 'diff' ? 'var(--bo-accent)' : 'var(--bo-text-tertiary)', cursor: 'pointer' }}
                  onClick={() => onFileClick(f.path)}
                  title="Open in editor"
                >
                  {f.action === 'written' ? '+' : f.action === 'diff' ? '~' : '>'}
                </span>
                <span
                  style={{ fontFamily: 'var(--bo-font-mono)', fontSize: 'var(--bo-text-xs)', cursor: 'pointer' }}
                  onClick={() => onFileClick(f.path)}
                >
                  {f.path}
                </span>
              </div>
            ))
          )
        )}
        {activeTab === 'tests' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}>
            {testResults && (
              <div style={{ background: 'var(--bo-bg-raised)', borderRadius: 'var(--bo-radius-md)', padding: 'var(--bo-space-3)' }}>
                <div style={{ fontSize: 'var(--bo-text-sm)', fontWeight: 600, color: 'var(--bo-text)', marginBottom: 'var(--bo-space-2)' }}>
                  Test Results
                </div>
                <div style={{ display: 'flex', gap: 'var(--bo-space-3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--bo-text-sm)', color: 'var(--bo-success)' }}>
                    <CheckCircle2 size={14} /> {testResults.passed} passed
                  </div>
                  {testResults.failed > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--bo-text-sm)', color: 'var(--bo-error)' }}>
                      <XCircle size={14} /> {testResults.failed} failed
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-tertiary)' }}>
                    <FlaskConical size={12} /> {testResults.total} total
                  </div>
                </div>
              </div>
            )}

            {previewRunning && previewUrl ? (
              <div>
                <div style={{ fontSize: 'var(--bo-text-sm)', fontWeight: 600, color: 'var(--bo-text)', marginBottom: 'var(--bo-space-2)' }}>
                  Preview
                </div>
                <iframe src={previewUrl} style={{ width: '100%', height: '300px', border: '1px solid var(--bo-border)', borderRadius: 'var(--bo-radius-sm)', background: '#fff' }} title="Preview" />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}>
                <div style={{ fontSize: 'var(--bo-text-sm)', fontWeight: 600, color: 'var(--bo-text)' }}>
                  Preview
                </div>
                <p style={{ fontSize: 'var(--bo-text-xs)', color: 'var(--bo-text-tertiary)' }}>
                  {previewRunning ? 'Starting preview...' : 'Preview not running.'}
                </p>
                <Button variant="outlined" size="sm" onClick={onStartPreview}>
                  <Play size={12} /> Start Preview
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
