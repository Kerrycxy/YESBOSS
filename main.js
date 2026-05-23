"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const positionLabel = document.getElementById("positionLabel");
const gameShell = document.getElementById("gameShell");
const gameUi = document.getElementById("gameUi");
const closePhoneButton = document.getElementById("closePhoneButton");

const sceneConfig = window.sceneConfig;
const gridConfig = sceneConfig.grid;
const GRID_WIDTH = gridConfig.width;
const GRID_HEIGHT = gridConfig.height;
const originX = gridConfig.origin.x;
const originY = gridConfig.origin.y;
const tileWidth = gridConfig.tileWidth;
const tileHeight = gridConfig.tileHeight;
const tileDepth = gridConfig.tileDepth;
const cellsPerSecond =
  sceneConfig.movement.cellsPerSecond ?? sceneConfig.movement.moveSpeed * 60;
const spriteConfig = sceneConfig.character.sprite;
const POSITION_EPSILON = 0.001;
const focusCamera = {
  scale: 1.68,
  targetX: 430,
  targetY: 402,
  followSpeed: 0.18,
};
let isPhoneMode = false;
let lastPlayerBounds = null;
let cameraState = {
  x: 0,
  y: 0,
  scale: 1,
};

const sceneTexture = new Image();
let isSceneTextureReady = false;
let sceneTextureError = "";

sceneTexture.addEventListener("load", () => {
  isSceneTextureReady = true;
  sceneTextureError = "";
});
sceneTexture.addEventListener("error", () => {
  isSceneTextureReady = false;
  sceneTextureError = `Texture missing: ${sceneConfig.image.src}`;
});
sceneTexture.src = sceneConfig.image.src;

const characterSprite = new Image();
let isCharacterSpriteReady = false;

characterSprite.addEventListener("load", () => {
  isCharacterSpriteReady = true;
});
characterSprite.addEventListener("error", () => {
  isCharacterSpriteReady = false;
});
characterSprite.src = spriteConfig.src;

// 0 = empty ground, 1 = obstacle.
const collisionMap = generateCollisionMapFromConfig(sceneConfig);

class Character {
  constructor(x, y) {
    this.targetX = x;
    this.targetY = y;
    this.renderX = x;
    this.renderY = y;
    this.color = "#f59e0b";
    this.direction = "down";
    this.animationTime = 0;
  }

  move(dx, dy) {
    const nextX = this.targetX + dx;
    const nextY = this.targetY + dy;
    this.direction = getDirectionFromDelta(dx, dy);

    if (canMove(nextX, nextY)) {
      this.targetX = nextX;
      this.targetY = nextY;
    }
  }

  update(deltaTime) {
    const maxStep = cellsPerSecond * (deltaTime / 1000);

    this.renderX = approach(this.renderX, this.targetX, maxStep);
    this.renderY = approach(this.renderY, this.targetY, maxStep);

    if (this.isMoving()) {
      this.animationTime += deltaTime;
    } else {
      this.animationTime = 0;
    }
  }

  draw(renderContext) {
    if (isCharacterSpriteReady) {
      this.drawSprite(renderContext);
      return;
    }

    this.drawFallback(renderContext);
  }

  drawSprite(renderContext) {
    const bounds = getPlayerWorldBounds(this);
    lastPlayerBounds = bounds;
    const frameWidth = characterSprite.width / spriteConfig.columns;
    const frameHeight = characterSprite.height / spriteConfig.rows;
    const directionRow = spriteConfig.directionRows[this.direction] ?? 0;
    const frameColumn = this.getAnimationFrame();

    renderContext.save();
    renderContext.imageSmoothingEnabled = false;
    renderContext.drawImage(
      characterSprite,
      frameColumn * frameWidth,
      directionRow * frameHeight,
      frameWidth,
      frameHeight,
      bounds.x,
      bounds.y,
      spriteConfig.renderWidth,
      spriteConfig.renderHeight,
    );

    if (isPhoneMode) {
      drawPhoneProp(renderContext, bounds, this.direction);
    }

    renderContext.restore();
  }

  drawFallback(renderContext) {
    lastPlayerBounds = getPlayerWorldBounds(this);
    const feet = gridToScreen(this.renderX, this.renderY);
    const centerX = feet.x;
    const feetY = feet.y;

    renderContext.save();
    renderContext.fillStyle = this.color;
    renderContext.strokeStyle = "#78350f";
    renderContext.lineWidth = 2;

    renderContext.beginPath();
    renderContext.arc(centerX, feetY - 24, 10, 0, Math.PI * 2);
    renderContext.fill();
    renderContext.stroke();

    renderContext.beginPath();
    renderContext.moveTo(centerX, feetY - 14);
    renderContext.lineTo(centerX - 12, feetY + 4);
    renderContext.lineTo(centerX + 12, feetY + 4);
    renderContext.closePath();
    renderContext.fill();
    renderContext.stroke();
    renderContext.restore();
  }

  getAnimationFrame() {
    if (!this.isMoving()) {
      return spriteConfig.idleFrame;
    }

    const frameDuration = 1000 / spriteConfig.animationFps;
    const sequenceIndex =
      Math.floor(this.animationTime / frameDuration) % spriteConfig.walkFrames.length;

    return spriteConfig.walkFrames[sequenceIndex];
  }

  isMoving() {
    return (
      Math.abs(this.targetX - this.renderX) > POSITION_EPSILON ||
      Math.abs(this.targetY - this.renderY) > POSITION_EPSILON
    );
  }
}

const player = new Character(sceneConfig.playerStart.x, sceneConfig.playerStart.y);

function getPlayerWorldBounds(character) {
  const feet = gridToScreen(character.renderX, character.renderY);
  const footX = feet.x;
  const footY = feet.y + (spriteConfig.footOffsetY ?? 0);

  return {
    x: footX - spriteConfig.renderWidth * spriteConfig.anchorX,
    y: footY - spriteConfig.renderHeight * spriteConfig.anchorY,
    width: spriteConfig.renderWidth,
    height: spriteConfig.renderHeight,
    footX,
    footY,
  };
}

function drawPhoneProp(renderContext, bounds, direction) {
  const position = getPhonePropPosition(bounds, direction);

  renderContext.save();
  renderContext.translate(position.x, position.y);
  renderContext.rotate(position.rotation);
  renderContext.scale(position.mirror ? -1 : 1, 1);
  renderContext.imageSmoothingEnabled = false;
  drawPixelPhoneInHand(renderContext);
  renderContext.restore();
}

function drawPixelPhoneInHand(renderContext) {
  renderContext.save();

  renderContext.fillStyle = "#111827";
  renderContext.beginPath();
  renderContext.moveTo(-20, 6);
  renderContext.lineTo(-9, 2);
  renderContext.lineTo(-4, 10);
  renderContext.lineTo(-16, 16);
  renderContext.closePath();
  renderContext.fill();

  renderContext.fillStyle = "#c98255";
  renderContext.fillRect(-8, 1, 9, 13);
  renderContext.fillRect(-5, 12, 11, 5);
  renderContext.fillStyle = "#8f4f33";
  renderContext.fillRect(-8, 11, 3, 5);

  renderContext.fillStyle = "#0f172a";
  renderContext.fillRect(-1, -14, 16, 27);
  renderContext.fillStyle = "#f8fafc";
  renderContext.fillRect(1, -12, 12, 23);
  renderContext.fillStyle = "#111827";
  renderContext.fillRect(2, -11, 10, 21);
  renderContext.fillStyle = "#38bdf8";
  renderContext.fillRect(4, -8, 6, 13);
  renderContext.fillStyle = "#7dd3fc";
  renderContext.fillRect(5, -7, 2, 10);
  renderContext.fillStyle = "#e0f2fe";
  renderContext.fillRect(6, 8, 3, 1);

  renderContext.fillStyle = "#d99a6c";
  renderContext.fillRect(-3, 1, 5, 12);
  renderContext.fillRect(0, 10, 7, 4);
  renderContext.fillStyle = "#8f4f33";
  renderContext.fillRect(0, 13, 6, 2);

  renderContext.restore();
}

function getPhonePropPosition(bounds, direction) {
  const positions = {
    down: {
      x: bounds.x + bounds.width * 0.62,
      y: bounds.y + bounds.height * 0.5,
      rotation: -0.22,
    },
    up: {
      x: bounds.x + bounds.width * 0.62,
      y: bounds.y + bounds.height * 0.49,
      rotation: 0.18,
    },
    left: {
      x: bounds.x + bounds.width * 0.38,
      y: bounds.y + bounds.height * 0.5,
      rotation: -0.12,
      mirror: true,
    },
    right: {
      x: bounds.x + bounds.width * 0.63,
      y: bounds.y + bounds.height * 0.5,
      rotation: 0.14,
    },
  };

  return positions[direction] ?? positions.down;
}

function generateCollisionMapFromConfig(config) {
  const { width, height } = config.grid;
  const map = Array.from({ length: height }, () => Array(width).fill(0));

  config.obstacles.forEach((area) => {
    if (Array.isArray(area.cells)) {
      markCollisionCells(map, area.cells);
      return;
    }

    markCollisionArea(map, area.fromX, area.fromY, area.toX, area.toY);
  });

  return map;
}

function markCollisionCells(map, cells) {
  cells.forEach(([x, y]) => {
    if (isInsideMap(x, y)) {
      map[y][x] = 1;
    }
  });
}

function markCollisionArea(map, fromX, fromY, toX, toY) {
  for (let y = fromY; y <= toY; y += 1) {
    for (let x = fromX; x <= toX; x += 1) {
      if (isInsideMap(x, y)) {
        map[y][x] = 1;
      }
    }
  }
}

function isInsideMap(x, y) {
  return x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;
}

function checkCollision(x, y) {
  if (!isInsideMap(x, y)) {
    return false;
  }

  return collisionMap[y][x] === 1;
}

function canMove(x, y) {
  if (!isInsideMap(x, y)) {
    return false;
  }

  return !checkCollision(x, y);
}

function approach(current, target, maxStep) {
  const distance = target - current;

  if (Math.abs(distance) <= Math.max(maxStep, POSITION_EPSILON)) {
    return target;
  }

  return current + Math.sign(distance) * maxStep;
}

function getDirectionFromDelta(dx, dy) {
  if (dx > 0) {
    return "right";
  }

  if (dx < 0) {
    return "left";
  }

  if (dy < 0) {
    return "up";
  }

  return "down";
}

function gridToScreen(gridX, gridY) {
  return {
    x: originX + (gridX - gridY) * (tileWidth / 2),
    y: originY + (gridX + gridY) * (tileHeight / 2),
  };
}

function getTargetCameraTransform() {
  if (!isPhoneMode) {
    return { x: 0, y: 0, scale: 1 };
  }

  const playerFeet = gridToScreen(player.renderX, player.renderY);

  return {
    x: focusCamera.targetX - playerFeet.x * focusCamera.scale,
    y: focusCamera.targetY - playerFeet.y * focusCamera.scale,
    scale: focusCamera.scale,
  };
}

function updateCamera() {
  const target = getTargetCameraTransform();

  cameraState = {
    x: lerp(cameraState.x, target.x, focusCamera.followSpeed),
    y: lerp(cameraState.y, target.y, focusCamera.followSpeed),
    scale: lerp(cameraState.scale, target.scale, focusCamera.followSpeed),
  };

  if (Math.abs(cameraState.x - target.x) < 0.1) {
    cameraState.x = target.x;
  }

  if (Math.abs(cameraState.y - target.y) < 0.1) {
    cameraState.y = target.y;
  }

  if (Math.abs(cameraState.scale - target.scale) < 0.001) {
    cameraState.scale = target.scale;
  }
}

function lerp(current, target, amount) {
  return current + (target - current) * amount;
}

function screenToWorld(point) {
  return {
    x: (point.x - cameraState.x) / cameraState.scale,
    y: (point.y - cameraState.y) / cameraState.scale,
  };
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function isPointInPlayerBounds(point) {
  const bounds = lastPlayerBounds ?? getPlayerWorldBounds(player);

  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

function drawTile(x, y, tileType, options = {}) {
  const { fillTile = true, drawObstacleModel = true } = options;
  const center = gridToScreen(x, y);
  const top = { x: center.x, y: center.y - tileHeight / 2 };
  const right = { x: center.x + tileWidth / 2, y: center.y };
  const bottom = { x: center.x, y: center.y + tileHeight / 2 };
  const left = { x: center.x - tileWidth / 2, y: center.y };
  const isObstacle = tileType === 1;

  ctx.save();

  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.lineTo(left.x, left.y);
  ctx.closePath();
  ctx.fillStyle = isObstacle ? "rgba(239, 68, 68, 0.32)" : "rgba(31, 157, 85, 0.64)";
  ctx.strokeStyle = isSceneTextureReady ? "rgba(15, 23, 42, 0.18)" : "#0f172a";
  ctx.lineWidth = 1;
  if (fillTile) {
    ctx.fill();
  }
  ctx.stroke();

  if (isObstacle && drawObstacleModel) {
    drawObstacleBlock(top, right, bottom, left);
  }

  ctx.restore();
}

function drawObstacleBlock(top, right, bottom, left) {
  const lowerRight = { x: right.x, y: right.y + tileDepth };
  const lowerBottom = { x: bottom.x, y: bottom.y + tileDepth };
  const lowerLeft = { x: left.x, y: left.y + tileDepth };

  ctx.fillStyle = "#475569";
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.lineTo(lowerBottom.x, lowerBottom.y);
  ctx.lineTo(lowerLeft.x, lowerLeft.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#334155";
  ctx.beginPath();
  ctx.moveTo(right.x, right.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.lineTo(lowerBottom.x, lowerBottom.y);
  ctx.lineTo(lowerRight.x, lowerRight.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#94a3b8";
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.lineTo(left.x, left.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawGrid() {
  const debugMode = new URLSearchParams(window.location.search).get("debug");
  const showGrid = sceneConfig.debug.showGrid || debugMode === "grid";
  const showCollision =
    sceneConfig.debug.showCollision || debugMode === "collision" || debugMode === "grid";

  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const isCollisionTile = checkCollision(x, y);

      if (!showGrid && !(showCollision && isCollisionTile)) {
        continue;
      }

      drawTile(x, y, collisionMap[y][x], {
        fillTile: !isSceneTextureReady && showGrid,
        drawObstacleModel: !isSceneTextureReady && showCollision,
      });

      if (showCollision && isCollisionTile) {
        drawCollisionMarker(x, y);
      }
    }
  }
}

function drawCollisionMarker(x, y) {
  const center = gridToScreen(x, y);
  const markerWidth = tileWidth * 0.38;
  const markerHeight = tileHeight * 0.28;

  ctx.save();
  ctx.fillStyle = "rgba(239, 68, 68, 0.72)";
  ctx.strokeStyle = "rgba(127, 29, 29, 0.9)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(center.x, center.y + tileHeight * 0.1, markerWidth / 2, markerHeight / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawSceneTexture() {
  if (!isSceneTextureReady) {
    return;
  }

  ctx.drawImage(sceneTexture, 0, 0, canvas.width, canvas.height);
}

function drawTextureStatus() {
  if (!sceneTextureError) {
    return;
  }

  ctx.save();
  ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
  ctx.fillRect(16, 16, 288, 52);
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "14px sans-serif";
  ctx.fillText(sceneTextureError, 32, 46);
  ctx.restore();
}

function updateHud() {
  const mode = isPhoneMode ? "Phone" : "Move";
  positionLabel.textContent = `Position: ${player.targetX}, ${player.targetY} · ${mode}`;
}

function update(deltaTime) {
  player.update(deltaTime);
  updateCamera();
  updateHud();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(cameraState.x, cameraState.y);
  ctx.scale(cameraState.scale, cameraState.scale);
  drawSceneTexture();
  drawGrid();
  player.draw(ctx);
  ctx.restore();

  drawTextureStatus();
}

let lastFrameTime = 0;

function gameLoop(timestamp = 0) {
  const deltaTime = Math.min(timestamp - lastFrameTime, 100);
  lastFrameTime = timestamp;

  update(deltaTime);
  render();
  requestAnimationFrame(gameLoop);
}

const movementKeys = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
};

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isPhoneMode) {
    closePhoneMode();
    return;
  }

  const movement = movementKeys[event.key];

  if (!movement) {
    return;
  }

  event.preventDefault();

  if (isPhoneMode) {
    return;
  }

  player.move(movement[0], movement[1]);
});

canvas.addEventListener("click", (event) => {
  if (isPhoneMode) {
    return;
  }

  const worldPoint = screenToWorld(getCanvasPoint(event));

  if (isPointInPlayerBounds(worldPoint)) {
    openPhoneMode();
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (isPhoneMode) {
    canvas.style.cursor = "default";
    return;
  }

  const worldPoint = screenToWorld(getCanvasPoint(event));
  canvas.style.cursor = isPointInPlayerBounds(worldPoint) ? "pointer" : "default";
});

function openPhoneMode() {
  isPhoneMode = true;
  player.direction = "down";
  gameShell.classList.add("phone-mode");
  gameUi.setAttribute("aria-hidden", "false");
}

function closePhoneMode() {
  isPhoneMode = false;
  gameShell.classList.remove("phone-mode");
  gameUi.setAttribute("aria-hidden", "true");
  canvas.style.cursor = "default";
}

closePhoneButton.addEventListener("click", closePhoneMode);

window.gameDebug = Object.freeze({
  sceneConfig,
  collisionMap,
  checkCollision,
  generateCollisionMapFromConfig,
  gridToScreen,
  getCanvasPoint,
  getPlayerWorldBounds,
  getTargetCameraTransform,
  openPhoneMode,
  closePhoneMode,
  characterSprite,
  getPlayerState: () => ({
    targetX: player.targetX,
    targetY: player.targetY,
    renderX: player.renderX,
    renderY: player.renderY,
    direction: player.direction,
    isMoving: player.isMoving(),
    isPhoneMode,
    cameraState,
  }),
  player,
});

gameLoop();
