import Phaser from "phaser";
import {
  type Actor,
  type Arena,
  Boss,
  Bullet,
  DART,
  DRONE,
  Enemy,
  type EnemyKind,
  LANCER,
  Player,
  PowerUp,
  type Spawn,
  TURRET,
  WIDTH,
} from "../actors.ts";
import type { Hud } from "../hud.ts";
import type { LaunchOptions } from "../main.ts";
import { AutoPilot, KeyboardPilot, type Pilot } from "../pilots.ts";
import { Rng } from "../rng.ts";
import { play } from "../sounds.ts";
import { TINTS } from "../textures.ts";
import { Backdrop } from "./backdrop.ts";
import type { CutsceneData } from "./cutscene.ts";
import { fadeIn, fadeTo } from "./fade.ts";

const TICK_MS = 1000 / 60;
const START_LIVES = 3;
const BOSS_WARNING_TICKS = 200;
const VICTORY_TICKS = 180;

type Kind = "drone" | "dart" | "lancer" | "turret";

/** information about each enemy */
const KINDS: Record<Kind, EnemyKind> = {
  drone: DRONE,
  dart: DART,
  lancer: LANCER,
  turret: TURRET,
};

type Formation = "line" | "vee" | "column" | "pincer";

/** x is the formation's center (default 240) */
interface Wave {
  at: number;
  kind: Kind;
  count: number;
  formation: Formation;
  x?: number;
}

interface Sector {
  name: string;
  subtitle: string;
  length: number;
  waves: Wave[];
}

/** ticks keep track of time and start the next wave when time */
const SECTOR_GRACE_TICKS = 240;
const WARDEN_STOP = "The Warden";

const SECTORS: readonly Sector[] = [
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

/**
 * One run of the game. Keyboard play and the self-play demo share this scene;
 * start it with { attract: true } for the demo.
 */
export class PlayScene extends Phaser.Scene implements Arena {
  rng!: Rng;
  player!: Player;
  now = 0;
  private attract = false;
  private run;
  private pilot!: Pilot;
  private backdrop!: Backdrop;
  private enemies: Enemy[] = [];
  private shots: Bullet[] = [];
  private bullets: Bullet[] = [];
  private pickups: PowerUp[] = [];
  private sector = -1;
  private sectorStart = 0;
  private boss: Boss | null = null;
  private bossDueAt = 0;
  private victoryAt = 0;
  private gameOver = false;
  private carry = 0;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(
    private readonly hud: Hud,
    private readonly options: LaunchOptions,
  ) {
    super("play");
  }

  /** Scene objects are reused, so every per-run field is reset here. */
  init(data: { attract?: boolean }): void {
    this.attract = data.attract ?? false;
    this.rng = new Rng(this.options.seed);
    this.now = 0;
    this.carry = 0;
    this.run = {
      score: 0,
      lives: START_LIVES,
      kills: 0,
      hits: 0,
      continues: 0,
    };
    this.enemies = [];
    this.shots = [];
    this.bullets = [];
    this.pickups = [];
    this.sector = -1;
    this.boss = null;
    this.bossDueAt = 0;
    this.victoryAt = 0;
    this.gameOver = false;
  }

  create(): void {
    this.backdrop = new Backdrop(this);
    if (this.attract) {
      // any key during the demo goes back to the title
      this.input.keyboard?.on("keydown-SPACE", () => fadeTo(this, "title"));
    }

    this.player = new Player(this);
    this.player.enableFilters();
    this.player.filters?.internal.addGlow(TINTS.player, 4, 0, 1);
    this.add.particles(0, 0, "spark", {
      speedY: { min: 80, max: 160 },
      speedX: { min: -20, max: 20 },
      lifespan: 260,
      scale: { start: 0.9, end: 0 },
      tint: TINTS.player,
      blendMode: "ADD",
      frequency: 30,
    }).startFollow(this.player, 0, 18);
    this.sparks = this.add.particles(0, 0, "spark", {
      speed: { min: 60, max: 260 },
      lifespan: { min: 250, max: 600 },
      scale: { start: 1.4, end: 0 },
      blendMode: "ADD",
      emitting: false,
    });

    this.pilot = this.attract
      ? new AutoPilot()
      : new KeyboardPilot(this.input.keyboard!);
    this.hud.setMode(this.attract ? "attract" : "play");
    fadeIn(this);
    this.startSector(0);
  }

  override update(_time: number, delta: number): void {
    this.backdrop.scroll(delta);
    const speed = this.attract ? this.options.speed : 1;
    // runs one tick per frame
    this.carry += Math.min(delta, 250) * speed;
    while (this.carry >= TICK_MS && this.scene.isActive()) {
      this.carry -= TICK_MS;
      this.tick();
    }
  }

  // Arena: what actors may ask of the scene.

  fire(
    x: number,
    y: number,
    angle: number,
    speed: number,
    heavy = false,
  ): void {
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    this.bullets.push(
      heavy
        ? new Bullet(this, x, y, "heavy", 8, vx, vy)
        : new Bullet(this, x, y, "bullet", 5, vx, vy),
    );
  }

  summon(_kind: string, x: number, y: number): void {
    this.spawn("drone", { x, y, side: x < WIDTH / 2 ? 1 : -1 });
  }

  // one tick of gameplay

  private tick(): void {
    this.now++;
    this.advanceRoute();
    this.updateProgression();

    if (!this.gameOver) this.flyPlayer();
    for (const enemy of this.enemies) enemy.step(this);
    for (const actor of [...this.shots, ...this.bullets, ...this.pickups]) {
      actor.step();
    }

    this.resolveHits();
    this.cull();
    this.refreshHud();
  }

  private flyPlayer(): void {
    const controls = this.pilot.read({
      player: this.player,
      enemies: this.enemies,
      threats: [...this.bullets, ...this.enemies],
      pickups: this.pickups,
    });
    for (const shot of this.player.step(controls)) {
      this.shots.push(
        new Bullet(this, shot.x, shot.y, "shot", 6, shot.vx, -11),
      );
      if (this.now % 2 === 0) play(this, "shoot", 0.25);
    }
  }

  private advanceRoute(): void {
    if (this.gameOver) return;
    if (this.victoryAt > 0) {
      if (this.now === this.victoryAt) {
        // fade out, then hand the run totals to the cutscene
        const data: CutsceneData = { run: this.run, afterDemo: this.attract };
        fadeTo(this, "cutscene", data);
      }
      return;
    }
    if (this.bossDueAt > 0) {
      if (this.now === this.bossDueAt) this.startBoss();
      return;
    }
    if (this.boss) return;
    const t = this.now - this.sectorStart;
    const sector = SECTORS[this.sector];
    if (
      sector && t >= sector.length &&
      (this.enemies.length === 0 || t >= sector.length + SECTOR_GRACE_TICKS)
    ) {
      this.startSector(this.sector + 1);
    }
  }

  private startSector(index: number): void {
    this.sector = index;
    this.hud.setSector(index);
    this.sectorStart = this.now;
    const sector = SECTORS[index];
    if (sector) {
      this.hud.announce(`Sector ${index + 1}: ${sector.name}`, sector.subtitle);
      return;
    }
    this.hud.announce("WARNING", "The Warden approaches");
    this.hud.shudder(true);
    play(this, "warn", 0.6);
    this.bossDueAt = this.now + BOSS_WARNING_TICKS;
  }

  private updateProgression(): void {
    const sector = SECTORS[this.sector];
    if (!sector) return;
    const t = this.now - this.sectorStart;
    for (const wave of sector.waves) this.spawnWave(t, wave);
  }

  /** Spawns whichever ships of this wave are due on tick t. */
  private spawnWave(t: number, wave: Wave): void {
    const { at, kind, count, formation, x: cx = 240 } = wave;
    const mid = (count - 1) / 2;
    for (let i = 0; i < count; i++) {
      let x = cx;
      let y = -30;
      let delay = 0;
      switch (formation) {
        case "line":
          x = cx + (i - mid) * 64;
          break;
        case "vee":
          x = cx + (i - mid) * 44;
          delay = Math.abs(i - mid) * 10;
          break;
        case "column":
          delay = i * 24;
          break;
        case "pincer":
          x = i % 2 === 0 ? -30 : 510;
          y = 70 + Math.floor(i / 2) * 50;
          delay = Math.floor(i / 2) * 30;
          break;
      }
      if (t === at + delay) {
        this.spawn(kind, { x, y, side: i % 2 === 0 ? 1 : -1 });
      }
    }
  }

  private spawn(kind: Kind, at: Spawn): void {
    this.enemies.push(new Enemy(this, KINDS[kind], at));
  }

  private startBoss(): void {
    this.bossDueAt = 0;
    this.boss = new Boss(this);
    this.boss.enableFilters();
    this.boss.filters?.internal.addGlow(TINTS.boss, 4, 0, 1);
    this.enemies.push(this.boss);
    this.hud.setBoss(1);
  }

  private resolveHits(): void {
    for (const shot of this.shots) {
      const enemy = this.enemies.find((e) => e.active && e.touches(shot));
      if (!enemy) continue;
      shot.setActive(false);
      this.burst(shot.x, shot.y, 3, TINTS.spark);
      if (enemy.takeDamage(shot.damage)) this.destroyEnemy(enemy);
      else play(this, "hit", 0.3);
    }

    for (const bullet of this.bullets) {
      if (bullet.active && bullet.touches(this.player)) {
        bullet.setActive(false);
        this.hurtPlayer();
      }
    }
    for (const enemy of this.enemies) {
      if (!enemy.active || !enemy.touches(this.player)) continue;
      this.hurtPlayer();
      if (enemy !== this.boss && enemy.takeDamage(3)) this.destroyEnemy(enemy);
    }
    for (const pickup of this.pickups) {
      if (pickup.active && pickup.touches(this.player)) {
        pickup.setActive(false);
        this.player.collect(pickup.kind);
        play(this, "pickup", 0.6);
        this.burst(pickup.x, pickup.y, 14, TINTS.player);
      }
    }
  }

  private destroyEnemy(enemy: Enemy): void {
    enemy.setActive(false);
    this.run.score += enemy.kind.score;
    this.run.kills++;
    if (enemy === this.boss) {
      this.defeatBoss(this.boss);
      return;
    }
    this.explode(enemy.x, enemy.y, 1);
    if (this.rng.chance(enemy.kind.dropChance)) {
      const kind = this.player.power < 3 && this.rng.chance(0.5)
        ? "spread"
        : "shield";
      this.pickups.push(new PowerUp(this, enemy.x, enemy.y, kind));
    }
  }

  private hurtPlayer(): void {
    // After the Warden falls, nothing can hurt the ship during the victory lap.
    if (this.run.bossDefeted || this.gameOver || !this.player.vulnerable) {
      return;
    }
    this.run.hits++;

    const lostLife = this.player.takeHit();
    this.hud.shudder(lostLife);
    this.cameras.main.shake(lostLife ? 260 : 120, lostLife ? 0.012 : 0.005);
    play(this, "hurt", 0.7);
    this.burst(this.player.x, this.player.y, 24, TINTS.player);
    if (!lostLife) return;
    this.run.lives--;
    this.cameras.main.flash(180, 255, 80, 120);
    if (this.run.lives > 0) return;
    if (this.attract) {
      // The demo never ends early: self-play buys another ship and keeps going.
      this.run.continues++;
      this.run.lives = START_LIVES;
      return;
    }
    this.hud.announce("GAME OVER", "The lanes stay closed");
    this.gameOver = true;
    this.player.setVisible(false);
    this.player.bubble.setVisible(false);
    this.explode(this.player.x, this.player.y, 2);
    this.time.delayedCall(1800, () => fadeTo(this, "title"));
  }

  private defeatBoss(boss: Boss): void {
    this.run.bossDefeated = true;
    this.victoryAt = this.now + VICTORY_TICKS;
    this.hud.setBoss(0);
    this.hud.announce("WARDEN DOWN", "The lanes are open");
    console.log("victory lap: ship protected =", this.run.bossDefeted);
    // The Warden's fall takes its bullets and escorts with it (no score).
    for (const bullet of this.bullets) {
      this.burst(bullet.x, bullet.y, 2, TINTS.spark);
      bullet.setActive(false);
    }
    for (const escort of this.enemies) {
      if (escort === boss || !escort.active) continue;
      this.explode(escort.x, escort.y, 1);
      escort.setActive(false);
    }
    console.info(
      `[self-play] seed=${this.options.seed} ticks=${this.now} score=${this.run.score}` +
        ` kills=${this.run.kills} hits=${this.run.hits} continues=${this.run.continues}`,
    );
    // A chain of blasts across the hull, then the big one.
    for (let i = 0; i < 8; i++) {
      this.time.delayedCall(i * 140, () => {
        this.explode(
          boss.x + Phaser.Math.Between(-80, 80),
          boss.y + Phaser.Math.Between(-40, 40),
          1,
        );
      });
    }
    this.time.delayedCall(1200, () => {
      this.explode(boss.x, boss.y, 3);
      this.cameras.main.flash(400, 255, 230, 160);
      this.hud.shudder(true);
      play(this, "bigboom", 0.9);
      boss.setVisible(false);
      boss.core.setVisible(false);
    });
  }

  private explode(x: number, y: number, size: number): void {
    this.burst(x, y, 18 * size, size > 1 ? TINTS.bossCore : TINTS.spark);
    const ring = this.add.image(x, y, "ring").setBlendMode(
      Phaser.BlendModes.ADD,
    );
    ring.setScale(0.2 * size);
    this.tweens.add({
      targets: ring,
      scale: 1.2 * size,
      alpha: 0,
      duration: 380 + 120 * size,
      ease: "Cubic.out",
      onComplete: () => ring.destroy(),
    });
    this.cameras.main.shake(90 * size, 0.004 * size);
    play(this, size > 1 ? "bigboom" : "boom", 0.5);
  }

  private burst(x: number, y: number, count: number, tint: number): void {
    this.sparks.particleTint = tint;
    this.sparks.explode(count, x, y);
  }

  /** Destroys spent and offscreen actors. */
  private cull(): void {
    const spent = (actor: Actor) => !actor.active || actor.isOffscreen();
    this.shots = sweep(this.shots, spent);
    this.bullets = sweep(this.bullets, spent);
    this.pickups = sweep(this.pickups, spent);
    // The defeated Warden stays on screen for its finale: drop it undestroyed.
    this.enemies = this.enemies.filter((e) => e.active || e !== this.boss);
    this.enemies = sweep(
      this.enemies,
      (e) => !e.active || (e.age > 30 && e.isOffscreen()),
    );
  }

  private refreshHud(): void {
    this.hud.setScore(this.run.score);
    this.hud.setLives(this.run.lives);
    this.hud.setPower(this.player.power);
    if (this.boss && !this.run.bossDefeated) {
      this.hud.setBoss(this.boss.fraction);
    }
  }
}

function sweep<T extends Actor>(
  actors: T[],
  gone: (actor: Actor) => boolean,
): T[] {
  return actors.filter((actor) => {
    if (!gone(actor)) return true;
    actor.destroy();
    return false;
  });
}
