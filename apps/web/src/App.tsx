import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@brickops/ui';
import { ProjectsPage } from './pages/ProjectsPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { CreateProjectPage } from './pages/CreateProjectPage';
import { SettingsPage } from './pages/SettingsPage';
import { SessionsPage } from './pages/SessionsPage';

function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/project/:slug" element={<WorkspacePage />} />
          <Route path="/projects/:projectId/workspace" element={<WorkspacePage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/new" element={<CreateProjectPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

export default App;
