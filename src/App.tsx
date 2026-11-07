import { HashRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from './hooks/useI18n';
import { ThemeProvider } from './hooks/useTheme';
import { Layout } from './components/Layout';
import { UpdatePrompt } from './components/UpdatePrompt';
import { DashboardPage } from './pages/DashboardPage';
import { TrendsPage } from './pages/TrendsPage';
import { EventsPage } from './pages/EventsPage';
import { KeywordsPage } from './pages/KeywordsPage';
import { SourcesPage } from './pages/SourcesPage';

export default function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <HashRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/trends" element={<TrendsPage />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/keywords" element={<KeywordsPage />} />
              <Route path="/sources" element={<SourcesPage />} />
            </Routes>
          </Layout>
          <UpdatePrompt />
        </HashRouter>
      </ThemeProvider>
    </I18nProvider>
  );
}
