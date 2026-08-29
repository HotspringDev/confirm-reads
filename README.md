# confirm-reads

A [DeepSeek Harness](https://github.com/deepseek-ai) (dsh) / Cordis plugin that blocks **read-capable tools** until the user approves each call.

> 一个 DeepSeek Harness 插件：把 `read` / `glob` / `grep` / `bash` 等可读工具拦在“用户逐次批准”之后，防止文件内容未经确认进入模型上下文或 API。

## Why / 为什么需要它

By default, a dsh session under `workspace-write` may **read** any file — inside or outside the workspace — without asking; the sandbox only confines *writes*. If your workspace contains private data, every read ships file content to the model. `confirm-reads` puts a per-call approval gate in front of read-capable tools via the `tools/pre-execute` waterfall: **the tool does not run, and the content never reaches the model, until you approve.**

默认情况下，`workspace-write` 档的 dsh 会话可以**不经询问读取任何文件**（工作区内/外都一样），沙箱只限制**写入**。如果你的工作区里有隐私数据，每一次读取都会把文件内容送到模型。`confirm-reads` 通过 `tools/pre-execute` 瀑布在可读工具前加一道逐次审批闸门：**在你批准之前，工具不会执行，内容不会到达模型。**

## Features / 功能

- Gates `read`, `glob`, `grep`, `bash` (configurable list) / 拦截 `read`、`glob`、`grep`、`bash`（列表可配置）。
- Per-call approval through the standard dsh approval seam — the same UI as sandbox escalations / 每次调用走 dsh 标准审批通道，与沙箱升权同一个弹窗。
- `/confirm-reads` command to toggle on/off and change the tool list from the WebUI / `/confirm-reads` 命令可在 WebUI 中开关拦截、修改工具列表。
- State persisted to `state.json` — the toggle survives restarts / 状态持久化到 `state.json`，开关在重启后保持。
- `danger-full-access` mode is **deliberately exempt**: approval policy is `never` there, so this plugin only governs confined modes (`workspace-write` / `read-only`) / `danger-full-access` 档**刻意豁免**：该档审批策略为 `never`，本插件只管理受限档（`workspace-write` / `read-only`）。

## Install / 安装

### Option A — local profile patch (recommended) / 本地 profile 补丁（推荐）

1. Put this package at `<profile>/plugins/confirm-reads/` (e.g. `$DSH_HOME/profiles/web/plugins/confirm-reads/`) / 把本包放到 `<profile>/plugins/confirm-reads/` 下。
2. Append `examples/cordis.patch.yml` to your profile's `cordis.patch.yml` / 把 `examples/cordis.patch.yml` 的内容追加到 profile 的 `cordis.patch.yml`。
3. Restart `dsh` (e.g. `dsh web`) / 重启 `dsh`。

### Option B — npm bundle (once published) / npm 包方式（发布后）

```sh
dsh plugin --profile web add confirm-reads
```

## Usage / 使用

In the WebUI input, type / 在 WebUI 输入框输入：

```
/confirm-reads                          # show status + gated tools / 显示状态与拦截列表
/confirm-reads status                   # same / 同上
/confirm-reads on                       # enable gating / 开启拦截
/confirm-reads off                      # disable gating / 关闭拦截
/confirm-reads tools read glob grep bash   # change the gated tool list / 修改拦截的工具列表
```

State file / 状态文件：`<profile>/plugins/confirm-reads/state.json`

## How it works / 工作原理

Every tool call is dispatched through the `tools/pre-execute` waterfall. This plugin listens on it and returns `{ kind: "ask", reason }` for gated tools (while `enabled` and under a confined sandbox mode). The tool scheduler resolves the `ask` through `ctx.approval.request()` — the same approval seam used by sandbox escalations — so the approval prompt appears in the WebUI and the tool only executes on `allowed-once`.

每次工具调用都会经过 `tools/pre-execute` 瀑布。本插件监听该事件，对拦截列表内的工具返回 `{ kind: "ask", reason }`（在开启状态且处于受限沙箱档时）。工具调度器通过 `ctx.approval.request()` 解析该 `ask` —— 与沙箱升权同一条审批通道 —— 弹窗出现在 WebUI，仅当结果为 `allowed-once` 时工具才执行。

## Development / 开发

```sh
npm test        # runs the node:test smoke suite / 运行 node:test 冒烟测试
```

The plugin is zero-dependency ESM (only Node builtins), so it can be loaded from a profile directory that has no `@deepseek-ai/*` packages installed.

## License

[MIT](./LICENSE)
