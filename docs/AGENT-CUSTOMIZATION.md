# Agent 可定制化设计

---

## 核心理念

每个 Agent 都是一个**配置文件**驱动的实例。你不写代码也能定制 agent 的行为。

---

## 1. Agent 配置结构

每个 agent 是一个 YAML 文件：

```
~/.my-workflow/
├── config.yaml              # 全局配置
├── providers/               # AI 模型配置
│   ├── claude.yaml
│   ├── gemini.yaml
│   └── grok.yaml
├── templates/               # 会话模板
│   ├── english-polish.yaml
│   ├── code-dev.yaml
│   └── quick-ask.yaml
├── agents/                  # 运行中的 agent 实例配置
│   ├── bastion-dev.yaml
│   └── marketing.yaml
├── plugins/                 # 自定义插件
│   ├── obsidian-sync.yaml
│   └── git-auto-commit.yaml
└── data/                    # 运行时数据
    ├── sessions/            # 会话历史
    └── logs/                # 日志
```

---

## 2. 会话模板（Template）— 定制对话类型

```yaml
# templates/english-polish.yaml
name: English Polish
description: 英语句子润色，无状态对话

# --- 模型配置 ---
provider: gemini
model: gemini-2.0-flash        # 具体模型（可选，不填则用 provider 默认）
fallback_provider: grok         # 主模型不可用时降级

# --- 记忆策略 ---
memory:
  strategy: none                # none | sliding_window | full | full_with_summary | external
  # sliding_window 时:
  # window_size: 20

# --- 系统提示 ---
system_prompt: |
  你是专业的英语润色助手。
  规则：
  1. 直接给出优化后的句子
  2. 简要说明改动原因（用中文）
  3. 如果原句没问题，说"原句已经很好"
  4. 给出 1-2 个替代表达

# --- 上下文注入 ---
context:
  files: []                     # 不需要加载文件
  obsidian_paths: []            # 不需要加载笔记

# --- Obsidian 集成 ---
obsidian:
  auto_save: false
  manual_save: true             # 用户说 /save 时保存
  save_target: Knowledge/英语学习/句子收集.md
  save_format: append           # append | new_file | replace

# --- 触发器 ---
triggers: []

# --- 显示 ---
ui:
  icon: ✏️
  color: "#4CAF50"
  pinned: true                  # 置顶显示
```

```yaml
# templates/code-dev.yaml
name: Code Development
description: 项目级深度开发

provider: claude
model: claude-sonnet-4-6

memory:
  strategy: full
  compress_after: 100           # 超过 100 条消息时自动压缩早期内容
  summary_model: gemini         # 用免费模型做摘要压缩，省钱

system_prompt: |
  你是一位高级软件工程师。
  规则：
  1. 先分析再动手
  2. 改动前说明原因
  3. 代码要有类型注解
  4. 关键变更写注释

# --- 创建实例时需要填的参数 ---
parameters:
  - name: project_path
    type: directory
    required: true
    description: 项目目录路径
  - name: language
    type: enum
    options: [java, typescript, python, go, rust]
    default: java
  - name: obsidian_project
    type: string
    required: false
    description: 关联的 Obsidian 项目文件夹名

context:
  files:
    - "{{project_path}}/README.md"
    - "{{project_path}}/CLAUDE.md"
  obsidian_paths:
    - "Projects/{{obsidian_project}}/"

obsidian:
  auto_save: milestone
  save_target: "Projects/{{obsidian_project}}/开发日志/"
  save_format: new_file         # 每次保存创建新文件
  filename_pattern: "{{date}}-{{summary}}.md"

triggers:
  - on: session_end
    action: git_commit_summary   # 会话结束时自动总结 git 变更
  - on: milestone
    action: obsidian_sync        # 关键节点同步到 Obsidian
```

---

## 3. Agent 实例配置 — 定制具体的 agent

从模板创建实例时，填入具体参数：

```bash
mw session new --template code-dev --name bastion-dev
# 交互式填写参数:
#   project_path: /Users/zliu/IdeaProjects/bastion-project
#   language: java
#   obsidian_project: Bastion
```

生成的实例配置：

```yaml
# agents/bastion-dev.yaml（自动生成，可手动编辑）
name: bastion-dev
template: code-dev
created: 2026-03-11T14:30:00+08:00

# 模板参数（实例化后的值）
parameters:
  project_path: /Users/zliu/IdeaProjects/bastion-project
  language: java
  obsidian_project: Bastion

# --- 可覆盖模板的任何配置 ---
# 比如这个项目想用 Claude Opus 而不是 Sonnet:
provider: claude
model: claude-opus-4-6

# 追加系统提示（在模板的基础上）
system_prompt_append: |
  这是一个 Java Spring Boot 项目，使用 Gradle 构建。
  数据库是 PostgreSQL。
  重点关注 com.bastion.auth 包。

# 追加上下文
context_append:
  files:
    - /Users/zliu/IdeaProjects/bastion-project/src/main/resources/application.yaml
```

---

## 4. 插件系统（Plugins）— 定制 agent 行为

插件是可复用的行为模块，挂载到 agent 的生命周期上。

```yaml
# plugins/obsidian-sync.yaml
name: obsidian-sync
description: 将 agent 产出同步到 Obsidian

triggers:
  - event: on_milestone           # agent 完成阶段性工作时
    action: save_to_obsidian
  - event: on_user_command        # 用户输入 /save 时
    command: /save
    action: save_to_obsidian
  - event: on_session_end         # 会话结束时
    action: generate_summary

actions:
  save_to_obsidian:
    type: mcp_call
    server: obsidian
    method: create_or_append_note
    params:
      path: "{{agent.obsidian.save_target}}"
      content: "{{last_ai_response}}"

  generate_summary:
    type: ai_call
    provider: gemini               # 用免费模型生成摘要
    prompt: |
      请总结以下对话的关键内容，生成一份结构化的笔记：
      {{session_history}}
    then:
      type: mcp_call
      server: obsidian
      method: create_note
      params:
        path: "{{agent.obsidian.save_target}}/{{date}}-总结.md"
```

```yaml
# plugins/git-auto-commit.yaml
name: git-auto-commit
description: Agent 完成代码修改后自动 commit

triggers:
  - event: on_milestone
    action: auto_commit
  - event: on_user_command
    command: /commit
    action: auto_commit

actions:
  auto_commit:
    type: shell
    commands:
      - cd {{agent.project_path}}
      - git add -A
      - git commit -m "{{ai_generate_commit_message}}"
    confirm: true                  # 执行前需要用户确认
```

```yaml
# plugins/notify-phone.yaml
name: notify-phone
description: Agent 完成或出错时推送通知到手机

triggers:
  - event: on_task_complete
    action: notify
  - event: on_error
    action: notify_error

config:
  channel: bark                    # bark | telegram | webhook
  bark_url: https://api.day.app/YOUR_KEY

actions:
  notify:
    type: http_post
    url: "{{config.bark_url}}/{{agent.name}} 完成/{{task_summary}}"
  notify_error:
    type: http_post
    url: "{{config.bark_url}}/{{agent.name}} 出错/{{error_message}}?sound=alarm"
```

在模板或 agent 实例中启用插件：

```yaml
# templates/code-dev.yaml 中
plugins:
  - obsidian-sync
  - git-auto-commit
  - notify-phone
```

---

## 5. 自定义命令（In-Session Commands）

在对话中可用的快捷命令，每个模板可定义自己的命令：

```yaml
# templates/code-dev.yaml 中
commands:
  /save:
    description: 保存当前内容到 Obsidian
    action: plugin.obsidian-sync.save_to_obsidian

  /commit:
    description: 自动 commit 当前变更
    action: plugin.git-auto-commit.auto_commit

  /switch <provider>:
    description: 切换 AI 模型
    action: builtin.switch_provider

  /context add <file>:
    description: 添加文件到上下文
    action: builtin.add_context

  /analyze:
    description: 分析整个项目结构
    action: ai_call
    prompt: |
      请分析 {{project_path}} 的项目结构，给出：
      1. 技术栈
      2. 模块划分
      3. 核心逻辑入口

  /review:
    description: Review 最近的 git 变更
    action: ai_call
    prompt: |
      请 review 以下 git diff：
      {{shell: cd {{project_path}} && git diff HEAD~1}}

  /test:
    description: 运行测试
    action: shell
    command: cd {{project_path}} && ./gradlew test
    show_output: true
```

```yaml
# templates/english-polish.yaml 中
commands:
  /formal:
    description: 用正式语气重写
    action: ai_call
    prompt: "请用正式商务英语重写上一条消息"

  /casual:
    description: 用口语化风格重写
    action: ai_call
    prompt: "请用日常口语风格重写上一条消息"

  /explain:
    description: 解释语法点
    action: ai_call
    prompt: "请详细解释上一次修改涉及的语法知识点"
```

---

## 6. 可定制维度总览

| 维度 | 在哪配置 | 示例 |
|------|---------|------|
| **用哪个模型** | template / agent | `provider: gemini` |
| **模型降级** | template | `fallback_provider: grok` |
| **记忆策略** | template | `memory.strategy: sliding_window` |
| **系统提示** | template / agent（可追加） | `system_prompt: ...` |
| **关联文件** | template / agent | `context.files: [...]` |
| **关联 Obsidian** | template / agent | `obsidian.save_target: ...` |
| **自动保存** | template / plugin | `obsidian.auto_save: milestone` |
| **Git 集成** | plugin | `git-auto-commit` |
| **手机通知** | plugin | `notify-phone` |
| **会话内命令** | template | `commands: { /review: ... }` |
| **触发器** | template / plugin | `triggers: [on_milestone, ...]` |
| **UI 外观** | template | `ui: { icon, color, pinned }` |
| **参数化** | template | `parameters: [{ name: project_path }]` |

---

## 7. 完整示例：从零创建一个自定义 agent

```bash
# 1. 创建模板
mw template create
# 交互式:
#   Name: 市场竞品分析
#   Provider: claude
#   Memory: full_with_summary
#   System prompt: (输入或从文件加载)
#   Obsidian auto-save: always
#   Plugins: obsidian-sync, notify-phone
# → 生成 templates/market-analysis.yaml

# 2. 编辑模板（如果需要精细调整）
mw template edit market-analysis
# → 打开 $EDITOR 编辑 YAML

# 3. 基于模板创建 agent 实例
mw session new --template market-analysis --name bastion-marketing
# 填入参数...

# 4. 开始对话
mw session attach bastion-marketing

# 5. 对话中使用自定义命令
> 帮我分析竞品 X 的定价策略
🤖 ...分析内容...

> /save
✅ 已保存到 Obsidian

# 6. 断开，agent 保持
> /detach
```
