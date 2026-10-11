/**
 * Held forward controls across real keyboard listeners and controller polling.
 * @module tests/input
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputManager } from '../src/game/input/InputManager.ts';
import { DEFAULT_KEY_BINDINGS } from '../src/data/defaults.ts';

describe('Forward direction input', () => {
  /** Browser event surface without a renderer. */
  let surface: EventTarget;
  /** Real manager installs listeners on the controlled surface. */
  let input: InputManager;
  /** Pending animation frame used to advance one controller sample. */
  let frame: FrameRequestCallback;
  /** Sparse controller state, including the standard D-pad indices. */
  let buttons: { pressed: boolean }[];
  /** Mutable connection state exposed to the polling loop. */
  let connected: boolean;

  beforeEach(() => {
    surface = new EventTarget();
    buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
    connected = true;
    vi.stubGlobal('window', surface);
    vi.stubGlobal('navigator', { getGamepads: () => connected ? [{ connected, buttons }] : [] });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
    input = new InputManager(DEFAULT_KEY_BINDINGS);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  /** Dispatch the physical keyboard code through the installed browser listeners. */
  function key(type: 'keydown' | 'keyup', code: string) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code });
    surface.dispatchEvent(event);
  }

  /** Right is held, releases immediately, and neither Left nor unrelated keys move. */
  it('starts stationary and only moves while Right Arrow is held', () => {
    expect(input.isActionActive('forward')).toBe(false);
    key('keydown', 'ArrowLeft');
    key('keydown', 'KeyD');
    expect(input.isActionActive('forward')).toBe(false);
    key('keydown', 'ArrowRight');
    key('keydown', 'ArrowRight');
    expect(input.isActionActive('forward')).toBe(true);
    key('keyup', 'ArrowRight');
    expect(input.isActionActive('forward')).toBe(false);
  });

  /** Polling already-connected controllers must not depend on a new connection event. */
  it('holds D-pad Right and stops on release or disconnection without moving left', () => {
    buttons[14].pressed = true;
    frame(0);
    expect(input.isActionActive('forward')).toBe(false);
    buttons[15].pressed = true;
    frame(16);
    expect(input.isActionActive('forward')).toBe(true);
    buttons[15].pressed = false;
    frame(32);
    expect(input.isActionActive('forward')).toBe(false);
    buttons[15].pressed = true;
    frame(48);
    connected = false;
    frame(64);
    expect(input.isActionActive('forward')).toBe(false);
  });

  /** Keyboard, controller and touch holds combine instead of overwriting one another. */
  it('does not let another device release a held direction and clears holds on blur', () => {
    key('keydown', 'ArrowRight');
    buttons[15].pressed = true;
    frame(0);
    key('keyup', 'ArrowRight');
    expect(input.isActionActive('forward')).toBe(true);
    input.triggerAction('forward', true);
    connected = false;
    frame(16);
    expect(input.isActionActive('forward')).toBe(true);
    input.triggerAction('forward', false);
    expect(input.isActionActive('forward')).toBe(false);
    connected = true;
    frame(32);
    surface.dispatchEvent(new Event('blur'));
    frame(48);
    expect(input.isActionActive('forward')).toBe(false);
    surface.dispatchEvent(new Event('focus'));
    frame(64);
    expect(input.isActionActive('forward')).toBe(true);
  });
});
