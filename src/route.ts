//The enemy kinds a wave can name
export type Kind = "drone" | "dart" | "lancer" | "turret";

export type Formation = "line" | "vee" | "column" | "pincer";

/** x is the formation's center (default 240) */
export interface Wave {
  at: number;
  kind: Kind;
  count: number;
  formation: Formation;
  x?: number;
}

export interface Sector {
  name: string;
  subtitle: string;
  length: number;
  waves: Wave[];
}

// ticks keep track of time and start the next wave when time
export const SECTOR_GRACE_TICKS = 240;
const WARDEN_STOP = "The Warden";

export const SECTORS: readonly Sector[] = [
  {
    name: "Outer Drift",
    subtitle: "Scouts ahead",
    length: 1560,
    waves: [
      { at: 60, kind: "drone", count: 4, formation: "line" },
      { at: 360, kind: "drone", count: 5, formation: "vee", x: 168 },
      { at: 660, kind: "drone", count: 5, formation: "vee", x: 312 },
      { at: 960, kind: "drone", count: 6, formation: "line" },
      { at: 1200, kind: "drone", count: 4, formation: "column", x: 120 },
      { at: 1260, kind: "drone", count: 4, formation: "column", x: 360 },
    ],
  },
  {
    name: "Shatter Belt",
    subtitle: "Divers incoming",
    length: 1800,
    waves: [
      { at: 60, kind: "drone", count: 6, formation: "vee" },
      { at: 300, kind: "dart", count: 4, formation: "line" },
      { at: 600, kind: "dart", count: 5, formation: "column", x: 144 },
      { at: 720, kind: "dart", count: 5, formation: "column", x: 336 },
      { at: 1020, kind: "drone", count: 7, formation: "line" },
      { at: 1140, kind: "dart", count: 5, formation: "vee" },
      { at: 1440, kind: "dart", count: 6, formation: "line" },
    ],
  },
  {
    name: "Gun Lanes",
    subtitle: "Turrets online",
    length: 1920,
    waves: [
      { at: 60, kind: "turret", count: 1, formation: "line" },
      { at: 240, kind: "drone", count: 6, formation: "vee" },
      { at: 540, kind: "turret", count: 2, formation: "line" },
      { at: 840, kind: "dart", count: 6, formation: "column" },
      { at: 1080, kind: "turret", count: 2, formation: "line" },
      { at: 1140, kind: "drone", count: 6, formation: "line" },
      { at: 1500, kind: "turret", count: 3, formation: "line" },
    ],
  },
  {
    name: "Lancer Gate",
    subtitle: "Crossfire",
    length: 1920,
    waves: [
      { at: 60, kind: "lancer", count: 4, formation: "pincer" },
      { at: 360, kind: "dart", count: 6, formation: "vee" },
      { at: 600, kind: "lancer", count: 6, formation: "pincer" },
      { at: 780, kind: "turret", count: 2, formation: "line" },
      { at: 1140, kind: "lancer", count: 6, formation: "pincer" },
      { at: 1260, kind: "drone", count: 8, formation: "vee" },
      { at: 1560, kind: "dart", count: 8, formation: "line" },
    ],
  },
  {
    name: "Last Approach",
    subtitle: "Everything they have",
    length: 2040,
    waves: [
      { at: 60, kind: "turret", count: 3, formation: "line" },
      { at: 180, kind: "lancer", count: 6, formation: "pincer" },
      { at: 540, kind: "dart", count: 6, formation: "column", x: 120 },
      { at: 540, kind: "dart", count: 6, formation: "column", x: 360 },
      { at: 900, kind: "drone", count: 9, formation: "vee" },
      { at: 1020, kind: "turret", count: 2, formation: "line" },
      { at: 1320, kind: "lancer", count: 8, formation: "pincer" },
      { at: 1560, kind: "dart", count: 8, formation: "vee" },
    ],
  },
];

export const ROUTE = [...SECTORS.map((s) => s.name), WARDEN_STOP];

export interface Placement {
  x: number;
  y: number;
  delay: number;
}

export function place(
  formation: Formation,
  i: number,
  count: number,
  cx: number,
): Placement {
  const mid = (count - 1) / 2;
  switch (formation) {
    case "line":
      return { x: cx + (i - mid) * 64, y: -30, delay: 0 };
    case "vee":
      return {
        x: cx + (i - mid) * 44,
        y: -30,
        delay: Math.abs(i - mid) * 10,
      };
    case "column":
      return { x: cx, y: -30, delay: i * 24 };
    case "pincer":
      return {
        x: i % 2 === 0 ? -30 : 510,
        y: 70 + Math.floor(i / 2) * 50,
        delay: Math.floor(i / 2) * 30,
      };
  }
}
