// Held input state written by keyboard and touch handlers, read once per frame by the stepper.
import { gameAudio } from "./audio/GameAudio";
import { useToggles } from "./store";

export const input = {
  gas: false,
  brake: false,
  left: false,
  right: false,
  liftUp: false,
  liftDown: false,
  horn: false,
  attachPressed: false,
  resetPressed: false,
};

/** Camera orbit / zoom controlled by pointer drag, pinch and wheel. */
export const camCtl = { yaw: 0, pitch: 0, dist: 11, fov: 70 };

const keys = new Set<string>();
export const keyHeld = (code: string) => keys.has(code);

export function cycleCamera() {
  const s = useToggles.getState();
  s.set({ cam: ((s.cam + 1) % 3) as 0 | 1 | 2 });
  camCtl.yaw = 0;
  camCtl.pitch = 0;
}

export function toggleDirection() {
  const s = useToggles.getState();
  s.set({ dir: s.dir > 0 ? -1 : 1 });
}

export function setHorn(on: boolean) {
  input.horn = on;
  if (on) gameAudio.hornOn();
  else gameAudio.hornOff();
}

export function bindKeyboard() {
  const down = (e: KeyboardEvent) => {
    if (e.repeat) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      return;
    }
    gameAudio.unlock();
    keys.add(e.code);
    const t = useToggles.getState();
    switch (e.code) {
      case "KeyK": t.flip("engine"); break;
      case "KeyL": t.flip("head"); break;
      case "KeyJ": t.flip("work"); break;
      case "KeyB": t.flip("beacon"); break;
      case "KeyN": t.flip("night"); break;
      case "KeyO": t.flip("hood"); break;
      case "KeyC": cycleCamera(); break;
      case "KeyR": toggleDirection(); break;
      case "KeyT": input.attachPressed = true; break;
      case "KeyH": setHorn(true); break;
      case "F1": e.preventDefault(); t.flip("help"); break;
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  };
  const up = (e: KeyboardEvent) => {
    keys.delete(e.code);
    if (e.code === "KeyH") setHorn(false);
  };
  const blur = () => {
    keys.clear();
    setHorn(false);
  };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", blur);
  };
}

/** Merge keyboard and touch into one set of axes. */
export function readAxes() {
  const gas = input.gas || keys.has("KeyW") || keys.has("ArrowUp");
  const brake = input.brake || keys.has("KeyS") || keys.has("ArrowDown") || keys.has("Space");
  const left = input.left || keys.has("KeyA") || keys.has("ArrowLeft");
  const right = input.right || keys.has("KeyD") || keys.has("ArrowRight");
  const up = input.liftUp || keys.has("KeyE");
  const dn = input.liftDown || keys.has("KeyQ");
  return {
    throttle: gas ? 1 : 0,
    brake: brake ? 1 : 0,
    steer: (right ? 1 : 0) - (left ? 1 : 0),
    liftCmd: (up ? 1 : 0) - (dn ? 1 : 0),
  };
}
