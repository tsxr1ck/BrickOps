import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@brickops/ui';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectPage } from './pages/ProjectPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { CreateProjectPage } from './pages/CreateProjectPage';
import { SettingsPage } from './pages/SettingsPage';

function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/project/:slug" element={<ProjectPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/new" element={<CreateProjectPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

export default App;
