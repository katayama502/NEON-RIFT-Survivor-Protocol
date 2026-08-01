"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Screen = "menu" | "playing" | "upgrade" | "paused" | "gameover" | "extracted";
type EnemyType = "drone" | "runner" | "tank" | "spitter" | "elite" | "boss";
type PickupType = "xp" | "core" | "heal" | "rift";
type Stick = { x: number; y: number };

type Player = {
  x: number; y: number; r: number; hp: number; maxHp: number; speed: number;
  damage: number; fireRate: number; bulletSpeed: number; pierce: number;
  multishot: number; spread: number; crit: number; magnet: number;
  shield: number; shieldMax: number; shotTimer: number; invuln: number;
  dash: number; dashCd: number; dashX: number; dashY: number; angle: number;
};

type Enemy = {
  id: number; type: EnemyType; x: number; y: number; r: number; hp: number;
  maxHp: number; speed: number; damage: number; color: string; shotTimer: number;
  phase: number;
};

type Bullet = {
  x: number; y: number; vx: number; vy: number; r: number; damage: number;
  life: number; pierce: number; enemy: boolean; color: string;
};

type Pickup = { x: number; y: number; r: number; type: PickupType; value: number; life: number };
type Particle = { x: number; y: number; vx: number; vy: number; size: number; life: number; max: number; color: string };
type FloatText = { x: number; y: number; text: string; color: string; life: number };

type Runtime = {
  w: number; h: number; t: number; score: number; kills: number; combo: number;
  comboTimer: number; maxCombo: number; level: number; xp: number; xpNext: number;
  rift: number; cores: number; spawnTimer: number; enemyId: number; shake: number;
  bossSpawned: boolean; droneTimer: number; novaCd: number; player: Player;
  enemies: Enemy[]; bullets: Bullet[]; pickups: Pickup[]; particles: Particle[];
  texts: FloatText[]; upgrades: Record<string, number>; drones: number;
};

type Meta = {
  best: number; cores: number; runs: number;
  modules: { hull: number; cannon: number; thrusters: number };
};

type Hud = {
  hp: number; maxHp: number; shield: number; shieldMax: number; score: number;
  level: number; xp: number; xpNext: number; rift: number; combo: number;
  cores: number; kills: number; time: number; dashCd: number; novaCd: number;
};

type Upgrade = { id: string; icon: string; title: string; desc: string; color: string; apply: (g: Runtime) => void };

const TAU = Math.PI * 2;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;
const defaultMeta: Meta = { best: 0, cores: 0, runs: 0, modules: { hull: 0, cannon: 0, thrusters: 0 } };

const UPGRADES: Upgrade[] = [
  { id: "rapid", icon: "RAPID", title: "Rapid cycle", desc: "発射速度 +25%", color: "#22f5ff", apply: g => { g.player.fireRate *= 1.25; } },
  { id: "power", icon: "DMG", title: "Rift rounds", desc: "弾丸ダメージ +30%", color: "#ff2daa", apply: g => { g.player.damage *= 1.3; } },
  { id: "multi", icon: "+1", title: "Split chamber", desc: "同時発射 +1 / 拡散を抑制", color: "#7a5cff", apply: g => { g.player.multishot = Math.min(5, g.player.multishot + 1); g.player.spread = Math.max(.11, g.player.spread - .01); } },
  { id: "pierce", icon: "PEN", title: "Phase piercer", desc: "貫通数 +1", color: "#eafbff", apply: g => { g.player.pierce += 1; } },
  { id: "shield", icon: "SHD", title: "Aegis lattice", desc: "シールド +1（自動回復）", color: "#7a5cff", apply: g => { g.player.shieldMax += 1; g.player.shield = g.player.shieldMax; } },
  { id: "speed", icon: "SPD", title: "Vector drive", desc: "移動速度 +15%", color: "#22f5ff", apply: g => { g.player.speed *= 1.15; } },
  { id: "magnet", icon: "MAG", title: "Gravity well", desc: "回収範囲 +35%", color: "#39ffb6", apply: g => { g.player.magnet *= 1.35; } },
  { id: "drone", icon: "ORB", title: "Attack drone", desc: "自律攻撃ドローン +1", color: "#ffca5a", apply: g => { g.drones = Math.min(4, g.drones + 1); } },
  { id: "hull", icon: "HP", title: "Reactive hull", desc: "最大HP +25 / 25回復", color: "#ff647c", apply: g => { g.player.maxHp += 25; g.player.hp = Math.min(g.player.maxHp, g.player.hp + 25); } },
  { id: "crit", icon: "CRT", title: "Singularity sight", desc: "クリティカル率 +9%", color: "#ffca5a", apply: g => { g.player.crit = Math.min(.55, g.player.crit + .09); } },
  { id: "nova", icon: "NOVA", title: "Flux capacitor", desc: "NOVA再使用 -20%", color: "#ff2daa", apply: g => { g.novaCd = Math.max(0, g.novaCd - 2.5); } },
];

function makeRuntime(w: number, h: number, meta: Meta): Runtime {
  const hpBonus = meta.modules.hull * 8;
  const player: Player = {
    x: w / 2, y: h / 2, r: 13, hp: 100 + hpBonus, maxHp: 100 + hpBonus,
    speed: 225 * (1 + meta.modules.thrusters * .035), damage: 21 * (1 + meta.modules.cannon * .05),
    fireRate: 5.2, bulletSpeed: 620, pierce: 0, multishot: 1, spread: .17,
    crit: .08, magnet: 105, shield: 0, shieldMax: 0, shotTimer: 0,
    invuln: 0, dash: 0, dashCd: 0, dashX: 0, dashY: -1, angle: -Math.PI / 2,
  };
  return {
    w, h, t: 0, score: 0, kills: 0, combo: 0, comboTimer: 0, maxCombo: 0,
    level: 1, xp: 0, xpNext: 28, rift: 0, cores: 0, spawnTimer: .35,
    enemyId: 0, shake: 0, bossSpawned: false, droneTimer: 0, novaCd: 0,
    player, enemies: [], bullets: [], pickups: [], particles: [], texts: [],
    upgrades: {}, drones: 0,
  };
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function weightedEnemy(t: number): EnemyType {
  const r = Math.random();
  if (t > 38 && r < .12) return "spitter";
  if (t > 24 && r < .27) return "tank";
  if (t > 12 && r < .5) return "runner";
  return "drone";
}

function spawnEnemy(g: Runtime, type: EnemyType = weightedEnemy(g.t)) {
  const edge = Math.floor(Math.random() * 4);
  const pad = 45;
  let x = Math.random() * g.w;
  let y = Math.random() * g.h;
  if (edge === 0) y = -pad;
  if (edge === 1) x = g.w + pad;
  if (edge === 2) y = g.h + pad;
  if (edge === 3) x = -pad;
  const scale = 1 + g.t * .008;
  const spec: Record<EnemyType, [number, number, number, number, string]> = {
    drone: [13, 32, 78, 10, "#ff2daa"], runner: [9, 20, 138, 8, "#ffca5a"],
    tank: [22, 115, 42, 18, "#855cff"], spitter: [15, 52, 55, 12, "#22f5ff"],
    elite: [27, 270, 62, 24, "#eafbff"], boss: [48, 1450, 34, 30, "#ff2daa"],
  };
  const [r, hp, speed, damage, color] = spec[type];
  g.enemies.push({ id: ++g.enemyId, type, x, y, r, hp: hp * scale, maxHp: hp * scale, speed, damage, color, shotTimer: 1.3 + Math.random(), phase: Math.random() * TAU });
}

function burst(g: Runtime, x: number, y: number, color: string, count = 8, speed = 140) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU;
    const v = speed * (.35 + Math.random() * .8);
    g.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: 1.5 + Math.random() * 3.5, life: .25 + Math.random() * .45, max: .7, color });
  }
}

function nearestEnemy(g: Runtime, x: number, y: number) {
  let target: Enemy | undefined;
  let best = Infinity;
  for (const e of g.enemies) {
    const d = dist2(x, y, e.x, e.y);
    if (d < best) { best = d; target = e; }
  }
  return target;
}

function drawPolygon(ctx: CanvasRenderingContext2D, sides: number, r: number, rotation = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rotation + i / sides * TAU;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

export default function NeonRiftGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<Screen>("menu");
  const keysRef = useRef(new Set<string>());
  const moveRef = useRef<Stick>({ x: 0, y: 0 });
  const aimRef = useRef<Stick>({ x: 0, y: 0 });
  const pointerRef = useRef({ x: 0, y: 0, active: false });
  const soundRef = useRef(true);
  const audioRef = useRef<AudioContext | null>(null);
  const runtimeRef = useRef<Runtime>(makeRuntime(1000, 700, defaultMeta));
  const hudTickRef = useRef(0);

  const [screen, setScreenState] = useState<Screen>("menu");
  const [choices, setChoices] = useState<Upgrade[]>([]);
  const [sound, setSound] = useState(true);
  const [moveStick, setMoveStick] = useState<Stick>({ x: 0, y: 0 });
  const [aimStick, setAimStick] = useState<Stick>({ x: 0, y: 0 });
  const [meta, setMeta] = useState<Meta>(() => {
    if (typeof window === "undefined") return defaultMeta;
    try { return { ...defaultMeta, ...JSON.parse(localStorage.getItem("neon-rift-meta") || "{}") }; }
    catch { return defaultMeta; }
  });
  const [hud, setHud] = useState<Hud>({ hp: 100, maxHp: 100, shield: 0, shieldMax: 0, score: 0, level: 1, xp: 0, xpNext: 28, rift: 0, combo: 0, cores: 0, kills: 0, time: 0, dashCd: 0, novaCd: 0 });

  const changeScreen = useCallback((next: Screen) => {
    screenRef.current = next;
    setScreenState(next);
  }, []);

  const saveMeta = useCallback((next: Meta) => {
    setMeta(next);
    try { localStorage.setItem("neon-rift-meta", JSON.stringify(next)); } catch { /* local mode */ }
  }, []);

  const beep = useCallback((kind: "shot" | "hit" | "hurt" | "level" | "nova" | "extract") => {
    if (!soundRef.current || !audioRef.current) return;
    const ctx = audioRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const config = {
      shot: [160, 95, .025, "square"], hit: [90, 50, .035, "sawtooth"], hurt: [120, 45, .12, "sawtooth"],
      level: [520, 880, .2, "triangle"], nova: [75, 380, .35, "sawtooth"], extract: [330, 990, .5, "triangle"],
    }[kind] as [number, number, number, OscillatorType];
    osc.type = config[3]; osc.frequency.setValueAtTime(config[0], ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(config[1], ctx.currentTime + config[2]);
    gain.gain.setValueAtTime(kind === "shot" ? .018 : .045, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + config[2]);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + config[2]);
  }, []);

  const syncHud = useCallback((g: Runtime) => {
    const p = g.player;
    setHud({ hp: p.hp, maxHp: p.maxHp, shield: p.shield, shieldMax: p.shieldMax, score: Math.floor(g.score), level: g.level, xp: g.xp, xpNext: g.xpNext, rift: g.rift, combo: g.combo, cores: g.cores, kills: g.kills, time: g.t, dashCd: p.dashCd, novaCd: g.novaCd });
  }, []);

  const startGame = useCallback(() => {
    if (!audioRef.current && typeof window !== "undefined") audioRef.current = new AudioContext();
    audioRef.current?.resume();
    const old = runtimeRef.current;
    runtimeRef.current = makeRuntime(old.w, old.h, meta);
    syncHud(runtimeRef.current);
    changeScreen("playing");
  }, [changeScreen, meta, syncHud]);

  const finishRun = useCallback((extracted: boolean) => {
    const g = runtimeRef.current;
    if (screenRef.current === "gameover" || screenRef.current === "extracted") return;
    const secured = extracted ? g.cores + Math.floor(g.score / 3500) : Math.floor(g.cores * .3);
    const next: Meta = { ...meta, best: Math.max(meta.best, Math.floor(g.score)), cores: meta.cores + secured, runs: meta.runs + 1, modules: { ...meta.modules } };
    saveMeta(next);
    beep(extracted ? "extract" : "hurt");
    changeScreen(extracted ? "extracted" : "gameover");
  }, [beep, changeScreen, meta, saveMeta]);

  const presentUpgrade = useCallback((g: Runtime) => {
    const pool = [...UPGRADES].sort(() => Math.random() - .5);
    setChoices(pool.slice(0, 3));
    beep("level");
    changeScreen("upgrade");
  }, [beep, changeScreen]);

  const selectUpgrade = useCallback((up: Upgrade) => {
    const g = runtimeRef.current;
    up.apply(g);
    g.upgrades[up.id] = (g.upgrades[up.id] || 0) + 1;
    changeScreen("playing");
  }, [changeScreen]);

  const action = useCallback((kind: "dash" | "nova") => {
    const g = runtimeRef.current;
    if (screenRef.current !== "playing") return;
    if (kind === "dash" && g.player.dashCd <= 0) {
      let dx = moveRef.current.x, dy = moveRef.current.y;
      if (!dx && !dy) { dx = Math.cos(g.player.angle); dy = Math.sin(g.player.angle); }
      const len = Math.hypot(dx, dy) || 1;
      g.player.dashX = dx / len; g.player.dashY = dy / len; g.player.dash = .18; g.player.dashCd = 2.4; g.player.invuln = .28;
      burst(g, g.player.x, g.player.y, "#22f5ff", 14, 210);
    }
    if (kind === "nova" && g.novaCd <= 0) {
      g.novaCd = 12;
      for (const e of g.enemies) {
        const d = Math.sqrt(dist2(g.player.x, g.player.y, e.x, e.y));
        if (d < 230) {
          e.hp -= 70 + g.player.damage * 1.5;
          const push = (230 - d) * 1.15;
          e.x += (e.x - g.player.x) / Math.max(1, d) * push;
          e.y += (e.y - g.player.y) / Math.max(1, d) * push;
        }
      }
      g.shake = 9; burst(g, g.player.x, g.player.y, "#ff2daa", 42, 330); beep("nova");
    }
  }, [beep]);

  const buyModule = useCallback((type: keyof Meta["modules"]) => {
    const level = meta.modules[type];
    const cost = 6 + level * 5;
    if (meta.cores < cost || level >= 5) return;
    saveMeta({ ...meta, cores: meta.cores - cost, modules: { ...meta.modules, [type]: level + 1 } });
  }, [meta, saveMeta]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const shell = shellRef.current;
    if (!canvas || !shell) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = shell.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`;
      const g = runtimeRef.current;
      g.w = rect.width; g.h = rect.height;
      g.player.x = clamp(g.player.x, 20, g.w - 20); g.player.y = clamp(g.player.y, 20, g.h - 20);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(shell);

    const keyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.code);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      if (e.code === "Space") action("dash");
      if (e.code === "KeyQ") action("nova");
      if (e.code === "Escape") {
        if (screenRef.current === "playing") changeScreen("paused");
        else if (screenRef.current === "paused") changeScreen("playing");
      }
    };
    const keyUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener("keydown", keyDown, { passive: false }); window.addEventListener("keyup", keyUp);

    let raf = 0; let last = performance.now();
    const loop = (now: number) => {
      const rawDt = Math.min(.034, (now - last) / 1000); last = now;
      const g = runtimeRef.current;
      const running = screenRef.current === "playing";
      if (running) {
        const dt = rawDt;
        const p = g.player;
        g.t += dt; g.spawnTimer -= dt; g.comboTimer -= dt; p.shotTimer -= dt; p.invuln -= dt; p.dash -= dt; p.dashCd -= dt; g.novaCd -= dt; g.droneTimer -= dt;
        if (g.comboTimer <= 0) g.combo = 0;

        let mx = (keysRef.current.has("KeyD") || keysRef.current.has("ArrowRight") ? 1 : 0) - (keysRef.current.has("KeyA") || keysRef.current.has("ArrowLeft") ? 1 : 0) + moveRef.current.x;
        let my = (keysRef.current.has("KeyS") || keysRef.current.has("ArrowDown") ? 1 : 0) - (keysRef.current.has("KeyW") || keysRef.current.has("ArrowUp") ? 1 : 0) + moveRef.current.y;
        const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
        const moveSpeed = p.dash > 0 ? 720 : p.speed;
        if (p.dash > 0) { mx = p.dashX; my = p.dashY; }
        p.x = clamp(p.x + mx * moveSpeed * dt, 18, g.w - 18); p.y = clamp(p.y + my * moveSpeed * dt, 18, g.h - 18);

        let aimX = aimRef.current.x, aimY = aimRef.current.y;
        if (Math.hypot(aimX, aimY) < .18 && pointerRef.current.active) { aimX = pointerRef.current.x - p.x; aimY = pointerRef.current.y - p.y; }
        if (Math.hypot(aimX, aimY) < .18) { const target = nearestEnemy(g, p.x, p.y); if (target) { aimX = target.x - p.x; aimY = target.y - p.y; } }
        if (Math.hypot(aimX, aimY) > .1) p.angle = Math.atan2(aimY, aimX);

        if (p.shotTimer <= 0 && g.enemies.length) {
          p.shotTimer += 1 / p.fireRate;
          const count = p.multishot;
          for (let i = 0; i < count; i++) {
            const offset = (i - (count - 1) / 2) * p.spread;
            const a = p.angle + offset;
            const crit = Math.random() < p.crit;
            g.bullets.push({ x: p.x + Math.cos(a) * 17, y: p.y + Math.sin(a) * 17, vx: Math.cos(a) * p.bulletSpeed, vy: Math.sin(a) * p.bulletSpeed, r: crit ? 4.5 : 3.2, damage: p.damage * (crit ? 2 : 1), life: 1.4, pierce: p.pierce, enemy: false, color: crit ? "#fff16c" : "#22f5ff" });
          }
          if (g.kills % 3 === 0) beep("shot");
        }

        if (g.drones > 0 && g.droneTimer <= 0 && g.enemies.length) {
          g.droneTimer = .7 / Math.sqrt(g.drones);
          for (let i = 0; i < g.drones; i++) {
            const a0 = g.t * 1.7 + i / g.drones * TAU;
            const dx = p.x + Math.cos(a0) * 48, dy = p.y + Math.sin(a0) * 48;
            const target = nearestEnemy(g, dx, dy); if (!target) continue;
            const a = Math.atan2(target.y - dy, target.x - dx);
            g.bullets.push({ x: dx, y: dy, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, r: 3, damage: p.damage * .55, life: 1.2, pierce: 0, enemy: false, color: "#ffca5a" });
          }
        }

        if (g.spawnTimer <= 0) {
          const amount = 1 + Math.floor(g.t / 55);
          for (let i = 0; i < amount; i++) spawnEnemy(g);
          if (g.kills > 0 && g.kills % 34 < amount) spawnEnemy(g, "elite");
          g.spawnTimer = Math.max(.12, .62 - g.t * .0045);
        }
        if (g.t > 48 && !g.bossSpawned) { g.bossSpawned = true; spawnEnemy(g, "boss"); }

        for (const e of g.enemies) {
          const dx = p.x - e.x, dy = p.y - e.y; const d = Math.hypot(dx, dy) || 1;
          if (e.type === "spitter" && d < 255) { e.x += -dy / d * e.speed * dt; e.y += dx / d * e.speed * dt; }
          else { e.x += dx / d * e.speed * dt; e.y += dy / d * e.speed * dt; }
          e.shotTimer -= dt;
          if ((e.type === "spitter" || e.type === "boss") && e.shotTimer <= 0) {
            e.shotTimer = e.type === "boss" ? 1.1 : 2.15;
            const shots = e.type === "boss" ? 10 : 1;
            for (let i = 0; i < shots; i++) {
              const a = e.type === "boss" ? i / shots * TAU + g.t * .3 : Math.atan2(dy, dx);
              g.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * (e.type === "boss" ? 180 : 245), vy: Math.sin(a) * (e.type === "boss" ? 180 : 245), r: e.type === "boss" ? 5 : 4, damage: e.damage, life: 3.2, pierce: 0, enemy: true, color: "#ff2daa" });
            }
          }
          if (d < e.r + p.r && p.invuln <= 0) {
            if (p.shield > 0) p.shield -= 1; else p.hp -= e.damage;
            p.invuln = .65; g.shake = 8; burst(g, p.x, p.y, "#ff647c", 14, 190); beep("hurt");
          }
        }

        for (const b of g.bullets) {
          b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
          if (b.enemy) {
            if (p.invuln <= 0 && dist2(b.x, b.y, p.x, p.y) < (b.r + p.r) ** 2) {
              if (p.shield > 0) p.shield -= 1; else p.hp -= b.damage;
              p.invuln = .55; b.life = 0; g.shake = 7; burst(g, p.x, p.y, "#ff647c", 12, 170); beep("hurt");
            }
            continue;
          }
          for (const e of g.enemies) {
            if (e.hp <= 0 || dist2(b.x, b.y, e.x, e.y) > (b.r + e.r) ** 2) continue;
            e.hp -= b.damage; b.pierce -= 1; burst(g, b.x, b.y, b.color, 3, 70);
            if (b.damage > p.damage * 1.5) g.texts.push({ x: e.x, y: e.y - e.r, text: "CRIT", color: "#fff16c", life: .55 });
            if (b.pierce < 0) b.life = 0;
            break;
          }
        }

        const survivors: Enemy[] = [];
        for (const e of g.enemies) {
          if (e.hp > 0) { survivors.push(e); continue; }
          g.kills++; g.combo++; g.comboTimer = 2.15; g.maxCombo = Math.max(g.maxCombo, g.combo);
          const comboMult = 1 + Math.min(2.5, g.combo * .035);
          g.score += (e.type === "boss" ? 2000 : e.type === "elite" ? 400 : 45) * comboMult;
          g.rift = Math.min(100, g.rift + (e.type === "boss" ? 32 : e.type === "elite" ? 9 : .72));
          const xpValue = e.type === "boss" ? 35 : e.type === "elite" ? 14 : e.type === "tank" ? 7 : 4;
          g.pickups.push({ x: e.x, y: e.y, r: 5, type: "xp", value: xpValue, life: 16 });
          if (e.type === "elite" || e.type === "boss" || Math.random() < .018) g.pickups.push({ x: e.x + 8, y: e.y, r: 7, type: "core", value: e.type === "boss" ? 5 : 1, life: 18 });
          if (Math.random() < .025) g.pickups.push({ x: e.x, y: e.y + 8, r: 6, type: "heal", value: 12, life: 14 });
          if (Math.random() < .02) g.pickups.push({ x: e.x - 8, y: e.y, r: 7, type: "rift", value: 6, life: 14 });
          burst(g, e.x, e.y, e.color, e.type === "boss" ? 55 : 12, e.type === "boss" ? 310 : 170);
          if (e.type === "boss") { g.shake = 14; g.texts.push({ x: g.w / 2, y: 115, text: "RIFT GUARDIAN DESTROYED", color: "#22f5ff", life: 2 }); }
          beep("hit");
        }
        g.enemies = survivors;

        for (const item of g.pickups) {
          item.life -= dt;
          const dx = p.x - item.x, dy = p.y - item.y; const d = Math.hypot(dx, dy) || 1;
          if (d < p.magnet) { const pull = 170 + (p.magnet - d) * 5; item.x += dx / d * pull * dt; item.y += dy / d * pull * dt; }
          if (d < p.r + item.r + 5) {
            item.life = 0;
            if (item.type === "xp") g.xp += item.value;
            if (item.type === "core") { g.cores += item.value; g.texts.push({ x: item.x, y: item.y, text: `CORE +${item.value}`, color: "#ffca5a", life: .8 }); }
            if (item.type === "heal") p.hp = Math.min(p.maxHp, p.hp + item.value);
            if (item.type === "rift") g.rift = Math.min(100, g.rift + item.value);
          }
        }

        g.bullets = g.bullets.filter(b => b.life > 0 && b.x > -100 && b.x < g.w + 100 && b.y > -100 && b.y < g.h + 100);
        g.pickups = g.pickups.filter(pick => pick.life > 0);
        for (const part of g.particles) { part.x += part.vx * dt; part.y += part.vy * dt; part.vx *= .94; part.vy *= .94; part.life -= dt; }
        g.particles = g.particles.filter(part => part.life > 0);
        for (const text of g.texts) { text.y -= 28 * dt; text.life -= dt; }
        g.texts = g.texts.filter(text => text.life > 0);
        g.shake *= .88;
        if (p.shieldMax > 0 && p.shield < p.shieldMax && Math.floor(g.t) % 8 === 0 && Math.floor((g.t - dt) * 2) !== Math.floor(g.t * 2)) p.shield = Math.min(p.shieldMax, p.shield + 1);
        if (g.xp >= g.xpNext) { g.xp -= g.xpNext; g.level++; g.xpNext = Math.floor(g.xpNext * 1.28 + 8); presentUpgrade(g); }
        if (p.hp <= 0) finishRun(false);

        hudTickRef.current += dt;
        if (hudTickRef.current > .08) { hudTickRef.current = 0; syncHud(g); }
      }

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, g.w, g.h);
      const sx = running ? (Math.random() - .5) * g.shake : 0, sy = running ? (Math.random() - .5) * g.shake : 0;
      ctx.save(); ctx.translate(sx, sy);
      const bg = ctx.createRadialGradient(g.w / 2, g.h / 2, 20, g.w / 2, g.h / 2, Math.max(g.w, g.h) * .72);
      bg.addColorStop(0, "#0b1940"); bg.addColorStop(.5, "#050a1d"); bg.addColorStop(1, "#02040c"); ctx.fillStyle = bg; ctx.fillRect(-20, -20, g.w + 40, g.h + 40);
      ctx.strokeStyle = "rgba(34,245,255,.075)"; ctx.lineWidth = 1;
      const grid = 54; const ox = (g.t * 7) % grid, oy = (g.t * 4) % grid;
      for (let x = -grid + ox; x < g.w + grid; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, g.h); ctx.stroke(); }
      for (let y = -grid + oy; y < g.h + grid; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(g.w, y); ctx.stroke(); }
      ctx.strokeStyle = "rgba(255,45,170,.13)"; ctx.beginPath(); ctx.arc(g.w / 2, g.h / 2, 155 + Math.sin(g.t * 1.2) * 5, 0, TAU); ctx.stroke();
      ctx.strokeStyle = "rgba(122,92,255,.09)"; ctx.beginPath(); ctx.arc(g.w / 2, g.h / 2, 315 + Math.cos(g.t) * 8, 0, TAU); ctx.stroke();

      if (screenRef.current === "menu") {
        for (let i = 0; i < 22; i++) {
          const a = i / 22 * TAU + Math.sin(i * 4.1) * .15; const rr = Math.min(g.w, g.h) * (.34 + (i % 3) * .055);
          const x = g.w / 2 + Math.cos(a) * rr, y = g.h / 2 + Math.sin(a) * rr;
          ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI); ctx.shadowBlur = 14; ctx.shadowColor = "#ff2daa"; ctx.fillStyle = i % 4 ? "#2a1038" : "#18255b"; drawPolygon(ctx, i % 5 ? 6 : 4, i % 5 ? 11 : 18, Math.PI / 4); ctx.fill(); ctx.strokeStyle = i % 4 ? "#ff2daa" : "#22f5ff"; ctx.stroke(); ctx.restore();
        }
      }

      for (const pick of g.pickups) {
        const colors: Record<PickupType, string> = { xp: "#22f5ff", core: "#ffca5a", heal: "#39ffb6", rift: "#ff2daa" };
        ctx.save(); ctx.translate(pick.x, pick.y); ctx.rotate(g.t * 2); ctx.shadowBlur = 14; ctx.shadowColor = colors[pick.type]; ctx.fillStyle = colors[pick.type]; drawPolygon(ctx, pick.type === "core" ? 6 : 4, pick.r, Math.PI / 4); ctx.fill(); ctx.restore();
      }
      for (const b of g.bullets) {
        ctx.save(); ctx.strokeStyle = b.color; ctx.fillStyle = b.color; ctx.shadowBlur = 13; ctx.shadowColor = b.color; ctx.lineWidth = b.r * 1.3; ctx.beginPath(); ctx.moveTo(b.x - b.vx * .018, b.y - b.vy * .018); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.restore();
      }
      for (const e of g.enemies) {
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(g.t * (e.type === "runner" ? 3 : .7) + e.phase); ctx.shadowBlur = e.type === "boss" ? 28 : 15; ctx.shadowColor = e.color; ctx.fillStyle = e.type === "boss" ? "#290a28" : "#101329"; ctx.strokeStyle = e.color; ctx.lineWidth = e.type === "boss" ? 3 : 1.6;
        drawPolygon(ctx, e.type === "runner" ? 4 : e.type === "boss" ? 8 : 6, e.r, Math.PI / 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = e.color; drawPolygon(ctx, 4, e.r * .34, Math.PI / 4); ctx.fill(); ctx.restore();
        if (e.type === "elite" || e.type === "boss") { ctx.fillStyle = "rgba(4,6,16,.75)"; ctx.fillRect(e.x - e.r, e.y - e.r - 11, e.r * 2, 4); ctx.fillStyle = e.color; ctx.fillRect(e.x - e.r, e.y - e.r - 11, e.r * 2 * clamp(e.hp / e.maxHp, 0, 1), 4); }
      }
      for (const part of g.particles) { ctx.globalAlpha = clamp(part.life / part.max, 0, 1); ctx.fillStyle = part.color; ctx.fillRect(part.x, part.y, part.size, part.size); }
      ctx.globalAlpha = 1;
      const p = g.player;
      for (let i = 0; i < g.drones; i++) { const a = g.t * 1.7 + i / g.drones * TAU; const x = p.x + Math.cos(a) * 48, y = p.y + Math.sin(a) * 48; ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.shadowBlur = 12; ctx.shadowColor = "#ffca5a"; ctx.fillStyle = "#ffca5a"; drawPolygon(ctx, 4, 6, Math.PI / 4); ctx.fill(); ctx.restore(); }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle + Math.PI / 2); ctx.globalAlpha = p.invuln > 0 && Math.floor(g.t * 20) % 2 ? .35 : 1; ctx.shadowBlur = 24; ctx.shadowColor = "#22f5ff"; ctx.fillStyle = "#091a42"; ctx.strokeStyle = "#22f5ff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(13, 14); ctx.lineTo(0, 8); ctx.lineTo(-13, 14); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#ff2daa"; ctx.beginPath(); ctx.moveTo(-5, 10); ctx.lineTo(0, 22 + Math.random() * 8); ctx.lineTo(5, 10); ctx.closePath(); ctx.fill(); ctx.restore();
      if (p.shield > 0) { ctx.strokeStyle = "rgba(122,92,255,.9)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 23 + Math.sin(g.t * 4) * 2, 0, TAU); ctx.stroke(); }
      for (const text of g.texts) { ctx.globalAlpha = clamp(text.life * 2, 0, 1); ctx.fillStyle = text.color; ctx.font = "700 13px Rajdhani, sans-serif"; ctx.textAlign = "center"; ctx.fillText(text.text, text.x, text.y); }
      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); };
  }, [action, beep, changeScreen, finishRun, presentUpgrade, syncHud]);

  const canvasPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") return;
    const rect = e.currentTarget.getBoundingClientRect(); pointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, active: true };
  };

  const stickHandler = (type: "move" | "aim") => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect(); const x = e.clientX - (rect.left + rect.width / 2); const y = e.clientY - (rect.top + rect.height / 2); const len = Math.hypot(x, y); const max = rect.width * .34; const scale = len > max ? max / len : 1;
    const visual = { x: x * scale / max, y: y * scale / max };
    if (type === "move") { moveRef.current = visual; setMoveStick(visual); } else { aimRef.current = visual; setAimStick(visual); }
  };
  const releaseStick = (type: "move" | "aim") => () => {
    if (type === "move") { moveRef.current = { x: 0, y: 0 }; setMoveStick({ x: 0, y: 0 }); }
    else { aimRef.current = { x: 0, y: 0 }; setAimStick({ x: 0, y: 0 }); }
  };

  const hpPercent = clamp(hud.hp / hud.maxHp * 100, 0, 100);
  const xpPercent = clamp(hud.xp / hud.xpNext * 100, 0, 100);
  const riftReady = hud.rift >= 100;

  return (
    <main ref={shellRef} className="game-shell">
      <canvas ref={canvasRef} className="game-canvas" onPointerMove={canvasPointer} onPointerEnter={canvasPointer} aria-label="NEON RIFT game arena" />
      <div className="arena-vignette" />
      <div className="scanlines" />

      {screen !== "menu" && (
        <div className="hud" aria-live="polite">
          <div className="hud-top">
            <div className="brand-mini"><span>NEON RIFT</span><small>SURVIVOR PROTOCOL</small></div>
            <div className="hp-panel cut-panel">
              <div className="hud-label"><span>HULL</span><b>{Math.ceil(hud.hp)} / {hud.maxHp}</b></div>
              <div className="meter"><i style={{ width: `${hpPercent}%` }} /></div>
              {hud.shieldMax > 0 && <div className="shield-pips">{Array.from({ length: hud.shieldMax }, (_, i) => <i key={i} className={i < hud.shield ? "on" : ""} />)}</div>}
            </div>
            <div className="stat-chip cut-panel"><span>LV</span><b>{hud.level}</b></div>
            <div className="score-chip cut-panel"><span>SCORE</span><b>{hud.score.toLocaleString()}</b></div>
            <div className={`rift-gauge ${riftReady ? "ready" : ""}`} style={{ "--rift": `${hud.rift * 3.6}deg` } as React.CSSProperties}><div><span>RIFT</span><b>{Math.floor(hud.rift)}%</b></div></div>
          </div>
          <div className="xp-line"><i style={{ width: `${xpPercent}%` }} /></div>
          <div className={`combo ${hud.combo > 0 ? "visible" : ""}`}><span>COMBO</span><b>x{hud.combo}</b></div>
          <div className="run-stats cut-panel"><span>TIME <b>{formatTime(hud.time)}</b></span><span>KILLS <b>{hud.kills}</b></span><span>CORES <b>{hud.cores}</b></span></div>
          <div className="hud-actions">
            <button className="icon-button" onClick={() => { soundRef.current = !sound; setSound(!sound); }} aria-label={sound ? "音を消す" : "音を出す"}>{sound ? "SOUND" : "MUTED"}</button>
            <button className="icon-button" onClick={() => changeScreen(screen === "paused" ? "playing" : "paused")} aria-label="一時停止">{screen === "paused" ? "RESUME" : "PAUSE"}</button>
          </div>
          {screen === "playing" && <div className="abilities">
            <button onClick={() => action("dash")} disabled={hud.dashCd > 0}><b>SPACE</b><span>DASH</span><i style={{ transform: `scaleX(${clamp(1 - hud.dashCd / 2.4, 0, 1)})` }} /></button>
            <button onClick={() => action("nova")} disabled={hud.novaCd > 0}><b>Q</b><span>NOVA</span><i style={{ transform: `scaleX(${clamp(1 - hud.novaCd / 12, 0, 1)})` }} /></button>
          </div>}
          {riftReady && screen === "playing" && <button className="extract-button" onClick={() => finishRun(true)}><span>RIFT STABLE</span>EXTRACT NOW <b>››</b></button>}
        </div>
      )}

      {screen === "playing" && <div className="touch-controls">
        <div className="joystick move-stick" onPointerDown={stickHandler("move")} onPointerMove={stickHandler("move")} onPointerUp={releaseStick("move")} onPointerCancel={releaseStick("move")}><i style={{ transform: `translate(${moveStick.x * 32}px, ${moveStick.y * 32}px)` }} /><span>MOVE</span></div>
        <div className="touch-actions"><button onPointerDown={() => action("nova")}>NOVA</button><button onPointerDown={() => action("dash")}>DASH</button></div>
        <div className="joystick aim-stick" onPointerDown={stickHandler("aim")} onPointerMove={stickHandler("aim")} onPointerUp={releaseStick("aim")} onPointerCancel={releaseStick("aim")}><i style={{ transform: `translate(${aimStick.x * 32}px, ${aimStick.y * 32}px)` }} /><span>AIM</span></div>
      </div>}

      {screen === "menu" && <section className="menu-overlay">
        <div className="menu-copy">
          <p className="eyebrow"><i /> TRANSMISSION 07 // RIFT BREACH</p>
          <h1>NEON RIFT<span>SURVIVOR PROTOCOL</span></h1>
          <p className="lead">撃つ。強くなる。欲張る。脱出する。<br />Bullet Heaven × ローグライト × エクストラクション。</p>
          <div className="feature-tags"><span>AUTO FIRE</span><span>BUILD CRAFT</span><span>HIGH-RISK EXTRACT</span></div>
          <button className="deploy-button" onClick={startGame}><small>SOLO PROTOCOL</small><strong>DEPLOY</strong><b>››</b></button>
          <div className="control-hint"><span><b>WASD</b> MOVE</span><span><b>MOUSE</b> AIM</span><span><b>SPACE</b> DASH</span><span><b>Q</b> NOVA</span></div>
        </div>
        <aside className="meta-panel cut-panel">
          <div className="meta-head"><span>PERMANENT MODULES</span><b>{meta.cores} CORES</b></div>
          {([
            ["hull", "REACTIVE HULL", "開始HPを強化"], ["cannon", "RIFT CANNON", "開始ダメージを強化"], ["thrusters", "VECTOR DRIVE", "開始速度を強化"],
          ] as [keyof Meta["modules"], string, string][]).map(([id, title, desc]) => {
            const level = meta.modules[id]; const cost = 6 + level * 5;
            return <button key={id} className="module-row" onClick={() => buyModule(id)} disabled={level >= 5 || meta.cores < cost}><i className={id} /><span><b>{title}</b><small>{desc}</small></span><em>LV {level}/5</em><strong>{level >= 5 ? "MAX" : `${cost} C`}</strong></button>;
          })}
          <div className="career-stats"><span>BEST <b>{meta.best.toLocaleString()}</b></span><span>RUNS <b>{meta.runs}</b></span></div>
        </aside>
      </section>}

      {screen === "upgrade" && <section className="modal-layer upgrade-layer">
        <div className="upgrade-title"><p>COMBAT SYNC // LEVEL {hud.level}</p><h2>SELECT AN UPGRADE</h2><span>ビルドは毎回変化する。今の戦況に最適な1枚を選べ。</span></div>
        <div className="upgrade-grid">{choices.map((up, index) => <button key={up.id} className="upgrade-card cut-panel" style={{ "--accent": up.color } as React.CSSProperties} onClick={() => selectUpgrade(up)}><small>0{index + 1}</small><i>{up.icon}</i><h3>{up.title}</h3><p>{up.desc}</p><span>INSTALL ›</span></button>)}</div>
      </section>}

      {screen === "paused" && <section className="modal-layer compact-modal"><div className="result-card cut-panel"><p>PROTOCOL SUSPENDED</p><h2>PAUSED</h2><button className="deploy-button small" onClick={() => changeScreen("playing")}><strong>RESUME</strong><b>›</b></button><button className="text-button" onClick={() => changeScreen("menu")}>ABORT RUN</button></div></section>}

      {(screen === "gameover" || screen === "extracted") && <section className="modal-layer compact-modal"><div className={`result-card cut-panel ${screen === "extracted" ? "success" : "failed"}`}><p>{screen === "extracted" ? "RIFT PAYLOAD SECURED" : "SIGNAL LOST"}</p><h2>{screen === "extracted" ? "EXTRACTION COMPLETE" : "PROTOCOL FAILED"}</h2><div className="result-stats"><span>SCORE <b>{hud.score.toLocaleString()}</b></span><span>KILLS <b>{hud.kills}</b></span><span>CORES FOUND <b>{hud.cores}</b></span><span>TIME <b>{formatTime(hud.time)}</b></span></div><button className="deploy-button small" onClick={startGame}><strong>RUN AGAIN</strong><b>››</b></button><button className="text-button" onClick={() => changeScreen("menu")}>RETURN TO HANGAR</button></div></section>}
    </main>
  );
}
