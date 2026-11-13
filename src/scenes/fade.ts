import type Phaser from "phaser";

const FADE_MS = 450;
const [R, G, B] = [4, 2, 12];

const leaving = new WeakSet<Phaser.Scene>();

export function fadeIn(scene: Phaser.Scene, ms = 400): void {
  leaving.delete(scene);
  scene.cameras.main.fadeIn(ms, R, G, B);
}

export function fadeTo(scene: Phaser.Scene, key: string, data?: object): void {
  if (leaving.has(scene)) return;
  leaving.add(scene);
  const camera = scene.cameras.main;
  camera.fadeOut(FADE_MS, R, G, B);
  camera.once("camerafadeoutcomplete", () => scene.scene.start(key, data));
}
