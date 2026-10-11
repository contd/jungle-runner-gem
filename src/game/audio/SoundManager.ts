/**
 * Jungle Run - Sound & Music Manager
 * Procedural Web Audio API synthesizer for 100% offline, zero-asset-failure audio.
 * Generates retro-arcade sound effects and a dynamic jungle adventure music loop.
 * @module game/audio/SoundManager
 */

/**
 * Lazy Web Audio mixer and procedural one-shot/music scheduler.
 * Frequencies are hertz, AudioContext times are seconds, and browser timers use
 * milliseconds. Effects are skipped when muted or audio nodes are unavailable.
 */
export class SoundManager {
  /** Browser audio clock/context, created only after resume or an effect request. */
  private ctx: AudioContext | null = null;
  /** Attenuated music bus, feeding the master mute bus. */
  private musicGainNode: GainNode | null = null;
  /** Independent effect-volume bus feeding the master mute bus. */
  private sfxGainNode: GainNode | null = null;
  /** Master gate: gain zero while muted, one otherwise. */
  private masterGainNode: GainNode | null = null;

  /** Scheduler-active flag; mute does not stop progression through the loop. */
  private isMusicPlaying = false;
  /** Pending browser timeout for the next eight-step scheduling batch. */
  private musicTimerId: number | null = null;
  /** Next step within the repeating sixteen-step melody. */
  private musicStep = 0;

  /** Clamped user effect-volume preference, retained before nodes exist. */
  private sfxVolume = 0.8;
  /** Clamped user music-volume preference, attenuated at the music bus. */
  private musicVolume = 0.7;
  /** Master mute preference; keeps gain values so unmuting restores them. */
  private isMuted = false;

  /** Construct without opening audio, preserving browser interaction requirements. */
  constructor() {
    // AudioContext will be lazily initialized on first user interaction
  }

  /**
   * Lazily create master/effect/music buses, including the legacy WebKit context alias.
   * Initialization attenuates music to 40%; later volume updates use 35%.
   * Unsupported audio leaves the mixer inactive; thrown initialization errors are logged.
   */
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

  /**
   * Initialize audio and request resumption of a suspended context.
   * Call from user interaction; the existing implementation ignores rejected resumes.
   */
  public resume() {
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Clamp preferences to [0, 1] and update live gains when the graph exists.
   * @param musicVol - Music preference before the additional 35% bus attenuation.
   * @param sfxVol - Effect preference, applied directly to its bus.
   * @param muted - Whether the master gain should be zero.
   */
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

  /** Play a 160-to-480 Hz square-wave rise for a jump or crocodile bounce. */
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

  /** Play 180 ms of white noise through a descending low-pass filter for sliding. */
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

  /** Play a B5/E6 sine-wave chime when a coin is collected. */
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

  /** Schedule a C6/E6/G6/C7 triangle-wave arpeggio, spaced at 60 ms per note. */
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

  /** Play a brief rising triangle tone when latching to a vine. */
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

  /** Play a longer rising sine tone when launching off an attached vine. */
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

  /** Play a falling sawtooth jaw-snap effect, available for future scene wiring. */
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

  /** Play a low descending sawtooth impact for shield absorption or life loss. */
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

  /** Schedule the descending G4/F4/E-flat4/C4 loss motif at 180 ms intervals. */
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

  /** Play a 50 ms triangle-wave UI feedback click. */
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

  /** Play a rising C4-to-C6 triangle tone for either power-up pickup. */
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

  /** Start the loop at step zero; repeated calls while running do not add schedulers. */
  public startMusic() {
    if (this.isMusicPlaying) return;
    this.isMusicPlaying = true;
    this.musicStep = 0;
    this.scheduleNextMusicBar();
  }

  /**
   * Cancel future scheduling batches.
   * Already scheduled oscillator notes are not canceled and can finish sounding.
   */
  public stopMusic() {
    this.isMusicPlaying = false;
    if (this.musicTimerId !== null) {
      window.clearTimeout(this.musicTimerId);
      this.musicTimerId = null;
    }
  }

  /**
   * Schedule eight 150 ms steps of bass, percussion, and melody ahead of the audio clock.
   * A 1100 ms timeout starts the next 1200 ms batch with a small scheduling overlap.
   * Muted batches still advance the sixteen-step index.
   */
  private scheduleNextMusicBar() {
    if (!this.isMusicPlaying) return;
    this.resume();

    // 16-step rhythmic jungle adventure progression in A minor pentatonic
    // (A, C, D, E, G) with marimba-like notes and tribal bassline pulse
    /** Eight-note bass frequencies in hertz, reused across the sixteen-step loop. */
    const bassScale = [110, 110, 130.81, 110, 146.83, 110, 164.81, 130.81];
    /** Melody frequencies in hertz; zero entries are rests, not zero-frequency notes. */
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

/** Shared lazy mixer for menu feedback, gameplay effects, and run music. */
export const soundManager = new SoundManager();
