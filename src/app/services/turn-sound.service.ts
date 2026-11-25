
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class TurnSoundService {

  private audioContext: AudioContext | null = null;

  private readonly storageKey = 'card-game-sound-enabled';

  private enabled = true;

  constructor() {
    try {
      this.enabled =
        localStorage.getItem(this.storageKey) !== 'false';
    } catch {
      this.enabled = true;
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;

    try {
      localStorage.setItem(
        this.storageKey,
        String(enabled)
      );
    } catch {
      // Sound preference remains available in memory.
    }
  }

  async initialize(): Promise<void> {
    try {
      if (!this.audioContext) {
        const AudioContextClass =
          window.AudioContext ||
          (window as any).webkitAudioContext;

        if (!AudioContextClass) {
          return;
        }

        this.audioContext = new AudioContextClass();
      }

      if (this.audioContext?.state === 'suspended') {
        await this.audioContext.resume();
      }

    } catch (error) {
      console.warn('Unable to initialize game audio', error);
    }
  }

  playTurnSound(): void {

    if (!this.enabled) {
      return;
    }

    const context = this.audioContext;

    if (!context || context.state !== 'running') {
      return;
    }

    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      const now = context.currentTime;

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, now);

      gain.gain.setValueAtTime(0.001, now);

      gain.gain.exponentialRampToValueAtTime(
        0.15,
        now + 0.015
      );

      gain.gain.exponentialRampToValueAtTime(
        0.001,
        now + 0.2
      );

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };

      oscillator.start(now);
      oscillator.stop(now + 0.22);

    } catch (error) {
      console.warn('Unable to play turn sound', error);
    }
  }
}
