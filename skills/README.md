# Project Skills

把你的自定义技能放在这里，容器启动时会自动复制到全局 skills 目录。

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
