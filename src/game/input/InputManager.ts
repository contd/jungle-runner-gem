/**
 * Jungle Run - Unified Input Manager
 * Handles Desktop Keyboard, Touch gestures, on-screen buttons, and Gamepads.
 */

import { KeyBindings } from '../../data/types.ts';

export type GameAction = 'jump' | 'slide' | 'interact' | 'pause';

export class InputManager {
  private keyBindings: KeyBindings;
  private activeActions: Set<GameAction> = new Set();
  private justPressedActions: Set<GameAction> = new Set();
  private listeners: Map<GameAction, Array<(pressed: boolean) => void>> = new Map();

  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;

  constructor(bindings: KeyBindings) {
    this.keyBindings = bindings;
    this.setupKeyboardListeners();
    this.setupGamepadPolling();
  }

  public updateBindings(bindings: KeyBindings) {
    this.keyBindings = bindings;
  }

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

  public triggerAction(action: GameAction, pressed: boolean) {
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

  public isActionActive(action: GameAction): boolean {
    return this.activeActions.has(action);
  }

  public wasActionJustPressed(action: GameAction): boolean {
    const was = this.justPressedActions.has(action);
    this.justPressedActions.delete(action);
    return was;
  }

  public clearJustPressed() {
    this.justPressedActions.clear();
  }

  private setupKeyboardListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      const code = e.code;
      // Prevent default page scroll on arrow keys and space
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        e.preventDefault();
      }

      for (const [action, keys] of Object.entries(this.keyBindings) as [GameAction, string[]][]) {
        if (keys.includes(code)) {
          this.triggerAction(action, true);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      const code = e.code;
      for (const [action, keys] of Object.entries(this.keyBindings) as [GameAction, string[]][]) {
        if (keys.includes(code)) {
          this.triggerAction(action, false);
        }
      }
    });
  }

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

  private setupGamepadPolling() {
    if (typeof window === 'undefined') return;

    let prevButtonJump = false;
    let prevButtonSlide = false;
    let prevButtonPause = false;

    const pollGamepad = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = gamepads[0];
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

    window.addEventListener('gamepadconnected', () => {
      requestAnimationFrame(pollGamepad);
    });
  }
}
