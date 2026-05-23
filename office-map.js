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

const grid = {
  width: 20,
  height: 14,
  originX: 512,
  originY: 42,
  tileWidth: 64,
  tileHeight: 32,
};

const player = {
  x: 1,
  y: 10,
  renderX: 1,
  renderY: 10,
  direction: "down",
  path: [],
  speed: 4.2,
  animationTime: 0,
};

const officeDoor = { x: 0, y: 10 };
const targetMarker = { x: 12, y: 10 };
let showGrid = true;
let currentPath = [];
let lastFrameTime = 0;

const characterSprite = new Image();
let isCharacterSpriteReady = false;

characterSprite.addEventListener("load", () => {
  isCharacterSpriteReady = true;
});
characterSprite.src = "./assets/character-spritesheet-normalized.png";

const obstacleAreas = [
  { id: "coffee-bar", fromX: 1, fromY: 0, toX: 6, toY: 1 },
  { id: "top-right-cabinet", fromX: 16, fromY: 0, toX: 19, toY: 2 },
  { id: "boss-desk", fromX: 9, fromY: 2, toX: 13, toY: 4 },
  { id: "left-desk", fromX: 4, fromY: 6, toX: 8, toY: 8 },
  { id: "left-lower-desk", fromX: 4, fromY: 10, toX: 8, toY: 12 },
  { id: "right-desk", fromX: 14, fromY: 6, toX: 18, toY: 8 },
  { id: "right-lower-desk", fromX: 14, fromY: 10, toX: 18, toY: 12 },
  { id: "water-cooler", cells: [[0, 11], [0, 12]] },
  { id: "left-plant", cells: [[1, 12], [2, 12]] },
  { id: "top-left-plant", cells: [[0, 2], [1, 2]] },
  { id: "right-plant", cells: [[17, 3], [18, 3]] },
  { id: "center-blocker", cells: [[10, 9], [11, 9]] },
];

const obstacleMap = buildObstacleMap();

function buildObstacleMap() {
  const cells = new Set();

  obstacleAreas.forEach((area) => {
    if (area.cells) {
      area.cells.forEach(([x, y]) => cells.add(cellKey(x, y)));
      return;
    }

    for (let y = area.fromY; y <= area.toY; y += 1) {
      for (let x = area.fromX; x <= area.toX; x += 1) {
        cells.add(cellKey(x, y));
      }
    }
  });

  return cells;
}

function cellKey(x, y) {
  return `${x},${y}`;
}

function isInsideGrid(x, y) {
  return x >= 0 && x < grid.width && y >= 0 && y < grid.height;
}

function isObstacle(x, y) {
  return obstacleMap.has(cellKey(x, y));
}

function isPassable(x, y) {
  return isInsideGrid(x, y) && !isObstacle(x, y);
}

function gridToScreen(x, y) {
  return {
    x: grid.originX + (x - y) * (grid.tileWidth / 2),
    y: grid.originY + (x + y) * (grid.tileHeight / 2),
  };
}

function screenToGrid(screenX, screenY) {
  let bestCell = null;
  let bestDistance = Infinity;

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const center = gridToScreen(x, y);
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

function drawBackground() {
  ctx.fillStyle = "#f6f7f7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#eef0f1";
  ctx.fillRect(0, 0, canvas.width, 128);
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 126);
  ctx.lineTo(canvas.width, 126);
  ctx.stroke();

  drawWindows();
  drawWallDecor();
  drawFurniture();
}

function drawWindows() {
  drawWindow(240, 0, 340, 94);
  drawWindow(620, 0, 290, 94);
}

function drawWindow(x, y, width, height) {
  ctx.fillStyle = "#9fd0e7";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "rgba(255,255,255,0.36)";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, width, height);

  for (let i = 1; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x + (width / 4) * i, y);
    ctx.lineTo(x + (width / 4) * i, y + height);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(15, 23, 42, 0.12)";
  for (let i = 0; i < 6; i += 1) {
    ctx.fillRect(x + 20 + i * 42, y + 38 - (i % 3) * 8, 24, 56 + (i % 2) * 10);
  }
}

function drawWallDecor() {
  drawWhiteboard(46, 116);
  drawPoster(595, 0, "专注\n创新\n结果");
  drawPlant(825, 72, 0.92);
  drawCabinet(860, 116, 150, 84);
  drawWaterCooler(55, 390);
  drawPlant(130, 430, 0.86);
}

function drawFurniture() {
  drawCounter(220, 78);
  drawBossDesk(512, 150);
  drawDesk(318, 278, "brown", false);
  drawDesk(318, 442, "black", true);
  drawDesk(742, 278, "brown", false);
  drawDesk(742, 442, "black", false);
}

function drawCounter(x, y) {
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(x, y + 50, 330, 58);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y + 28, 330, 38);
  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y + 28, 330, 80);
  drawCoffeeMachine(x + 24, y);
  drawCoffeeMachine(x + 245, y + 10);

  ["#92400e", "#92400e", "#ffffff", "#f59e0b"].forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + 105 + index * 28, y + 44, 14, 12);
    ctx.strokeStyle = "#111827";
    ctx.strokeRect(x + 105 + index * 28, y + 44, 14, 12);
  });
}

function drawCoffeeMachine(x, y) {
  ctx.fillStyle = "#111827";
  ctx.fillRect(x, y + 16, 42, 48);
  ctx.fillStyle = "#374151";
  ctx.fillRect(x + 5, y + 22, 32, 10);
  ctx.fillStyle = "#f97316";
  ctx.fillRect(x + 10, y + 46, 7, 16);
  ctx.fillRect(x + 25, y + 46, 7, 16);
}

function drawBossDesk(x, y) {
  drawOfficeWorker(x + 98, y - 58, "boss");
  drawDeskBase(x, y, 230, 86);
  drawMonitor(x + 78, y + 18, 66, 42);
  drawMug(x + 154, y + 22);
  drawPlant(x + 174, y + 20, 0.28);
  drawPaper(x + 28, y + 22);
  drawChair(x + 97, y - 42);
}

function drawDesk(x, y, hair, jacket) {
  drawOfficeWorker(x + 85, y - 58, hair);
  drawDeskBase(x, y, 180, 76);
  drawMonitor(x + 70, y + 26, 58, 36);
  drawMug(x + 26, y + 34);
  drawPaper(x + 142, y + 30);
  drawChair(x + 80, y + 82);

  if (jacket) {
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(x + 102, y + 108, 28, 62);
  }
}

function drawDeskBase(x, y, width, height) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = "#d1d5db";
  ctx.fillRect(x + 8, y + height, width - 16, 26);
  ctx.strokeRect(x + 8, y + height, width - 16, 26);
}

function drawMonitor(x, y, width, height) {
  ctx.fillStyle = "#111827";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "#374151";
  ctx.fillRect(x + width * 0.43, y + height, width * 0.14, 24);
  ctx.fillStyle = "#9ca3af";
  ctx.fillRect(x + width * 0.28, y + height + 20, width * 0.44, 8);
}

function drawChair(x, y) {
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(x, y, 48, 44);
  ctx.strokeStyle = "#6b7280";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, 48, 44);
  ctx.fillStyle = "#9ca3af";
  ctx.fillRect(x + 20, y + 44, 8, 28);
}

function drawPlant(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(-16, 42, 32, 34);
  ctx.strokeStyle = "#9ca3af";
  ctx.strokeRect(-16, 42, 32, 34);
  ctx.fillStyle = "#6b3f17";
  ctx.fillRect(-10, 40, 20, 8);
  ctx.strokeStyle = "#4d7c0f";
  ctx.lineWidth = 4;
  for (let i = -3; i <= 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, 44);
    ctx.quadraticCurveTo(i * 12, 16 + Math.abs(i) * 4, i * 20, 6 + Math.abs(i) * 8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOfficeWorker(x, y, kind) {
  const hair = kind === "brown" ? "#92400e" : "#111827";
  const shirt = kind === "boss" ? "#111827" : "#f8fafc";

  ctx.fillStyle = shirt;
  ctx.fillRect(x - 18, y + 38, 36, 40);
  ctx.strokeStyle = "#111827";
  ctx.strokeRect(x - 18, y + 38, 36, 40);
  ctx.fillStyle = "#f2b07a";
  ctx.fillRect(x - 14, y + 14, 28, 28);
  ctx.fillStyle = hair;
  ctx.fillRect(x - 17, y + 4, 34, 18);
  ctx.fillStyle = "#111827";
  ctx.fillRect(x - 8, y + 27, 4, 3);
  ctx.fillRect(x + 6, y + 27, 4, 3);

  if (kind === "boss") {
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(x - 3, y + 42, 6, 24);
  }
}

function drawWhiteboard(x, y) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, 76, 142);
  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, 76, 142);
  ctx.fillStyle = "#fcd34d";
  ctx.fillRect(x + 18, y + 88, 12, 10);
  ctx.fillStyle = "#f9a8d4";
  ctx.fillRect(x + 34, y + 96, 12, 10);
}

function drawPoster(x, y, text) {
  ctx.fillStyle = "#fffdf7";
  ctx.fillRect(x, y, 58, 90);
  ctx.strokeStyle = "#92400e";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, 58, 90);
  ctx.fillStyle = "#111827";
  ctx.font = "bold 18px sans-serif";
  text.split("\n").forEach((line, index) => {
    ctx.fillText(line, x + 18, y + 28 + index * 22);
  });
}

function drawCabinet(x, y, width, height) {
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "#9ca3af";
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = "#d1d5db";
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      ctx.fillRect(x + 12 + col * 21, y + 15 + row * 33, 14, 24);
    }
  }
}

function drawWaterCooler(x, y) {
  ctx.fillStyle = "#dbeafe";
  ctx.fillRect(x + 12, y, 34, 52);
  ctx.strokeStyle = "#60a5fa";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 12, y, 34, 52);
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(x, y + 50, 58, 86);
  ctx.strokeStyle = "#9ca3af";
  ctx.strokeRect(x, y + 50, 58, 86);
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(x + 18, y + 80, 9, 12);
  ctx.fillStyle = "#3b82f6";
  ctx.fillRect(x + 32, y + 80, 9, 12);
}

function drawMug(x, y) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, 16, 18);
  ctx.strokeStyle = "#111827";
  ctx.strokeRect(x, y, 16, 18);
}

function drawPaper(x, y) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, 22, 32);
  ctx.strokeStyle = "#9ca3af";
  ctx.strokeRect(x, y, 22, 32);
}

function drawTile(x, y) {
  const center = gridToScreen(x, y);
  const points = getTilePoints(center);
  const isBlocked = isObstacle(x, y);
  const isPath = currentPath.some((cell) => cell.x === x && cell.y === y);
  const isTarget = targetMarker.x === x && targetMarker.y === y;
  const isDoor = officeDoor.x === x && officeDoor.y === y;

  ctx.save();
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
      return;
    }
    ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();

  if (isBlocked) {
    ctx.fillStyle = "rgba(239, 68, 68, 0.18)";
    ctx.strokeStyle = "rgba(185, 28, 28, 0.8)";
  } else if (isPath) {
    ctx.fillStyle = "rgba(59, 130, 246, 0.22)";
    ctx.strokeStyle = "rgba(37, 99, 235, 0.9)";
  } else {
    ctx.fillStyle = "rgba(34, 197, 94, 0.18)";
    ctx.strokeStyle = "rgba(22, 163, 74, 0.64)";
  }

  ctx.lineWidth = isPath || isTarget ? 2.5 : 1.4;
  ctx.fill();
  ctx.stroke();

  if (showGrid) {
    if (isBlocked) {
      drawCross(center);
    } else {
      drawCheck(center);
    }
  }

  if (isTarget || isDoor) {
    drawTargetBracket(center, isDoor ? "#f59e0b" : "#22c55e");
    drawTileLabel(center, isDoor ? "门口" : `目标 ${x},${y}`, isDoor ? "#92400e" : "#166534");
  }

  ctx.restore();
}

function drawTileLabel(center, label, color) {
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.84)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  const width = ctx.measureText(label).width + 12;
  ctx.fillRect(center.x - width / 2, center.y - 39, width, 20);
  ctx.strokeRect(center.x - width / 2, center.y - 39, width, 20);
  ctx.fillStyle = color;
  ctx.fillText(label, center.x, center.y - 24);
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

function drawCheck(center) {
  ctx.strokeStyle = "rgba(22, 163, 74, 0.75)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(center.x - 9, center.y + 1);
  ctx.lineTo(center.x - 1, center.y + 8);
  ctx.lineTo(center.x + 13, center.y - 8);
  ctx.stroke();
}

function drawCross(center) {
  ctx.strokeStyle = "rgba(185, 28, 28, 0.82)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(center.x - 14, center.y - 9);
  ctx.lineTo(center.x + 14, center.y + 9);
  ctx.moveTo(center.x + 14, center.y - 9);
  ctx.lineTo(center.x - 14, center.y + 9);
  ctx.stroke();
}

function drawTargetBracket(center, color) {
  const size = 25;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(center.x - size, center.y - size * 0.55);
  ctx.lineTo(center.x - size, center.y - size);
  ctx.lineTo(center.x - size * 0.55, center.y - size);
  ctx.moveTo(center.x + size, center.y - size * 0.55);
  ctx.lineTo(center.x + size, center.y - size);
  ctx.lineTo(center.x + size * 0.55, center.y - size);
  ctx.moveTo(center.x - size, center.y + size * 0.55);
  ctx.lineTo(center.x - size, center.y + size);
  ctx.lineTo(center.x - size * 0.55, center.y + size);
  ctx.moveTo(center.x + size, center.y + size * 0.55);
  ctx.lineTo(center.x + size, center.y + size);
  ctx.lineTo(center.x + size * 0.55, center.y + size);
  ctx.stroke();
}

function drawGridOverlay() {
  if (!showGrid && currentPath.length === 0) {
    return;
  }

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      drawTile(x, y);
    }
  }
}

function drawPlayer() {
  const screen = gridToScreen(player.renderX, player.renderY);
  const width = 82;
  const height = 98;
  const x = screen.x - width * 0.5;
  const y = screen.y - height + 8;

  if (!isCharacterSpriteReady) {
    ctx.fillStyle = "#111827";
    ctx.fillRect(x + 24, y + 24, 34, 60);
    ctx.fillStyle = "#f2b07a";
    ctx.fillRect(x + 28, y + 8, 26, 24);
    return;
  }

  const frameWidth = characterSprite.width / 3;
  const frameHeight = characterSprite.height / 4;
  const row = { down: 0, up: 1, left: 2, right: 3 }[player.direction] ?? 0;
  const col = player.path.length > 0 ? Math.floor(player.animationTime / 120) % 3 : 1;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    characterSprite,
    col * frameWidth,
    row * frameHeight,
    frameWidth,
    frameHeight,
    x,
    y,
    width,
    height,
  );
  ctx.restore();
}

function update(deltaTime) {
  updateOfficeHud();

  if (player.path.length === 0) {
    player.animationTime = 0;
    return;
  }

  const next = player.path[0];
  const maxStep = player.speed * (deltaTime / 1000);
  const dx = next.x - player.renderX;
  const dy = next.y - player.renderY;
  const distance = Math.hypot(dx, dy);

  player.direction = getDirection(dx, dy);
  player.animationTime += deltaTime;

  if (distance <= Math.max(maxStep, 0.001)) {
    player.renderX = next.x;
    player.renderY = next.y;
    player.x = next.x;
    player.y = next.y;
    player.path.shift();
    currentPath = [...player.path];

    if (player.x === officeDoor.x && player.y === officeDoor.y) {
      window.location.href = "./index.html";
      return;
    }

    if (player.path.length === 0) {
      officeStatus.textContent = "状态：已到达";
    }

    return;
  }

  player.renderX += (dx / distance) * maxStep;
  player.renderY += (dy / distance) * maxStep;
}

function getDirection(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? "right" : "left";
  }

  return dy > 0 ? "down" : "up";
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawGridOverlay();
  drawPlayer();
}

function updateOfficeHud() {
  officePosition.textContent = `当前坐标：(${player.x}, ${player.y})`;
}

function loop(timestamp = 0) {
  const deltaTime = Math.min(timestamp - lastFrameTime, 100);
  lastFrameTime = timestamp;

  update(deltaTime);
  render();
  requestAnimationFrame(loop);
}

function findPath(start, goal) {
  if (!isPassable(goal.x, goal.y)) {
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
      const neighborKey = cellKey(neighbor.x, neighbor.y);

      if (visited.has(neighborKey)) {
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

function getNeighbors(cell) {
  return [
    { x: cell.x + 1, y: cell.y },
    { x: cell.x - 1, y: cell.y },
    { x: cell.x, y: cell.y + 1 },
    { x: cell.x, y: cell.y - 1 },
  ].filter((neighbor) => isPassable(neighbor.x, neighbor.y));
}

function moveTo(goal) {
  const start = { x: Math.round(player.x), y: Math.round(player.y) };
  const path = findPath(start, goal);
  targetMarker.x = goal.x;
  targetMarker.y = goal.y;
  currentPath = path;

  if (start.x === goal.x && start.y === goal.y) {
    player.path = [];
    officeStatus.textContent = "状态：已在目标坐标";
    officeTarget.textContent = `目标坐标：(${goal.x}, ${goal.y})`;
    return;
  }

  if (path.length === 0) {
    officeStatus.textContent = "状态：目标被障碍物挡住";
    officeTarget.textContent = `目标坐标：(${goal.x}, ${goal.y})`;
    return;
  }

  player.path = [...path];
  officeStatus.textContent = "状态：移动中";
  officeTarget.textContent = `目标坐标：(${goal.x}, ${goal.y})`;
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

  if (!cell) {
    return;
  }

  moveTo(cell);
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
  currentPath = [];
  officeStatus.textContent = "状态：待命";
  officeTarget.textContent = "目标坐标：未选择";
});

exitOfficeButton.addEventListener("click", () => {
  window.location.href = "./index.html";
});

window.officeDebug = Object.freeze({
  grid,
  obstacleMap,
  findPath,
  isPassable,
  gridToScreen,
  screenToGrid,
  player,
});

moveTo(targetMarker);
loop();
