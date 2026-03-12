# My Workflow — 产品需求文档 (PRD)

> 统一的 AI 工作流平台：多模型、多项目、持久会话、Obsidian 资料中心、随处访问

---

## 1. 产品定位

My Workflow 是一个**个人 AI 工作流管理平台**，将分散在多个工具（Claude Web、Obsidian、IDEA、各家 AI）中的工作统一到一个可远程访问的系统中。

**核心价值：**
- 不再绑定某一台电脑，云端部署，手机/浏览器随时接入
- AI 对话永不丢失，断开后随时恢复
- 多家 AI 模型统一调度，充分利用免费额度
- Obsidian 作为唯一知识源，所有产出自动回流

---

## 2. 用户画像

独立开发者 / 多项目管理者，同时维护多个项目（~28 个 IDEA 项目），使用多种 AI 工具辅助开发、分析、写作、学习，需要在不同设备间无缝切换工作状态。

---

## 3. 功能全景

### 3.1 会话管理（Session Manager）

#### 3.1.1 会话生命周期
| 功能 | 描述 |
|------|------|
| 创建会话 | 基于模板创建新对话，自动配置模型、记忆策略、系统提示 |
| 持久化运行 | 会话进程常驻云端，关闭客户端不影响运行 |
| 断开/重连 | 随时断开，任意设备重新连接，上下文完整保留 |
| 暂停/恢复 | 手动暂停不活跃的会话，释放资源，需要时恢复 |
| 归档 | 完成的会话归档保存，可随时查阅历史 |

#### 3.1.2 会话模板（Session Templates）
预定义的对话类型模板，每个模板包含：

| 配置项 | 说明 |
|--------|------|
| `name` | 模板名称（如"英语润色"、"Bastion 开发"） |
| `provider` | 默认使用的 AI 模型 |
| `memory` | 记忆策略（见 3.1.3） |
| `system_prompt` | 系统提示词 |
| `context` | 关联的代码仓库 / Obsidian 笔记路径 |
| `obsidian` | Obsidian 读写策略（见 3.4） |
| `icon` / `color` | 视觉标识 |

**预设模板示例：**

| 模板 | 模型 | 记忆 | 用途 |
|------|------|------|------|
| 英语润色 | Gemini Free | 无状态 | 句子优化，用完即走 |
| 快速问答 | Grok Free | 滑动窗口(20条) | 日常问题 |
| 代码开发 | Claude | 全量记忆 | 项目级深度开发 |
| 市场分析 | Claude / Gemini | 全量+摘要 | 长期分析任务 |
| 技术调研 | OpenAI / Gemini | 全量记忆 | 技术方案对比 |
| 自定义 | 用户选择 | 用户配置 | 任意场景 |

#### 3.1.3 记忆策略（Memory Strategies）

| 策略 | 行为 | 适用场景 |
|------|------|---------|
| `none` | 无记忆，每次对话独立 | 英语润色、翻译、格式转换 |
| `sliding_window` | 保留最近 N 条消息 | 快速问答、日常闲聊 |
| `full` | 保留全部对话历史，超长时自动压缩摘要 | 项目开发、深度分析 |
| `full_with_summary` | 全量保留 + 每轮自动生成结构化摘要 | 市场分析、技术调研 |
| `external` | 对话本身不保留，全部写入 Obsidian | 纯知识生产型对话 |

---

### 3.2 多模型管理（Provider Router）

#### 3.2.1 支持的 AI 提供商

| Provider | 接入方式 | 免费额度 | 擅长领域 |
|----------|---------|---------|---------|
| **Claude** (Anthropic) | API | 付费 | 复杂推理、代码开发 |
| **Gemini** (Google) | API | 慷慨免费额度、长上下文 | 文档分析、翻译、总结 |
| **Grok** (xAI) | API | X 用户免费 | 快速问答、实时信息 |
| **OpenAI** (GPT) | API | 有限免费 | 通用任务、代码生成 |
| **DeepSeek** | API | 低价 | 中文场景、代码 |
| **自定义** | OpenAI 兼容接口 | — | 本地模型 / 其他服务 |

#### 3.2.2 统一接口层
- 所有模型统一为相同的对话协议（消息格式、角色、工具调用）
- 模型间差异在 adapter 层抹平，上层无感知
- 支持运行时切换模型（同一会话中途换模型）

#### 3.2.3 智能路由
```yaml
routing_rules:
  - match: { template: "english-polish" }  → provider: gemini
  - match: { template: "quick-ask" }       → provider: grok
  - match: { template: "code-dev" }        → provider: claude
  - match: { task_type: "long_document" }  → provider: gemini  # 长上下文优势
  - match: { budget_exceeded: true }       → provider: cheapest_available
  - fallback:                              → provider: user_default
```

#### 3.2.4 额度与用量管理
- 实时追踪每家 provider 的 token 用量
- 免费额度临近上限时自动预警
- 支持设置每日/每月预算上限
- 超限后自动降级到免费/低价模型
- 用量统计面板：按 provider / 按会话 / 按日期

---

### 3.3 Agent 开发管理

#### 3.3.1 项目绑定
- 每个开发类会话可绑定一个或多个 git 仓库
- Agent 在对应项目目录下执行操作
- 支持的操作：代码分析、生成、重构、测试、调试

#### 3.3.2 多项目并行
- 同时运行多个 agent 在不同项目上工作
- 每个 agent 独立的工作目录和上下文
- 全局面板查看所有 agent 状态

#### 3.3.3 任务队列
- 为 agent 排队任务，按顺序执行
- 支持定时任务（如每天凌晨跑一轮测试）
- 任务完成后自动通知

#### 3.3.4 Git 工作流集成
- Agent 完成开发后自动 commit
- 自动创建分支和 PR
- 代码变更摘要自动生成

---

### 3.4 Obsidian 资料中心

#### 3.4.1 Obsidian 作为知识源
Obsidian Vault 是整个系统的**单一知识存储**，所有 AI 产出最终都汇聚到这里。

**通过 MCP (Model Context Protocol) 实现双向集成：**

| 方向 | 功能 |
|------|------|
| **读取** | Agent 启动时自动加载关联的 Obsidian 笔记作为上下文 |
| **写入** | 对话中的有价值内容自动/手动写入 Obsidian |
| **搜索** | Agent 可搜索整个 Vault 查找相关资料 |
| **更新** | 修改已有笔记，追加新内容 |

#### 3.4.2 自动写入策略

| 策略 | 行为 | 触发条件 |
|------|------|---------|
| `false` | 不自动写入 | — |
| `manual` | 用户说"保存"时写入 | 用户指令 |
| `milestone` | 关键节点自动写入 | Agent 完成阶段性工作 |
| `always` | 每轮有价值的内容都写入 | 每次 AI 回复 |
| `smart` | AI 自动判断是否值得保存 | AI 评估内容价值 |

#### 3.4.3 Vault 结构约定
```
Obsidian Vault/
├── Projects/                    # 项目资料
│   ├── Bastion/
│   │   ├── 开发日志/            ← agent 自动写入
│   │   ├── 架构分析/            ← agent 产出
│   │   └── 需求文档/            ← 手写 + agent 辅助
│   ├── Accord/
│   └── ...
├── Knowledge/                   # 知识积累
│   ├── 英语学习/                ← 英语润色中的好句子
│   ├── 技术笔记/                ← 快速问答中有价值的内容
│   └── 市场研究/                ← 分析对话生成的报告
└── Workflow/                    # 工作流元数据
    ├── 每日摘要/                ← 每天自动生成
    ├── Agent 日志/              ← Agent 运行记录
    └── 任务看板.md              ← 全局任务状态
```

#### 3.4.4 每日自动摘要
- 每天结束时自动汇总当日所有会话的关键产出
- 生成结构化的每日摘要笔记到 Obsidian
- 包含：完成的任务、关键决策、待跟进事项

---

### 3.5 远程访问与通知

#### 3.5.1 访问方式
| 方式 | 场景 | 优先级 |
|------|------|--------|
| **CLI** | 主要操作入口，本地或 SSH 到云端 | P0 |
| **Web Dashboard** | 命令中心风格监控面板（方案 A），浏览器/手机查看状态 | P0 |
| **REST API** | 程序化调用、第三方集成、CLI 底层依赖 | P0 |
| **WebSocket** | 实时日志流、消息推送 | P1 |

> **决策记录（2026-03-11）：**
> - UI 选定方案 A（命令中心 / Mission Control 风格）
> - 交互方式：CLI 为主要操作入口，Web Dashboard 为监控和可视化
> - Dashboard 设计为可扩展，预留更多监控面板位置

#### 3.5.2 通知推送
- Agent 完成任务时推送通知
- Agent 出错/卡住时告警
- 每日摘要推送
- 支持渠道：浏览器通知 / Telegram / Bark / 邮件

---

### 3.6 云端部署与备份

#### 3.6.1 部署架构
- 单台云服务器（VPS）承载所有服务
- Docker Compose 一键部署
- 支持迁移：导出配置 + 数据，在新服务器恢复

#### 3.6.2 备份策略
| 内容 | 方式 | 频率 |
|------|------|------|
| Obsidian Vault | Git push 到远程仓库 | 每次变更 |
| 会话历史数据库 | SQLite 文件备份到 S3/OSS | 每日 |
| 服务器快照 | 云厂商快照功能 | 每周 |
| 配置文件 | Git 版本控制 | 每次变更 |

---

## 4. 非功能需求

| 维度 | 要求 |
|------|------|
| **响应速度** | Dashboard 页面加载 < 2s，对话消息实时推送延迟 < 500ms |
| **并发** | 支持同时运行 5-10 个 Agent 会话 |
| **数据安全** | API Key 加密存储，会话数据本地持有不上传第三方 |
| **可用性** | 服务崩溃自动重启，会话状态可恢复 |
| **可扩展** | 新增 AI Provider 只需实现 adapter 接口 |

---

## 5. 优先级规划

### Phase 1 — MVP（最小可用）
- [ ] 会话管理：创建、持久化、断开/重连
- [ ] 多模型接入：Claude + Gemini + Grok（至少 2 个）
- [ ] Web Dashboard：会话列表 + 对话界面
- [ ] 基础模板系统：3-5 个预设模板

### Phase 2 — 核心增强
- [ ] Obsidian MCP 集成：双向读写
- [ ] 记忆策略完整实现
- [ ] 智能路由 + 额度管理
- [ ] 通知推送

### Phase 3 — 高级功能
- [ ] Agent 开发管理（Git 集成、任务队列）
- [ ] 每日自动摘要
- [ ] 多 agent 协作
- [ ] 移动端优化

---

## 6. 技术选型（待定）

| 层 | 候选方案 |
|----|---------|
| **后端** | Node.js (Express/Fastify) / Python (FastAPI) / Go |
| **CLI** | Commander.js / Click (Python) / Cobra (Go) |
| **前端** | Next.js + Tailwind + shadcn/ui（方案 A 命令中心风格） |
| **数据库** | SQLite（轻量）/ PostgreSQL（如需更强查询） |
| **实时通信** | WebSocket / Server-Sent Events (SSE) |
| **AI 接入** | 各家官方 SDK + 统一 adapter 层 |
| **Obsidian** | MCP Server / Obsidian CLI / 直接文件操作 |
| **部署** | Docker Compose on VPS |
| **备份** | Restic / rclone → S3/OSS |

---

## 7. CLI 设计

CLI 是主要操作入口，所有功能都可通过命令行完成。

### 7.1 核心命令

```bash
# 会话管理
mw session list                    # 列出所有会话及状态
mw session new --template english  # 基于模板创建新会话
mw session attach bastion-dev      # 连接到一个运行中的会话
mw session detach                  # 断开（会话继续运行）
mw session pause bastion-dev       # 暂停会话
mw session resume bastion-dev      # 恢复会话
mw session archive bastion-dev     # 归档会话
mw session logs bastion-dev        # 查看会话日志

# 发送指令（不进入交互模式）
mw send bastion-dev "分析一下 auth 模块的安全性"
mw send english "Please help me polish: ..."

# 模板管理
mw template list                   # 列出所有模板
mw template create                 # 交互式创建模板
mw template edit english           # 编辑模板

# 模型/Provider 管理
mw provider list                   # 列出所有已配置的 AI 模型
mw provider usage                  # 查看用量统计
mw provider add gemini             # 添加新 provider

# 监控面板
mw dashboard                       # 启动 Web Dashboard
mw status                          # 终端内显示简要状态

# Obsidian
mw obsidian sync                   # 手动触发同步
mw obsidian search "auth 模块"     # 搜索 Obsidian 笔记

# 服务管理
mw server start                    # 启动后端服务
mw server stop                     # 停止
mw server status                   # 服务状态
```

### 7.2 终端状态视图 (`mw status`)

```
┌─ My Workflow Status ─────────────────────────────────┐
│                                                       │
│  Sessions:                                            │
│  ● bastion-dev     Claude    running  2h 13m          │
│  ● quick-ask       Grok      idle     —               │
│  ● marketing       Claude    running  1h 20m          │
│  ○ accord-dev      —         paused   —               │
│  ○ fortinac        —         paused   —               │
│                                                       │
│  Providers:                                           │
│  Claude   $2.30 / $10.00  ██████░░░░░░░░░░  23%      │
│  Gemini   free             ████████████████░  80%     │
│  Grok     free             ████░░░░░░░░░░░░  20%     │
│                                                       │
│  Obsidian: synced 3 min ago  │  Server: running       │
└───────────────────────────────────────────────────────┘
```

### 7.3 交互模式 (`mw session attach`)

```
╭─ bastion-dev (Claude) ─────────────────────────────╮
│ Memory: full (2.3k messages) │ Obsidian: auto-sync │
╰────────────────────────────────────────────────────╯

🤖 上次对话停在：正在分析 auth 模块的 TokenService...

> 继续重构 TokenService，加上 refresh token 的逻辑
🤖 好的，我来继续...

> /save   ← 手动保存当前内容到 Obsidian
✅ 已保存到 Projects/Bastion/开发日志/2026-03-11.md

> /switch gemini   ← 临时切换模型
🔄 切换到 Gemini

> /detach   ← 断开，会话继续保持
🔌 已断开。会话 bastion-dev 继续运行中。
```
