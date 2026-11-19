import { create } from "zustand";

export type CamMode = 0 | 1 | 2; // 0 = chase, 1 = cab, 2 = rear hitch view

export type Toggles = {
  cam: CamMode;
  head: boolean;
  work: boolean;
  beacon: boolean;
  engine: boolean;
  night: boolean;
  hood: boolean;
  dir: 1 | -1;
  help: boolean;
  quality: "high" | "low";
};

type ToggleStore = Toggles & { set: (p: Partial<Toggles>) => void; flip: (k: "head" | "work" | "beacon" | "engine" | "night" | "hood" | "help") => void };

function initialQuality(): "high" | "low" {
  if (typeof window === "undefined") return "high";
  const q = new URLSearchParams(window.location.search).get("q");
  if (q === "low" || q === "high") return q;
  return window.matchMedia?.("(pointer: coarse)").matches ? "low" : "high";
}

export const useToggles = create<ToggleStore>((set) => ({
  cam: 0,
  head: false,
  work: false,
  beacon: false,
  engine: false,
  night: false,
  hood: false,
  dir: 1,
  help: false,
  quality: initialQuality(),
  set: (p) => set(p),
  flip: (k) => set((s) => ({ [k]: !s[k] }) as Partial<Toggles>),
}));

export type Hud = {
  ready: boolean;
  speed: number;
  rpm: number;
  lift: number;
  attached: boolean;
  working: boolean;
  canAttach: boolean;
  attachDist: number;
  area: number;
  surface: string;
  running: boolean;
  toast: string;
  toastT: number;
};

export const useHud = create<Hud>(() => ({
  ready: false,
  speed: 0,
  rpm: 0,
  lift: 1,
  attached: false,
  working: false,
  canAttach: false,
  attachDist: 99,
  area: 0,
  surface: "",
  running: false,
  toast: "",
  toastT: 0,
}));

export const toast = (msg: string) => useHud.setState({ toast: msg, toastT: Date.now() });
