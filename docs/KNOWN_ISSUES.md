# 已知问题 & 待完成功能

## 🔴 未完成

### 第三方技能安装（skills.sh）不落地到 workspace

**现象**：在「技能搜索」页搜索并点击安装第三方技能（来自 skills.sh），显示安装成功，但技能不出现在「已安装」列表，文件管理器也看不到。

**根本原因**：
`skills add -g` 会把技能装到 `$HOME/.openclaw/skills/`（容器内是 `/root/.openclaw/skills/`），而平台的实际数据在 `OPENCLAW_HOME=/Users/wu/.openclaw`（宿主机 bind mount）。两个路径不同，snapshot + rename 的逻辑无法从容器内 `/root/.openclaw/skills/` 取到内容再移到用户 workspace。

**涉及文件**：`bridge/routes/marketplaces.ts` — `POST /api/marketplaces/skills/install`

**可能的修复方向**：
1. 在用户沙盒容器内执行 `npx skills add`（沙盒的 workspace 已挂载为工作目录，不带 `-g` 就能装到正确位置）— 需要通过 Docker API exec 进沙盒容器，沙盒可能未运行时需先启动
2. 用 Agent 在聊天里自己运行 `skills add`（绕过 UI 安装，直接让 Agent 帮装）
3. 修改 `skills` CLI 安装路径（暂无文档支持自定义 global 路径）

---

## 🟡 功能占位 / 降级实现

### 技能提交 AI 自动审核

**现象**：用户提交技能后，AI 审核步骤跳过，直接等待管理员手动审核。

**位置**：`platform/app/routes/skills.py` — `_ai_review_skill()` 函数返回 `None`

**说明**：框架已搭好（`ReviewTask` 表、`skill-reviewer` agent、审核队列接口都在），只差把 LLM 调用接进去。

---

### URL 提交技能不拉取 SKILL.md

**现象**：用户通过 source_url 提交技能时，平台不会去拉取 SKILL.md 内容，无法触发 AI 审核。

**位置**：`platform/app/routes/skills.py` — `submit_skill()` 里的 TODO

---

### Dashboard 数据待确认

**现象**：仪表盘统计数据（用户数、会话数、Agent 数等）需确认是读取真实数据库还是硬编码。

**位置**：`platform/app/routes/admin.py` 对应接口 + `frontend/src/pages/Dashboard.tsx`

---

### 知识库：仅 Markdown 可被 Agent 检索，暂不对用户开放

**现状**：
- `/knowledge` 页面目前仅管理员可见（`App.tsx` 有 `RequireAdmin`）
- 底层复用 filemanager 接口，本质是文件管理器套壳，存储路径为 `workspace-{agentId}/knowledge/`
- OpenClaw 原生 memory 系统（`memory_search` / `memory_get`）**只索引 `.md` 文件**，非 md 文件不会被 Agent 搜索到

**与 OpenClaw 原生 memory 对接的分析**：

OpenClaw 原生 memory 系统已相当完善（BM25 + 向量混合检索、时间衰减、MMR 去重），但有几个限制：
1. 只能索引 Markdown 文件，PDF/Word/CSV 等无法直接索引
2. 需要配置 embedding provider API key（OpenAI/Gemini/Voyage/Mistral 或本地 GGUF）
3. `MEMORY.md` 和 `memory/YYYY-MM-DD.md` 是 Agent 自管理区域，不应被 UI 覆写
4. 设计面向短笔记，索引大文档（万字以上）效果一般

**推荐的知识库升级路线**（暂不实现，记录设计思路）：

**阶段 1（最小改动）**：上传 .md 文件到 `memory/docs/` 子目录，OpenClaw 自动索引。
- 只改前端上传目标路径
- 前端明确提示"仅 .md 文件可被 Agent 检索"

**阶段 2（支持多格式）**：platform gateway 加预处理层
- 用户上传 PDF/Word/CSV → Python 提取文本 → 写入 `memory/docs/{name}.md`
- 原始文件保留在 `knowledge/` 供下载
- 依赖：`PyMuPDF` / `python-docx` / `pandas`

**阶段 3（Agent 精读）**：上传后异步通知 Agent
- Agent 在沙盒中读取原文件，生成结构化 Markdown 笔记
- 比机械提取质量更高，支持图片（多模态）
- 代价：消耗 LLM token，异步不即时

**当前不实现的原因**：功能定义尚未明确，暂保持现状（filemanager 套壳 + admin only）。

**位置**：`frontend/src/App.tsx`、`frontend/src/pages/KnowledgeBase.tsx`、`bridge/routes/filemanager.ts`

---

### 文件管理器工作区路径不一致

**现象**：admin 用户的"文件管理器"显示的根路径与普通用户不同，且部分情况下可能显示错误的 workspace 路径。

**位置**：`bridge/routes/filemanager.ts`

**根本原因**：
- `main` agent 的 workspace 在 `~/.openclaw/workspace/`
- 普通用户 agent 的 workspace 在 `~/.openclaw/workspace-<agentId>/`
- filemanager 路由通过 `X-Agent-Id` 头区分，但 admin 通过 agent 管理页面访问时可能传入错误的 agentId

**调查建议**：确认 `filemanager.ts` 中 `buildRootDir(agentId)` 的分支逻辑，以及 admin 用 file manager 时实际传递的 agentId。

---

### 聊天输入框"/"命令自动补全未实现

**现象**：在聊天输入框输入 `/` 时，没有弹出技能或命令选择器（其他平台常见的 slash command UX）。

**位置**：`frontend/src/pages/Chat.tsx`、`frontend/src/components/ChatDrawer.tsx`

**待确认需求**：
1. 弹出列表的内容范围：只显示已安装的技能？还是包含内置命令（`/help`, `/clear` 等）？
2. 实现方式：前端本地过滤已缓存的技能列表，还是实时调用 `listSkillsForAgent()`？
3. 命令触发后是展开为提示词模板，还是直接调用技能的 agent 指令？

---

### AuditLog 页面未接入

**现象**：`frontend/src/pages/AuditLog.tsx` 存在但未加入路由，内部使用硬编码 mock 数据，没有实际 API 调用。

**说明**：DB 中有 `AuditLog` 模型，后端数据已有，前端页面需要重写并注册路由。

---

## 🟠 待实现功能

*(本节为空 — 所有待实现功能已完成，见下方修复记录)*

---

## ✅ 近期修复记录

| 时间 | 问题 | 修复 |
|------|------|------|
| 2026-03-17 | AdminSkills 精选与审核耦合 | `approve_skill_submission` 不再自动设 `is_featured`；新增独立"标记精选"按钮；删除 toggle 旁多余"可见"文字 |
| 2026-03-17 | 管理员无法测试安装待审核技能 | 新增 `POST /api/admin/skills/submissions/{id}/test-install` 接口 + AdminSkills 测试安装按钮 |
| 2026-03-17 | 容器状态栏用 platform UUID 查 bridge 导致全部 unknown | `admin.py` 改为先查 `user_to_openclaw_id` 映射再请求 `/api/agents/{openclaw_agent_id}/status` |
| 2026-03-17 | AgentCreate 表单含多余 AgentID 字段 | 移除 AgentID 输入框，改为 slug 自动预览（后端自动生成）|
| 2026-03-17 | 每用户最多 1 个 Agent | `settings.max_agents_per_user=5` 可通过环境变量 `PLATFORM_MAX_AGENTS_PER_USER` 覆盖 |
| 2026-03-17 | AgentDetail 只对 admin 开放，普通用户无法编辑 SOUL.md | 移除 RequireAdmin 限制，添加文件编辑能力（textarea + setAgentFile） |
| 2026-03-17 | Sessions 页面缺少按用户筛选 | Admin 新增"用户"下拉，通过 `/api/admin/user-agents` 联动 agent 过滤 |
| 2026-03-17 | ChatDrawer 使用 1s 轮询，响应慢无 Markdown 渲染 | 接入 WebSocket 实现（challenge/response 握手）+ react-markdown + 工具调用状态展示 |
| 2026-03-17 | 新建 Agent 自动写入 SkillClaw soul | 注册时第一个 agent 保留 SkillClaw soul；用户手动新建的 agent 传 `set_soul=False` |
| 2026-03-17 | 技能管理待审核详情为空 | 后端补全 `file_path`/`ai_review_result` 字段返回；新增 `/content` 接口读 SKILL.md；前端加展开详情、AI 审核结果展示 |
| 2026-03-17 | 精选技能安装 404 `Skill files not found` | `install_curated_skill` 用了 `user.id` 而非 `openclaw_agent_id`；本地文件不存在时缺少 fallback |
| 2026-03-17 | 沙盒报错 `Sandbox image not found: openclaw-sandbox:agentclaw` | 镜像 tag 从 `skillclaw` 改名后未重新 tag，执行 `docker tag` 修复 |
| 2026-03-17 | 选择供应商弹窗透明 | `bg-bg-overlay` Tailwind v4 循环变量 bug，改为 `bg-black/40` |
| 2026-03-17 | 全站样式丢失（仪表盘只剩线条） | 批量迁移旧暗色 class（`bg-dark-card` 等）到双主题 CSS 变量 |
| 2026-03-17 | AgentDetail 文件列表/内容无法加载 | `store/agents.ts` 适配 bridge 返回的平坦数组格式；`AgentDetail.tsx` 修正文件内容读取路径 |
| 2026-03-17 | 技能启用/禁用 toggle 不直观 | 改为 ToggleLeft/ToggleRight 图标 + "已启用"/"已禁用" 文字 |
| 2026-03-17 | ChatDrawer 从 Agents 页面打开复用旧 session | 传入唯一 `sessionKey`（`agent:{id}:session-{timestamp}`），每次打开新建会话 |
| 2026-03-17 | 会话列表未按时间排序，不自动选中最新 | `Chat.tsx` 按 `updated_at` 降序排列，`useEffect` 自动 load 第一条 |
| 2026-03-17 | Chat.tsx 助手消息无 Markdown 渲染 | 引入 `react-markdown` + `remark-gfm`，assistant 消息用 `<ReactMarkdown>` 渲染 |
| 2026-03-17 | 侧边栏收起/展开无动画 | 从条件渲染改为 CSS `transition`（width + opacity + maxWidth），图标改 PanelLeftClose/Open |
| 2026-03-17 | CronJobs 不支持多 Agent 管理 | Bridge 新增 `/agents/:agentId/cron/...` 路由；前端加 Agent 选择器；移除"发送到渠道"选项 |
| 2026-03-17 | Agent 数量上限硬编码为 1 | `settings.max_agents_per_user=5`；新增 `GET/PUT /api/admin/config`；SystemSettings 加平台配置区块 |
| 2026-03-17 | Markdown 代码块背景色在浅色模式下近乎白色 | 新增 `--color-bg-code` CSS 变量（浅色 `#dde3ed` / 深色 `#0d1321`），替换 `bg-bg-base` |
| 2026-03-17 | Chat 页面多 Agent 无法筛选 | 会话侧栏顶部新增 Agent 过滤 pills（>1 个 Agent 时显示） |
| 2026-03-17 | Chat 页面无工具调用状态 | WS 监听 `tool.use.start`/`tool.use.end` 事件，显示"正在调用/已完成"状态行 |
| 2026-03-17 | Cron 定时任务仅管理员可用 | App.tsx `/cron` 路由已移出 `RequireAdmin`，对所有用户可见 |
| 2026-03-17 | API 访问页面功能不全 | `ApiAccess.tsx` 已有完整的 Token 生成 + Agent ID 展示 + Python 调用示例 |
