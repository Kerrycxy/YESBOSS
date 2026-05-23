# 等距视角 Canvas 场景开发 SOP

## 目标

把一张等距视角办公室场景图，接入 HTML5 Canvas，并实现角色移动、方向动画、家具碰撞与调试校准。

核心原则：

- 背景和家具可以是一张整图。
- 角色作为独立精灵层在 Canvas 中移动。
- 碰撞只判断角色脚底格子，身体允许遮挡家具。
- 场景参数全部配置化，避免把坐标写死在逻辑里。

## 1. 项目骨架

建立基础文件：

- `index.html`：Canvas 入口，加载配置和主逻辑。
- `style.css`：页面和 Canvas 尺寸样式。
- `main.js`：渲染循环、角色移动、碰撞检测。
- `scene-config.js`：浏览器直接运行用的场景配置。
- `scene-config.json`：给工具和后续工程导入用的同款配置。
- `assets/`：放背景图、角色精灵、验证截图。

启动本地服务：

```bash
python3 -m http.server 8000
```

访问：

```text
http://localhost:8000/index.html
```

## 2. 背景贴图接入

把办公室背景图放入：

```text
assets/office-scene.png
```

如果原图里已经有人物，需要额外生成或修图出无人版背景：

```text
assets/office-scene-clean.png
```

配置中指向无人版：

```js
image: {
  src: "./assets/office-scene-clean.png",
  width: 1024,
  height: 576,
}
```

Canvas 渲染顺序：

1. 清空画布。
2. 绘制背景图。
3. 绘制调试网格或碰撞标记。
4. 绘制角色。

## 3. 场景网格校准

根据地板线估算等距参数：

```js
grid: {
  width: 18,
  height: 13,
  origin: { x: 500, y: 120 },
  tileWidth: 64,
  tileHeight: 32,
}
```

等距坐标转换：

```js
function gridToScreen(gridX, gridY) {
  return {
    x: originX + (gridX - gridY) * (tileWidth / 2),
    y: originY + (gridX + gridY) * (tileHeight / 2),
  };
}
```

校准方法：

- 打开 `?debug=grid`。
- 检查蓝色网格是否贴合地板砖线。
- 如果整张网格偏移，调 `origin.x` / `origin.y`。
- 如果格子大小不对，调 `tileWidth` / `tileHeight`。

调试地址：

```text
http://localhost:8000/index.html?debug=grid
```

## 4. 角色精灵制作

先生成四方向精灵表：

- 第 1 行：面向前方/down。
- 第 2 行：背向/up。
- 第 3 行：朝左/left。
- 第 4 行：朝右/right。
- 每行 3 帧：走路帧 1、站立帧、走路帧 2。

如果使用绿幕生成：

1. 生成绿色背景精灵表。
2. 本地抠绿生成透明 PNG。
3. 重新标准化每帧：
   - 统一帧尺寸。
   - 统一人物高度。
   - 统一脚底线。
   - 保留头发边缘。

最终使用：

```text
assets/character-spritesheet-normalized.png
```

配置示例：

```js
character: {
  sprite: {
    src: "./assets/character-spritesheet-normalized.png",
    columns: 3,
    rows: 4,
    renderWidth: 142,
    renderHeight: 170,
    anchorX: 0.5,
    anchorY: 1,
    footOffsetY: 12,
    idleFrame: 1,
    walkFrames: [0, 1, 2, 1],
    animationFps: 7,
    directionRows: {
      down: 0,
      up: 1,
      left: 2,
      right: 3,
    },
  },
}
```

## 5. 角色移动逻辑

角色维护两组坐标：

- `targetX / targetY`：逻辑目标格。
- `renderX / renderY`：实际渲染位置。

按键时：

1. 根据方向计算目标格。
2. 更新角色朝向。
3. 调用 `canMove(nextX, nextY)`。
4. 只有目标格可走时，才更新 `targetX / targetY`。

每帧更新时：

- 使用 `requestAnimationFrame`。
- 让 `renderX / renderY` 匀速接近目标格。
- 移动中播放走路帧，停止时回到站立帧。

## 6. 家具碰撞规则

碰撞判断只看脚底目标格：

```js
function checkCollision(x, y) {
  if (!isInsideMap(x, y)) return false;
  return collisionMap[y][x] === 1;
}
```

移动边界：

```js
function canMove(x, y) {
  if (!isInsideMap(x, y)) return false;
  return !checkCollision(x, y);
}
```

重要规则：

- 脚不能踩到桌子、厨房柜台、花盆、饮水机、柜子、垃圾桶等家具占用格。
- 脚可以踩到家具旁边的空地。
- 角色身体可以遮挡家具，这是等距游戏的正常视觉效果。

不要用大矩形粗暴封家具。优先使用精确 `cells`：

```js
{
  id: "meeting-table-and-chairs",
  label: "meeting table and chairs",
  cells: [
    [10, 9],
    [11, 9],
    [12, 9],
    [13, 9],
  ],
}
```

## 7. 碰撞调试

调试模式：

```text
http://localhost:8000/index.html?debug=grid
```

推荐显示方式：

- 蓝线显示地板格子。
- 红色小椭圆显示“脚底禁区”。
- 不要用整块红色地砖判断视觉，因为家具本体有高度和透视，会造成误判。

校准步骤：

1. 打开 `?debug=grid`。
2. 先校准网格是否对齐地板。
3. 再看红色脚底禁区是否落在家具底部。
4. 如果红色区域挡住明显空地，删掉对应 cell。
5. 如果角色脚能踩进家具底部，补上对应 cell。
6. 反复按键验证。

## 8. 验证清单

每次改完至少验证：

- `node --check main.js`
- `node --check scene-config.js`
- `scene-config.json` 能被 `JSON.parse` 正常解析。
- 背景图请求返回 200。
- 精灵图请求返回 200。
- 起点不在障碍格。
- 桌子、柜台、花盆、饮水机等核心家具格不可走。
- 家具旁边空地可走。
- 四方向切换时人物大小一致。
- 头发、脚底没有被裁切。
- 人物脚底贴地，不悬空。

## 9. 常见问题

### 看不到贴图

检查配置路径是否真实存在：

```text
assets/office-scene-clean.png
```

### 角色像飘着走

检查：

- `anchorY` 是否为 `1`。
- `footOffsetY` 是否合适。
- 精灵表每帧脚底线是否统一。
- 移动是否使用匀速接近，而不是无限缓动。

### 方向切换大小不一致

重新标准化精灵表：

- 每帧统一透明画布大小。
- 每帧统一人物可见高度。
- 每帧统一脚底 y 坐标。

### 碰撞位置不对

先判断是哪一类问题：

- 如果所有格子整体偏移，调 `origin`。
- 如果格子间距不对，调 `tileWidth/tileHeight`。
- 如果只有家具禁区不准，调 `obstacles[].cells`。

## 10. 推荐工作顺序

1. 先让背景图正确显示。
2. 校准网格。
3. 接入角色精灵。
4. 调整脚底锚点。
5. 实现移动动画。
6. 添加家具碰撞。
7. 打开调试模式逐格修碰撞。
8. 关闭调试显示，做最终视觉验证。

