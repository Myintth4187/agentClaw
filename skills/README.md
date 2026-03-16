# Project Skills

把你的自定义技能放在这里，容器启动时会自动复制到全局 skills 目录，在**平台技能**板块中供所有用户使用。

管理员可以在后台勾选控制哪些平台技能对用户可见。

## 当前技能列表

### Claude Code 官方开源技能

| 技能 | 描述 |
|------|------|
| `claude-api` | 使用 Claude API 构建应用 |
| `docx` | Word 文档处理 |
| `pptx` | PowerPoint 演示文稿处理 |
| `pdf` | PDF 文档处理 |
| `xlsx` | Excel 表格处理 |
| `canvas-design` | Canvas 设计生成 |
| `frontend-design` | 前端设计开发 |
| `webapp-testing` | Web 应用测试 |
| `web-artifacts-builder` | Web 产物构建 |
| `mcp-builder` | MCP (Model Context Protocol) 构建 |
| `algorithmic-art` | 算法艺术生成 |
| `theme-factory` | 主题工厂 |
| `slack-gif-creator` | Slack GIF 制作 |
| `brand-guidelines` | 品牌指南 |
| `internal-comms` | 内部通讯 |
| `doc-coauthoring` | 文档协作编写 |

来源：[Claude Code Skills](https://github.com/anthropics/claude-code-skills)

### OpenClaw 内置技能（容器适配版）

| 技能 | 描述 | 需求 |
|------|------|------|
| `skill-creator` | 创建、编辑、审核 AgentSkills | 无 |
| `github` | GitHub 操作（gh CLI） | gh |
| `summarize` | 总结 URL/播客/文档 | 无 |
| `weather` | 天气查询（via wttr.in） | curl |
| `healthcheck` | 健康检查和安全审计 | 无 |
| `model-usage` | 模型使用统计 | codexbar |
| `tmux` | tmux 会话控制 | tmux |
| `video-frames` | 视频帧提取 | ffmpeg |
| `discord` | Discord 集成 | webhook |
| `slack` | Slack 集成 | webhook |
| `notion` | Notion 集成 | API token |

## 目录结构

```
skills/
├── skill-creator/          # 自定义 skill-creator（优先使用，替代内置版本）
│   ├── SKILL.md
│   └── scripts/
├── my-custom-skill/        # 你的其他技能
│   ├── SKILL.md
│   └── scripts/
└── README.md
```

## 规则

1. **skill-creator**: 如果有，会完全替代 OpenClaw 内置的版本
2. **其他技能**: 会复制到全局 skills，所有用户都能看到和使用
3. **命名**: 目录名就是技能名（小写，用连字符分隔）

## 示例

创建新技能最简单的方式是让 skill-creator 帮你生成：

```bash
cd skills
npx skill-creator init my-new-skill
```

或者直接手动创建：

```bash
mkdir -p my-skill/scripts
cat > my-skill/SKILL.md << 'SKILL'
# my-skill

简介...

## 使用

```bash
python3 scripts/main.py
```
SKILL

touch my-skill/scripts/main.py
```
