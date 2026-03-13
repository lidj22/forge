# Multi-Agent Workflow (Roadmap)

> 让多个 Claude Code 实例协作完成复杂任务，相互传递信息和中间产物。

## 动机

当前的 Flow 系统是线性的：每个 step 独立运行一个 Claude Code，step 之间没有数据传递。真实的复杂工程场景需要：

- **Agent A** 做架构设计 → 把设计文档传给 **Agent B** 写代码 → **Agent C** review + 测试
- 多个 Agent 并行工作在不同模块，通过共享 artifact 协调
- Agent 完成后触发下游 Agent，形成 DAG（有向无环图）执行流

## 设计分析

### 核心概念

```
Pipeline (一次执行实例)
  └─ Workflow (YAML 定义)
       └─ Node (一个 Agent 节点)
            ├─ inputs:  从上游节点或用户获取
            ├─ action:  运行 Claude Code prompt
            ├─ outputs: 产出 artifact（文本、文件、diff）
            └─ routes:  根据条件决定下游节点
```

**与现有系统的关系：**
- `Node` 对应现有的 `Task`（一次 Claude Code 执行）
- `Workflow` 扩展现有的 `Flow`（从线性 steps → DAG nodes）
- `Pipeline` 是新增的，表示一次 workflow 运行实例

### YAML 定义格式

```yaml
name: feature-implementation
description: "从需求到 PR 的完整流程"

# 全局变量，所有节点可用
vars:
  project: my-app

nodes:
  architect:
    project: "{{vars.project}}"
    prompt: |
      分析以下需求并输出技术方案文档（markdown），包括：
      1. 架构设计
      2. 需要修改的文件列表
      3. 接口定义
      需求：{{input.requirement}}
    outputs:
      - name: design_doc
        extract: result  # 从 Claude 的 result 中提取

  implement:
    project: "{{vars.project}}"
    depends_on: [architect]
    prompt: |
      按照以下技术方案实现代码：
      {{nodes.architect.outputs.design_doc}}
    outputs:
      - name: diff
        extract: git_diff

  review:
    project: "{{vars.project}}"
    depends_on: [implement]
    prompt: |
      Review 以下代码改动，检查：
      1. 是否符合设计方案
      2. 是否有 bug 或安全问题
      3. 测试覆盖

      设计方案：
      {{nodes.architect.outputs.design_doc}}

      代码改动：
      {{nodes.implement.outputs.diff}}
    outputs:
      - name: review_result
        extract: result
    routes:
      - condition: "{{outputs.review_result contains 'LGTM'}}"
        next: create_pr
      - condition: default
        next: fix

  fix:
    project: "{{vars.project}}"
    depends_on: [review]
    prompt: |
      根据 Review 意见修复代码：
      {{nodes.review.outputs.review_result}}
    routes:
      - next: review  # 循环回 review（需要设定最大循环次数）
    max_iterations: 3

  create_pr:
    project: "{{vars.project}}"
    depends_on: [review]
    prompt: |
      为当前改动创建 Pull Request，标题和描述基于：
      {{nodes.architect.outputs.design_doc}}
```

### 并行执行

```yaml
nodes:
  frontend:
    project: my-app-web
    prompt: "实现前端登录页面..."

  backend:
    project: my-app-api
    prompt: "实现后端 auth API..."

  integration:
    depends_on: [frontend, backend]  # 等两个都完成
    project: my-app-web
    prompt: |
      前端和后端都已完成，进行集成：
      前端改动：{{nodes.frontend.outputs.diff}}
      后端改动：{{nodes.backend.outputs.diff}}
```

### 数据传递机制

节点之间传递信息有三种方式：

| 方式 | 说明 | 适用场景 |
|------|------|----------|
| **Output Extraction** | 从 Claude 的 result/diff 中自动提取 | 文本结果、设计文档 |
| **File Artifact** | Claude 生成的文件保存到共享目录 | 代码文件、配置 |
| **Git State** | 通过 git branch/commit 传递代码改动 | 同一 repo 的代码接力 |

```yaml
nodes:
  generate_config:
    prompt: "生成 API schema 文件到 shared/api-schema.json"
    outputs:
      - name: schema_file
        type: file
        path: "shared/api-schema.json"

  use_config:
    depends_on: [generate_config]
    prompt: |
      根据这个 schema 生成客户端代码：
      {{read_file(nodes.generate_config.outputs.schema_file)}}
```

### 实现方案（基于现有架构）

#### Phase 1：扩展 Flow → DAG

**改动点：**

1. **`src/types/index.ts`** — 新增类型：
   ```typescript
   export interface WorkflowNode {
     id: string;
     project: string;
     prompt: string;           // 支持模板语法 {{...}}
     dependsOn?: string[];     // 上游节点 ID
     outputs?: NodeOutput[];
     routes?: NodeRoute[];
     maxIterations?: number;   // 防止无限循环
   }

   export interface NodeOutput {
     name: string;
     extract: 'result' | 'git_diff' | 'file';
     path?: string;            // for file type
   }

   export interface NodeRoute {
     condition: string;        // 模板表达式
     next: string;             // 目标节点 ID
   }

   export interface Workflow {
     name: string;
     description?: string;
     vars?: Record<string, string>;
     nodes: Record<string, WorkflowNode>;
     input?: Record<string, string>;  // 启动时需要的输入
   }

   export interface Pipeline {
     id: string;
     workflowName: string;
     status: 'running' | 'done' | 'failed' | 'cancelled';
     input: Record<string, any>;
     nodeStates: Record<string, PipelineNodeState>;
     createdAt: string;
     completedAt?: string;
   }

   export interface PipelineNodeState {
     status: TaskStatus;
     taskId?: string;          // 关联的 Task ID
     outputs: Record<string, any>;
     iterations: number;
     startedAt?: string;
     completedAt?: string;
   }
   ```

2. **`lib/pipeline-engine.ts`** — 新增 Pipeline 执行引擎：
   - `startPipeline(workflowName, input)` → 创建 Pipeline，解析 DAG，启动无依赖节点
   - `onTaskComplete(taskId)` → 检查下游节点是否 ready，触发执行
   - `resolveTemplate(template, context)` → 解析 `{{...}}` 模板
   - `evaluateRoute(routes, outputs)` → 条件路由
   - `extractOutput(task, outputDef)` → 从 Task 结果中提取 output
   - 状态持久化到 SQLite `pipelines` 表

3. **`lib/task-manager.ts`** — 小改动：
   - `createTask` 增加 `pipelineId` 和 `nodeId` 字段
   - Task 完成时触发 `pipeline-engine.onTaskComplete`

4. **`lib/flows.ts`** — 兼容升级：
   - 旧格式（线性 steps）自动转换为 DAG（每个 step depends_on 上一个）
   - 新格式支持 `nodes` 字段

5. **UI 改动：**
   - Pipeline 视图：DAG 可视化，显示节点状态和数据流
   - 节点详情：点击查看 prompt（渲染后）、outputs、关联 task
   - 启动 workflow 时可填入 input 参数

6. **API 路由：**
   - `POST /api/pipelines` — 启动 pipeline
   - `GET /api/pipelines` — 列表
   - `GET /api/pipelines/[id]` — 详情（含 DAG 状态）
   - `POST /api/pipelines/[id]/cancel` — 取消

7. **CLI：**
   - `forge run <workflow> --input requirement="实现用户注册功能"`
   - `forge pipeline <id>` — 查看 pipeline 状态
   - `forge pipelines` — 列表

#### Phase 2：实时协作（高级）

更高级的场景——Agent 不是等上游完全结束才开始，而是通过消息通道实时交互：

```yaml
nodes:
  coder:
    prompt: "实现功能..."
    channels:
      - name: questions
        direction: out
        target: architect

  architect:
    prompt: "你是架构师，回答 coder 的问题..."
    channels:
      - name: questions
        direction: in
        source: coder
```

这需要：
- 两个 Claude Code 进程同时运行
- 中间消息总线（可基于 SQLite + polling 或 WebSocket）
- 一个 Agent 的 output 实时注入另一个 Agent 的 stdin（通过 `--resume` + append message）

**复杂度高，建议 Phase 1 稳定后再考虑。**

### 执行流程示意

```
User: forge run feature-implementation --input requirement="Add OAuth login"
  │
  ▼
Pipeline created (id: pip-abc123)
  │
  ▼ (resolve input template)
[architect] ──prompt──▶ Claude Code ──result──▶ design_doc
  │
  ▼ (depends_on satisfied)
[implement] ──prompt(with design_doc)──▶ Claude Code ──git_diff──▶ diff
  │
  ▼
[review] ──prompt(with design_doc + diff)──▶ Claude Code ──result──▶ review_result
  │
  ├── "LGTM" ──▶ [create_pr]
  │
  └── else ──▶ [fix] ──▶ [review] (loop, max 3)
```

### SQLite Schema

```sql
CREATE TABLE pipelines (
  id TEXT PRIMARY KEY,
  workflow_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  input TEXT,          -- JSON
  node_states TEXT,    -- JSON: Record<nodeId, PipelineNodeState>
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- tasks 表增加：
ALTER TABLE tasks ADD COLUMN pipeline_id TEXT;
ALTER TABLE tasks ADD COLUMN node_id TEXT;
```

### 工作量评估

| 模块 | 工作量 | 说明 |
|------|--------|------|
| 类型定义 | 小 | 新增 Workflow/Pipeline/Node 类型 |
| YAML 解析 | 小 | 扩展现有 flows.ts |
| 模板引擎 | 中 | `{{...}}` 解析 + output 引用 |
| Pipeline 引擎 | 大 | DAG 调度、状态管理、条件路由 |
| Task Manager 集成 | 小 | 增加 pipeline/node 关联 |
| Pipeline UI | 大 | DAG 可视化、实时状态 |
| CLI 扩展 | 小 | 新增 pipeline 命令 |
| **总计** | **~3-5 天** | Phase 1 完整可用 |

### 关键设计决策

1. **模板语法**：用 `{{...}}` Mustache 风格，简单够用，不引入 Handlebars 依赖
2. **Output 提取**：默认取 Claude 的 `result` 字段；`git_diff` 取 task 的 diff；`file` 读指定路径
3. **循环保护**：`max_iterations` 默认 3，防止 review → fix 无限循环
4. **错误处理**：单节点失败 → 标记该节点 failed → 下游节点 skip → Pipeline 标记 failed
5. **并发**：同 project 的节点串行（现有 `runningProjects` 锁），不同 project 的节点并行
6. **向后兼容**：现有线性 Flow YAML 无需修改，自动适配
