import { HashRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from './hooks/useI18n';
import { Layout } from './components/Layout';
import { UpdatePrompt } from './components/UpdatePrompt';
import { DashboardPage } from './pages/DashboardPage';
import { TrendsPage } from './pages/TrendsPage';
import { KeywordsPage } from './pages/KeywordsPage';
import { SourcesPage } from './pages/SourcesPage';

export default function App() {
  return (
    <I18nProvider>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/trends" element={<TrendsPage />} />
            <Route path="/keywords" element={<KeywordsPage />} />
            <Route path="/sources" element={<SourcesPage />} />
          </Routes>
        </Layout>
        <UpdatePrompt />
      </HashRouter>
    </I18nProvider>
  );
}
