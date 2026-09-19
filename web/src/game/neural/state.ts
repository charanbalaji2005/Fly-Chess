/**
 * Internal neural activity channels driven by live chess gameplay events.
 */

export type NeuralEventType =
  | 'IDLE'
  | 'TURN_START'
  | 'BOARD_SCAN'
  | 'PIECE_SELECTED'
  | 'TACTICAL_SCAN'
  | 'CANDIDATE_MOVE'
  | 'MOVE_SELECTED'
  | 'MOTOR_PREPARATION'
  | 'PIECE_GRAB'
  | 'PIECE_CARRY'
  | 'PIECE_RELEASE'
  | 'CAPTURE'
  | 'CHECK'
  | 'CHECKMATE'
  | 'VICTORY';

export interface NeuralEvent {
  type: NeuralEventType;
  pieceId?: string;
  square?: string;
}

export interface NeuralState {
  visual: number;
  attention: number;
  decision: number;
  motor: number;
  threat: number;
  reward: number;
}

export const NEURAL_CHANNELS: (keyof NeuralState)[] = [
  'visual',
  'attention',
  'decision',
  'motor',
  'threat',
  'reward',
];

export const NEURAL_LABELS: Record<keyof NeuralState, string> = {
  visual: 'Vision',
  attention: 'Attention',
  decision: 'Decision',
  motor: 'Motor Control',
  threat: 'Threat Level',
  reward: 'Reward / Advantage',
};

const INITIAL_STATE: NeuralState = {
  visual: 0.2,
  attention: 0.3,
  decision: 0.1,
  motor: 0.05,
  threat: 0.1,
  reward: 0.2,
};

export class NeuralStateMachine {
  private current: NeuralState = { ...INITIAL_STATE };

  public get state(): NeuralState {
    return { ...this.current };
  }

  public onEvent(event: NeuralEvent): void {
    switch (event.type) {
      case 'TURN_START':
        this.current.attention = Math.min(1, this.current.attention + 0.4);
        this.current.visual = 0.6;
        break;
      case 'BOARD_SCAN':
      case 'TACTICAL_SCAN':
        this.current.visual = 0.85;
        this.current.decision = 0.7;
        break;
      case 'PIECE_SELECTED':
        this.current.attention = 0.9;
        this.current.visual = 0.75;
        this.current.decision = 0.5;
        break;
      case 'MOVE_SELECTED':
      case 'MOTOR_PREPARATION':
        this.current.decision = 0.9;
        this.current.motor = 0.7;
        break;
      case 'PIECE_GRAB':
      case 'PIECE_CARRY':
        this.current.motor = 0.95;
        this.current.visual = 0.8;
        break;
      case 'PIECE_RELEASE':
        this.current.motor = 0.3;
        break;
      case 'CAPTURE':
        this.current.reward = 0.9;
        this.current.threat = 0.2;
        break;
      case 'CHECK':
        this.current.threat = 0.95;
        this.current.attention = 1.0;
        break;
      case 'CHECKMATE':
      case 'VICTORY':
        this.current.reward = 1.0;
        this.current.attention = 0.8;
        this.current.motor = 0.5;
        break;
      case 'IDLE':
      default:
        break;
    }
  }

  public tick(deltaSeconds: number): void {
    // Natural relaxation back towards base level
    const decay = Math.min(1, deltaSeconds * 1.5);
    for (const key of NEURAL_CHANNELS) {
      this.current[key] += (INITIAL_STATE[key] - this.current[key]) * decay;
    }
  }
}
