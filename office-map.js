"use strict";

const canvas = document.getElementById("officeCanvas");
const ctx = canvas.getContext("2d");
const toggleGridButton = document.getElementById("toggleGridButton");
const moveDoorButton = document.getElementById("moveDoorButton");
const clearPathButton = document.getElementById("clearPathButton");
const exitOfficeButton = document.getElementById("exitOfficeButton");
const officeStatus = document.getElementById("officeStatus");
const officePosition = document.getElementById("officePosition");
const officeTarget = document.getElementById("officeTarget");

const TILE_EMPTY = 0;
const TILE_OBSTACLE = 1;
const MOVE_DEBOUNCE_MS = 135;
const POSITION_EPSILON = 0.001;

const grid = {
  width: 20,
  height: 14,
  originX: 512,
  originY: 44,
  tileWidth: 64,
  tileHeight: 32,
};

const officeDoor = { x: 0, y: 10 };
const defaultTarget = { x: 13, y: 9 };

// 0 = empty ground, 1 = obstacle. This is the pure logic layer.
const collisionMap = createCollisionMap(grid.width, grid.height, [
  { name: "coffee bar", fromX: 2, fromY: 0, toX: 7, toY: 1 },
  { name: "boss desk", fromX: 9, fromY: 2, toX: 13, toY: 4 },
  { name: "left desk upper", fromX: 4, fromY: 6, toX: 8, toY: 8 },
  { name: "left desk lower", fromX: 4, fromY: 10, toX: 8, toY: 12 },
  { name: "right desk upper", fromX: 13, fromY: 6, toX: 17, toY: 8 },
  { name: "right desk lower", fromX: 13, fromY: 10, toX: 17, toY: 12 },
  { name: "file cabinet", fromX: 17, fromY: 0, toX: 19, toY: 2 },
  { name: "left door wall", cells: [[0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8]] },
  { name: "water cooler", cells: [[0, 11], [0, 12], [1, 12]] },
  { name: "plants", cells: [[0, 1], [1, 1], [1, 11], [18, 2], [19, 1]] },
]);

let showGrid = true;
let lastFrameTime = 0;
let lastMoveAt = 0;
let activePath = [];
let targetCell = { ...defaultTarget };

const backgroundImage = new Image();
let isBackgroundReady = false;
backgroundImage.addEventListener("load", () => {
  isBackgroundReady = true;
});
backgroundImage.src = "./assets/office-map-background.png";

const characterSprite = new Image();
let isCharacterSpriteReady = false;
characterSprite.addEventListener("load", () => {
  isCharacterSpriteReady = true;
});
characterSprite.src = "./assets/character-spritesheet-normalized.png";

class Character {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.renderX = x;
    this.renderY = y;
    this.path = [];
    this.direction = "down";
    this.animationTime = 0;
    this.speed = 4.4;
  }

  canAcceptInput() {
    return !this.isMoving() && this.path.length === 0;
  }

  isMoving() {
    return (
      Math.abs(this.x - this.renderX) > POSITION_EPSILON ||
      Math.abs(this.y - this.renderY) > POSITION_EPSILON ||
      this.path.length > 0
    );
  }

  moveBy(dx, dy) {
    const nextX = this.x + dx;
    const nextY = this.y + dy;
    this.direction = getDirectionFromDelta(dx, dy);

    if (!canMove(nextX, nextY)) {
      setStatus("状态：前方是障碍物");
      return false;
    }

    this.x = nextX;
    this.y = nextY;
    activePath = [];
    targetCell = { x: nextX, y: nextY };
    setTarget(nextX, nextY);
    console.log(`Character grid position: (${this.x}, ${this.y})`);
    return true;
  }

  followPath(path) {
    this.path = [...path];
    activePath = [...path];
  }

  update(deltaTime) {
    if (this.path.length > 0 && !this.isInterpolating()) {
      const next = this.path.shift();
      this.direction = getDirectionFromDelta(next.x - this.x, next.y - this.y);
      this.x = next.x;
      this.y = next.y;
      activePath = [...this.path];
      console.log(`Character grid position: (${this.x}, ${this.y})`);
    }

    const maxStep = this.speed * (deltaTime / 1000);
    this.renderX = approach(this.renderX, this.x, maxStep);
    this.renderY = approach(this.renderY, this.y, maxStep);

    if (this.isInterpolating()) {
      this.animationTime += deltaTime;
    } else {
      this.animationTime = 0;
    }

    if (!this.isMoving() && this.x === officeDoor.x && this.y === officeDoor.y) {
      window.location.href = "./index.html";
    }
  }

  isInterpolating() {
    return (
      Math.abs(this.x - this.renderX) > POSITION_EPSILON ||
      Math.abs(this.y - this.renderY) > POSITION_EPSILON
    );
  }

  draw(renderContext) {
    const screen = gridToIsometric(this.renderX, this.renderY);
    const width = 82;
    const height = 98;
    const x = screen.x - width * 0.5;
    const y = screen.y - height + 10;

    if (!isCharacterSpriteReady) {
      renderContext.fillStyle = "#111827";
      renderContext.fillRect(x + 24, y + 24, 34, 60);
      renderContext.fillStyle = "#f2b07a";
      renderContext.fillRect(x + 28, y + 8, 26, 24);
      return;
    }

    const frameWidth = characterSprite.width / 3;
    const frameHeight = characterSprite.height / 4;
    const row = { down: 0, up: 1, left: 2, right: 3 }[this.direction] ?? 0;
    const frame = this.isMoving() ? Math.floor(this.animationTime / 130) % 3 : 1;

    renderContext.save();
    renderContext.imageSmoothingEnabled = false;
    renderContext.drawImage(
      characterSprite,
      frame * frameWidth,
      row * frameHeight,
      frameWidth,
      frameHeight,
      x,
      y,
      width,
      height,
    );
    renderContext.restore();
  }
}

const player = new Character(2, 10);

function createCollisionMap(width, height, blockers) {
  const map = Array.from({ length: height }, () => Array(width).fill(TILE_EMPTY));

  blockers.forEach((blocker) => {
    if (blocker.cells) {
      blocker.cells.forEach(([x, y]) => markCell(map, x, y));
      return;
    }

    for (let y = blocker.fromY; y <= blocker.toY; y += 1) {
      for (let x = blocker.fromX; x <= blocker.toX; x += 1) {
        markCell(map, x, y);
      }
    }
  });

  return map;
}

function markCell(map, x, y) {
  if (x >= 0 && x < grid.width && y >= 0 && y < grid.height) {
    map[y][x] = TILE_OBSTACLE;
  }
}

function canMove(x, y) {
  return x >= 0 && x < grid.width && y >= 0 && y < grid.height && collisionMap[y][x] === TILE_EMPTY;
}

function gridToIsometric(gridX, gridY) {
  return {
    x: grid.originX + (gridX - gridY) * (grid.tileWidth / 2),
    y: grid.originY + (gridX + gridY) * (grid.tileHeight / 2),
  };
}

function screenToGrid(screenX, screenY) {
  let bestCell = null;
  let bestDistance = Infinity;

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const center = gridToIsometric(x, y);
      const dx = center.x - screenX;
      const dy = center.y - screenY;
      const distance = dx * dx + dy * dy;

      if (distance < bestDistance) {
        bestDistance = distance;
        bestCell = { x, y };
      }
    }
  }

  return bestCell;
}

function findPath(start, goal) {
  if (!canMove(goal.x, goal.y)) {
    return [];
  }

  const open = [{ ...start, g: 0, f: heuristic(start, goal), previous: null }];
  const visited = new Map();

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
    const key = cellKey(current.x, current.y);

    if (visited.has(key)) {
      continue;
    }

    visited.set(key, current);

    if (current.x === goal.x && current.y === goal.y) {
      return reconstructPath(current);
    }

    getNeighbors(current).forEach((neighbor) => {
      if (visited.has(cellKey(neighbor.x, neighbor.y))) {
        return;
      }

      const g = current.g + 1;
      open.push({
        ...neighbor,
        g,
        f: g + heuristic(neighbor, goal),
        previous: current,
      });
    });
  }

  return [];
}

function getNeighbors(cell) {
  return [
    { x: cell.x + 1, y: cell.y },
    { x: cell.x - 1, y: cell.y },
    { x: cell.x, y: cell.y + 1 },
    { x: cell.x, y: cell.y - 1 },
  ].filter((neighbor) => canMove(neighbor.x, neighbor.y));
}

function reconstructPath(node) {
  const path = [];
  let current = node;

  while (current.previous) {
    path.unshift({ x: current.x, y: current.y });
    current = current.previous;
  }

  return path;
}

function heuristic(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function cellKey(x, y) {
  return `${x},${y}`;
}

function moveTo(goal) {
  targetCell = { ...goal };
  setTarget(goal.x, goal.y);

  if (!canMove(goal.x, goal.y)) {
    player.path = [];
    activePath = [];
    setStatus("状态：目标格是障碍物");
    return;
  }

  if (player.x === goal.x && player.y === goal.y) {
    player.path = [];
    activePath = [];
    setStatus("状态：已在目标坐标");
    return;
  }

  const path = findPath({ x: player.x, y: player.y }, goal);

  if (path.length === 0) {
    setStatus("状态：没有可绕行路径");
    return;
  }

  player.followPath(path);
  setStatus("状态：自动绕开障碍物移动中");
}

function drawScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (isBackgroundReady) {
    ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawGridOverlay() {
  if (!showGrid && activePath.length === 0) {
    drawTargetMarker(officeDoor, "#f59e0b", "门口");
    return;
  }

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const isBlocked = collisionMap[y][x] === TILE_OBSTACLE;
      const inPath = activePath.some((cell) => cell.x === x && cell.y === y);

      if (!showGrid && !inPath) {
        continue;
      }

      drawIsoTile(x, y, isBlocked, inPath);
    }
  }

  drawTargetMarker(officeDoor, "#f59e0b", "门口");
  drawTargetMarker(targetCell, "#2563eb", "目标");
}

function drawIsoTile(x, y, isBlocked, inPath) {
  const center = gridToIsometric(x, y);
  const points = getTilePoints(center);

  ctx.save();
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.closePath();
  ctx.fillStyle = inPath
    ? "rgba(37, 99, 235, 0.25)"
    : isBlocked
      ? "rgba(239, 68, 68, 0.2)"
      : "rgba(34, 197, 94, 0.08)";
  ctx.strokeStyle = isBlocked ? "rgba(185, 28, 28, 0.65)" : "rgba(21, 128, 61, 0.28)";
  ctx.lineWidth = inPath ? 2 : 1;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawTargetMarker(cell, color, label) {
  const center = gridToIsometric(cell.x, cell.y);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = "rgba(255, 255, 255, 0.84)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(center.x, center.y + 5, grid.tileWidth * 0.32, grid.tileHeight * 0.28, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  const width = ctx.measureText(label).width + 12;
  ctx.fillRect(center.x - width / 2, center.y - 31, width, 18);
  ctx.strokeRect(center.x - width / 2, center.y - 31, width, 18);
  ctx.fillStyle = color;
  ctx.fillText(label, center.x, center.y - 17);
  ctx.restore();
}

function getTilePoints(center) {
  return [
    { x: center.x, y: center.y - grid.tileHeight / 2 },
    { x: center.x + grid.tileWidth / 2, y: center.y },
    { x: center.x, y: center.y + grid.tileHeight / 2 },
    { x: center.x - grid.tileWidth / 2, y: center.y },
  ];
}

function update(deltaTime) {
  player.update(deltaTime);
  updateHud();

  if (!player.isMoving() && activePath.length === 0 && officeStatus.textContent.includes("移动中")) {
    setStatus("状态：已到达");
  }
}

function render() {
  drawScene();
  drawGridOverlay();
  player.draw(ctx);
}

function loop(timestamp = 0) {
  const deltaTime = Math.min(timestamp - lastFrameTime, 100);
  lastFrameTime = timestamp;

  update(deltaTime);
  render();
  requestAnimationFrame(loop);
}

function updateHud() {
  officePosition.textContent = `当前坐标：(${player.x}, ${player.y})`;
}

function setStatus(text) {
  officeStatus.textContent = text;
}

function setTarget(x, y) {
  officeTarget.textContent = `目标坐标：(${x}, ${y})`;
}

function approach(current, target, maxStep) {
  const distance = target - current;

  if (Math.abs(distance) <= Math.max(maxStep, POSITION_EPSILON)) {
    return target;
  }

  return current + Math.sign(distance) * maxStep;
}

function getDirectionFromDelta(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? "right" : "left";
  }

  if (dy < 0) {
    return "up";
  }

  return "down";
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

canvas.addEventListener("click", (event) => {
  const point = getCanvasPoint(event);
  const cell = screenToGrid(point.x, point.y);
  moveTo(cell);
});

window.addEventListener("keydown", (event) => {
  const moves = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
  };
  const movement = moves[event.key];

  if (!movement) {
    return;
  }

  event.preventDefault();

  const now = performance.now();
  if (now - lastMoveAt < MOVE_DEBOUNCE_MS || !player.canAcceptInput()) {
    return;
  }

  lastMoveAt = now;
  player.moveBy(movement[0], movement[1]);
});

toggleGridButton.addEventListener("click", () => {
  showGrid = !showGrid;
  toggleGridButton.textContent = showGrid ? "隐藏网格" : "显示网格";
});

moveDoorButton.addEventListener("click", () => {
  moveTo(officeDoor);
});

clearPathButton.addEventListener("click", () => {
  player.path = [];
  activePath = [];
  setStatus("状态：待命");
  officeTarget.textContent = "目标坐标：未选择";
});

exitOfficeButton.addEventListener("click", () => {
  window.location.href = "./index.html";
});

window.officeDebug = Object.freeze({
  grid,
  collisionMap,
  canMove,
  gridToIsometric,
  screenToGrid,
  findPath,
  player,
  getState: () => ({
    position: { x: player.x, y: player.y },
    path: [...player.path],
    target: { ...targetCell },
  }),
});

officeTarget.textContent = "目标坐标：未选择";
setStatus("状态：待命");
loop();
