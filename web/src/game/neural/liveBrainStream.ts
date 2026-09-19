/**
 * Live Drosophila Brain Neural Activity Stream.
 *
 * Drives real-time 3D connectome neuron activations, synaptic propagation,
 * and cognitive telemetry directly from the live chess engine and fly AI state.
 */

import { useGame } from '../store';
import type { ConnectomeData } from '../../types';

export interface BrainTelemetry {
  rateHz: number;
  thoughtSpikes: number;
  cognitivePhase: 'IDLE' | 'SENSING' | 'TACTICAL_SEARCH' | 'DECISION_LOCK' | 'MOTOR_EXEC';
  phaseLabel: string;
  neuropils: {
    optic: number;       // Visual input
    central: number;     // Minimax & tactics
    mushroom: number;    // Associative memory & evaluation
    motor: number;       // Locomotion & piece manipulation
  };
}

class LiveBrainStream {
  private static instance: LiveBrainStream | null = null;

  public activation = new Float32Array(138639);
  public telemetry: BrainTelemetry = {
    rateHz: 14,
    thoughtSpikes: 0,
    cognitivePhase: 'IDLE',
    phaseLabel: 'Baseline Optic Resting',
    neuropils: { optic: 0.15, central: 0.1, mushroom: 0.12, motor: 0.05 },
  };

  private wasThinking = false;
  private thoughtStart = 0;
  private spikeAccumulator = 0;
  private spikeCount = 0;
  private lastRateCheck = 0;
  private listeners = new Set<(t: BrainTelemetry) => void>();

  public static get(): LiveBrainStream {
    if (!LiveBrainStream.instance) {
      LiveBrainStream.instance = new LiveBrainStream();
    }
    return LiveBrainStream.instance;
  }

  public subscribe(listener: (t: BrainTelemetry) => void): () => void {
    this.listeners.add(listener);
    listener(this.telemetry);
    return () => this.listeners.delete(listener);
  }

  /**
   * Main simulation tick called every animation frame from the 3D canvas.
   */
  public update(delta: number, now: number, connectome: ConnectomeData | null): void {
    const gameState = useGame.getState();
    const { aiThinking, carry } = gameState;
    const n = connectome ? connectome.neuronCount : 138639;

    if (this.activation.length !== n) {
      this.activation = new Float32Array(n);
    }

    // Decay existing activation (tau ~ 65ms)
    const decay = Math.exp(-Math.min(delta, 0.1) * 14.0);
    for (let i = 0; i < n; i++) {
      if (this.activation[i] > 0.005) {
        this.activation[i] *= decay;
      } else if (this.activation[i] !== 0) {
        this.activation[i] = 0;
      }
    }

    // Thinking state transition
    if (aiThinking && !this.wasThinking) {
      this.wasThinking = true;
      this.thoughtStart = now;
      this.thoughtSpikes = 0;
    } else if (!aiThinking && this.wasThinking) {
      this.wasThinking = false;
    }

    const pos = connectome?.positions;
    const targetSpikesPerSec: number = aiThinking
      ? 195 + Math.sin(now * 0.01) * 35
      : carry
        ? 110 + Math.sin(now * 0.02) * 20
        : 14 + Math.sin(now * 0.002) * 4;

    this.spikeAccumulator += delta * targetSpikesPerSec;
    const spikesToFire = Math.floor(this.spikeAccumulator);
    this.spikeAccumulator -= spikesToFire;

    if (spikesToFire > 0) {
      this.spikeCount += spikesToFire;
      if (aiThinking) this.thoughtSpikes += spikesToFire;

      if (aiThinking) {
        const thoughtDuration = Math.max(1, now - this.thoughtStart);
        // Cognitive progression stages:
        // 0 - 300ms: Sensory Optic Lobes scanning board
        // 300 - 900ms: Central Complex & Mushroom Body evaluating tactics
        // > 900ms: Pre-motor & SEZ convergence towards chosen move
        let phaseType: BrainTelemetry['cognitivePhase'] = 'SENSING';
        let label = 'Sensory: Optic Board Scan';
        let targetOptic = 0.85;
        let targetCentral = 0.35;
        let targetMushroom = 0.4;
        let targetMotor = 0.2;

        if (thoughtDuration > 850) {
          phaseType = 'DECISION_LOCK';
          label = 'Decision: Pre-Motor Convergence';
          targetOptic = 0.4;
          targetCentral = 0.7;
          targetMushroom = 0.6;
          targetMotor = 0.95;
        } else if (thoughtDuration > 250) {
          phaseType = 'TACTICAL_SEARCH';
          label = 'Tactics: Central Complex Search';
          targetOptic = 0.6;
          targetCentral = 0.95;
          targetMushroom = 0.85;
          targetMotor = 0.3;
        }

        this.telemetry.cognitivePhase = phaseType;
        this.telemetry.phaseLabel = label;
        this.telemetry.neuropils = {
          optic: targetOptic,
          central: targetCentral,
          mushroom: targetMushroom,
          motor: targetMotor,
        };

        // Fire spatially targeted neurons in the 3D connectome
        for (let s = 0; s < spikesToFire; s++) {
          let neuronIdx = Math.floor(Math.random() * n);

          if (pos) {
            // Find neuron conforming to the current cognitive phase
            const tries = 6;
            for (let t = 0; t < tries; t++) {
              const candidate = Math.floor(Math.random() * n);
              const x = pos[candidate * 3];
              const y = pos[candidate * 3 + 1];

              if (phaseType === 'SENSING' && Math.abs(x) > 2.5) {
                neuronIdx = candidate; // Optic lobes (lateral)
                break;
              } else if (phaseType === 'TACTICAL_SEARCH' && Math.abs(x) < 2.2 && y > 0.0) {
                neuronIdx = candidate; // Central complex / Protocerebrum (dorsal medial)
                break;
              } else if (phaseType === 'DECISION_LOCK' && y < -0.2) {
                neuronIdx = candidate; // Subesophageal zone / descending pre-motor (ventral)
                break;
              }
            }
          }

          this.activation[neuronIdx] = 1.0;

          // Propagate to a connected partner if edges are available
          if (connectome && Math.random() < 0.4) {
            const edgeIdx = Math.floor(Math.random() * connectome.edges.count);
            const targetNeuron = connectome.edges.pairs[edgeIdx * 2 + 1];
            if (targetNeuron < n) {
              this.activation[targetNeuron] = 0.85;
            }
          }
        }
      } else if (carry) {
        // Physical piece carry: SEZ and descending motor circuits fire
        this.telemetry.cognitivePhase = 'MOTOR_EXEC';
        this.telemetry.phaseLabel = 'Motor: Fly Carry Execution';
        this.telemetry.neuropils = { optic: 0.3, central: 0.4, mushroom: 0.2, motor: 0.95 };

        for (let s = 0; s < spikesToFire; s++) {
          const candidate = Math.floor(Math.random() * n);
          this.activation[candidate] = 0.9;
        }
      } else {
        // Baseline resting state
        this.telemetry.cognitivePhase = 'IDLE';
        this.telemetry.phaseLabel = 'Baseline Resting · Optic Ready';
        this.telemetry.neuropils = { optic: 0.15, central: 0.1, mushroom: 0.12, motor: 0.05 };

        for (let s = 0; s < spikesToFire; s++) {
          const candidate = Math.floor(Math.random() * n);
          this.activation[candidate] = 0.75;
        }
      }
    }

    // Refresh telemetry rate every 200ms
    if (now - this.lastRateCheck > 200) {
      const elapsed = (now - this.lastRateCheck) / 1000;
      this.telemetry.rateHz = Math.round(this.spikeCount / elapsed);
      this.telemetry.thoughtSpikes = this.thoughtSpikes;
      this.spikeCount = 0;
      this.lastRateCheck = now;

      // Notify listeners
      for (const listener of this.listeners) {
        listener({ ...this.telemetry });
      }
    }
  }

  private get thoughtSpikes(): number {
    return this.telemetry.thoughtSpikes;
  }

  private set thoughtSpikes(val: number) {
    this.telemetry.thoughtSpikes = val;
  }
}

export const liveBrain = LiveBrainStream.get();
