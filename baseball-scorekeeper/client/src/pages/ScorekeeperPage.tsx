import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { joinGame, getSocket } from '../lib/socket';
import { defaultRunnerActions, cycleRunnerAction } from '../lib/baseballRules';
import { CountDisplay } from '../components/scorekeeper/CountDisplay';
import { PitchPanel } from '../components/scorekeeper/PitchPanel';
import { BaserunnerDiamond } from '../components/scorekeeper/BaserunnerDiamond';
import { AtBatOutcomePicker } from '../components/scorekeeper/AtBatOutcomePicker';
import { UndoBar } from '../components/scorekeeper/UndoBar';
import { Button } from '../components/ui/Button';
import { ShareLinks } from '../components/ShareLinks';
import type { AtBatOutcome, GameStateSnapshot, RunnerActions } from '../types';

export function ScorekeeperPage() {
  const { gameId } = useParams();
  const [state, setState] = useState<GameStateSnapshot | null>(null);
  const [outcome, setOutcome] = useState<AtBatOutcome | null>(null);
  const [runnerActions, setRunnerActions] = useState<RunnerActions>({ '1b': 'stay', '2b': 'stay', '3b': 'stay' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    api.get<GameStateSnapshot>(`/games/${gameId}/state`).then(setState).catch(() => {});

    const socket = getSocket();
    const onSync = (data: GameStateSnapshot) => setState(data);
    socket.on('state_sync', onSync);
    const cleanup = joinGame(Number(gameId));

    return () => {
      socket.off('state_sync', onSync);
      cleanup();
    };
  }, [gameId]);

  const selectOutcome = (newOutcome: AtBatOutcome) => {
    setOutcome(newOutcome);
    if (state?.bases_occupied) {
      setRunnerActions(defaultRunnerActions(newOutcome, state.bases_occupied));
    }
  };

  const cycleRunner = (base: '1b' | '2b' | '3b') => {
    setRunnerActions((prev) => ({ ...prev, [base]: cycleRunnerAction(base, prev[base]) }));
  };

  const confirm = async () => {
    if (!gameId || !outcome) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.post<GameStateSnapshot>(`/games/${gameId}/at-bat`, {
        outcome,
        runner_actions: runnerActions,
      });
      setState(updated);
      setOutcome(null);
      setRunnerActions({ '1b': 'stay', '2b': 'stay', '3b': 'stay' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record play');
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!gameId) return;
    const updated = await api.post<GameStateSnapshot>(`/games/${gameId}/undo`);
    setState(updated);
    setOutcome(null);
  };

  const pitch = async (type: 'ball' | 'strike' | 'foul') => {
    if (!gameId) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.post<GameStateSnapshot>(`/games/${gameId}/pitch`, { type });
      setState(updated);
      if (updated.game_state?.balls === 0 && updated.game_state?.strikes === 0) {
        // Auto-recorded walk/strikeout ended the at-bat; clear any in-progress picker state.
        setOutcome(null);
        setRunnerActions({ '1b': 'stay', '2b': 'stay', '3b': 'stay' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record pitch');
    } finally {
      setBusy(false);
    }
  };

  const undoPitch = async () => {
    if (!gameId) return;
    setError(null);
    try {
      const updated = await api.post<GameStateSnapshot>(`/games/${gameId}/pitch/undo`);
      setState(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo pitch');
    }
  };

  if (!state) return <div className="p-4">Loading...</div>;

  const { game, game_state } = state;
  if (!game_state) return <div className="p-4">Game has not started.</div>;

  return (
    <div className="max-w-md mx-auto p-3 space-y-3 pb-8">
      <div className="flex items-center justify-between text-sm">
        <Link to="/games" className="text-blue-600 hover:underline min-h-0">&larr; Games</Link>
        <button onClick={() => setShowShare((s) => !s)} className="text-blue-600 hover:underline min-h-0">
          {showShare ? 'Hide share' : 'Share / stream'}
        </button>
        <Link to={`/scoreboard/${gameId}`} target="_blank" className="text-blue-600 hover:underline min-h-0">
          Open scoreboard
        </Link>
      </div>

      {showShare && gameId && <ShareLinks gameId={gameId} />}

      <h1 className="text-center font-bold">
        {game.away_team_name} @ {game.home_team_name}
      </h1>

      <CountDisplay gameState={game_state} />

      <PitchPanel gameState={game_state} onPitch={pitch} onUndoPitch={undoPitch} busy={busy} />

      <div className="flex justify-center">
        <BaserunnerDiamond state={state} runnerActions={runnerActions} onCycle={cycleRunner} />
      </div>

      <AtBatOutcomePicker selected={outcome} onSelect={selectOutcome} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button className="w-full" disabled={!outcome || busy} onClick={confirm}>
        Confirm play
      </Button>

      <UndoBar onUndo={undo} />
    </div>
  );
}
