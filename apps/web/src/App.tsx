import { useEffect, useState } from 'react';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { CallLogsPage } from './pages/CallLogsPage';
import { OverviewPage } from './pages/OverviewPage';
import { SettingsPage, type SettingsTab } from './pages/SettingsPage';
import { useI18n } from './i18n';
import './styles.css';
import './redesign.css';

type AppView = 'overview' | 'projects' | 'logs' | 'settings';

interface AppRoute {
  view: AppView;
  projectId: string | null;
  settingsTab: SettingsTab;
}

function parseHashRoute(hashValue: string): AppRoute {
  const raw = hashValue.replace(/^#\/?/, '');
  const [first = '', second = ''] = raw.split('/');

  if (first === 'projects') {
    return { view: 'projects', projectId: second || null, settingsTab: 'general' };
  }
  if (first === 'benchmark') {
    return { view: 'projects', projectId: null, settingsTab: 'general' };
  }
  if (first === 'logs') {
    return { view: 'logs', projectId: null, settingsTab: 'general' };
  }
  if (first === 'replay') {
    return { view: 'logs', projectId: null, settingsTab: 'general' };
  }
  if (first === 'export') {
    return { view: 'settings', projectId: null, settingsTab: 'runtime' };
  }
  if (first === 'providers') {
    return { view: 'settings', projectId: null, settingsTab: 'providers' };
  }
  if (first === 'settings') {
    const tab: SettingsTab =
      second === 'providers'
        ? 'providers'
        : second === 'runtime' || second === 'runtime-advanced'
          ? 'runtime'
          : 'providers';
    return { view: 'settings', projectId: null, settingsTab: tab };
  }

  return { view: 'overview', projectId: null, settingsTab: 'general' };
}

function toHashPath(view: AppView): string {
  if (view === 'settings') {
    return '#/settings/providers';
  }

  return `#/${view}`;
}

function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseHashRoute(window.location.hash));
  const { t } = useI18n();

  useEffect(() => {
    const raw = window.location.hash.replace(/^#\/?/, '');
    const [first = ''] = raw.split('/');
    if (first === 'export') {
      window.location.hash = '#/settings/runtime';
      return;
    }

    const syncRoute = () => {
      const currentRaw = window.location.hash.replace(/^#\/?/, '');
      const [currentFirst = '', currentSecond = ''] = currentRaw.split('/');
      if (currentFirst === 'export') {
        window.location.hash = '#/settings/runtime';
        return;
      }

      if (currentFirst === 'settings' && currentSecond === 'runtime-advanced') {
        window.location.hash = '#/settings/runtime';
        return;
      }

      setRoute(parseHashRoute(window.location.hash));
    };

    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  const view = route.view;
  const projectDetailId = route.projectId;

  const openView = (nextView: AppView) => {
    const nextHash = toHashPath(nextView);
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
      return;
    }

    setRoute({
      view: nextView,
      projectId: null,
      settingsTab: nextView === 'settings' ? 'providers' : 'general'
    });
  };

  return (
    <main className="app-shell">
      <header className="top-nav">
        <div className="top-nav-brand">
          <span className="top-nav-logo-wrap" aria-hidden="true">
            <img src="/favicon.png" alt="" className="top-nav-logo" />
          </span>
          <div className="top-nav-title-block">
            <p className="top-nav-kicker">{t('Local Runtime Workspace')}</p>
            <h1>{t('Contrix Control Center')}</h1>
          </div>
        </div>
        <nav className="top-nav-links" aria-label={t('Primary navigation')}>
          <button
            type="button"
            className={view === 'overview' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => openView('overview')}
          >
            {t('Overview')}
          </button>
          <button
            type="button"
            className={view === 'projects' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => openView('projects')}
          >
            {t('Contracts / Endpoints')}
          </button>
          <button
            type="button"
            className={view === 'logs' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => openView('logs')}
          >
            {t('Logs')}
          </button>
          <button
            type="button"
            className={view === 'settings' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => openView('settings')}
          >
            {t('Settings')}
          </button>
        </nav>
      </header>

      <section className="app-content">
        {view === 'overview' ? <OverviewPage /> : null}
        {view === 'projects' ? (
          projectDetailId ? (
            <ProjectDetailPage
              projectId={projectDetailId}
              onBack={() => {
                window.location.hash = '#/projects';
              }}
            />
          ) : (
            <ProjectsPage
              onOpenProjectDetail={(projectId) => {
                window.location.hash = `#/projects/${projectId}`;
              }}
            />
          )
        ) : null}
        {view === 'logs' ? <CallLogsPage /> : null}
        {view === 'settings' ? (
          <SettingsPage
            initialTab={route.settingsTab}
            onChangeTab={(tab) => {
              window.location.hash = `#/settings/${tab}`;
            }}
          />
        ) : null}
      </section>

      <footer className="app-footnote" aria-label="Application footnote">
        Contrix · V1.1.0 · Ryan Yan
      </footer>
    </main>
  );
}

export default App;
