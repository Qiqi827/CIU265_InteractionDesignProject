# Typewriter — Public Newsroom Desk

CIU265 互动设计展览原型：**新闻编辑台 + 物理打字机发布**。参观者在 iPad 上组合故事变量、生成档案风格新闻草稿；按下打字机按键后，稿件发布到本地新闻室显示屏，并可同步推送到终端大屏（Supabase Realtime）。

本目录是 **Typewriter 子项目** 的根目录，位于仓库 `CIU265_InteractionDesignProject/Typewriter/`。

---

## 展览工作流

```text
iPad /editor
  → 选择 Story Fragment + Subject + Where + Time + Tone
  → 生成标题与正文预览
  → Socket: draft:send（草稿进入「待发布」）

本地 /display（新闻室电脑）
  → 显示等待中的草稿

物理打字机 / 发布触发
  → Arduino 串口发送 PUBLISH，或 /display 上的备用按钮，或 POST /api/publish
  → 服务器发布稿件
  → 更新 /display 上的已发布文章
  → （可选）写入 Supabase frontpage_articles → CIU265_IXDProject_Web 终端大屏实时更新
```

**要点：** iPad 只负责**提交草稿**；真正**发布**必须由新闻室侧触发（打字机按键或 display 备用操作），不会在编辑端自动上墙。

---

## 目录结构

```text
Typewriter/
├── server.js                 # Express + Socket.IO 主服务；串口监听；发布逻辑
├── package.json
├── .env.example              # 环境变量模板（复制为 .env，勿提交密钥）
│
├── data/
│   ├── newsConfig.json       # 编辑变量库：故事片段、主题、地点、时代、语气、生成模板
│   └── terminalConfig.json   # 终端大屏（Supabase）推送配置
│
├── lib/
│   ├── configLoader.js       # 加载与缓存 newsConfig.json；选项解析
│   ├── templateEngine.js     # 模板填充、标签文案（服务端）
│   ├── newsGenerator.js      # 根据所选变量生成 headline / body / summary
│   ├── state.js              # 房间状态：idle / draft_waiting / published
│   └── terminalPublisher.js  # 发布时写入 Supabase（终端墙）
│
├── public/                   # 静态前端
│   ├── editor.html           # 编辑台（iPad）
│   ├── display.html          # 本地新闻室监视器
│   ├── css/
│   │   ├── common.css
│   │   ├── editor.css
│   │   └── display.css
│   └── js/
│       ├── editor.js         # 变量选择、草稿预览、draft:send
│       ├── display.js        # 草稿/已发布视图、发布与重置
│       └── templateEngine.js # 浏览器端模板引擎（须与 lib/templateEngine.js 逻辑一致）
│
└── scripts/
    └── test-terminal-connection.js   # 测试 Supabase 终端推送
```

---

## 页面与路由

| 地址 | 说明 |
|------|------|
| `/` | 重定向到 `/editor` |
| `/editor` | **Public Newsroom Desk** — 展览用编辑台（iPad 横屏） |
| `/display` | **本地新闻室** — 显示待发布草稿与最近发布稿 |
| `GET /api/config` | 返回 `newsConfig.json`（供 editor 加载） |
| `GET /api/terminal` | 终端配置公开信息（不含密钥） |
| `POST /api/publish` | HTTP 触发发布（调试用） |

Socket.IO 事件（简要）：

| 事件 | 方向 | 作用 |
|------|------|------|
| `room:update` | 服务器 → 客户端 | 同步房间快照（草稿 / 已发布） |
| `draft:send` | editor → 服务器 | 提交完整草稿 |
| `publish:trigger` | display → 服务器 | 触发发布 |
| `room:reset` | display → 服务器 | 重置为 idle |

---

## 环境要求

- **Node.js** ≥ 18
- 同一局域网内：iPad、新闻室电脑、（可选）Arduino 串口线
- 推送终端大屏时：Supabase 项目与 `CIU265_IXDProject_Web` 使用同一数据库

---

## 安装与启动

在 `Typewriter/` 目录下：

```powershell
npm install
copy .env.example .env
# 编辑 .env，填入 SUPABASE_SERVICE_ROLE_KEY（仅需终端推送时）
npm start
```

默认端口 **3000**（可通过环境变量 `PORT` 修改）。

启动后控制台会打印：

- Editor：`http://localhost:3000/editor`
- Display：`http://localhost:3000/display`

展览现场建议将 iPad 与新闻室电脑都指向**运行 server 的那台机器的局域网 IP**，例如 `http://192.168.x.x:3000/editor`。

---

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `SUPABASE_SERVICE_ROLE_KEY` | 终端推送时必填 | Supabase **Secret / service_role** 密钥，仅服务器使用，勿提交到 Git |
| `SUPABASE_URL` | 否 | 覆盖 `terminalConfig.json` 中的 URL |
| `TERMINAL_SESSION_ID` | 否 | 固定展览 session UUID；不设则使用数据库中的 active session |
| `PORT` | 否 | HTTP 端口，默认 `3000` |
| `SERIAL_PORT` | 否 | Arduino 串口，如 `COM3`（Windows）或 `/dev/ttyUSB0`（Linux）。未设置则禁用串口，可用 display 备用发布 |

复制 `.env.example` 为 `.env` 后按需填写。`.env` 已在 `.gitignore` 中，请勿把真实密钥提交进仓库。

---

## 配置文件说明

### `data/newsConfig.json`

展览的**编辑数据库**，包含：

- **labels** — 草稿/文章免责声明、fact notice 等文案
- **subjects** — 报道焦点（Subject / focus）
- **locations** — 场景（Where / scene）
- **times** — 时代滤镜（Time filter）
- **tones** — 编辑立场（Tone / editorial stance）
- **storyFragments** — 故事片段；每条含 `allowedSubjects`、`allowedLocations`、`allowedTimes`、`allowedTones` 等约束
- **generationTemplates** — `headlineTemplates`、`bodyTemplates`、`editorSummaryTemplates` 等，占位符如 `{subjectTitle}`、`{locationTitle}`

修改后**重启 server** 或请求 `GET /api/config`（editor 启动时拉取）即可生效。`configLoader` 会按文件修改时间缓存。

### `data/terminalConfig.json`

控制发布到 **CIU265_IXDProject_Web** 的行为：

- `enabled` — 是否尝试 Supabase 推送
- `supabaseUrl`、`table`、`sessionsTable`
- `useActiveSession` / `sessionId` — 关联哪一场展览 session
- `terminal` — 终端项目名称与本地预览 URL

---

## 编辑台（/editor）使用说明

1. 打开 `/editor`，加载 `newsConfig.json`。
2. 依次选择（左侧可滚动）：
   - **Story fragment** — 事件基底；切换后会清空与该片段不兼容的其它选项
   - **Subject / focus**
   - **Where / scene**
   - **Time filter**
   - **Tone / editorial stance**
3. 右侧 **Draft board** 实时显示已选变量；全部选完后显示标题与短文预览。
4. 点击 **Send to newsroom** — 草稿经 Socket 送到服务器，本地 `/display` 进入「待发布」状态。
5. 在新闻室按下**打字机按键**（或 display 备用发布）后，稿件才会正式发布。

生成逻辑：`public/js/templateEngine.js` 与 `lib/templateEngine.js` + `lib/newsGenerator.js` 需保持同步。

---

## 本地显示屏（/display）使用说明

- 连接同一 server 的 Socket.IO，自动同步 `room:update`。
- **无草稿时**：空闲或展示上一篇已发布稿。
- **有草稿待发布时**：显示编辑台发来的预览；等待物理发布。
- 提供**发布**与**重置**操作（串口未连接时的备用路径）。

---

## Arduino 串口

在 `.env` 中设置：

```env
SERIAL_PORT=COM3
```

固件在串口发送一行 `PUBLISH`（换行结尾，波特率 9600）时，服务器执行与 `publish:trigger` 相同的发布流程。

未配置 `SERIAL_PORT` 时，串口监听不启动；请使用 display 上的发布按钮或 `POST /api/publish` 调试。

---

## 终端大屏（CIU265_IXDProject_Web）

关联项目路径（同级仓库）：`CIU265_IXDProject_Web/`。

发布成功后，`terminalPublisher` 向 Supabase 表 `frontpage_articles` 插入记录；终端网页通过 Realtime 订阅更新。

测试连接：

```powershell
npm run test:terminal
```

需已配置 `SUPABASE_SERVICE_ROLE_KEY` 与有效的 `terminalConfig.json`。

本地预览终端页（示例，端口以你本地静态服务为准）：

```powershell
# 在 CIU265_IXDProject_Web 目录
python -m http.server 5500
```

打开 `http://localhost:5500/`（参见该仓库 README）。

---

## 与父仓库的关系

本 Typewriter 项目位于：

```text
CIU265_InteractionDesignProject/
├── Typewriter/          ← 本 README 所在目录
└── …（其它展览资源）
```

终端展示站点为独立仓库/目录：**CIU265_IXDProject_Web**（Supabase 浏览器端使用 **publishable** 密钥；Typewriter 服务端使用 **service_role / secret** 密钥）。

---

## 常见问题

**Editor 显示 “Could not load editorial database”**  
→ 确认 `npm start` 已运行，且 iPad 能访问 server 的 IP 与端口。

**Send 成功但 display 无变化**  
→ 检查是否同一 server、同一网络；浏览器控制台是否有 Socket 错误。

**发布成功但终端墙无更新**  
→ 检查 `.env` 中 `SUPABASE_SERVICE_ROLE_KEY`、`terminalConfig.json` 的 `enabled` 与 session；运行 `npm run test:terminal`。

**串口无反应**  
→ 确认 `SERIAL_PORT`、波特率 9600、Arduino 发送的是 `PUBLISH` 加换行。

---

## 许可与展览说明

本项目为课程展览原型。`newsConfig.json` 中的文案为**档案启发式虚构报道**，非真实历史新闻。展览现场请配合免责声明使用。
