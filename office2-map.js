"use strict";

/* ===== Canvas & DOM ===== */
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const coordDisplay = document.getElementById("coordDisplay");
const statusDisplay = document.getElementById("statusDisplay");
const backButton = document.getElementById("backButton");

/* ===== Grid Config (top-down orthogonal) ===== */
const COLS = 22;
const ROWS = 13;
const CANVAS_W = 1024;
const CANVAS_H = 640;
const TILE_W = CANVAS_W / COLS;   // ~46.5
const TILE_H = CANVAS_H / ROWS;   // ~49.2

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

const SPRITE_COLS = 3;
const SPRITE_ROWS = 4;
const FRAME_W = 160;
const FRAME_H = 192;

const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };

/* ===== Collision Map (0=walkable, 1=obstacle) =====
 * 22 cols x 13 rows — mapped to background image furniture:
 *
 * Image analysis:
 * - Row 0: top wall
 * - Col 0, Col 21: side walls
 * - Top-left (cols 1-3, rows 1-2): bookshelf/plants
 * - Top-right (cols 18-20, rows 1-2): shelves
 * - Left desk group 1 (cols 2-5, rows 3-4): 2 workstations
 * - Left desk group 2 (cols 2-5, rows 7-8): 2 workstations
 * - Right desk group 1 (cols 14-17, rows 3-4): 2 workstations
 * - Right desk group 2 (cols 14-17, rows 7-8): 2 workstations
 * - Center meeting table (cols 8-13, rows 4-7): large table
 * - Bottom sofa area (cols 7-14, rows 10-11): lounge
 * - Plants in corners
 * - Row 12: bottom wall with door at cols 10-11
 */
const collisionMap = [
  //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0 top wall
  [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1], // 1 top shelves
  [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1], // 2
  [1, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1], // 3 desk row top
  [1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1], // 4 desk + center table
  [1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1], // 5 center table
  [1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1], // 6 center table
  [1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1], // 7 desk + center table
  [1, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1], // 8 desk row bottom
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 9 open
  [1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1], // 10 sofa
  [1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1], // 11 sofa
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 12 bottom wall, door at 10-11
];

/* ===== Coordinate Conversion (top-down) ===== */
function gridToScreen(gx, gy) {
  return {
    x: gx * TILE_W + TILE_W / 2,
    y: gy * TILE_H + TILE_H / 2,
  };
}

function screenToGrid(sx, sy) {
  return {
    x: Math.floor(sx / TILE_W),
    y: Math.floor(sy / TILE_H),
  };
}

function canMove(x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
  return collisionMap[y][x] === 0;
}

/* ===== Character Class with Sprite Animation ===== */
class Character {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
    this.renderX = x;
    this.renderY = y;
    this.moving = false;
    this.speed = 5;
    this.direction = "down";
    this.animTime = 0;
    this.frameIndex = 1; // stand frame
  }

  moveTo(nx, ny) {
    if (this.moving) return;
    if (!canMove(nx, ny)) {
      statusDisplay.textContent = "状态：路径被阻挡";
      return;
    }
    this.targetX = nx;
    this.targetY = ny;
    this.moving = true;
    statusDisplay.textContent = "状态：移动中";

    const dx = nx - this.x;
    const dy = ny - this.y;
    if (dy < 0) this.direction = "up";
    else if (dy > 0) this.direction = "down";
    else if (dx < 0) this.direction = "left";
    else if (dx > 0) this.direction = "right";
  }

  update(dt) {
    if (!this.moving) {
      this.frameIndex = 1; // stand
      return;
    }

    // Animate walking frames
    this.animTime += dt * 1000;
    const frameDuration = 150; // ms per frame
    // Cycle: 0, 1, 2, 1, 0, 1, 2, 1...
    const cycle = [0, 1, 2, 1];
    const idx = Math.floor(this.animTime / frameDuration) % cycle.length;
    this.frameIndex = cycle[idx];

    // Smooth movement
    const step = this.speed * dt;
    const dx = this.targetX - this.renderX;
    const dy = this.targetY - this.renderY;
    const dist = Math.hypot(dx, dy);

    if (dist <= step) {
      this.renderX = this.targetX;
      this.renderY = this.targetY;
      this.x = this.targetX;
      this.y = this.targetY;
      this.moving = false;
      this.animTime = 0;
      this.frameIndex = 1;
      statusDisplay.textContent = "状态：待命";
    } else {
      this.renderX += (dx / dist) * step;
      this.renderY += (dy / dist) * step;
    }

    coordDisplay.textContent = `坐标：(${this.x}, ${this.y})`;
  }

  draw(ctx) {
    if (!spriteReady) return;

    const pos = gridToScreen(this.renderX, this.renderY);
    const row = DIR_ROW[this.direction];
    const col = this.frameIndex;

    // Character display size — fit within tile, feet touching ground
    const displayH = TILE_H * 1.6;
    const displayW = displayH * (FRAME_W / FRAME_H);

    // Position: feet at bottom of tile (center-bottom anchor)
    const drawX = pos.x - displayW / 2;
    const drawY = pos.y + TILE_H / 2 - displayH; // feet at tile bottom edge

    ctx.drawImage(
      spriteSheet,
      col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H,
      drawX, drawY, displayW, displayH
    );
  }
}

/* ===== Grid Overlay ===== */
let showGrid = true;

function drawGrid() {
  if (!showGrid) return;

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const sx = x * TILE_W;
      const sy = y * TILE_H;

      if (collisionMap[y][x] === 1) {
        ctx.fillStyle = "rgba(239, 68, 68, 0.18)";
        ctx.fillRect(sx, sy, TILE_W, TILE_H);
        ctx.strokeStyle = "rgba(239, 68, 68, 0.6)";
      } else {
        ctx.strokeStyle = "rgba(34, 197, 94, 0.3)";
      }

      ctx.lineWidth = 0.8;
      ctx.strokeRect(sx, sy, TILE_W, TILE_H);
    }
  }
}

/* ===== Exit Zone (door at bottom) ===== */
const EXIT_TILES = [{ x: 10, y: 12 }, { x: 11, y: 12 }];

function drawExitZone() {
  EXIT_TILES.forEach((t) => {
    const sx = t.x * TILE_W;
    const sy = t.y * TILE_H;
    ctx.fillStyle = "rgba(251, 191, 36, 0.35)";
    ctx.fillRect(sx, sy, TILE_W, TILE_H);
  });

  const mid = gridToScreen(10.5, 12);
  ctx.fillStyle = "#fbbf24";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("EXIT", mid.x, mid.y + 4);
}

/* ===== Player Instance ===== */
const player = new Character(10, 9);

/* ===== Keyboard Input with Smooth Repeat ===== */
const keys = {};
let lastMoveTime = 0;
const MOVE_COOLDOWN = 130;

window.addEventListener("keydown", (e) => {
  keys[e.key] = true;
  // Toggle grid
  if (e.key === "g" || e.key === "G") {
    showGrid = !showGrid;
  }
});
window.addEventListener("keyup", (e) => { keys[e.key] = false; });

function handleInput() {
  if (player.moving) return;
  const now = performance.now();
  if (now - lastMoveTime < MOVE_COOLDOWN) return;

  let nx = player.x;
  let ny = player.y;

  if (keys["ArrowUp"] || keys["w"] || keys["W"]) ny -= 1;
  else if (keys["ArrowDown"] || keys["s"] || keys["S"]) ny += 1;
  else if (keys["ArrowLeft"] || keys["a"] || keys["A"]) nx -= 1;
  else if (keys["ArrowRight"] || keys["d"] || keys["D"]) nx += 1;

  if (nx !== player.x || ny !== player.y) {
    player.moveTo(nx, ny);
    lastMoveTime = now;
  }
}

/* ===== Check Exit ===== */
function checkExit() {
  if (player.moving) return;
  const atExit = EXIT_TILES.some((t) => t.x === player.x && t.y === player.y);
  if (atExit) {
    statusDisplay.textContent = "状态：返回办公室...";
    setTimeout(() => { window.location.href = "./office.html"; }, 400);
  }
}

/* ===== Main Render ===== */
function render() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Background image
  if (bgReady) {
    ctx.drawImage(bgImage, 0, 0, CANVAS_W, CANVAS_H);
  } else {
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // Grid overlay
  drawGrid();
  drawExitZone();

  // Player
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

/* ===== Click to inspect grid cells ===== */
canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = (e.clientX - rect.left) * (CANVAS_W / rect.width);
  const sy = (e.clientY - rect.top) * (CANVAS_H / rect.height);
  const cell = screenToGrid(sx, sy);

  if (cell.x >= 0 && cell.x < COLS && cell.y >= 0 && cell.y < ROWS) {
    console.log(`Grid (${cell.x}, ${cell.y}) => ${collisionMap[cell.y][cell.x] === 1 ? "obstacle" : "walkable"}`);
  }
});

/* ===== Button ===== */
backButton.addEventListener("click", () => {
  window.location.href = "./office.html";
});

/* ===== Start ===== */
coordDisplay.textContent = `坐标：(${player.x}, ${player.y})`;
requestAnimationFrame(gameLoop);
