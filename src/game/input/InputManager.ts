/**
 * Jungle Run - Unified Input Manager
 * Handles Desktop Keyboard, Touch gestures, on-screen buttons, and Gamepads.
 * @module game/input/InputManager
 */

import { KeyBindings } from '../../data/types.ts';

/** Device-independent commands; forward is a hold, jump releases vines, and interact attaches. */
export type GameAction = 'forward' | 'jump' | 'slide' | 'interact' | 'pause';

/**
 * Shared action-state bridge between browser devices, React buttons, and Phaser.
 * Keyboard listeners and gamepad polling live for the window lifetime;
 * this class currently has no global listener/poll disposal method.
 */
export class InputManager {
  /** Current code mapping, replaceable when persisted preferences load. */
  private keyBindings: KeyBindings;
  /** Logical held actions; forward alone is also tracked per input source. */
  private activeActions: Set<GameAction> = new Set();
  /** Independent forward holds prevent a released device from cancelling another. */
  private forwardSources = new Set<'keyboard' | 'gamepad' | 'manual'>();
  /** A background window must not resume controller movement after blur releases it. */
  private focused = true;
  /** Rising-edge flags consumed individually or cleared by the frame owner. */
  private justPressedActions: Set<GameAction> = new Set();
  /** Action observers notified on every trigger, including repeated held events. */
  private listeners: Map<GameAction, Array<(pressed: boolean) => void>> = new Map();

  /** First touch's viewport X coordinate in pixels for swipe classification. */
  private touchStartX = 0;
  /** First touch's viewport Y coordinate in pixels for swipe classification. */
  private touchStartY = 0;
  /** Touch start wall-clock time in milliseconds. */
  private touchStartTime = 0;

  /** Store bindings and install keyboard/gamepad hooks when a browser window exists. */
  constructor(bindings: KeyBindings) {
    this.keyBindings = bindings;
    this.setupKeyboardListeners();
    this.setupGamepadPolling();
  }

  /** Replace the code mapping; currently held/edge action state is not cleared. */
  public updateBindings(bindings: KeyBindings) {
    this.keyBindings = bindings;
  }

  /**
   * Subscribe to press/release notifications for one logical action.
   * @returns A function removing this callback; there is no immediate state replay.
   */
  public onAction(action: GameAction, callback: (pressed: boolean) => void): () => void {
    if (!this.listeners.has(action)) {
      this.listeners.set(action, []);
    }
    this.listeners.get(action)!.push(callback);

    return () => {
      const arr = this.listeners.get(action);
      if (arr) {
        this.listeners.set(action, arr.filter(cb => cb !== callback));
      }
    };
  }

  /**
   * Update held/edge state and synchronously broadcast a device or UI event.
   * Only an inactive-to-active transition marks a new edge, but repeated presses
   * still notify listeners. Forward holds are combined across keyboard, controller
   * and on-screen controls; other actions retain their shared held-action state.
   */
  public triggerAction(action: GameAction, pressed: boolean, source: 'keyboard' | 'gamepad' | 'manual' = 'manual') {
    if (action === 'forward') {
      if (pressed) this.forwardSources.add(source);
      else this.forwardSources.delete(source);
      pressed = this.forwardSources.size > 0;
      if (pressed === this.activeActions.has(action)) return;
    }
    if (pressed) {
      if (!this.activeActions.has(action)) {
        this.justPressedActions.add(action);
      }
      this.activeActions.add(action);
    } else {
      this.activeActions.delete(action);
    }

    const callbacks = this.listeners.get(action);
    if (callbacks) {
      callbacks.forEach(cb => cb(pressed));
    }
  }

  /** Read whether the logical action is currently held without consuming its state. */
  public isActionActive(action: GameAction): boolean {
    return this.activeActions.has(action);
  }

  /** Read and consume this action's rising-edge flag; subsequent reads return false. */
  public wasActionJustPressed(action: GameAction): boolean {
    const was = this.justPressedActions.has(action);
    this.justPressedActions.delete(action);
    return was;
  }

  /** Discard every unconsumed rising edge, normally at a frame boundary. */
  public clearJustPressed() {
    this.justPressedActions.clear();
  }

  /** Install fixed Right movement plus saved action bindings; release holds on blur. */
  private setupKeyboardListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      const code = e.code;
      // Prevent default page scroll on arrow keys and space
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        e.preventDefault();
      }
      if (code === 'ArrowRight') this.triggerAction('forward', true, 'keyboard');

      for (const [action, keys] of Object.entries(this.keyBindings) as [GameAction, string[]][]) {
        if (keys.includes(code)) {
          this.triggerAction(action, true);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      const code = e.code;
      if (code === 'ArrowRight') this.triggerAction('forward', false, 'keyboard');
      for (const [action, keys] of Object.entries(this.keyBindings) as [GameAction, string[]][]) {
        if (keys.includes(code)) {
          this.triggerAction(action, false);
        }
      }
    });
    window.addEventListener('blur', () => {
      this.focused = false;
      this.forwardSources.clear();
      for (const action of this.activeActions) this.triggerAction(action, false);
      this.clearJustPressed();
    });
    window.addEventListener('focus', () => { this.focused = true; });
  }

  /**
   * Attach passive gesture listeners to a canvas container.
   * @param element - Surface used to record touch start/end coordinates.
   * @remarks Gestures must finish under 400 ms: vertical swipes exceed 30 px,
   * taps stay below 15 px on both axes. Jump/slide/tap pulses release after
   * 150/350/100 ms. Each call adds listeners; no unbind handle is returned.
   */
  public bindTouchElement(element: HTMLElement) {
    element.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        this.touchStartTime = Date.now();
      }
    }, { passive: true });

    element.addEventListener('touchend', (e) => {
      if (e.changedTouches.length > 0) {
        const dx = e.changedTouches[0].clientX - this.touchStartX;
        const dy = e.changedTouches[0].clientY - this.touchStartY;
        const dt = Date.now() - this.touchStartTime;

        // Swipe detection (quick swipe under 400ms, threshold 30px)
        if (dt < 400) {
          if (dy < -30 && Math.abs(dy) > Math.abs(dx)) {
            // Swipe Up -> Jump
            this.triggerAction('jump', true);
            setTimeout(() => this.triggerAction('jump', false), 150);
          } else if (dy > 30 && Math.abs(dy) > Math.abs(dx)) {
            // Swipe Down -> Slide
            this.triggerAction('slide', true);
            setTimeout(() => this.triggerAction('slide', false), 350);
          } else if (Math.abs(dx) < 15 && Math.abs(dy) < 15) {
            // Tap -> Jump / Interact
            this.triggerAction('jump', true);
            this.triggerAction('interact', true);
            setTimeout(() => {
              this.triggerAction('jump', false);
              this.triggerAction('interact', false);
            }, 100);
          }
        }
      }
    }, { passive: true });
  }

  /**
   * Poll the first connected pad, including pads connected before construction.
   * Standard D-pad Right holds forward; A/Up jumps, B/Down slides, and Start pauses.
   * Missing pads release their forward hold without cancelling keyboard/touch input.
   */
  private setupGamepadPolling() {
    if (typeof window === 'undefined') return;

    /** Previous sampled states distinguish held buttons from new transitions. */
    let prevButtonJump = false;
    let prevButtonSlide = false;
    let prevButtonPause = false;

    /** Sample the first pad and schedule the next browser animation frame. */
    const pollGamepad = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = Array.from(gamepads).find(pad => pad?.connected);
      this.triggerAction('forward', this.focused && (gp?.buttons[15]?.pressed ?? false), 'gamepad');
      if (gp) {
        // Button 0 (A / Cross): Jump
        const jumpPressed = gp.buttons[0]?.pressed || gp.buttons[12]?.pressed; // Dpad Up is 12
        if (jumpPressed !== prevButtonJump) {
          this.triggerAction('jump', jumpPressed);
          prevButtonJump = jumpPressed;
        }

        // Button 1 (B / Circle) or Dpad Down (13): Slide
        const slidePressed = gp.buttons[1]?.pressed || gp.buttons[13]?.pressed;
        if (slidePressed !== prevButtonSlide) {
          this.triggerAction('slide', slidePressed);
          prevButtonSlide = slidePressed;
        }

        // Button 9 (Start / Options): Pause
        const pausePressed = gp.buttons[9]?.pressed;
        if (pausePressed && !prevButtonPause) {
          this.triggerAction('pause', true);
        } else if (!pausePressed && prevButtonPause) {
          this.triggerAction('pause', false);
        }
        prevButtonPause = pausePressed;
      }
      requestAnimationFrame(pollGamepad);
    };

    requestAnimationFrame(pollGamepad);
  }
}
