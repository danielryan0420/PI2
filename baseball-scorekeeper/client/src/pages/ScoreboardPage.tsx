import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { api } from '../lib/api';
import { joinGame, getSocket } from '../lib/socket';
import { useOverlayConfig } from '../hooks/useOverlayConfig';
import { LineScore } from '../components/scoreboard/LineScore';
import { CountIndicator } from '../components/scoreboard/CountIndicator';
import { CurrentPlayers } from '../components/scoreboard/CurrentPlayers';
import { BaseballDiamond } from '../components/scoreboard/BaseballDiamond';
import { TeamHeader } from '../components/scoreboard/TeamHeader';
import type { GameStateSnapshot } from '../types';

export function ScoreboardPage() {
  const { gameId } = useParams();
  const overlay = useOverlayConfig();
  const [state, setState] = useState<GameStateSnapshot | null>(null);

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

  if (!state) {
    return <div className="p-4 text-center text-gray-400">Loading scoreboard...</div>;
  }

  const { game, game_state } = state;
  const containerClass = clsx(
    'mx-auto',
    overlay.transparent ? 'bg-transparent' : 'bg-white shadow-lg rounded-xl border border-gray-200',
    overlay.compact ? 'p-2 max-w-md' : 'p-4 max-w-md'
  );

  const style = overlay.scale !== 1 ? { transform: `scale(${overlay.scale})`, transformOrigin: 'top left' } : undefined;

  if (!game_state) {
    return (
      <div className="p-4 flex justify-center">
        <div className={containerClass} style={style}>
          <h1 className="text-lg font-bold text-center">
            {game.away_team_name} @ {game.home_team_name}
          </h1>
          <p className="text-center text-gray-400 text-sm mt-2">Scheduled</p>
        </div>
      </div>
    );
  }

  if (overlay.compact) {
    return (
      <div className="p-2 flex justify-center">
        <div className={containerClass} style={style}>
          <div className="flex items-center justify-between gap-3 text-sm font-semibold">
            <span>{game.away_team_short || game.away_team_name} {game_state.away_score}</span>
            <span>{game_state.half === 'top' ? 'Top' : 'Bot'} {game_state.inning}</span>
            <span>{game.home_team_short || game.home_team_name} {game_state.home_score}</span>
          </div>
          {!overlay.hidden.has('count') && (
            <div className="mt-1">
              <CountIndicator balls={game_state.balls} strikes={game_state.strikes} outs={game_state.outs} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex justify-center">
      <div className={containerClass} style={style}>
        <TeamHeader state={state} />

        {!overlay.hidden.has('linescore') && (
          <div className="mt-3">
            <LineScore game={game} gameState={game_state} lineScore={state.line_score} />
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-4">
          {!overlay.hidden.has('diamond') && <BaseballDiamond state={state} />}
          <div className="flex-1 space-y-2">
            {!overlay.hidden.has('count') && (
              <CountIndicator balls={game_state.balls} strikes={game_state.strikes} outs={game_state.outs} />
            )}
            {!overlay.hidden.has('pitcher') && <CurrentPlayers state={state} />}
          </div>
        </div>
      </div>
    </div>
  );
}
