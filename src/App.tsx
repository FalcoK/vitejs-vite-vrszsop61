import React, { useEffect, useMemo, useState } from 'react';

// ===================================================================================
//  TYPES
// ===================================================================================
type Player = { id: string; name: string };
type Mode = '2v2' | 'tournament';

type Match = {
  id: string;
  dateISO: string;
  mode: Mode;
  teamAName: string;
  teamBName: string;
  teamAPlayers: string[];
  teamBPlayers: string[];
  goalsA: number;
  goalsB: number;
  enteredBy: string;
  sessionId?: string;
};

type KingSession = {
  id: string;
  dateISO: string;
  kings: string[];
  mode: Mode;
  bestOf?: number; // For 2v2
  rounds?: number; // For tournament
  tournamentParticipants?: number; // For tournament
  kingEnteredBy?: string;
};

type ViolationType =
  | 'unerlaubt_pausiert'
  | 'durch_den_bildschirm_gelaufen'
  | 'koenigstitel_nicht_erwaehnt'
  | 'kein_getraenk_erhalten'
  | 'sonderrecht_des_hauens_ignoriert'
  | 'sonstiges';

type Violation = {
  id: string;
  dateISO: string;
  playerId: string;
  type: ViolationType;
  comment: string;
  enteredBy: string;
};

type SessionTeam = {
  id: string;
  name: string;
  players: string[];
};

type ActiveSessionMatch = {
  id: string;
  teamA: SessionTeam;
  teamB: SessionTeam;
  goalsA: number | null;
  goalsB: number | null;
  isTiebreaker?: boolean;
};

type ActiveBestOfSession = {
  type: '2v2';
  teams: SessionTeam[];
  schedule: ActiveSessionMatch[];
  bestOf: number;
  mode: '2v2';
};

type ActiveTournamentSession = {
  type: 'tournament';
  players: Player[];
  schedule: ActiveSessionMatch[];
  rounds: number;
  mode: 'tournament';
};

type ActiveSession = ActiveBestOfSession | ActiveTournamentSession;


type DB = {
  theme: ThemeKey;
  players: Player[];
  matches: Match[];
  kingSessions: KingSession[];
  violations: Violation[];
};

type ThemeKey = 'FCB' | 'BVB' | 'FALCO';

// ===================================================================================
//  KONSTANTEN & UTILS
// ===================================================================================
const STORAGE_KEY = 'fifa-king-tracker-v5';

const VIOLATION_TYPES: Record<ViolationType, string> = {
  unerlaubt_pausiert: 'Unerlaubt pausiert/resumed',
  durch_den_bildschirm_gelaufen: 'Durch den Bildschirm gelaufen',
  koenigstitel_nicht_erwaehnt: 'Königstititel nicht erwähnt',
  kein_getraenk_erhalten: 'Auf Anfrage kein Getränk erhalten',
  sonderrecht_des_hauens_ignoriert: 'Sonderrecht des Hauens ignoriert',
  sonstiges: 'Sonstiges (siehe Kommentar)',
};

const KING_TITLES: { [key: number]: string } = {
  1: 'König',
  2: 'Zönig',
  3: 'Drönig',
  4: 'Vönig',
  5: 'Fönig',
  6: 'Sönig',
  7: 'Septönig',
  8: 'Oktönig',
  9: 'Nönig',
  10: 'Xönig',
  11: 'Kaiser',
  12: 'Zwaiser',
  13: 'Traiser',
};

const THEMES: Record<
  ThemeKey,
  {
    name: string;
    classes: string;
    wmText: string;
    wmImage?: string;
    wmOpacity?: number;
  }
> = {
  FCB: {
    name: 'FC Bayern',
    classes:
      '[--bg:254,242,242] [--paper:255,255,255] [--text:15,23,42] [--accent:220,38,38] [--accent2:37,99,235] [--muted:100,116,139]',
    wmText: 'FC BAYERN',
    wmImage:
      'https://upload.wikimedia.org/wikipedia/en/1/1f/FC_Bayern_München_logo_%282017%29.svg',
    wmOpacity: 0.12,
  },
  BVB: {
    name: 'Borussia Dortmund',
    classes:
      '[--bg:250,250,249] [--paper:255,255,255] [--text:15,23,42] [--accent:234,179,8] [--accent2:24,24,27] [--muted:113,113,122]',
    wmText: 'BORUSSIA',
    wmImage:
      'https://upload.wikimedia.org/wikipedia/commons/6/67/Borussia_Dortmund_logo.svg',
    wmOpacity: 0.15,
  },
  FALCO: {
    name: '13X König Falco',
    classes:
      '[--bg:245,252,245] [--paper:255,255,255] [--text:5,46,22] [--accent:16,185,129] [--accent2:21,128,61] [--muted:71,85,105]',
    wmText: '13X KÖNIG FALCO',
    wmImage:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Beard_icon.svg/512px-Beard_icon.svg.png',
    wmOpacity: 0.18,
  },
};

function useLocalState<T>(
  initial: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return initial;
      const data = JSON.parse(raw) as T;
      return { ...initial, ...data };
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);
  return [state, setState];
}

function cls(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}
function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}
function nameOf(players: Player[], id: string): string {
  return players.find((p) => p.id === id)?.name || '?';
}


// ===================================================================================
//  HOOK FÜR KÖNIGS-INFORMATIONEN
// ===================================================================================
type KingInfo = {
  currentKings: { id: string; name: string; streak: number }[];
  longestStreaks: Record<string, number>;
};

function useKingInfo(db: DB): KingInfo {
  return useMemo(() => {
    const sortedSessions = [...db.kingSessions].sort(
      (a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime()
    );
    const longestStreaks: Record<string, number> = {};
    const currentStreaks: Record<string, number> = {};

    for (const player of db.players) {
      longestStreaks[player.id] = 0;
      currentStreaks[player.id] = 0;
    }

    for (const session of sortedSessions) {
      if (session.kings.length === 0) continue;
      const winnerIds = new Set(session.kings);
      for (const player of db.players) {
        if (winnerIds.has(player.id)) {
          currentStreaks[player.id]++;
        } else {
          if (currentStreaks[player.id] > longestStreaks[player.id]) {
            longestStreaks[player.id] = currentStreaks[player.id];
          }
          currentStreaks[player.id] = 0;
        }
      }
    }

    for (const player of db.players) {
      if (currentStreaks[player.id] > longestStreaks[player.id]) {
        longestStreaks[player.id] = currentStreaks[player.id];
      }
    }

    const currentKings = db.players
      .filter((p) => currentStreaks[p.id] > 0)
      .map((p) => ({ id: p.id, name: p.name, streak: currentStreaks[p.id] }));

    return { currentKings, longestStreaks };
  }, [db.kingSessions, db.players]);
}

// ===================================================================================
//  ROOT APP COMPONENT
// ===================================================================================
export default function App() {
  const [db, setDb] = useLocalState<DB>({
    theme: 'BVB',
    players: [
      { id: uid(), name: 'Falco' },
      { id: uid(), name: 'Marcus' },
      { id: uid(), name: 'Alex' },
      { id: uid(), name: 'Martin' },
      { id: uid(), name: 'Obi' },
    ],
    matches: [],
    kingSessions: [],
    violations: [],
  });

  const [activeSession, setActiveSession] = useState<ActiveSession | null>(
    null
  );

  type TabKey =
    | 'session'
    | 'table'
    | 'violations'
    | 'history'
    | 'stats'
    | 'settings';
  const [tab, setTab] = useState<TabKey>('session');

  const kingInfo = useKingInfo(db);
  const theme = THEMES[db.theme];
  const themeClass = theme?.classes || THEMES.BVB.classes;
  const bannerVars = {
    ['--wm-image']: theme?.wmImage ? `url(${theme.wmImage})` : 'none',
    ['--wm-opacity']: String(theme?.wmOpacity ?? 0.12),
  } as React.CSSProperties;

  return (
    <div
      className={cls(
        'min-h-screen flex flex-col bg-[rgb(var(--bg))] text-[rgb(var(--text))] overflow-x-hidden dark:bg-slate-900 dark:text-slate-200',
        themeClass
      )}
      style={{
        fontFamily:
          'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        ...bannerVars,
      }}
    >
      <div className="sticky top-0 z-20 bg-[rgb(var(--bg))]/90 backdrop-blur supports-[backdrop-filter]:bg-[rgb(var(--bg))]/70 dark:bg-slate-900/80 border-b border-neutral-200 dark:border-slate-700">
        <div className="w-full p-4 sm:p-6">
          <Header tab={tab} setTab={setTab} kingInfo={kingInfo} />
          <BrandStrip text={theme?.wmText} />
        </div>
      </div>
      <div className="flex-1 w-full p-4 sm:p-6">
        <div className="grid gap-4">
          {tab === 'session' && (
            <SessionManager
              db={db}
              setDb={setDb}
              activeSession={activeSession}
              setActiveSession={setActiveSession}
            />
          )}
          {tab === 'table' && <Standings db={db} kingInfo={kingInfo} />}
          {tab === 'violations' && <ViolationsTab db={db} setDb={setDb} />}
          {tab === 'history' && <History db={db} setDb={setDb} />}
          {tab === 'stats' && <Stats db={db} kingInfo={kingInfo} />}
          {tab === 'settings' && <Settings db={db} setDb={setDb} />}
        </div>
      </div>
    </div>
  );
}

// ===================================================================================
//  HEADER & UI COMPONENTS
// ===================================================================================
function Header({
  tab,
  setTab,
  kingInfo,
}: {
  tab: string;
  setTab: (t: any) => void;
  kingInfo: KingInfo;
}) {
  const kingTitle = useMemo(() => {
    if (kingInfo.currentKings.length === 0) return 'Der Thron ist leer';
    const sortedKings = [...kingInfo.currentKings].sort(
      (a, b) => b.streak - a.streak
    );
    const topKing = sortedKings[0];
    const title = KING_TITLES[topKing.streak] || `König (${topKing.streak}x)`;
    const names = sortedKings.map((k) => `${k.name} (${k.streak})`).join(' & ');
    return `${title}: ${names}`;
  }, [kingInfo]);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          FIFA König Session Tracker
        </h1>
        <p className="text-sm text-[rgb(var(--accent2))] font-semibold">
          👑 {kingTitle}
        </p>
      </div>
      <nav className="flex flex-wrap gap-2 min-h-[42px]">
        {(
          [
            ['session', '🏆 Session'],
            ['table', 'Tabelle'],
            ['violations', 'Regelverstöße'],
            ['history', 'History'],
            ['stats', 'Statistiken'],
            ['settings', 'Einstellungen'],
          ] as const
        ).map(([k, label]) => (
          <TabButton key={k} active={tab === k} onClick={() => setTab(k)}>
            {label}
          </TabButton>
        ))}
      </nav>
    </div>
  );
}

function TabButton({
  active,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cls(
        'px-3 py-2 rounded-xl text-sm border transition-colors',
        active
          ? 'bg-[rgb(var(--accent))] border-[rgb(var(--accent))] text-white shadow'
          : 'bg-[rgb(var(--paper))] border-neutral-200 hover:bg-neutral-50 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700'
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function BrandStrip({ text }: { text?: string }) {
  return (
    <div className="mt-3 w-full">
      <div
        className="h-28 sm:h-32 flex items-center justify-center relative overflow-hidden rounded-xl"
        style={{
          background:
            'linear-gradient(90deg, rgba(var(--accent),0.98), rgba(var(--accent2),0.98))',
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: 'var(--wm-opacity, 0.12)',
            backgroundImage: 'var(--wm-image)',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right center',
            backgroundSize: 'contain',
            filter: 'grayscale(0.1) contrast(0.9)',
          }}
        />
        <div
          className="relative text-white/95 text-3xl sm:text-5xl font-extrabold tracking-[0.18em] uppercase select-none"
          style={{
            textShadow: '0 2px 10px rgba(0,0,0,0.45), 0 0 2px rgba(0,0,0,0.35)',
            WebkitTextStroke: '1px rgba(0,0,0,0.15)',
            letterSpacing: '0.18em',
          }}
        >
          {text ?? ''}
        </div>
      </div>
    </div>
  );
}

function PlayerNameDisplay({
  playerId,
  players,
  kingInfo,
}: {
  playerId: string;
  players: Player[];
  kingInfo: KingInfo;
}) {
  const player = players.find((p) => p.id === playerId);
  const kingData = kingInfo.currentKings.find((k) => k.id === playerId);
  if (!player) return <span>?</span>;
  return (
    <span className="flex items-center gap-1.5">
      {player.name}
      {kingData && kingData.streak > 0 && (
        <span
          className="text-amber-500 font-bold"
          title={`${kingData.streak} Session(s) in Folge König`}
        >
          👑<sub className="text-xs -ml-1">{kingData.streak}</sub>
        </span>
      )}
    </span>
  );
}

// ===================================================================================
//  TAB: TABELLE
// ===================================================================================
function Standings({ db, kingInfo }: { db: DB; kingInfo: KingInfo }) {
  const matchStats = useMemo(
    () => computeStandings(db.players, db.matches),
    [db.players, db.matches]
  );
  const sessionCounts = useMemo(() => {
    const map = new Map<string, { id: string; name: string; wins: number }>(
      db.players.map((p) => [p.id, { id: p.id, name: p.name, wins: 0 }])
    );
    for (const s of db.kingSessions) {
      for (const pid of s.kings) {
        const rec = map.get(pid);
        if (!rec) continue;
        rec.wins += 1;
      }
    }
    return Array.from(map.values());
  }, [db.players, db.kingSessions]);
  return (
    <div className="bg-[rgb(var(--paper))] rounded-2xl shadow border border-neutral-200 p-4 dark:bg-slate-800 dark:border-slate-700">
      <h2 className="text-xl font-semibold mb-3">Gesamttabellen</h2>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-semibold text-lg mb-2">🏆 Königs-Titel</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b dark:border-slate-600">
                  {['#', 'Spieler', 'Titel'].map((h) => (
                    <th
                      key={h}
                      className="py-2 pr-3 font-medium text-[rgb(var(--muted))] dark:text-slate-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessionCounts
                  .sort(
                    (a, b) => b.wins - a.wins || a.name.localeCompare(b.name)
                  )
                  .map((r, i) => (
                    <tr key={r.id} className="border-b last:border-0 dark:border-slate-700">
                      <td className="py-2 pr-3">{i + 1}</td>
                      <td className="py-2 pr-3 font-semibold">
                        <PlayerNameDisplay
                          playerId={r.id}
                          players={db.players}
                          kingInfo={kingInfo}
                        />
                      </td>
                      <td className="py-2 pr-3">{r.wins}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-lg mb-2">🎯 Punkte aus Spielen</h3>
          <TableStats stats={matchStats} db={db} kingInfo={kingInfo} />
        </div>
      </div>
    </div>
  );
}
function TableStats({
  stats,
  db,
  kingInfo,
}: {
  stats: Array<ReturnType<typeof computeStandings>[number]>;
  db: DB;
  kingInfo: KingInfo;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b dark:border-slate-600">
            {['#', 'Spieler', 'Pkte', '+/−', 'Sp', 'S', 'U', 'N', 'Tore'].map(
              (h) => (
                <th
                  key={h}
                  className="py-2 pr-3 font-medium text-[rgb(var(--muted))] dark:text-slate-400"
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {stats
            .sort(
              (a, b) =>
                b.points - a.points ||
                b.goalDiff - a.goalDiff ||
                b.goalsFor - a.goalsFor ||
                a.name.localeCompare(b.name)
            )
            .map((p, i) => (
              <tr key={p.id} className="border-b last:border-0 dark:border-slate-700">
                <td className="py-2 pr-3">{i + 1}</td>
                <td className="py-2 pr-3 font-semibold">
                  <PlayerNameDisplay
                    playerId={p.id}
                    players={db.players}
                    kingInfo={kingInfo}
                  />
                </td>
                <td className="py-2 pr-3 font-bold">{p.points}</td>
                <td className="py-2 pr-3">
                  {p.goalDiff > 0 ? `+${p.goalDiff}` : p.goalDiff}
                </td>
                <td className="py-2 pr-3">{p.played}</td>
                <td className="py-2 pr-3">{p.wins}</td>
                <td className="py-2 pr-3">{p.draws}</td>
                <td className="py-2 pr-3">{p.losses}</td>
                <td className="py-2 pr-3">
                  {p.goalsFor}:{p.goalsAgainst}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function computeStandings(players: Player[], matches: Match[]) {
  const map = new Map<
    string,
    {
      id: string;
      name: string;
      played: number;
      wins: number;
      draws: number;
      losses: number;
      goalsFor: number;
      goalsAgainst: number;
    }
  >(
    players.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
      },
    ])
  );
  for (const m of matches) {
    const aWon = m.goalsA > m.goalsB;
    const bWon = m.goalsB > m.goalsA;
    for (const pid of m.teamAPlayers) {
      const s = map.get(pid);
      if (!s) continue;
      s.played += 1;
      s.goalsFor += m.goalsA;
      s.goalsAgainst += m.goalsB;
      if (aWon) s.wins += 1;
      else if (bWon) s.losses += 1;
      else s.draws += 1;
    }
    for (const pid of m.teamBPlayers) {
      const s = map.get(pid);
      if (!s) continue;
      s.played += 1;
      s.goalsFor += m.goalsB;
      s.goalsAgainst += m.goalsA;
      if (bWon) s.wins += 1;
      else if (aWon) s.losses += 1;
      else s.draws += 1;
    }
  }
  return Array.from(map.values()).map((s) => {
    const points = s.wins * 3 + s.draws;
    const goalDiff = s.goalsFor - s.goalsAgainst;
    return { ...s, points, goalDiff };
  });
}

// ===================================================================================
//  TAB: SESSION MANAGER
// ===================================================================================
function SessionManager({
  db,
  setDb,
  activeSession,
  setActiveSession,
}: {
  db: DB;
  setDb: React.Dispatch<React.SetStateAction<DB>>;
  activeSession: ActiveSession | null;
  setActiveSession: React.Dispatch<React.SetStateAction<ActiveSession | null>>;
}) {
  if (activeSession) {
    if (activeSession.type === '2v2') {
        return (
          <ActiveBestOfDisplay
            setDb={setDb}
            activeSession={activeSession}
            setActiveSession={setActiveSession}
          />
        );
    }
     if (activeSession.type === 'tournament') {
        return (
          <ActiveTournamentDisplay
            setDb={setDb}
            activeSession={activeSession}
            setActiveSession={setActiveSession}
          />
        );
    }
  }

  return <StartSessionChooser db={db} setActiveSession={setActiveSession} />;
}

function StartSessionChooser({
    db,
    setActiveSession,
}: {
    db: DB;
    setActiveSession: React.Dispatch<React.SetStateAction<ActiveSession | null>>;
}) {
    const [sessionType, setSessionType] = useState<'2v2' | 'tournament'>('tournament');

    return (
        <div className="bg-[rgb(var(--paper))] rounded-2xl shadow border border-neutral-200 p-4 max-w-4xl mx-auto dark:bg-slate-800 dark:border-slate-700">
            <div className="flex justify-center mb-4 border-b pb-4 dark:border-slate-600">
                 <div className="flex items-center gap-2">
                    <TabButton active={sessionType === 'tournament'} onClick={() => setSessionType('tournament')}>
                      Einzelsession (Turnier)
                    </TabButton>
                    <TabButton active={sessionType === '2v2'} onClick={() => setSessionType('2v2')}>
                      2 vs 2 (Best Of)
                    </TabButton>
                </div>
            </div>
            {sessionType === '2v2' && <StartBestOfForm db={db} setActiveSession={setActiveSession} />}
            {sessionType === 'tournament' && <StartTournamentForm db={db} setActiveSession={setActiveSession} />}
        </div>
    );
}

function StartBestOfForm({
  db,
  setActiveSession,
}: {
  db: DB;
  setActiveSession: React.Dispatch<React.SetStateAction<ActiveSession | null>>;
}) {
  const [bestOf, setBestOf] = useState<number>(3);
  const [sessionTeams, setSessionTeams] = useState<SessionTeam[]>([]);
  const [teamName, setTeamName] = useState('');
  const [teamPlayers, setTeamPlayers] = useState<string[]>([]);

  const availablePlayers = db.players.filter(
    (p) => !sessionTeams.flatMap((t) => t.players).includes(p.id)
  );
  
  function toggleTeamPlayer(id: string) {
    setTeamPlayers((current) => {
      if (current.includes(id)) return current.filter((pId) => pId !== id);
      if (current.length >= 2) return current;
      return [...current, id];
    });
  }

  function addTeam() {
    if (teamPlayers.length !== 2) {
      alert(`Bitte genau 2 Spieler für das Team auswählen.`);
      return;
    }
    const finalTeamName =
      teamName.trim() ||
      teamPlayers.map((pId) => nameOf(db.players, pId)).join(' & ');
    setSessionTeams((current) => [
      ...current,
      { id: uid(), name: finalTeamName, players: teamPlayers },
    ]);
    setTeamName('');
    setTeamPlayers([]);
  }

  function handleStart() {
    if (sessionTeams.length !== 2) {
      alert("Bitte genau 2 Teams für eine 'Best of'-Session erstellen.");
      return;
    }
    const schedule: ActiveSessionMatch[] = Array.from(
      { length: bestOf },
      () => ({
        id: uid(),
        teamA: sessionTeams[0],
        teamB: sessionTeams[1],
        goalsA: null,
        goalsB: null,
      })
    );
    setActiveSession({ type: '2v2', teams: sessionTeams, schedule, bestOf, mode: '2v2' });
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-3 text-center">Neue 2v2 Best-Of-Session</h2>
      <div className="border-b pb-4 mb-4 dark:border-slate-600">
        <h3 className="font-semibold mb-2">1. Session-Einstellungen</h3>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
           <label className="flex items-center gap-2 text-sm">
            <span className="font-medium">Best of:</span>
            <select
              value={bestOf}
              onChange={(e) => setBestOf(Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-neutral-300 dark:bg-slate-700 dark:border-slate-600"
            >
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={7}>7</option>
              <option value={9}>9</option>
            </select>
          </label>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6 border-b pb-4 mb-4 dark:border-slate-600">
        <div>
          <h3 className="font-semibold mb-2">
            2. Teams erstellen (genau 2 benötigt)
          </h3>
          <div className="p-3 bg-neutral-50 rounded-lg space-y-3 dark:bg-slate-700">
            <input
              type="text"
              placeholder="Teamname (optional)"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-sm dark:bg-slate-600 dark:border-slate-500"
            />
            <div className="text-sm">
              Spieler wählen ({2 - teamPlayers.length} / 2):
            </div>
            <div className="flex flex-wrap gap-1">
              {availablePlayers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => toggleTeamPlayer(p.id)}
                  className={cls(
                    'px-2 py-1 rounded-lg border text-xs',
                    teamPlayers.includes(p.id)
                      ? 'bg-[rgb(var(--accent))] border-[rgb(var(--accent))] text-white'
                      : 'bg-white border-neutral-300 hover:bg-neutral-50 dark:bg-slate-600 dark:border-slate-500 dark:hover:bg-slate-500'
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <button
              onClick={addTeam}
              disabled={
                teamPlayers.length !== 2 ||
                sessionTeams.length >= 2
              }
              className="w-full px-4 py-2 rounded-xl text-white bg-[rgb(var(--accent2))] disabled:bg-neutral-400 disabled:dark:bg-slate-600 text-sm"
            >
              Team hinzufügen
            </button>
          </div>
        </div>
        <div>
          <h3 className="font-semibold mb-2">
            Teilnehmende Teams ({sessionTeams.length}/2)
          </h3>
          {sessionTeams.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Noch keine Teams hinzugefügt.
            </p>
          )}
          <ul className="space-y-1">
            {sessionTeams.map((team, i) => (
              <li
                key={team.id}
                className="text-sm flex justify-between items-center p-2 rounded bg-white border dark:bg-slate-700 dark:border-slate-600"
              >
                <span>
                  {i + 1}. <b>{team.name}</b> (
                  {team.players
                    .map((pId) => nameOf(db.players, pId))
                    .join(', ')}
                  )
                </span>
                <button
                  onClick={() =>
                    setSessionTeams((t) => t.filter((t) => t.id !== team.id))
                  }
                  className="text-red-500 text-xs"
                >
                  X
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <button
          onClick={handleStart}
          disabled={sessionTeams.length !== 2}
          className="px-6 py-3 rounded-xl text-white font-bold bg-[rgb(var(--accent))] disabled:bg-neutral-400 disabled:dark:bg-slate-600"
        >
          Session starten
        </button>
      </div>
    </div>
  );
}

function ActiveBestOfDisplay({
  setDb,
  activeSession,
  setActiveSession,
}: {
  setDb: React.Dispatch<React.SetStateAction<DB>>;
  activeSession: ActiveBestOfSession;
  setActiveSession: React.Dispatch<React.SetStateAction<ActiveSession | null>>;
}) {
  const [schedule, setSchedule] = useState(activeSession.schedule);

  const winsNeeded = Math.ceil(activeSession.bestOf / 2);

  const scores = useMemo(() => {
    const teamAWins = schedule.filter(
      (m) => m.goalsA !== null && m.goalsB !== null && m.goalsA > m.goalsB
    ).length;
    const teamBWins = schedule.filter(
      (m) => m.goalsA !== null && m.goalsB !== null && m.goalsB > m.goalsA
    ).length;
    return { teamAWins, teamBWins };
  }, [schedule]);

  function updateScore(matchId: string, team: 'A' | 'B', value: string) {
    setSchedule((current) =>
      current.map((match) => {
        if (match.id === matchId) {
          const score = value === '' ? null : parseInt(value, 10);
          if (isNaN(score)) return match;
          return { ...match, [team === 'A' ? 'goalsA' : 'goalsB']: score };
        }
        return match;
      })
    );
  }

  const finishSession = (isConfirmed = false) => {
     if (
      !isConfirmed &&
      scores.teamAWins < winsNeeded &&
      scores.teamBWins < winsNeeded
    ) {
      if (
        !window.confirm(
          'Die Serie ist noch nicht entschieden. Trotzdem beenden und speichern?'
        )
      )
        return;
    }

    const winnerTeam =
      scores.teamAWins >= winsNeeded
        ? activeSession.teams[0]
        : scores.teamBWins >= winsNeeded
        ? activeSession.teams[1]
        : null;
    const kings = winnerTeam ? winnerTeam.players : [];

    const sessionId = uid();
    const now = new Date().toISOString();

    const newMatches: Match[] = schedule
      .filter((m) => m.goalsA !== null && m.goalsB !== null)
      .map((m) => ({
        id: uid(),
        dateISO: now,
        mode: activeSession.mode,
        sessionId,
        teamAPlayers: m.teamA.players,
        teamBPlayers: m.teamB.players,
        goalsA: m.goalsA as number,
        goalsB: m.goalsB as number,
        teamAName: m.teamA.name,
        teamBName: m.teamB.name,
        enteredBy: 'Session',
      }));

    const newKingSession: KingSession = {
      id: sessionId,
      dateISO: now,
      kings,
      kingEnteredBy: 'Session',
      bestOf: activeSession.bestOf,
      mode: activeSession.mode,
    };

    setDb((prev) => ({
      ...prev,
      matches: [...prev.matches, ...newMatches],
      kingSessions: [...prev.kingSessions, newKingSession],
    }));
    const winnerName = winnerTeam ? winnerTeam.name : 'Niemand';
    alert(
      `Session beendet! Der Sieger ist: ${winnerName}! Alle Spiele und der Königstitel wurden gespeichert.`
    );
    setActiveSession(null);
  }

  useEffect(() => {
    if (scores.teamAWins >= winsNeeded || scores.teamBWins >= winsNeeded) {
        // Use a timeout to allow state to update and avoid confirm dialogs blocking UI
        setTimeout(() => finishSession(true), 100);
    }
  }, [scores, winsNeeded]);

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-[rgb(var(--paper))] rounded-2xl shadow border border-neutral-200 p-4 dark:bg-slate-800 dark:border-slate-700">
        <h2 className="text-xl font-semibold mb-1">
          Laufende 2v2 Session: Best of {activeSession.bestOf}
        </h2>
        <h3 className="text-2xl font-bold text-center mb-4">
          {activeSession.teams[0].name}{' '}
          <span className="text-[rgb(var(--accent))]">
            {scores.teamAWins} : {scores.teamBWins}
          </span>{' '}
          {activeSession.teams[1].name}
        </h3>
        <div className="space-y-2">
          {schedule.map((match, i) => (
            <div
              key={match.id}
              className="grid grid-cols-[1fr,50px,20px,50px,1fr] items-center gap-2 p-2 bg-neutral-50 rounded-lg dark:bg-slate-700"
            >
              <span className="text-right font-bold">Spiel {i + 1}</span>
              <input
                type="number"
                min="0"
                value={match.goalsA ?? ''}
                onChange={(e) => updateScore(match.id, 'A', e.target.value)}
                className="w-full text-center p-1 rounded-md border border-neutral-300 dark:bg-slate-600 dark:border-slate-500"
              />
              <span className="text-center">:</span>
              <input
                type="number"
                min="0"
                value={match.goalsB ?? ''}
                onChange={(e) => updateScore(match.id, 'B', e.target.value)}
                className="w-full text-center p-1 rounded-md border border-neutral-300 dark:bg-slate-600 dark:border-slate-500"
              />
              <span></span>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center mt-4">
          <button
            onClick={() => {
              if (window.confirm('Session wirklich abbrechen?'))
                setActiveSession(null);
            }}
            className="px-4 py-2 rounded-xl bg-neutral-200 text-sm dark:bg-slate-600 dark:text-slate-100"
          >
            Abbrechen
          </button>
          <button
            onClick={() => finishSession(false)}
            className="px-4 py-2 rounded-xl text-white bg-[rgb(var(--accent))]"
          >
            Manuell beenden & speichern
          </button>
        </div>
      </div>
      <div className="bg-[rgb(var(--paper))] rounded-2xl shadow border border-neutral-200 p-4 self-start dark:bg-slate-800 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-3">Session Info</h3>
        <p>
          <b>Modus:</b> {activeSession.mode}
        </p>
        <p>
          <b>Teams:</b>
        </p>
        <ul className="list-disc pl-5">
          {activeSession.teams.map((t) => (
            <li key={t.id}>{t.name}</li>
          ))}
        </ul>
        <p className="mt-2">
          <b>Siege zum Gewinn:</b> {winsNeeded}
        </p>
      </div>
    </div>
  );
}

function StartTournamentForm({
  db,
  setActiveSession,
}: {
  db: DB;
  setActiveSession: React.Dispatch<React.SetStateAction<ActiveSession | null>>;
}) {
    const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
    const [rounds, setRounds] = useState<number>(1);

    function togglePlayer(player: Player) {
        setSelectedPlayers(current => 
            current.some(p => p.id === player.id)
                ? current.filter(p => p.id !== player.id)
                : [...current, player]
        );
    }

    function generateSchedule(players: Player[], numRounds: number): ActiveSessionMatch[] {
        let participants = [...players];
        const isOdd = participants.length % 2 !== 0;
        if (isOdd) {
            // Add a dummy player for bye rounds
            participants.push({ id: 'bye', name: 'BYE' });
        }

        const playerCount = participants.length;
        const numRoundsForRR = playerCount - 1;

        const allHinrundeMatches: ActiveSessionMatch[][] = [];

        // Generate one full Round Robin set of rounds (Hinrunde)
        for (let r = 0; r < numRoundsForRR; r++) {
            const roundMatches: ActiveSessionMatch[] = [];
            for (let i = 0; i < playerCount / 2; i++) {
                const p1 = participants[i];
                const p2 = participants[playerCount - 1 - i];

                if (p1.id !== 'bye' && p2.id !== 'bye') {
                     roundMatches.push({
                        id: uid(),
                        teamA: { id: p1.id, name: p1.name, players: [p1.id] },
                        teamB: { id: p2.id, name: p2.name, players: [p2.id] },
                        goalsA: null,
                        goalsB: null,
                    });
                }
            }
            allHinrundeMatches.push(roundMatches);

            // Rotate for next round: keep first player, rotate the rest
            const lastPlayer = participants.pop();
            participants.splice(1, 0, lastPlayer!);
        }
        
        const finalSchedule: ActiveSessionMatch[] = [];

        // Add Hinrunde matches
        finalSchedule.push(...allHinrundeMatches.flat());

        // Add Rückrunde matches if selected
        if (numRounds >= 2) {
            const rueckrundeMatches = allHinrundeMatches.map(round =>
                round.map(match => ({
                    ...match,
                    id: uid(),
                    teamA: match.teamB, // Swap teams for return leg
                    teamB: match.teamA,
                }))
            );
            finalSchedule.push(...rueckrundeMatches.flat());
        }

        // Add double matches if selected
        if (numRounds >= 4) {
             const extraHinrundeMatches = allHinrundeMatches.map(round =>
                round.map(match => ({...match, id: uid() }))
            );
             const extraRueckrundeMatches = allHinrundeMatches.map(round =>
                round.map(match => ({
                    ...match,
                    id: uid(),
                    teamA: match.teamB,
                    teamB: match.teamA,
                }))
            );
            finalSchedule.push(...extraHinrundeMatches.flat());
            finalSchedule.push(...extraRueckrundeMatches.flat());
        }

        return finalSchedule;
    }
    
    function handleStart() {
        if (selectedPlayers.length < 3) {
            alert('Bitte mindestens 3 Spieler für ein Turnier auswählen.');
            return;
        }

        const schedule = generateSchedule(selectedPlayers, rounds);
        setActiveSession({
            type: 'tournament',
            players: selectedPlayers,
            schedule,
            rounds,
            mode: 'tournament',
        });
    }

    return (
        <div>
            <h2 className="text-xl font-semibold mb-3 text-center">Neue Einzelsession (Turnier)</h2>
            <div className="space-y-4">
                <div>
                    <h3 className="font-semibold mb-2">1. Runden</h3>
                    <select
                        value={rounds}
                        onChange={e => setRounds(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:bg-slate-700 dark:border-slate-600"
                    >
                        <option value={1}>Hinrunde</option>
                        <option value={2}>Hin- und Rückrunde</option>
                        <option value={4}>Doppelte Hin- und Rückrunde</option>
                    </select>
                </div>

                <div>
                    <h3 className="font-semibold mb-2">2. Spieler auswählen ({selectedPlayers.length})</h3>
                    <div className="flex flex-wrap gap-2 p-3 bg-neutral-50 rounded-lg dark:bg-slate-700">
                        {db.players.map(player => (
                            <button
                                key={player.id}
                                onClick={() => togglePlayer(player)}
                                className={cls(
                                    'px-3 py-1.5 rounded-lg border text-sm',
                                    selectedPlayers.some(p => p.id === player.id)
                                        ? 'bg-[rgb(var(--accent))] border-[rgb(var(--accent))] text-white'
                                        : 'bg-white border-neutral-300 hover:bg-neutral-50 dark:bg-slate-600 dark:border-slate-500 dark:hover:bg-slate-500'
                                )}
                            >
                                {player.name}
                            </button>
                        ))}
                    </div>
                </div>
                
                <div className="flex justify-end pt-2">
                    <button
                      onClick={handleStart}
                      disabled={selectedPlayers.length < 3}
                      className="px-6 py-3 rounded-xl text-white font-bold bg-[rgb(var(--accent))] disabled:bg-neutral-400 disabled:dark:bg-slate-600"
                    >
                        Turnier starten
                    </button>
                </div>
            </div>
        </div>
    );
}

function ActiveTournamentDisplay({
  setDb,
  activeSession,
  setActiveSession,
}: {
  setDb: React.Dispatch<React.SetStateAction<DB>>;
  activeSession: ActiveTournamentSession;
  setActiveSession: React.Dispatch<React.SetStateAction<ActiveSession | null>>;
}) {
    const [schedule, setSchedule] = useState<ActiveSessionMatch[]>(activeSession.schedule);
    
    const playedMatches = useMemo(() => schedule.filter((m): m is ActiveSessionMatch & { goalsA: number; goalsB: number } => m.goalsA !== null && m.goalsB !== null), [schedule]);
    const allMatchesPlayed = playedMatches.length === schedule.length;

    const standings = useMemo(() => {
        const playerStats = new Map(activeSession.players.map(p => [p.id, {
            id: p.id, name: p.name, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0, goalDiff: 0
        }]));

        for (const match of playedMatches) {
            const statsA = playerStats.get(match.teamA.id)!;
            const statsB = playerStats.get(match.teamB.id)!;

            statsA.played++;
            statsB.played++;
            statsA.goalsFor += match.goalsA;
            statsA.goalsAgainst += match.goalsB;
            statsB.goalsFor += match.goalsB;
            statsB.goalsAgainst += match.goalsA;

            if (match.goalsA > match.goalsB) {
                statsA.wins++;
                statsB.losses++;
                statsA.points += 3;
            } else if (match.goalsB > match.goalsA) {
                statsB.wins++;
                statsA.losses++;
                statsB.points += 3;
            } else {
                statsA.draws++;
                statsB.draws++;
                statsA.points += 1;
                statsB.points += 1;
            }
        }
        
        return Array.from(playerStats.values()).map(s => ({...s, goalDiff: s.goalsFor - s.goalsAgainst})).sort(
            (a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.name.localeCompare(b.name)
        );
    }, [activeSession.players, playedMatches]);

    const tiebreakerInfo = useMemo(() => {
        if (!allMatchesPlayed || schedule.some(m => m.isTiebreaker)) return null;

        if (standings.length >= 2) {
            const p1 = standings[0];
            const p2 = standings[1];
            if (p1.points === p2.points && p1.goalDiff === p2.goalDiff && p1.goalsFor === p2.goalsFor) {
                return {p1, p2};
            }
        }
        return null;
    }, [allMatchesPlayed, standings, schedule]);

    useEffect(() => {
        if (tiebreakerInfo) {
            const tiebreakerMatch: ActiveSessionMatch = {
                id: uid(),
                teamA: { id: tiebreakerInfo.p1.id, name: tiebreakerInfo.p1.name, players: [tiebreakerInfo.p1.id] },
                teamB: { id: tiebreakerInfo.p2.id, name: tiebreakerInfo.p2.name, players: [tiebreakerInfo.p2.id] },
                goalsA: null, goalsB: null, isTiebreaker: true
            };
            setSchedule(s => [...s, tiebreakerMatch]);
        }
    }, [tiebreakerInfo]);

    function updateScore(matchId: string, team: 'A' | 'B', value: string) {
        setSchedule(current => current.map(match => {
            if (match.id === matchId) {
                const score = value === '' ? null : parseInt(value, 10);
                if (isNaN(score)) return match;
                return { ...match, [team === 'A' ? 'goalsA' : 'goalsB']: score };
            }
            return match;
        }));
    }

    function finishSession() {
        if (!allMatchesPlayed) {
            if (!window.confirm("Nicht alle Spiele sind beendet. Trotzdem speichern?")) return;
        }

        const finalWinner = standings.length > 0 ? [standings[0].id] : [];
        const sessionId = uid();
        const now = new Date().toISOString();

        const newMatches: Match[] = playedMatches.map(m => ({
            id: m.id, dateISO: now, mode: 'tournament', sessionId,
            teamAPlayers: m.teamA.players, teamBPlayers: m.teamB.players,
            goalsA: m.goalsA as number,
            goalsB: m.goalsB as number,
            teamAName: m.teamA.name, teamBName: m.teamB.name, enteredBy: 'Turnier'
        }));

        const newKingSession: KingSession = {
            id: sessionId, dateISO: now, kings: finalWinner, kingEnteredBy: 'Turnier',
            mode: 'tournament', rounds: activeSession.rounds, tournamentParticipants: activeSession.players.length
        };
        
        setDb(prev => ({
            ...prev,
            matches: [...prev.matches, ...newMatches],
            kingSessions: [...prev.kingSessions, newKingSession]
        }));

        alert(`Turnier beendet! Der Sieger ist ${standings[0]?.name || 'unbekannt'}. Alles wurde gespeichert.`);
        setActiveSession(null);
    }
    
    const roundNames: {[key: number]: string} = {1: "Hinrunde", 2: "Hin- und Rückrunde", 4: "Doppelte Hin- und Rückrunde"};

    return (
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[rgb(var(--paper))] rounded-2xl shadow border border-neutral-200 p-4 dark:bg-slate-800 dark:border-slate-700">
          <h2 className="text-xl font-semibold mb-2">Laufendes Turnier: {roundNames[activeSession.rounds]}</h2>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
            {schedule.map((match) => (
              <div key={match.id} className={cls("grid grid-cols-[1fr_auto_50px_20px_50px_auto_1fr] items-center gap-2 p-2 rounded-lg", match.isTiebreaker ? 'bg-amber-100 dark:bg-amber-900/50 border-2 border-amber-400' : 'bg-neutral-50 dark:bg-slate-700')}>
                <span className="text-right font-medium">{match.teamA.name}</span>
                <img src={`https://api.dicebear.com/8.x/initials/svg?seed=${match.teamA.name}`} className="h-6 w-6 rounded-full" />
                <input type="number" min="0" value={match.goalsA ?? ''} onChange={(e) => updateScore(match.id, 'A', e.target.value)} className="w-full text-center p-1 rounded-md border border-neutral-300 dark:bg-slate-600 dark:border-slate-500" />
                <span className="text-center font-bold text-gray-400 dark:text-slate-400">:</span>
                <input type="number" min="0" value={match.goalsB ?? ''} onChange={(e) => updateScore(match.id, 'B', e.target.value)} className="w-full text-center p-1 rounded-md border border-neutral-300 dark:bg-slate-600 dark:border-slate-500" />
                 <img src={`https://api.dicebear.com/8.x/initials/svg?seed=${match.teamB.name}`} className="h-6 w-6 rounded-full" />
                <span className="text-left font-medium">{match.teamB.name}</span>
              </div>
            ))}
          </div>
           <div className="flex justify-between items-center mt-4">
              <button onClick={() => { if(window.confirm('Turnier wirklich abbrechen?')) setActiveSession(null) }} className="px-4 py-2 rounded-xl bg-neutral-200 text-sm dark:bg-slate-600 dark:text-slate-100">Abbrechen</button>
              <button onClick={finishSession} disabled={!allMatchesPlayed || !!tiebreakerInfo} className="px-4 py-2 rounded-xl text-white bg-[rgb(var(--accent))] disabled:bg-neutral-400 disabled:dark:bg-slate-600">Turnier beenden & speichern</button>
            </div>
        </div>
        <div className="bg-[rgb(var(--paper))] rounded-2xl shadow border border-neutral-200 p-4 self-start dark:bg-slate-800 dark:border-slate-700">
            <h3 className="text-lg font-semibold mb-3">Live-Tabelle</h3>
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left border-b dark:border-slate-600">
                        <th className="p-1 font-medium text-[rgb(var(--muted))] dark:text-slate-400">#</th>
                        <th className="p-1 font-medium text-[rgb(var(--muted))] dark:text-slate-400">Spieler</th>
                        <th className="p-1 font-medium text-[rgb(var(--muted))] dark:text-slate-400">P</th>
                        <th className="p-1 font-medium text-[rgb(var(--muted))] dark:text-slate-400">Diff</th>
                        <th className="p-1 font-medium text-[rgb(var(--muted))] dark:text-slate-400">Tore</th>
                    </tr>
                </thead>
                <tbody>
                    {standings.map((p, i) => (
                        <tr key={p.id} className="border-b last:border-0 dark:border-slate-700">
                            <td className="p-1">{i+1}</td>
                            <td className="p-1 font-semibold">{p.name}</td>
                            <td className="p-1 font-bold">{p.points}</td>
                            <td className="p-1">{p.goalDiff > 0 ? `+${p.goalDiff}` : p.goalDiff}</td>
                            <td className="p-1">{p.goalsFor}:{p.goalsAgainst}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>
    );
}


// ===================================================================================
// TAB: REGELVERSTÖSSE
// ===================================================================================
function ViolationsTab({
  db,
  setDb,
}: {
  db: DB;
  setDb: React.Dispatch<React.SetStateAction<DB>>;
}) {
  const [playerId, setPlayerId] = useState('');
  const [type, setType] = useState<ViolationType>('unerlaubt_pausiert');
  const [comment, setComment] = useState('');
  const [enteredBy, setEnteredBy] = useState('');
  function addViolation() {
    if (!playerId) {
      alert('Bitte einen Spieler auswählen.');
      return;
    }
    const violation: Violation = {
      id: uid(),
      dateISO: new Date().toISOString(),
      playerId,
      type,
      comment,
      enteredBy: enteredBy || 'Unbekannt',
    };
    setDb((prev) => ({ ...prev, violations: [violation, ...prev.violations] }));
    setPlayerId('');
    setType('unerlaubt_pausiert');
    setComment('');
  }
  const sortedViolations = [...db.violations].sort(
    (a, b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime()
  );
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 bg-[rgb(var(--paper))] rounded-2xl shadow border border-neutral-200 p-4 self-start dark:bg-slate-800 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-3">Neuer Regelverstoß</h3>
        <div className="space-y-3 text-sm">
          <div>
            <label className="block mb-1">Spieler</label>
            <select
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:bg-slate-700 dark:border-slate-600"
            >
              <option value="">- auswählen -</option>
              {db.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1">Verstoß</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ViolationType)}
              className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:bg-slate-700 dark:border-slate-600"
            >
              {Object.entries(VIOLATION_TYPES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1">Kommentar (optional)</label>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Details..."
              className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:bg-slate-700 dark:border-slate-600"
            />
          </div>
          <div>
            <label className="block mb-1">Eingetragen von</label>
            <SelectOrInput
              players={db.players}
              value={enteredBy}
              onChange={setEnteredBy}
              placeholder="Dein Name"
            />
          </div>
          <div className="text-right pt-2">
            <button
              onClick={addViolation}
              className="px-4 py-2 rounded-xl text-white bg-[rgb(var(--accent2))]"
            >
              Hinzufügen
            </button>
          </div>
        </div>
      </div>
      <div className="lg:col-span-2 bg-[rgb(var(--paper))] rounded-2xl shadow border border-neutral-200 p-4 dark:bg-slate-800 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-3">
          Protokoll der Regelverstöße
        </h3>
        <ul className="divide-y dark:divide-slate-700">
          {sortedViolations.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Bisher keine Verstöße. Vorbildlich!
            </p>
          )}
          {sortedViolations.map((v) => (
            <li key={v.id} className="py-2 text-sm">
              <div className="flex justify-between">
                <span className="font-bold">
                  {nameOf(db.players, v.playerId)}
                </span>
                <span className="text-xs text-gray-400 dark:text-slate-500">
                  {new Date(v.dateISO).toLocaleString()}
                </span>
              </div>
              <p className="text-gray-600 dark:text-slate-300">{VIOLATION_TYPES[v.type]}</p>
              {v.comment && (
                <p className="text-xs text-gray-500 italic pl-2 border-l-2 border-gray-200 my-1 dark:text-slate-400 dark:border-slate-600">
                  "{v.comment}"
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ===================================================================================
//  TAB: HISTORY
// ===================================================================================
function History({
  db,
  setDb,
}: {
  db: DB;
  setDb: React.Dispatch<React.SetStateAction<DB>>;
}) {
  function deleteMatch(id: string) {
    if (window.confirm('Soll dieses Spiel wirklich gelöscht werden?')) {
      setDb((prev) => ({
        ...prev,
        matches: prev.matches.filter((m) => m.id !== id),
      }));
    }
  }
  function removeKingTitle(id: string) {
    if (
      window.confirm(
        'Soll der Königstitel dieser Session wirklich entfernt werden? Die Session bleibt in der History, zählt aber nicht mehr als Sieg.'
      )
    ) {
      setDb((prev) => ({
        ...prev,
        kingSessions: prev.kingSessions.map((s) =>
          s.id === id ? { ...s, kings: [] } : s
        ),
      }));
    }
  }
  const combinedHistory = useMemo(() => {
    const matchHistory = db.matches.map((m) => ({
      type: 'match' as const,
      date: m.dateISO,
      data: m,
    }));
    const sessionHistory = db.kingSessions.map((s) => ({
      type: 'session' as const,
      date: s.dateISO,
      data: s,
    }));
    return [...matchHistory, ...sessionHistory].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [db.matches, db.kingSessions]);
  
  const roundNames: {[key: number]: string} = {1: "Hinrunde", 2: "Hin- & Rückrunde", 4: "Doppelte Hin- & Rückrunde"};

  return (
    <div className="bg-[rgb(var(--paper))] rounded-2xl shadow border border-neutral-200 p-4 dark:bg-slate-800 dark:border-slate-700">
      <h2 className="text-xl font-semibold mb-3">Verlauf</h2>
      <ul className="divide-y dark:divide-slate-700">
        {combinedHistory.map((item, index) => {
          if (item.type === 'match') {
            const m = item.data;
            return (
              <li
                key={`match-${m.id}-${index}`}
                className="py-3 flex items-start justify-between gap-3 text-sm"
              >
                <div>
                  <div>
                    {new Date(m.dateISO).toLocaleString()} •{' '}
                    {m.mode === '2v2' ? '2vs2 Spiel' : 'Turnierspiel'}
                  </div>
                  <div className="font-semibold text-base">
                    {m.teamAName}{' '}
                    <span className="text-lg">
                      {m.goalsA} : {m.goalsB}
                    </span>{' '}
                    {m.teamBName}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-slate-400">
                    Eingetragen von: {m.enteredBy}{' '}
                    {m.sessionId
                      ? `(Session ID: ...${m.sessionId.slice(-4)})`
                      : ''}
                  </div>
                </div>
                <button
                  onClick={() => deleteMatch(m.id)}
                  className="px-2 py-1 rounded-lg border text-red-500 border-red-200 hover:bg-red-50 text-xs dark:border-red-500/30 dark:hover:bg-red-500/10"
                >
                  Löschen
                </button>
              </li>
            );
          } else {
            const s = item.data;
            let sessionInfo = '';
            if (s.mode === '2v2') {
                sessionInfo = `2v2, Best of ${s.bestOf}`;
            } else if (s.mode === 'tournament') {
                sessionInfo = `Turnier, ${s.tournamentParticipants} Spieler, ${s.rounds ? roundNames[s.rounds] : 'unbekannt'}`;
            }
            
            return (
              <li
                key={`session-${s.id}-${index}`}
                className="py-3 flex items-start justify-between gap-3 text-sm bg-amber-50/50 px-2 rounded dark:bg-amber-900/20"
              >
                <div>
                  <div>
                    {new Date(s.dateISO).toLocaleString()} • Session-Ende ({sessionInfo})
                  </div>
                  {s.kings.length > 0 ? (
                    <div className="font-semibold">
                      König(e):{' '}
                      {s.kings.map((id) => nameOf(db.players, id)).join(' & ')}
                    </div>
                  ) : (
                    <div className="text-gray-500 dark:text-slate-400">
                      Kein Königstitel für diese Session vergeben.
                    </div>
                  )}
                  {s.kingEnteredBy && (
                    <div className="text-xs text-gray-500 dark:text-slate-400">
                      Eingetragen von: {s.kingEnteredBy}
                    </div>
                  )}
                </div>
                {s.kings.length > 0 && (
                  <button
                    onClick={() => removeKingTitle(s.id)}
                    className="px-2 py-1 rounded-lg border text-orange-600 border-orange-200 hover:bg-orange-50 text-xs dark:border-orange-500/30 dark:hover:bg-orange-500/10"
                  >
                    Titel entfernen
                  </button>
                )}
              </li>
            );
          }
        })}
      </ul>
    </div>
  );
}

// ===================================================================================
//  TAB: STATISTIKEN
// ===================================================================================
function Stats({ db, kingInfo }: { db: DB; kingInfo: KingInfo }) {
  const violationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    db.players.forEach((p) => (counts[p.id] = 0));
    db.violations.forEach((v) => {
      if (counts[v.playerId] !== undefined) counts[v.playerId]++;
    });
    return counts;
  }, [db.violations, db.players]);

  const playerStats = useMemo(() => {
    return db.players
      .map((p) => ({
        id: p.id,
        name: p.name,
        longestStreak: kingInfo.longestStreaks[p.id] || 0,
        violations: violationCounts[p.id] || 0,
      }))
      .sort(
        (a, b) =>
          b.longestStreak - a.longestStreak || a.violations - b.violations
      );
  }, [db.players, kingInfo.longestStreaks, violationCounts]);

  return (
    <div className="bg-[rgb(var(--paper))] rounded-2xl shadow border border-neutral-200 p-4 dark:bg-slate-800 dark:border-slate-700">
      <h2 className="text-xl font-semibold mb-3">Spielerstatistiken</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b dark:border-slate-600">
              <th className="py-2 pr-3 font-medium text-[rgb(var(--muted))] dark:text-slate-400">
                Spieler
              </th>
              <th className="py-2 pr-3 font-medium text-[rgb(var(--muted))] dark:text-slate-400">
                Längste Königsserie
              </th>
              <th className="py-2 pr-3 font-medium text-[rgb(var(--muted))] dark:text-slate-400">
                Regelverstöße
              </th>
            </tr>
          </thead>
          <tbody>
            {playerStats.map((p) => (
              <tr key={p.id} className="border-b last:border-0 dark:border-slate-700">
                <td className="py-2 pr-3 font-semibold">
                  <PlayerNameDisplay
                    playerId={p.id}
                    players={db.players}
                    kingInfo={kingInfo}
                  />
                </td>
                <td className="py-2 pr-3">{p.longestStreak}</td>
                <td className="py-2 pr-3">{p.violations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===================================================================================
//  TAB: EINSTELLUNGEN
// ===================================================================================
function Settings({
  db,
  setDb,
}: {
  db: DB;
  setDb: React.Dispatch<React.SetStateAction<DB>>;
}) {
  const [newName, setNewName] = useState('');
  function addPlayer() {
    if (newName.trim() && !db.players.some((p) => p.name === newName.trim())) {
      setDb((prev) => ({
        ...prev,
        players: [...prev.players, { id: uid(), name: newName.trim() }],
      }));
      setNewName('');
    }
  }
  function deletePlayer(id: string) {
    if (window.confirm('Soll dieser Spieler wirklich gelöscht werden?')) {
      setDb((prev) => ({
        ...prev,
        players: prev.players.filter((p) => p.id !== id),
      }));
    }
  }
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="bg-[rgb(var(--paper))] rounded-2xl shadow border border-neutral-200 p-4 dark:bg-slate-800 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-3">Spieler verwalten</h3>
        <ul className="divide-y mb-3 dark:divide-slate-700">
          {db.players.map((p) => (
            <li key={p.id} className="py-2 flex items-center justify-between">
              <span>{p.name}</span>
              <button
                onClick={() => deletePlayer(p.id)}
                className="text-red-500 text-sm"
              >
                Löschen
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Neuer Spielername"
            className="flex-1 px-3 py-2 rounded-xl border border-neutral-300 dark:bg-slate-700 dark:border-slate-600"
          />
          <button
            onClick={addPlayer}
            className="px-4 py-2 rounded-xl bg-[rgb(var(--accent))] text-white"
          >
            +
          </button>
        </div>
      </div>
      <div className="bg-[rgb(var(--paper))] rounded-2xl shadow border border-neutral-200 p-4 dark:bg-slate-800 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-3">Theme</h3>
        <div className="flex flex-col gap-2">
          {Object.entries(THEMES).map(([key, theme]) => (
            <button
              key={key}
              onClick={() =>
                setDb((prev) => ({ ...prev, theme: key as ThemeKey }))
              }
              className={cls(
                'px-3 py-2 rounded-xl border w-full text-left dark:border-slate-600',
                db.theme === key ? 'border-[rgb(var(--accent))] border-2' : 'dark:hover:bg-slate-700'
              )}
            >
              {theme.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===================================================================================
//  HELPER COMPONENTS
// ===================================================================================
function SelectOrInput({
  players,
  value,
  onChange,
  placeholder,
}: {
  players: Player[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [mode, setMode] = useState<'select' | 'manual'>('select');
  if (mode === 'manual') {
    return (
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:bg-slate-700 dark:border-slate-600"
        />
        <button onClick={() => setMode('select')} className="text-xs">
          Liste
        </button>
      </div>
    );
  }
  return (
    <select
      className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:bg-slate-700 dark:border-slate-600"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '__manual__') {
          setMode('manual');
          onChange('');
        } else onChange(v);
      }}
    >
      <option value="">– auswählen –</option>
      {players.map((p) => (
        <option key={p.id} value={p.name}>
          {p.name}
        </option>
      ))}
      <option value="__manual__">Andere…</option>
    </select>
  );
}


