"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const positionLabel = document.getElementById("positionLabel");
const gameShell = document.getElementById("gameShell");
const gameUi = document.getElementById("gameUi");
const closePhoneButton = document.getElementById("closePhoneButton");
const phonePanel = document.querySelector(".phone-panel");
const phoneListView = document.getElementById("phoneListView");
const conversationView = document.getElementById("conversationView");
const backChatButton = document.getElementById("backChatButton");
const chatHeaderAvatar = document.getElementById("chatHeaderAvatar");
const chatContactName = document.getElementById("chatContactName");
const chatContactSummary = document.getElementById("chatContactSummary");
const chatThread = document.getElementById("chatThread");
const chatComposer = document.getElementById("chatComposer");
const chatInput = document.getElementById("chatInput");

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
const sceneExits = sceneConfig.exits ?? [];
let isPhoneMode = false;
let lastPlayerBounds = null;
let isLeavingScene = false;
let cameraState = {
  x: 0,
  y: 0,
  scale: 1,
};
let activeContactId = "lin";

const bgmAudio = new Audio("./assets/audio/bgm/office_ambient.ogg");
bgmAudio.loop = true;
bgmAudio.volume = 0.34;

const soundEffects = {
  click: createSfx("./assets/audio/ui/button_primary.ogg", 0.54),
  modalOpen: createSfx("./assets/audio/ui/modal_open.ogg", 0.44),
  modalClose: createSfx("./assets/audio/ui/modal_close.ogg", 0.5),
  send: createSfx("./assets/audio/ui/input_send.ogg", 0.58),
};
let isBgmStarted = false;

const contacts = {
  lin: {
    name: "林小满",
    initial: "林",
    avatarClass: "",
    time: "09:14",
    badge: "1",
    summary: "产品需求又变了，工程组昨晚加班到很晚。",
    messages: [
      { from: "contact", text: "老板，产品需求又双叒变了，刚刚客户那边又提了新想法。" },
      { from: "contact", text: "工程组昨晚又加班到凌晨2点，我都不好意思再让他们改了。" },
      { from: "contact", text: "要不一起给大家加个鸡腿？或者夜宵安排起来？" },
      { from: "player", text: "先把具体需求变更点发我，我看看影响范围。" },
      { from: "player", text: "辛苦大家了，后续进展随时同步我。" },
    ],
  },
  zhang: {
    name: "张总监",
    initial: "张",
    avatarClass: "glasses",
    time: "09:05",
    badge: "2",
    summary: "关于下个版本的排期，我们需要再对齐一下。",
    messages: [
      { from: "contact", text: "下个版本的排期我重新估了一版，风险主要在联调和测试。" },
      { from: "contact", text: "如果下午能定优先级，今晚我就把人手排出来。" },
      { from: "player", text: "先按核心链路排，非必要需求往后顺延。" },
    ],
  },
  chen: {
    name: "陈海明",
    initial: "陈",
    avatarClass: "suit",
    time: "08:50",
    badge: "1",
    summary: "测试环境出了点问题，需要你这边确认支持。",
    messages: [
      { from: "contact", text: "测试环境支付回调不稳定，我怀疑是配置被覆盖了。" },
      { from: "contact", text: "你这边能不能帮忙确认一下今天能不能恢复？" },
      { from: "player", text: "我先让运维看日志，你把复现步骤发我。" },
    ],
  },
  li: {
    name: "行政-李姐",
    initial: "李",
    avatarClass: "dark",
    time: "08:30",
    badge: "1",
    summary: "下周团建的时间地点，麻烦确认一下哦。",
    messages: [
      { from: "contact", text: "团建备选有周五晚上和周六下午，你觉得哪个更合适？" },
      { from: "player", text: "周五晚上吧，尽量别占大家周末。" },
    ],
  },
  wang: {
    name: "王大伟",
    initial: "王",
    avatarClass: "neutral",
    time: "昨天",
    badge: "0",
    summary: "这个方案我有个想法，改天聊聊？",
    messages: [
      { from: "contact", text: "这个方案我有个替代思路，可能能少做一半页面。" },
      { from: "player", text: "可以，下午找我过一下。" },
    ],
  },
};

function createSfx(src, volume) {
  const sound = new Audio(src);
  sound.preload = "auto";
  sound.volume = volume;
  return sound;
}

function startBgm() {
  if (isBgmStarted) {
    return;
  }

  isBgmStarted = true;
  bgmAudio.play().catch(() => {
    isBgmStarted = false;
  });
}

function playSfx(name) {
  startBgm();

  const source = soundEffects[name];

  if (!source) {
    return;
  }

  const sound = source.cloneNode();
  sound.volume = source.volume;
  sound.play().catch(() => {});
}

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

const phoneCloseupSprite = new Image();
let isPhoneCloseupSpriteReady = false;

phoneCloseupSprite.addEventListener("load", () => {
  isPhoneCloseupSpriteReady = true;
});
phoneCloseupSprite.addEventListener("error", () => {
  isPhoneCloseupSpriteReady = false;
});
phoneCloseupSprite.src = "./assets/character-phone-closeup.png";

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

    if (isPhoneMode && isPhoneCloseupSpriteReady) {
      this.drawPhoneCloseupSprite(renderContext, bounds);
      return;
    }

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

    renderContext.restore();
  }

  drawPhoneCloseupSprite(renderContext, bounds) {
    const closeupHeight = 232;
    const closeupWidth = closeupHeight * (phoneCloseupSprite.width / phoneCloseupSprite.height);
    const x = bounds.footX - closeupWidth * 0.5;
    const y = bounds.footY - closeupHeight;

    renderContext.save();
    renderContext.imageSmoothingEnabled = false;
    renderContext.drawImage(
      phoneCloseupSprite,
      0,
      0,
      phoneCloseupSprite.width,
      phoneCloseupSprite.height,
      x,
      y,
      closeupWidth,
      closeupHeight,
    );
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

function drawExitMarkers() {
  sceneExits.forEach((exit) => {
    const center = gridToScreen(exit.x, exit.y);

    ctx.save();
    ctx.fillStyle = "rgba(37, 99, 235, 0.2)";
    ctx.strokeStyle = "rgba(29, 78, 216, 0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(center.x, center.y + tileHeight * 0.1, tileWidth * 0.34, tileHeight * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1d4ed8";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(exit.label, center.x, center.y - 8);
    ctx.restore();
  });
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

  if (!isPhoneMode) {
    checkSceneExit();
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(cameraState.x, cameraState.y);
  ctx.scale(cameraState.scale, cameraState.scale);
  drawSceneTexture();
  drawGrid();
  drawExitMarkers();
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

function checkSceneExit() {
  if (isLeavingScene) {
    return;
  }

  const exit = sceneExits.find(
    (candidate) => player.targetX === candidate.x && player.targetY === candidate.y && !player.isMoving(),
  );

  if (!exit) {
    return;
  }

  isLeavingScene = true;
  window.location.href = exit.href;
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
  startBgm();

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

function openConversation(contactId) {
  activeContactId = contactId;
  phonePanel.classList.add("chat-mode");
  phoneListView.hidden = true;
  conversationView.hidden = false;
  renderConversation();
  window.setTimeout(() => chatInput.focus(), 60);
}

function showPhoneList() {
  phonePanel.classList.remove("chat-mode");
  conversationView.hidden = true;
  phoneListView.hidden = false;
}

function renderConversation() {
  const contact = contacts[activeContactId] ?? contacts.lin;

  chatHeaderAvatar.className = `avatar ${contact.avatarClass}`.trim();
  chatHeaderAvatar.textContent = contact.initial;
  chatContactName.textContent = contact.name;
  chatContactSummary.textContent = contact.summary;

  document.querySelectorAll("[data-contact]").forEach((element) => {
    element.classList.toggle("active", element.dataset.contact === activeContactId);
  });

  chatThread.replaceChildren();

  contact.messages.forEach((message) => {
    chatThread.appendChild(createChatRow(contact, message));
  });

  chatThread.scrollTop = chatThread.scrollHeight;
}

function createChatRow(contact, message) {
  const row = document.createElement("div");
  row.className = message.from === "player" ? "chat-row from-player" : "chat-row";

  const bubble = document.createElement("p");
  bubble.className = "chat-bubble";
  bubble.textContent = message.text;

  const avatar = document.createElement("span");

  if (message.from === "player") {
    avatar.className = "avatar neutral";
    avatar.textContent = "我";
    row.append(bubble, avatar);
    return row;
  }

  avatar.className = `avatar ${contact.avatarClass}`.trim();
  avatar.textContent = contact.initial;
  row.append(avatar, bubble);
  return row;
}

function sendChatMessage() {
  const contact = contacts[activeContactId] ?? contacts.lin;
  const text = chatInput.value.trim();

  if (!text) {
    return;
  }

  contact.messages.push({ from: "player", text });
  chatInput.value = "";
  renderConversation();
  playSfx("send");
}

function openPhoneMode() {
  isPhoneMode = true;
  player.direction = "down";
  gameShell.classList.add("phone-mode");
  gameUi.setAttribute("aria-hidden", "false");
  showPhoneList();
  playSfx("modalOpen");
}

function closePhoneMode() {
  isPhoneMode = false;
  gameShell.classList.remove("phone-mode");
  gameUi.setAttribute("aria-hidden", "false");
  canvas.style.cursor = "default";
  showPhoneList();
  playSfx("modalClose");
}

closePhoneButton.addEventListener("click", closePhoneMode);

document.addEventListener("pointerdown", startBgm, { once: true });

document.querySelectorAll(".bottom-actions button, .phone-tabs button, .phone-actions button").forEach((button) => {
  button.addEventListener("click", () => playSfx("click"));
});

document.querySelectorAll(".bottom-actions button[data-href]").forEach((button) => {
  button.addEventListener("click", () => {
    window.location.href = button.dataset.href;
  });
});

document.querySelectorAll(".message-card").forEach((card) => {
  card.addEventListener("click", () => {
    playSfx("click");
    openConversation(card.dataset.contact);
  });
});

document.querySelectorAll(".rail-contact").forEach((contactButton) => {
  contactButton.addEventListener("click", () => {
    playSfx("click");
    activeContactId = contactButton.dataset.contact;
    renderConversation();
  });
});

backChatButton.addEventListener("click", () => {
  playSfx("click");
  showPhoneList();
});

chatComposer.addEventListener("submit", (event) => {
  event.preventDefault();
  sendChatMessage();
});

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
  phoneCloseupSprite,
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
