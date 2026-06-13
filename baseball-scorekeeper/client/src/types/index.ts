export interface Team {
  id: number;
  name: string;
  short_name: string | null;
  primary_color: string | null;
  secondary_color: string | null;
}

export interface Player {
  id: number;
  team_id: number;
  first_name: string;
  last_name: string;
  jersey_number: string | null;
  primary_position: string | null;
  bats: 'L' | 'R' | 'S' | null;
  throws: 'L' | 'R' | null;
  active: number;
}

export type GameStatus = 'scheduled' | 'in_progress' | 'completed';

export interface Game {
  id: number;
  home_team_id: number;
  away_team_id: number;
  home_team_name: string;
  home_team_short: string | null;
  home_primary_color: string | null;
  home_secondary_color: string | null;
  away_team_name: string;
  away_team_short: string | null;
  away_primary_color: string | null;
  away_secondary_color: string | null;
  scheduled_at: string | null;
  venue: string | null;
  status: GameStatus;
  innings_scheduled: number;
  notes: string | null;
}

export interface Lineup {
  id: number;
  game_id: number;
  team_id: number;
  player_id: number;
  batting_order: number;
  position: string;
  first_name: string;
  last_name: string;
  jersey_number: string | null;
}

export interface GameStateRow {
  game_id: number;
  inning: number;
  half: 'top' | 'bottom';
  outs: number;
  balls: number;
  strikes: number;
  home_score: number;
  away_score: number;
  runner_1b: number | null;
  runner_2b: number | null;
  runner_3b: number | null;
  home_batting_index: number;
  away_batting_index: number;
}

export interface RunnerInfo {
  id: number;
  first_name: string;
  last_name: string;
  jersey_number: string | null;
}

export interface GameStateSnapshot {
  game: Game;
  game_state: GameStateRow | null;
  line_score: Record<string, Record<string, number>>;
  lineups: Lineup[];
  current_batter?: Lineup | null;
  current_pitcher?: Player | null;
  batting_team_id?: number;
  pitching_team_id?: number;
  runners?: {
    '1b': RunnerInfo | null;
    '2b': RunnerInfo | null;
    '3b': RunnerInfo | null;
  };
  bases_occupied?: {
    '1b': boolean;
    '2b': boolean;
    '3b': boolean;
  };
}

export type AtBatOutcome =
  | 'single' | 'double' | 'triple' | 'home_run'
  | 'walk' | 'hit_by_pitch'
  | 'strikeout' | 'groundout' | 'flyout' | 'lineout' | 'popout'
  | 'error' | 'fielders_choice' | 'sac_fly' | 'sac_bunt' | 'double_play';

export type RunnerAction = 'stay' | 'to_2b' | 'to_3b' | 'score' | 'out';

export interface RunnerActions {
  '1b': RunnerAction;
  '2b': RunnerAction;
  '3b': RunnerAction;
}

export interface BattingLine {
  ab: number; h: number; '2b': number; '3b': number; hr: number;
  bb: number; k: number; r: number; rbi: number; sac: number;
  avg: number; obp: number; slg: number; ops: number;
}

export interface BoxScorePlayer extends BattingLine {
  player_id: number;
  first_name: string;
  last_name: string;
  jersey_number: string | null;
  batting_order: number;
  position: string;
}

export interface BoxScore {
  home: BoxScorePlayer[];
  away: BoxScorePlayer[];
}
