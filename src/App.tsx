import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_PAR = "72";
const CLUB_CODE = "GGC2026";
const STORAGE_KEY = "ggc_handicaps_local_v1";

const SUPABASE_URL = "https://bhkpncdqbpsqnsrqjaye.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEYsb_publishable_HAp6q8y6Oo5VIxg9we9jGQ_J-75mYJU";

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
  gameCount: "1" | "2";
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

function calculateHandicapFromRecentScores(
  currentHandicap: number,
  recentScores: { score: number; par: number }[],
  gameCount: "1" | "2"
) {
  const roundsToUse = gameCount === "2" ? 2 : 1;
  const selected = recentScores.slice(0, roundsToUse);

  if (selected.length === 0) return null;

  const averageGross =
    selected.reduce((sum, item) => sum + item.score, 0) / selected.length;
  const averagePar =
    selected.reduce((sum, item) => sum + item.par, 0) / selected.length;

  const scoreToPar = averageGross - averagePar;
  const newHandicap = roundWhole((currentHandicap + scoreToPar) / 2);

  return {
    averageGross,
    averagePar,
    scoreToPar,
    newHandicap,
    roundsUsed: selected.length,
  };
}

function makeScoreEntry(score = "", par = DEFAULT_PAR, date = "", course = ""): ScoreEntry {
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

  if (copperleaf) history.push(makeScoreEntry(copperleaf, DEFAULT_PAR, "", "Copperleaf"));
  if (ruimsig) history.push(makeScoreEntry(ruimsig, DEFAULT_PAR, "", "Ruimsig"));

  return {
    id: crypto.randomUUID(),
    name,
    currentHandicap,
    gameCount: history.length >= 2 ? "2" : "1",
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
    !SUPABASE_URL.startsWith("https://") ||
    SUPABASE_URL.includes("YOUR-PROJECT") ||
    SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY"
  ) {
    return null;
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export default function App() {
  const [players, setPlayers] = useState<Player[]>(seededPlayers);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(seededPlayers[0]?.id || "");
  const [searchTerm, setSearchTerm] = useState("");
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
        // ignore bad local storage
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

  const filteredPlayers = players.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedPlayer =
    players.find((p) => p.id === selectedPlayerId) || filteredPlayers[0] || null;

  const leaderboard = [...players]
    .map((player) => {
      const calc = calculateHandicapFromRecentScores(
        toNumber(player.currentHandicap),
        player.scoreHistory.map((s) => ({
          score: toNumber(s.score),
          par: toNumber(s.par || DEFAULT_PAR),
        })),
        player.gameCount
      );

      return {
        id: player.id,
        name: player.name,
        handicap: calc ? calc.newHandicap : toNumber(player.currentHandicap),
      };
    })
    .sort((a, b) => a.handicap - b.handicap);

  function updatePlayer(id: string, updates: Partial<Player>) {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  }

  function saveRound() {
    if (!selectedPlayer) return;
    if (!selectedPlayer.scoreInput) return;

    const newEntry = makeScoreEntry(
      selectedPlayer.scoreInput,
      selectedPlayer.parInput || DEFAULT_PAR,
      selectedPlayer.dateInput || new Date().toISOString().slice(0, 10),
      selectedPlayer.courseInput
    );

    const updatedHistory = [newEntry, ...selectedPlayer.scoreHistory];

    const recalculated = calculateHandicapFromRecentScores(
      toNumber(selectedPlayer.currentHandicap),
      updatedHistory.map((entry) => ({
        score: toNumber(entry.score),
        par: toNumber(entry.par || DEFAULT_PAR),
      })),
      selectedPlayer.gameCount
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
    updatePlayer(selectedPlayer.id, {
      scoreHistory: selectedPlayer.scoreHistory.filter((r) => r.id !== roundId),
    });
  }

  function resetPlayers() {
    setPlayers(seededPlayers);
    setSelectedPlayerId(seededPlayers[0]?.id || "");
    localStorage.removeItem(STORAGE_KEY);
  }

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

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2>Search and select player</h2>
        <input
          style={{ width: "100%", padding: 10, marginBottom: 10 }}
          placeholder="Search by golfer name"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <select
          style={{ width: "100%", padding: 10 }}
          value={selectedPlayerId}
          onChange={(e) => setSelectedPlayerId(e.target.value)}
        >
          {filteredPlayers.map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2>Leaderboard</h2>
        {leaderboard.map((row, index) => (
          <div key={row.id} style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
            {index + 1}. {row.name} — Handicap {row.handicap}
          </div>
        ))}
      </div>

      {selectedPlayer && (
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <h2>{selectedPlayer.name}</h2>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label>Current handicap</label>
              <input
                style={{ width: "100%", padding: 10 }}
                type="number"
                value={selectedPlayer.currentHandicap}
                onChange={(e) =>
                  updatePlayer(selectedPlayer.id, { currentHandicap: e.target.value })
                }
              />
            </div>

            <div>
              <label>Rounds used</label>
              <select
                style={{ width: "100%", padding: 10 }}
                value={selectedPlayer.gameCount}
                onChange={(e) =>
                  updatePlayer(selectedPlayer.id, {
                    gameCount: e.target.value as "1" | "2",
                  })
                }
              >
                <option value="1">Use 1 score</option>
                <option value="2">Use 2 scores</option>
              </select>
            </div>

            <div>
              <label>New score</label>
              <input
                style={{ width: "100%", padding: 10 }}
                type="number"
                value={selectedPlayer.scoreInput}
                onChange={(e) =>
                  updatePlayer(selectedPlayer.id, { scoreInput: e.target.value })
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
                  updatePlayer(selectedPlayer.id, { parInput: e.target.value })
                }
              />
            </div>

            <div>
              <label>Course</label>
              <input
                style={{ width: "100%", padding: 10 }}
                value={selectedPlayer.courseInput}
                onChange={(e) =>
                  updatePlayer(selectedPlayer.id, { courseInput: e.target.value })
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
                  updatePlayer(selectedPlayer.id, { dateInput: e.target.value })
                }
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <button onClick={saveRound} style={{ padding: "10px 16px", marginRight: 8 }}>
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