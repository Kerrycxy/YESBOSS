"use strict";

/* ===== Canvas & DOM ===== */
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const coordDisplay = document.getElementById("coordDisplay");
const statusDisplay = document.getElementById("statusDisplay");
const backButton = document.getElementById("backButton");

/* ===== Canvas Size ===== */
const CANVAS_W = 1024;
const CANVAS_H = 580;
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

/* ===== Background Image ===== */
const bgImage = new Image();
let bgReady = false;
bgImage.onload = () => { bgReady = true; };
bgImage.src = "./assets/office2-bg.png";

/* ===== Player Sprite Sheet =====
 * 480x768 => 3 cols x 4 rows => frame 160x192
 * Row 0: face down
 * Row 1: face left
 * Row 2: face right
 * Row 3: face up
 * Cols: 0=left step, 1=stand, 2=right step
 */
const spriteSheet = new Image();
let spriteReady = false;
spriteSheet.onload = () => { spriteReady = true; };
spriteSheet.src = "./assets/player-walk.png";

const FRAME_W = 160;
const FRAME_H = 192;
const DIR_ROW = { down: 0, up: 1, left: 2, right: 3 };

/* ===== AABB Hitbox System =====
 * Each obstacle is defined as a pixel-coordinate rectangle.
 * These are calibrated to match the furniture in the background image
 * at canvas resolution 1024x580.
 *
 * Image is 2168x1228, scaled to 1024x580:
 *   scaleX = 1024/2168 ≈ 0.4724
 *   scaleY = 580/1228 ≈ 0.4723
 */
const SX = CANVAS_W / 2168;
const SY = CANVAS_H / 1228;

function s(x, y, w, h) {
  return { x: x * SX, y: y * SY, width: w * SX, height: h * SY };
}

const hitboxes = [
  // === Walls ===
  { id: "wall-top", ...s(0, 0, 2168, 200) },
  { id: "wall-bottom-left", ...s(0, 1150, 880, 78) },
  { id: "wall-bottom-right", ...s(1280, 1150, 888, 78) },
  { id: "wall-left", ...s(0, 0, 100, 1228) },
  { id: "wall-right", ...s(2068, 0, 100, 1228) },

  // === Top-left L-shaped sofa ===
  { id: "sofa-L-back", ...s(120, 200, 380, 100) },
  { id: "sofa-L-side", ...s(120, 200, 100, 280) },

  // === Top-right bookshelf / cabinet ===
  { id: "cabinet-top-right", ...s(1780, 200, 280, 200) },

  // === Left desk group upper (2 desks facing each other with chairs) ===
  { id: "desk-LU", ...s(260, 440, 420, 200) },

  // === Left desk group lower ===
  { id: "desk-LL", ...s(260, 740, 420, 200) },

  // === Right desk group upper ===
  { id: "desk-RU", ...s(1460, 440, 420, 200) },

  // === Right desk group lower ===
  { id: "desk-RL", ...s(1460, 740, 420, 200) },

  // === Center meeting table (large dark wood table) ===
  { id: "center-table", ...s(780, 460, 560, 340) },

  // === Bottom-left small table / coffee table ===
  { id: "table-bottom-left", ...s(300, 1000, 200, 120) },

  // === Bottom-right small table ===
  { id: "table-bottom-right", ...s(1600, 1000, 200, 120) },

  // === Plants ===
  { id: "plant-TL", ...s(110, 480, 80, 80) },
  { id: "plant-TR", ...s(1960, 400, 80, 80) },
  { id: "plant-BL", ...s(110, 1020, 80, 80) },
  { id: "plant-BR", ...s(1960, 1020, 80, 80) },
  { id: "plant-center-left", ...s(700, 380, 60, 60) },
  { id: "plant-center-right", ...s(1380, 380, 60, 60) },
];

/* ===== AABB Collision Detection ===== */
function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function checkCollision(playerRect) {
  for (let i = 0; i < hitboxes.length; i++) {
    if (rectsOverlap(playerRect, hitboxes[i])) {
      return true;
    }
  }
  return false;
}

/* ===== Hitbox Adjustment Helper ===== */
function updateHitbox(id, offsetX, offsetY, newWidth, newHeight) {
  const box = hitboxes.find((h) => h.id === id);
  if (!box) { console.warn("Hitbox not found:", id); return; }
  if (offsetX !== undefined) box.x += offsetX;
  if (offsetY !== undefined) box.y += offsetY;
  if (newWidth !== undefined) box.width = newWidth;
  if (newHeight !== undefined) box.height = newHeight;
  console.log(`Updated ${id}:`, box);
}

/* ===== Debug: Draw all hitboxes ===== */
let showHitboxes = true;

function drawHitboxes() {
  if (!showHitboxes) return;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 50, 50, 0.8)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.font = "10px monospace";
  ctx.fillStyle = "rgba(255, 50, 50, 0.7)";

  hitboxes.forEach((box) => {
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.fillText(box.id, box.x + 2, box.y + 11);
  });

  ctx.restore();
}

/* ===== Character Class (pixel-based movement with AABB) ===== */
// Match office1 character size: renderWidth=142, renderHeight=170 on 1024x576 canvas
// Office2 canvas is 1024x580, nearly identical — use same size
const PLAYER_W = 142;
const PLAYER_H = 170;

// The collision box is just the lower body (feet area)
const PLAYER_HITBOX_W = 28;
const PLAYER_HITBOX_H = 16;

class Character {
  constructor(px, py) {
    // px, py = pixel position of feet (bottom-center)
    this.px = px;
    this.py = py;
    this.speed = 120; // pixels per second
    this.direction = "down";
    this.moving = false;
    this.animTime = 0;
    this.frameIndex = 1;
    this.vx = 0;
    this.vy = 0;
  }

  getHitbox(px, py) {
    // Hitbox centered at feet position
    return {
      x: (px || this.px) - PLAYER_HITBOX_W / 2,
      y: (py || this.py) - PLAYER_HITBOX_H,
      width: PLAYER_HITBOX_W,
      height: PLAYER_HITBOX_H,
    };
  }

  update(dt) {
    if (this.vx === 0 && this.vy === 0) {
      this.moving = false;
      this.frameIndex = 1;
      this.animTime = 0;
      return;
    }

    this.moving = true;

    // Determine direction
    if (Math.abs(this.vy) >= Math.abs(this.vx)) {
      this.direction = this.vy > 0 ? "down" : "up";
    } else {
      this.direction = this.vx > 0 ? "right" : "left";
    }

    // Animate
    this.animTime += dt * 1000;
    const cycle = [0, 1, 2, 1];
    this.frameIndex = cycle[Math.floor(this.animTime / 140) % cycle.length];

    // Try moving
    const nx = this.px + this.vx * this.speed * dt;
    const ny = this.py + this.vy * this.speed * dt;

    // Try X and Y independently for sliding along walls
    const testX = this.getHitbox(nx, this.py);
    const testY = this.getHitbox(this.px, ny);
    const testBoth = this.getHitbox(nx, ny);

    if (!checkCollision(testBoth)) {
      this.px = nx;
      this.py = ny;
    } else if (!checkCollision(testX)) {
      this.px = nx;
    } else if (!checkCollision(testY)) {
      this.py = ny;
    }
    // else: blocked in both directions, don't move

    // Keep in bounds
    this.px = Math.max(PLAYER_HITBOX_W / 2, Math.min(CANVAS_W - PLAYER_HITBOX_W / 2, this.px));
    this.py = Math.max(PLAYER_HITBOX_H, Math.min(CANVAS_H - 2, this.py));

    coordDisplay.textContent = `像素：(${Math.round(this.px)}, ${Math.round(this.py)})`;
  }

  draw(ctx) {
    if (!spriteReady) return;

    const row = DIR_ROW[this.direction];
    const col = this.frameIndex;

    // Draw character: feet anchor at (px, py), with footOffsetY=12 matching scene1
    const drawX = this.px - PLAYER_W / 2;
    const drawY = this.py - PLAYER_H + 12;

    ctx.drawImage(
      spriteSheet,
      col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H,
      drawX, drawY, PLAYER_W, PLAYER_H
    );

    // Debug: draw player hitbox
    if (showHitboxes) {
      const hb = this.getHitbox();
      ctx.strokeStyle = "rgba(0, 255, 100, 0.9)";
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(hb.x, hb.y, hb.width, hb.height);
    }
  }
}

/* ===== Player Instance ===== */
// Start near center of the room
const player = new Character(CANVAS_W / 2, CANVAS_H * 0.7);

/* ===== Keyboard Input (smooth analog-style) ===== */
const keys = {};

window.addEventListener("keydown", (e) => {
  keys[e.key] = true;
  if (e.key === "h" || e.key === "H") showHitboxes = !showHitboxes;
});
window.addEventListener("keyup", (e) => { keys[e.key] = false; });

function handleInput() {
  let vx = 0;
  let vy = 0;

  if (keys["ArrowUp"] || keys["w"] || keys["W"]) vy -= 1;
  if (keys["ArrowDown"] || keys["s"] || keys["S"]) vy += 1;
  if (keys["ArrowLeft"] || keys["a"] || keys["A"]) vx -= 1;
  if (keys["ArrowRight"] || keys["d"] || keys["D"]) vx += 1;

  // Normalize diagonal
  if (vx !== 0 && vy !== 0) {
    const len = Math.hypot(vx, vy);
    vx /= len;
    vy /= len;
  }

  player.vx = vx;
  player.vy = vy;
}

/* ===== Exit Zone (door at bottom center) ===== */
const EXIT_ZONE = { x: 880 * SX, y: 1150 * SY, width: 400 * SX, height: 78 * SY };

function checkExit() {
  const hb = player.getHitbox();
  if (rectsOverlap(hb, EXIT_ZONE)) {
    statusDisplay.textContent = "状态：返回茶水间...";
    setTimeout(() => { window.location.href = "./index.html"; }, 300);
  }
}

function drawExitZone() {
  ctx.fillStyle = "rgba(251, 191, 36, 0.25)";
  ctx.fillRect(EXIT_ZONE.x, EXIT_ZONE.y, EXIT_ZONE.width, EXIT_ZONE.height);
  ctx.fillStyle = "#fbbf24";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("EXIT →", EXIT_ZONE.x + EXIT_ZONE.width / 2, EXIT_ZONE.y + EXIT_ZONE.height / 2 + 4);
  ctx.textAlign = "left";
}

/* ===== Main Render ===== */
function render() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  if (bgReady) {
    ctx.drawImage(bgImage, 0, 0, CANVAS_W, CANVAS_H);
  } else {
    ctx.fillStyle = "#2a2a3e";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  drawExitZone();
  drawHitboxes();
  player.draw(ctx);
}

/* ===== Game Loop ===== */
let lastTime = 0;

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  handleInput();
  player.update(dt);
  checkExit();
  render();

  requestAnimationFrame(gameLoop);
}

/* ===== Button & Events ===== */
backButton.addEventListener("click", () => {
  window.location.href = "./index.html";
});

// Click to log position (useful for calibrating hitboxes)
canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (CANVAS_W / rect.width);
  const cy = (e.clientY - rect.top) * (CANVAS_H / rect.height);
  console.log(`Canvas click: (${Math.round(cx)}, ${Math.round(cy)})`);
  // Check which hitbox contains this point
  hitboxes.forEach((box) => {
    if (cx >= box.x && cx <= box.x + box.width && cy >= box.y && cy <= box.y + box.height) {
      console.log(`  -> inside: ${box.id}`);
    }
  });
});

/* ===== Expose debug helpers to console ===== */
window.hitboxes = hitboxes;
window.updateHitbox = updateHitbox;
window.player = player;

/* ===== Start ===== */
statusDisplay.textContent = "状态：待命 (H=切换碰撞框)";
requestAnimationFrame(gameLoop);
