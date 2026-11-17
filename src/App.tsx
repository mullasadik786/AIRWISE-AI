import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AlertPreferences,
  CityLocation,
  EnvironmentalSnapshot,
  FamilyProfile,
  IndoorRoomTask,
  LifestyleAlternative,
  PageId,
  SmartAlert,
} from './types/airwise.ts';
import { buildDemoFallbackSnapshot, PRESET_CITIES } from './data/presets.ts';
import {
  buildSmartAlerts,
  getInitialIndoorChecklist,
  getInitialLifestyleAlternatives,
} from './lib/recommendations.ts';
import type { CarbonCalculatorInput } from './lib/impact.ts';
import { calculateCarbonImpact } from './lib/impact.ts';
import { PersistedStateSchema } from './lib/validation.ts';
import { WorkspaceLayout } from './components/WorkspaceLayout.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { LandingPage } from './pages/LandingPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';

const AssistantPage = lazy(() =>
  import('./pages/AssistantPage.tsx').then((m) => ({ default: m.AssistantPage }))
);
const RoutinePage = lazy(() =>
  import('./pages/RoutinePage.tsx').then((m) => ({ default: m.RoutinePage }))
);
const IndoorPage = lazy(() =>
  import('./pages/IndoorPage.tsx').then((m) => ({ default: m.IndoorPage }))
);
const SustainabilityPage = lazy(() =>
  import('./pages/SustainabilityPage.tsx').then((m) => ({ default: m.SustainabilityPage }))
);
const CalculatorPage = lazy(() =>
  import('./pages/CalculatorPage.tsx').then((m) => ({ default: m.CalculatorPage }))
);
const InsightsPage = lazy(() =>
  import('./pages/InsightsPage.tsx').then((m) => ({ default: m.InsightsPage }))
);
const CommunityPage = lazy(() =>
  import('./pages/CommunityPage.tsx').then((m) => ({ default: m.CommunityPage }))
);
const NotificationsPage = lazy(() =>
  import('./pages/NotificationsPage.tsx').then((m) => ({ default: m.NotificationsPage }))
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage.tsx').then((m) => ({ default: m.SettingsPage }))
);

const STORAGE_KEY = 'airwise_ai_state_v1';

const DEFAULT_PROFILE: FamilyProfile = {
  householdSize: 3,
  groups: ['adults', 'children', 'dailyCommuters'],
  preferredStandard: 'CPCB',
  hasPurifier: true,
  gridRegion: 'INDIA',
};

const DEFAULT_CALC_INPUT: CarbonCalculatorInput = {
  carKmReplacedByTransitPerWeek: 30,
  carKmCarpoolPerWeek: 16,
  carKmReplacedByWalkCyclePerWeek: 8,
  electricitySavedKwhPerWeek: 10,
  ledBulbsReplacedCount: 4,
  wasteReducedKgPerWeek: 3,
  gridRegion: 'INDIA',
  householdSize: 3,
};

const DEFAULT_ALERT_PREFS: AlertPreferences = {
  severeAqi: true,
  risingPm25: true,
  forecastAlerts: true,
  ventilationWindows: true,
  filterMaintenance: true,
  sustainabilityGoals: true,
};

interface PersistedState {
  locationId?: string;
  customLocation?: CityLocation;
  profile?: FamilyProfile;
  completedTaskIds?: string[];
  adoptedHabitIds?: string[];
  joinedChallengeIds?: string[];
  calcInput?: CarbonCalculatorInput;
  alertPrefs?: AlertPreferences;
}

function loadPersistedState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = PersistedStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

const VALID_PAGES: readonly PageId[] = [
  'landing',
  'dashboard',
  'assistant',
  'routine',
  'indoor',
  'sustainability',
  'calculator',
  'insights',
  'community',
  'notifications',
  'settings',
];

function parseHashPage(): PageId | null {
  const hash = window.location.hash.replace('#', '') as PageId;
  return VALID_PAGES.includes(hash) ? hash : null;
}

export default function App() {
  const initialPersisted = useMemo(() => loadPersistedState(), []);

  const [activePage, setActivePage] = useState<PageId>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') return 'dashboard';
    return parseHashPage() ?? 'landing';
  });

  const [location, setLocation] = useState<CityLocation>(() => {
    if (initialPersisted.customLocation) return initialPersisted.customLocation;
    if (initialPersisted.locationId) {
      return PRESET_CITIES.find((c) => c.id === initialPersisted.locationId) ?? PRESET_CITIES[0];
    }
    return PRESET_CITIES[0];
  });

  const [snapshot, setSnapshot] = useState<EnvironmentalSnapshot>(() =>
    buildDemoFallbackSnapshot(location, 'Connecting to live environmental telemetry...')
  );
  const [loadingFeed, setLoadingFeed] = useState<boolean>(true);

  const [profile, setProfile] = useState<FamilyProfile>(
    initialPersisted.profile ?? DEFAULT_PROFILE
  );
  const [indoorTasks, setIndoorTasks] = useState<IndoorRoomTask[]>(() => {
    const doneSet = new Set(initialPersisted.completedTaskIds ?? []);
    return getInitialIndoorChecklist().map((t) => ({ ...t, completed: doneSet.has(t.id) }));
  });
  const [alternatives, setAlternatives] = useState<LifestyleAlternative[]>(() => {
    const adoptedSet = new Set(initialPersisted.adoptedHabitIds ?? ['alt-transit']);
    return getInitialLifestyleAlternatives().map((a) => ({ ...a, adopted: adoptedSet.has(a.id) }));
  });
  const [joinedChallenges, setJoinedChallenges] = useState<string[]>(
    initialPersisted.joinedChallengeIds ?? ['chal-transit']
  );
  const [calcInput, setCalcInput] = useState<CarbonCalculatorInput>(
    initialPersisted.calcInput ?? DEFAULT_CALC_INPUT
  );
  const [alertPrefs, setAlertPrefs] = useState<AlertPreferences>(
    initialPersisted.alertPrefs ?? DEFAULT_ALERT_PREFS
  );
  const [readAlertIds, setReadAlertIds] = useState<string[]>([]);

  const fetchControllerRef = useRef<AbortController | null>(null);

  const fetchSnapshot = useCallback(async (targetLoc: CityLocation) => {
    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    setLoadingFeed(true);
    try {
      const qs = new URLSearchParams({
        lat: String(targetLoc.latitude),
        lon: String(targetLoc.longitude),
        name: targetLoc.name,
        region: targetLoc.region,
        country: targetLoc.country,
        countryCode: targetLoc.countryCode,
        timezone: targetLoc.timezone,
      });
      const res = await fetch(`/api/air-quality?${qs.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { snapshot?: EnvironmentalSnapshot };
      if (!controller.signal.aborted) {
        if (data.snapshot) {
          setSnapshot(data.snapshot);
        } else {
          setSnapshot(buildDemoFallbackSnapshot(targetLoc));
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setSnapshot(buildDemoFallbackSnapshot(targetLoc));
    } finally {
      if (!controller.signal.aborted) {
        setLoadingFeed(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchSnapshot(location);
    return () => {
      fetchControllerRef.current?.abort();
    };
  }, [location, fetchSnapshot]);

  // Sync browser Back/Forward hash navigation
  useEffect(() => {
    const onHashChange = () => {
      const next = parseHashPage();
      if (next) setActivePage(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Persist non-sensitive preferences locally
  useEffect(() => {
    try {
      const payload: PersistedState = {
        locationId: location.id,
        customLocation: location,
        profile,
        completedTaskIds: indoorTasks.filter((t) => t.completed).map((t) => t.id),
        adoptedHabitIds: alternatives.filter((a) => a.adopted).map((a) => a.id),
        joinedChallengeIds: joinedChallenges,
        calcInput,
        alertPrefs,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }, [location, profile, indoorTasks, alternatives, joinedChallenges, calcInput, alertPrefs]);

  const navigate = useCallback((page: PageId) => {
    setActivePage(page);
    const targetHash = page === 'landing' ? '' : `#${page}`;
    if (window.location.hash !== targetHash) {
      window.history.pushState(null, '', targetHash || window.location.pathname + window.location.search);
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const alerts: SmartAlert[] = useMemo(() => {
    const readSet = new Set(readAlertIds);
    return buildSmartAlerts(snapshot).map((a) => ({
      ...a,
      read: readSet.has(a.id),
    }));
  }, [snapshot, readAlertIds]);

  const unreadAlertsCount = alerts.filter((a) => !a.read).length;

  const indoorProgressPercent = useMemo(() => {
    const done = indoorTasks.filter((t) => t.completed).length;
    return indoorTasks.length > 0 ? Math.round((done / indoorTasks.length) * 100) : 0;
  }, [indoorTasks]);

  const sustainabilityScore = useMemo(() => {
    const adopted = alternatives.filter((a) => a.adopted).length;
    return alternatives.length > 0 ? Math.round((adopted / alternatives.length) * 100) : 0;
  }, [alternatives]);

  const calcResult = useMemo(() => calculateCarbonImpact(calcInput), [calcInput]);

  function handleClearAllData() {
    localStorage.removeItem(STORAGE_KEY);
    setLocation(PRESET_CITIES[0]);
    setProfile(DEFAULT_PROFILE);
    setIndoorTasks(getInitialIndoorChecklist());
    setAlternatives(getInitialLifestyleAlternatives());
    setJoinedChallenges([]);
    setCalcInput(DEFAULT_CALC_INPUT);
    setAlertPrefs(DEFAULT_ALERT_PREFS);
    setReadAlertIds([]);
  }

  if (activePage === 'landing') {
    return (
      <ErrorBoundary onReset={() => navigate('dashboard')}>
        <LandingPage snapshot={snapshot} onNavigate={navigate} />
      </ErrorBoundary>
    );
  }

  return (
    <WorkspaceLayout
      activePage={activePage}
      onNavigate={navigate}
      location={location}
      unreadAlertsCount={unreadAlertsCount}
    >
      <ErrorBoundary onReset={() => navigate('dashboard')}>
        <Suspense
          fallback={
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600" role="status">
              Loading module...
            </div>
          }
        >
        {activePage === 'dashboard' && (
          <DashboardPage
            snapshot={snapshot}
            loading={loadingFeed}
            indoorProgressPercent={indoorProgressPercent}
            sustainabilityScore={sustainabilityScore}
            weeklyCo2SavedKg={calcResult.weeklySavingsKg}
            onSelectLocation={setLocation}
            onRefresh={() => void fetchSnapshot(location)}
            onNavigate={navigate}
          />
        )}

        {activePage === 'assistant' && <AssistantPage snapshot={snapshot} profile={profile} />}

        {activePage === 'routine' && (
          <RoutinePage snapshot={snapshot} profile={profile} onNavigate={navigate} />
        )}

        {activePage === 'indoor' && (
          <IndoorPage
            snapshot={snapshot}
            tasks={indoorTasks}
            onToggleTask={(id) =>
              setIndoorTasks((prev) =>
                prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
              )
            }
          />
        )}

        {activePage === 'sustainability' && (
          <SustainabilityPage
            snapshot={snapshot}
            alternatives={alternatives}
            onToggleAdopted={(id) =>
              setAlternatives((prev) =>
                prev.map((a) => (a.id === id ? { ...a, adopted: !a.adopted } : a))
              )
            }
          />
        )}

        {activePage === 'calculator' && (
          <CalculatorPage
            input={calcInput}
            onChangeInput={setCalcInput}
            onResetInput={() => setCalcInput(DEFAULT_CALC_INPUT)}
          />
        )}

        {activePage === 'insights' && <InsightsPage snapshot={snapshot} />}

        {activePage === 'community' && (
          <CommunityPage
            snapshot={snapshot}
            joinedChallengeIds={joinedChallenges}
            onToggleJoinChallenge={(id) =>
              setJoinedChallenges((prev) =>
                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
              )
            }
          />
        )}

        {activePage === 'notifications' && (
          <NotificationsPage
            alerts={alerts}
            preferences={alertPrefs}
            onMarkRead={(id) => setReadAlertIds((prev) => (prev.includes(id) ? prev : [...prev, id]))}
            onMarkAllRead={() => setReadAlertIds(alerts.map((a) => a.id))}
            onUpdatePreferences={setAlertPrefs}
            onNavigate={navigate}
          />
        )}

        {activePage === 'settings' && (
          <SettingsPage
            profile={profile}
            onUpdateProfile={(next) => {
              setProfile(next);
              setCalcInput((prev) => ({
                ...prev,
                gridRegion: next.gridRegion,
                householdSize: next.householdSize,
              }));
            }}
            onClearAllData={handleClearAllData}
          />
        )}
        </Suspense>
      </ErrorBoundary>
    </WorkspaceLayout>
  );
}
