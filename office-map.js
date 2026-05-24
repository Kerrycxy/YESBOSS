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
  originX: 112,
  originY: 44,
  tileWidth: 43,
  tileHeight: 36,
};

const officeDoor = { x: 0, y: 13 };
const defaultTarget = { x: 11, y: 8 };

// 0 = walkable floor, 1 = obstacle. These cells match the top-down map overlay.
const collisionMap = createCollisionMap(grid.width, grid.height, [
  { name: "top-left counter", fromX: 2, fromY: 0, toX: 6, toY: 2 },
  { name: "boss desk", fromX: 8, fromY: 1, toX: 12, toY: 3 },
  { name: "file cabinets", fromX: 14, fromY: 0, toX: 18, toY: 2 },
  { name: "left upper desks", fromX: 4, fromY: 5, toX: 8, toY: 7 },
  { name: "left lower desks", fromX: 4, fromY: 10, toX: 8, toY: 12 },
  { name: "right upper desks", fromX: 12, fromY: 5, toX: 16, toY: 7 },
  { name: "right lower desks", fromX: 12, fromY: 10, toX: 16, toY: 12 },
  { name: "left wall", cells: [[0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8]] },
  { name: "water cooler", cells: [[0, 9], [1, 9], [0, 10]] },
  { name: "plants", cells: [[0, 1], [1, 1], [1, 10], [18, 6], [18, 11]] },
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

const officePeople = [
  { role: "boss", label: "老板", x: 10, y: 2, direction: "down", frame: 1 },
  { role: "staff", label: "职员", x: 5.2, y: 6.3, direction: "down", frame: 0 },
  { role: "staff", label: "职员", x: 7.3, y: 6.3, direction: "down", frame: 2 },
  { role: "staff", label: "职员", x: 13.4, y: 6.3, direction: "down", frame: 1 },
  { role: "staff", label: "职员", x: 15.6, y: 11.3, direction: "down", frame: 0 },
];

const characterRenderSize = {
  width: 50,
  height: 60,
};

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
    const screen = gridToScreen(this.renderX, this.renderY);
    const { width, height } = characterRenderSize;
    const x = screen.x - width * 0.5;
    const y = screen.y - height + 8;

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

function gridToScreen(gridX, gridY) {
  return {
    x: grid.originX + gridX * grid.tileWidth + grid.tileWidth / 2,
    y: grid.originY + gridY * grid.tileHeight + grid.tileHeight / 2,
  };
}

function screenToGrid(screenX, screenY) {
  return {
    x: Math.floor((screenX - grid.originX) / grid.tileWidth),
    y: Math.floor((screenY - grid.originY) / grid.tileHeight),
  };
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

      drawGridCell(x, y, isBlocked, inPath);
    }
  }

  drawTargetMarker(officeDoor, "#f59e0b", "门口");
  drawTargetMarker(targetCell, "#2563eb", "目标");
}

function drawGridCell(x, y, isBlocked, inPath) {
  const rect = getCellRect(x, y);

  ctx.save();
  ctx.fillStyle = inPath
    ? "rgba(37, 99, 235, 0.25)"
    : isBlocked
      ? "rgba(239, 68, 68, 0.2)"
      : "rgba(34, 197, 94, 0.08)";
  ctx.strokeStyle = isBlocked ? "rgba(185, 28, 28, 0.65)" : "rgba(21, 128, 61, 0.28)";
  ctx.lineWidth = inPath ? 2 : 1;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
  ctx.restore();
}

function drawTargetMarker(cell, color, label) {
  const center = gridToScreen(cell.x, cell.y);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = "rgba(255, 255, 255, 0.84)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(center.x, center.y, Math.min(grid.tileWidth, grid.tileHeight) * 0.35, 0, Math.PI * 2);
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

function getCellRect(x, y) {
  return {
    x: grid.originX + x * grid.tileWidth,
    y: grid.originY + y * grid.tileHeight,
    width: grid.tileWidth,
    height: grid.tileHeight,
  };
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
  drawOfficePeople();
  player.draw(ctx);
}

function drawOfficePeople() {
  officePeople.forEach((person) => {
    drawOfficePerson(person);
  });
}

function drawOfficePerson(person) {
  const screen = gridToScreen(person.x, person.y);
  const { width, height } = characterRenderSize;
  const x = screen.x - width * 0.5;
  const y = screen.y - height + 8;

  if (!isCharacterSpriteReady) {
    ctx.save();
    ctx.fillStyle = person.role === "boss" ? "#111827" : "#1d4ed8";
    ctx.fillRect(x + 15, y + 20, 20, 34);
    ctx.fillStyle = "#f2b07a";
    ctx.fillRect(x + 17, y + 7, 16, 17);
    ctx.restore();
    return;
  }

  const frameWidth = characterSprite.width / 3;
  const frameHeight = characterSprite.height / 4;
  const row = { down: 0, up: 1, left: 2, right: 3 }[person.direction] ?? 0;
  const frame = person.frame ?? 1;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
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

  if (person.role === "boss") {
    ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
    ctx.strokeStyle = "rgba(17, 24, 39, 0.7)";
    ctx.lineWidth = 1;
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    const labelWidth = ctx.measureText(person.label).width + 10;
    ctx.fillRect(screen.x - labelWidth / 2, y - 18, labelWidth, 17);
    ctx.strokeRect(screen.x - labelWidth / 2, y - 18, labelWidth, 17);
    ctx.fillStyle = "#111827";
    ctx.fillText(person.label, screen.x, y - 5);
  }

  ctx.restore();
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
  if (cell.x < 0 || cell.x >= grid.width || cell.y < 0 || cell.y >= grid.height) {
    setStatus("状态：目标不在网格内");
    return;
  }
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
  gridToScreen,
  gridToIsometric: gridToScreen,
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
