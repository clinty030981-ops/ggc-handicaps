import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_PAR = "72";
const CLUB_CODE = "GGC2026";
const STORAGE_KEY = "ggc_handicaps_local_v2";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

type ScoreEntry = {
  id: string;
  score: string;
  par: string;
  date: string;
  course: string;
};

type Player = {
  id: string;
  name: string;
  currentHandicap: string;
  scoreInput: string;
  parInput: string;
  courseInput: string;
  dateInput: string;
  scoreHistory: ScoreEntry[];
};

function toNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundWhole(value: number) {
  return Math.round(value);
}

function calculateHandicapFromAllScores(
  currentHandicap: number,
  allScores: { score: number; par: number }[]
) {
  if (allScores.length === 0) return null;

  const averageGross =
    allScores.reduce((sum, item) => sum + item.score, 0) / allScores.length;

  const averagePar =
    allScores.reduce((sum, item) => sum + item.par, 0) / allScores.length;

  const scoreToPar = averageGross - averagePar;
  const newHandicap = roundWhole((currentHandicap + scoreToPar) / 2);

  return {
    averageGross,
    averagePar,
    scoreToPar,
    newHandicap,
    roundsUsed: allScores.length,
  };
}

function makeScoreEntry(
  score = "",
  par = DEFAULT_PAR,
  date = "",
  course = ""
): ScoreEntry {
  return {
    id: crypto.randomUUID(),
    score,
    par,
    date,
    course,
  };
}

function createPlayer(
  name: string,
  currentHandicap: string,
  ruimsig: string | null,
  copperleaf: string | null
): Player {
  const history: ScoreEntry[] = [];

  if (copperleaf) {
    history.push(makeScoreEntry(copperleaf, DEFAULT_PAR, "", "Copperleaf"));
  }

  if (ruimsig) {
    history.push(makeScoreEntry(ruimsig, DEFAULT_PAR, "", "Ruimsig"));
  }

  return {
    id: crypto.randomUUID(),
    name,
    currentHandicap,
    scoreInput: "",
    parInput: DEFAULT_PAR,
    courseInput: "",
    dateInput: "",
    scoreHistory: history,
  };
}

const seededPlayers: Player[] = [
  createPlayer("CLINT VAN BUUREN", "18", "87", "95"),
  createPlayer("BRENDAN VAN BUUREN", "14", "82", "87"),
  createPlayer("CLINT YOUNG", "12", "81", "81"),
  createPlayer("RYAN DE VRIES", "18", "80", "86"),
  createPlayer("RICK WYKES", "16", "81", "93"),
  createPlayer("FAIZEL DAMONS", "10", "71", null),
  createPlayer("DELRON PRETORIUS", "18", "90", "95"),
  createPlayer("NASIUS MYBURGH", "14", "75", null),
  createPlayer("NOLAN DE VILLIERS", "18", "97", "93"),
  createPlayer("CHANNING STARKEY", "18", "87", "99"),
  createPlayer("RYAN FERRIS", "18", null, "100"),
  createPlayer("VIKS MAHARAJ", "23", "113", null),
  createPlayer("BRETT LEON", "10", null, "83"),
  createPlayer("KELVIN HEYNES", "18", null, "110"),
];

function getSupabaseClient() {
  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    !SUPABASE_URL.startsWith("https://")
  ) {
    return null;
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export default function App() {
  const [players, setPlayers] = useState<Player[]>(seededPlayers);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(
    seededPlayers[0]?.id || ""
  );
  const [syncMessage, setSyncMessage] = useState("Local mode");

  const supabase = useMemo(() => getSupabaseClient(), []);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPlayers(parsed);
          setSelectedPlayerId(parsed[0]?.id || "");
        }
      } catch {
        // ignore invalid local storage
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
  }, [players]);

  useEffect(() => {
    if (supabase) {
      setSyncMessage("Supabase configured");
    }
  }, [supabase]);

  const selectedPlayer =
    players.find((p) => p.id === selectedPlayerId) || players[0] || null;

  const leaderboard = [...players]
    .map((player) => {
      const calc = calculateHandicapFromAllScores(
        toNumber(player.currentHandicap),
        player.scoreHistory.map((s) => ({
          score: toNumber(s.score),
          par: toNumber(s.par || DEFAULT_PAR),
        }))
      );

      return {
        id: player.id,
        name: player.name,
        handicap: calc ? calc.newHandicap : toNumber(player.currentHandicap),
        roundsUsed: calc ? calc.roundsUsed : 0,
      };
    })
    .sort((a, b) => a.handicap - b.handicap);

  function updatePlayer(id: string, updates: Partial<Player>) {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  }

  function saveRound() {
    if (!selectedPlayer || !selectedPlayer.scoreInput) return;

    const newEntry = makeScoreEntry(
      selectedPlayer.scoreInput,
      selectedPlayer.parInput || DEFAULT_PAR,
      selectedPlayer.dateInput || new Date().toISOString().slice(0, 10),
      selectedPlayer.courseInput
    );

    const updatedHistory = [newEntry, ...selectedPlayer.scoreHistory];

    const recalculated = calculateHandicapFromAllScores(
      toNumber(selectedPlayer.currentHandicap),
      updatedHistory.map((entry) => ({
        score: toNumber(entry.score),
        par: toNumber(entry.par || DEFAULT_PAR),
      }))
    );

    updatePlayer(selectedPlayer.id, {
      currentHandicap: recalculated
        ? String(recalculated.newHandicap)
        : selectedPlayer.currentHandicap,
      scoreInput: "",
      parInput: DEFAULT_PAR,
      courseInput: "",
      dateInput: "",
      scoreHistory: updatedHistory,
    });
  }

  function removeRound(roundId: string) {
    if (!selectedPlayer) return;

    const updatedHistory = selectedPlayer.scoreHistory.filter(
      (r) => r.id !== roundId
    );

    const recalculated = calculateHandicapFromAllScores(
      toNumber(selectedPlayer.currentHandicap),
      updatedHistory.map((entry) => ({
        score: toNumber(entry.score),
        par: toNumber(entry.par || DEFAULT_PAR),
      }))
    );

    updatePlayer(selectedPlayer.id, {
      currentHandicap: recalculated
        ? String(recalculated.newHandicap)
        : selectedPlayer.currentHandicap,
      scoreHistory: updatedHistory,
    });
  }

  function resetPlayers() {
    setPlayers(seededPlayers);
    setSelectedPlayerId(seededPlayers[0]?.id || "");
    localStorage.removeItem(STORAGE_KEY);
  }

  const selectedPlayerCalc = selectedPlayer
    ? calculateHandicapFromAllScores(
        toNumber(selectedPlayer.currentHandicap),
        selectedPlayer.scoreHistory.map((entry) => ({
          score: toNumber(entry.score),
          par: toNumber(entry.par || DEFAULT_PAR),
        }))
      )
    : null;

  return (
    <div
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: 20,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>🏌️ GGC Handicaps</h1>
      <p>Club code: {CLUB_CODE}</p>
      <p>{syncMessage}</p>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <h2>Select player</h2>
        <select
          style={{ width: "100%", padding: 10 }}
          value={selectedPlayerId}
          onChange={(e) => setSelectedPlayerId(e.target.value)}
        >
          {[...players]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
        </select>
      </div>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <h2>Leaderboard</h2>
        {leaderboard.map((row, index) => (
          <div
            key={row.id}
            style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}
          >
            {index + 1}. {row.name} — Handicap {row.handicap} ({row.roundsUsed} rounds)
          </div>
        ))}
      </div>

      {selectedPlayer && (
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <h2>{selectedPlayer.name}</h2>

          <div style={{ marginBottom: 16 }}>
            <strong>Formula used:</strong>
            <div style={{ marginTop: 8 }}>
              New Handicap = round((Current Handicap + (Average of all scores - Average par)) / 2)
            </div>
          </div>

          {selectedPlayerCalc && (
            <div style={{ marginBottom: 16 }}>
              <div>Average gross: {selectedPlayerCalc.averageGross.toFixed(2)}</div>
              <div>Average par: {selectedPlayerCalc.averagePar.toFixed(2)}</div>
              <div>To par: {selectedPlayerCalc.scoreToPar.toFixed(2)}</div>
              <div>Rounds used: {selectedPlayerCalc.roundsUsed}</div>
              <div>
                <strong>Calculated handicap: {selectedPlayerCalc.newHandicap}</strong>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label>Current handicap</label>
              <input
                style={{ width: "100%", padding: 10 }}
                type="number"
                value={selectedPlayer.currentHandicap}
                onChange={(e) =>
                  updatePlayer(selectedPlayer.id, {
                    currentHandicap: e.target.value,
                  })
                }
              />
            </div>

            <div>
              <label>New score</label>
              <input
                style={{ width: "100%", padding: 10 }}
                type="number"
                value={selectedPlayer.scoreInput}
                onChange={(e) =>
                  updatePlayer(selectedPlayer.id, {
                    scoreInput: e.target.value,
                  })
                }
              />
            </div>

            <div>
              <label>Par</label>
              <input
                style={{ width: "100%", padding: 10 }}
                type="number"
                value={selectedPlayer.parInput}
                onChange={(e) =>
                  updatePlayer(selectedPlayer.id, {
                    parInput: e.target.value,
                  })
                }
              />
            </div>

            <div>
              <label>Course</label>
              <input
                style={{ width: "100%", padding: 10 }}
                value={selectedPlayer.courseInput}
                onChange={(e) =>
                  updatePlayer(selectedPlayer.id, {
                    courseInput: e.target.value,
                  })
                }
              />
            </div>

            <div>
              <label>Date</label>
              <input
                style={{ width: "100%", padding: 10 }}
                type="date"
                value={selectedPlayer.dateInput}
                onChange={(e) =>
                  updatePlayer(selectedPlayer.id, {
                    dateInput: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <button
              onClick={saveRound}
              style={{ padding: "10px 16px", marginRight: 8 }}
            >
              Save round
            </button>
            <button onClick={resetPlayers} style={{ padding: "10px 16px" }}>
              Reset
            </button>
          </div>

          <div style={{ marginTop: 16 }}>
            <h3>Score history</h3>
            {selectedPlayer.scoreHistory.length === 0 && <div>No rounds saved yet.</div>}
            {selectedPlayer.scoreHistory.map((entry) => (
              <div
                key={entry.id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 8,
                }}
              >
                <div>
                  Score: {entry.score} | Par: {entry.par}
                  {entry.course ? ` | ${entry.course}` : ""}
                  {entry.date ? ` | ${entry.date}` : ""}
                </div>
                <button
                  onClick={() => removeRound(entry.id)}
                  style={{ marginTop: 8, padding: "6px 10px" }}
                >
                  Delete round
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}