/**
 * Jungle Run - Sound & Music Manager
 * Procedural Web Audio API synthesizer for 100% offline, zero-asset-failure audio.
 * Generates retro-arcade sound effects and a dynamic jungle adventure music loop.
 */

export class SoundManager {
  private ctx: AudioContext | null = null;
  private musicGainNode: GainNode | null = null;
  private sfxGainNode: GainNode | null = null;
  private masterGainNode: GainNode | null = null;

  private isMusicPlaying = false;
  private musicTimerId: number | null = null;
  private musicStep = 0;

  private sfxVolume = 0.8;
  private musicVolume = 0.7;
  private isMuted = false;

  constructor() {
    // AudioContext will be lazily initialized on first user interaction
  }

  private initContext() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.masterGainNode = this.ctx.createGain();
      this.masterGainNode.gain.setValueAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime);
      this.masterGainNode.connect(this.ctx.destination);

      this.sfxGainNode = this.ctx.createGain();
      this.sfxGainNode.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
      this.sfxGainNode.connect(this.masterGainNode);

      this.musicGainNode = this.ctx.createGain();
      this.musicGainNode.gain.setValueAtTime(this.musicVolume * 0.4, this.ctx.currentTime);
      this.musicGainNode.connect(this.masterGainNode);
    } catch (e) {
      console.warn('Web Audio API unavailable:', e);
    }
  }

  public resume() {
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setVolumes(musicVol: number, sfxVol: number, muted: boolean) {
    this.musicVolume = Math.max(0, Math.min(1, musicVol));
    this.sfxVolume = Math.max(0, Math.min(1, sfxVol));
    this.isMuted = muted;

    if (this.ctx && this.masterGainNode && this.sfxGainNode && this.musicGainNode) {
      const t = this.ctx.currentTime;
      this.masterGainNode.gain.setValueAtTime(this.isMuted ? 0 : 1, t);
      this.sfxGainNode.gain.setValueAtTime(this.sfxVolume, t);
      this.musicGainNode.gain.setValueAtTime(this.musicVolume * 0.35, t);
    }
  }

  // --- Retro Sound Effects ---

  public playJump() {
    this.resume();
    if (!this.ctx || !this.sfxGainNode || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(480, t + 0.16);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.16);

    osc.connect(gain);
    gain.connect(this.sfxGainNode);

    osc.start(t);
    osc.stop(t + 0.18);
  }

  public playSlide() {
    this.resume();
    if (!this.ctx || !this.sfxGainNode || this.isMuted) return;

    const t = this.ctx.currentTime;
    // White noise swoosh through low-pass filter
    const bufferSize = this.ctx.sampleRate * 0.18;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, t);
    filter.frequency.linearRampToValueAtTime(150, t + 0.18);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.18);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGainNode);

    noise.start(t);
    noise.stop(t + 0.18);
  }

  public playCoin() {
    this.resume();
    if (!this.ctx || !this.sfxGainNode || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, t); // B5
    osc.frequency.setValueAtTime(1318.51, t + 0.08); // E6

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.005, t + 0.22);

    osc.connect(gain);
    gain.connect(this.sfxGainNode);

    osc.start(t);
    osc.stop(t + 0.23);
  }

  public playRelic() {
    this.resume();
    if (!this.ctx || !this.sfxGainNode || this.isMuted) return;

    const t = this.ctx.currentTime;
    // Chord arpeggio (C6, E6, G6, C7)
    const freqs = [1046.5, 1318.5, 1567.98, 2093.0];
    freqs.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGainNode) return;
      const noteTime = t + idx * 0.06;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.22, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.005, noteTime + 0.3);

      osc.connect(gain);
      gain.connect(this.sfxGainNode);

      osc.start(noteTime);
      osc.stop(noteTime + 0.32);
    });
  }

  public playVineGrab() {
    this.resume();
    if (!this.ctx || !this.sfxGainNode || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(640, t + 0.12);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.12);

    osc.connect(gain);
    gain.connect(this.sfxGainNode);

    osc.start(t);
    osc.stop(t + 0.13);
  }

  public playVineSwing() {
    this.resume();
    if (!this.ctx || !this.sfxGainNode || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.2);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.22);

    osc.connect(gain);
    gain.connect(this.sfxGainNode);

    osc.start(t);
    osc.stop(t + 0.23);
  }

  public playCrocodileSnap() {
    this.resume();
    if (!this.ctx || !this.sfxGainNode || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.14);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGainNode);

    osc.start(t);
    osc.stop(t + 0.16);
  }

  public playHit() {
    this.resume();
    if (!this.ctx || !this.sfxGainNode || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.linearRampToValueAtTime(40, t + 0.25);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGainNode);

    osc.start(t);
    osc.stop(t + 0.26);
  }

  public playGameOver() {
    this.resume();
    if (!this.ctx || !this.sfxGainNode || this.isMuted) return;

    const t = this.ctx.currentTime;
    const notes = [392.0, 349.23, 311.13, 261.63]; // G4, F4, Eb4, C4
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGainNode) return;
      const noteTime = t + idx * 0.18;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.22, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.01, noteTime + 0.22);

      osc.connect(gain);
      gain.connect(this.sfxGainNode);

      osc.start(noteTime);
      osc.stop(noteTime + 0.24);
    });
  }

  public playClick() {
    this.resume();
    if (!this.ctx || !this.sfxGainNode || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, t);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.005, t + 0.04);

    osc.connect(gain);
    gain.connect(this.sfxGainNode);

    osc.start(t);
    osc.stop(t + 0.05);
  }

  public playPowerup() {
    this.resume();
    if (!this.ctx || !this.sfxGainNode || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(261.63, t);
    osc.frequency.exponentialRampToValueAtTime(1046.5, t + 0.25);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.26);

    osc.connect(gain);
    gain.connect(this.sfxGainNode);

    osc.start(t);
    osc.stop(t + 0.27);
  }

  // --- Dynamic Procedural Retro Jungle Adventure Music ---

  public startMusic() {
    if (this.isMusicPlaying) return;
    this.isMusicPlaying = true;
    this.musicStep = 0;
    this.scheduleNextMusicBar();
  }

  public stopMusic() {
    this.isMusicPlaying = false;
    if (this.musicTimerId !== null) {
      window.clearTimeout(this.musicTimerId);
      this.musicTimerId = null;
    }
  }

  private scheduleNextMusicBar() {
    if (!this.isMusicPlaying) return;
    this.resume();

    // 16-step rhythmic jungle adventure progression in A minor pentatonic
    // (A, C, D, E, G) with marimba-like notes and tribal bassline pulse
    const bassScale = [110, 110, 130.81, 110, 146.83, 110, 164.81, 130.81];
    const melodyScale = [
      440, 0, 523.25, 587.33, 659.25, 0, 587.33, 523.25,
      440, 392, 440, 523.25, 659.25, 783.99, 659.25, 523.25
    ];

    if (this.ctx && this.musicGainNode && !this.isMuted) {
      const now = this.ctx.currentTime;
      const stepDuration = 0.15; // 100 BPM 16th notes

      for (let i = 0; i < 8; i++) {
        const stepIdx = (this.musicStep + i) % 16;
        const time = now + i * stepDuration;

        // Bass Pulse
        const bassFreq = bassScale[stepIdx % 8];
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = 'triangle';
        bassOsc.frequency.setValueAtTime(bassFreq, time);
        bassGain.gain.setValueAtTime(0.2, time);
        bassGain.gain.exponentialRampToValueAtTime(0.01, time + 0.12);
        bassOsc.connect(bassGain);
        bassGain.connect(this.musicGainNode);
        bassOsc.start(time);
        bassOsc.stop(time + 0.13);

        // Percussion Jungle Click / Woodblock
        if (stepIdx % 2 === 0) {
          const percOsc = this.ctx.createOscillator();
          const percGain = this.ctx.createGain();
          percOsc.type = 'sine';
          percOsc.frequency.setValueAtTime(800 + (stepIdx % 4) * 150, time);
          percGain.gain.setValueAtTime(0.08, time);
          percGain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
          percOsc.connect(percGain);
          percGain.connect(this.musicGainNode);
          percOsc.start(time);
          percOsc.stop(time + 0.05);
        }

        // Melody note
        const melodyFreq = melodyScale[stepIdx];
        if (melodyFreq > 0) {
          const melOsc = this.ctx.createOscillator();
          const melGain = this.ctx.createGain();
          melOsc.type = 'sine';
          melOsc.frequency.setValueAtTime(melodyFreq, time);
          melGain.gain.setValueAtTime(0.14, time);
          melGain.gain.exponentialRampToValueAtTime(0.008, time + 0.14);
          melOsc.connect(melGain);
          melGain.connect(this.musicGainNode);
          melOsc.start(time);
          melOsc.stop(time + 0.15);
        }
      }
    }

    this.musicStep = (this.musicStep + 8) % 16;
    // Schedule next 8 steps (8 * 0.15s = 1.2s)
    this.musicTimerId = window.setTimeout(() => {
      this.scheduleNextMusicBar();
    }, 1100);
  }
}

export const soundManager = new SoundManager();
