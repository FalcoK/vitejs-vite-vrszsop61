            {[
              "#",
              "Spieler",
              "Spiele",
              "S",
              "U",
              "N",
              "Tore",
              "Gegentore",
              "+/−",
              "Pkte",
              "Pkte/Sp",
              "Tore/Sp",
              "Gegent/Sp",
            ].map((h) => (
              <th key={h} className="py-2 pr-3 font-medium text-[rgb(var(--muted))]">
                {h}
              </th>
            ))}
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
              <tr key={p.id} className="border-b last:border-0">
                <td className="py-2 pr-3">{i + 1}</td>
                <td className="py-2 pr-3 font-semibold">
                  {currentKingIds.includes(p.id) && (
                    <span className="inline-block mr-2" title="Aktueller König">
                      👑
                    </span>
                  )}
                  {p.name}
                </td>
                <td className="py-2 pr-3">{p.played}</td>
                <td className="py-2 pr-3">{p.wins}</td>
                <td className="py-2 pr-3">{p.draws}</td>
                <td className="py-2 pr-3">{p.losses}</td>
                <td className="py-2 pr-3">{p.goalsFor}</td>
                <td className="py-2 pr-3">{p.goalsAgainst}</td>
                <td className="py-2 pr-3">{p.goalDiff}</td>
                <td className="py-2 pr-3 font-semibold">{p.points}</td>
                <td className="py-2 pr-3">{fmt(p.pointsPerGame)}</td>
                <td className="py-2 pr-3">{fmt(p.goalsPerGame)}</td>
                <td className="py-2 pr-3">{fmt(p.concededPerGame)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// ===================== Königs-Sessions Tab =====================
function KingsTab({ db, setDb }: { db: DB; setDb: React.Dispatch<React.SetStateAction<DB>> }) {
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [sessionPlayers, setSessionPlayers] = useState<Player[]>([]);
  const [roundTrip, setRoundTrip] = useState<boolean>(false);
  const [matchSchedule, setMatchSchedule] = useState<
    { teamAPlayers: string[]; teamBPlayers: string[] }[]
  >([]);
  const [matchResults, setMatchResults] = useState<
    { goalsA: number; goalsB: number; entered: boolean }[]
  >([]);
  const [kingEnteredBy, setKingEnteredBy] = useState<string>("");
  const [sessionTitle, setSessionTitle] = useState<string>("");
  const [sessionMode, setSessionMode] = useState<Mode>("1v1");
  const [bestOf, setBestOf] = useState<3 | 5 | 7 | 9>(3);
  const [isBestOfSeries, setIsBestOfSeries] = useState<boolean>(false);

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const sessionsToday = db.sessions.filter((s) => s.startedAtISO.slice(0, 10) === todayKey);
  const nextIndex = sessionsToday.length + 1;

  // Nur rekonstruieren, wenn wirklich Matches vorhanden sind (Fix)
  useEffect(() => {
    if (activeSession && (activeSession.matches?.length ?? 0) > 0) {
      const playersInSession = new Set<string>();
      activeSession.matches!.forEach((m) => {
        m.teamAPlayers.forEach((p) => playersInSession.add(p));
        m.teamBPlayers.forEach((p) => playersInSession.add(p));
      });
      setSessionPlayers(db.players.filter((p) => playersInSession.has(p.id)));
    }
  }, [activeSession, db.players]);

  function generateSchedule(
    players: Player[],
    mode: Mode,
    roundTrip: boolean,
    isBestOf: boolean
  ) {
    if (players.length < 2) return [];
    const schedule: { teamAPlayers: string[]; teamBPlayers: string[] }[] = [];
    const playerIds = players.map((p) => p.id);

    if (isBestOf) {
      if (mode === "1v1") {
        if (playerIds.length !== 2) return [];
        for (let i = 0; i < bestOf; i++) {
          schedule.push({ teamAPlayers: [playerIds[0]], teamBPlayers: [playerIds[1]] });
        }
      } else {
        if (playerIds.length !== 4) return [];
        const [p1, p2, p3, p4] = playerIds;
        for (let i = 0; i < bestOf; i++) {
          schedule.push({ teamAPlayers: [p1, p2], teamBPlayers: [p3, p4] });
        }
      }
    } else {
      // Jeder gegen Jeden
      if (mode === "1v1") {
        for (let i = 0; i < playerIds.length; i++) {
          for (let j = i + 1; j < playerIds.length; j++) {
            schedule.push({ teamAPlayers: [playerIds[i]], teamBPlayers: [playerIds[j]] });
            if (roundTrip) {
              schedule.push({ teamAPlayers: [playerIds[j]], teamBPlayers: [playerIds[i]] });
            }
          }
        }
      } else {
        const pairs: string[][] = [];
        for (let i = 0; i < playerIds.length; i++) {
          for (let j = i + 1; j < playerIds.length; j++) {
            pairs.push([playerIds[i], playerIds[j]]);
          }
        }
        for (let i = 0; i < pairs.length; i++) {
          for (let j = i + 1; j < pairs.length;
