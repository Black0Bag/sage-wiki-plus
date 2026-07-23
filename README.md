# sage-wiki-plus

> 🌟 基于 [xoai/sage-wiki](https://github.com/xoai/sage-wiki) 的定制增强版  
> LLM 编译的个人知识库 — 手机适配 WebUI，文件上传/在线编辑/服务配置，MCP 修复，自动同步上游 + 自动编译 Release

[![GitHub](https://img.shields.io/badge/GitHub-Black0Bag%2Fsage--wiki--plus-blue)](https://github.com/Black0Bag/sage-wiki-plus)
[![Upstream](https://img.shields.io/badge/Upstream-xoai%2Fsage--wiki-4f8cff)](https://github.com/xoai/sage-wiki)

---

## ✨ 增强功能

| 功能 | 说明 |
|---|---|
| 📱 **手机适配 WebUI** | 移动端 SPA，侧边栏导航，响应式布局，触摸友好 |
| 📤 **文件上传** | 拖拽/点击上传 Markdown/PDF 到 `raw/`，自动触发编译 |
| ✏️ **在线编辑** | 直接在 WebUI 中编辑/保存/删除文章 |
| ⚙️ **服务设置** | WebUI 内修改 LLM 模型、Embedding 配置等 |
| 🖥️ **模型自动遍历** | 自动发现可用的 LLM/Embedding 模型 |
| 🔗 **知识图谱** | 力导向图可视化，支持邻域查询 |
| 🔍 **混合搜索** | BM25 + 向量语义搜索，带片段预览 |
| 🔒 **MCP 修复** | 移除严格的 CSRF origin 检查，增加 CORS 支持 |
| 📦 **单二进制** | `go build -tags webui` 编译为单一可执行文件 |
| 🔄 **上游同步** | 自动化脚本检测上游更新，同步代码并自动打补丁 |
| 🚀 **自动 Release** | 检测到变更后 1 小时自动编译并发布 Release |

## 🆕 新增 API

| 方法 | 路由 | 说明 |
|---|---|---|
| GET/PUT | `/api/config` | 读写服务配置 |
| POST | `/api/sources/upload` | 上传源文件 (multipart) |
| GET | `/api/sources` | 列出源文件 |
| POST | `/api/compile` | 触发编译 |
| GET | `/api/models` | 模型发现 |
| POST/PUT/DELETE | `/api/article` | 文章写入/更新/删除 |
| GET | `/api/manifest` | 编译清单 |
| GET | `/api/health` | 健康检查 |
| GET | `/api/status` | 知识库状态（条目/向量/实体/关系） |
| GET | `/api/sysinfo` | 宿主机系统信息（CPU/内存/磁盘/温度） |
| POST | `/api/models/test` | 模型有效性测试 |

## 🚀 快速开始

```bash
# 克隆
git clone https://github.com/Black0Bag/sage-wiki-plus.git
cd sage-wiki-plus

# 编译（含 WebUI）
go build -tags webui -o sage-wiki-plus .

# 初始化项目
./sage-wiki-plus init my-wiki

# 启动服务（WebUI + API）
cd my-wiki
../sage-wiki-plus serve --ui --port 8082 --bind 0.0.0.0

# 打开浏览器访问 http://localhost:8082
```

## 🔧 编译选项

```bash
# 不带 WebUI（纯 CLI + API）
go build -o sage-wiki-plus .

# 带 WebUI（推荐）
go build -tags webui -o sage-wiki-plus .

# 交叉编译（OpenWrt/ImmortalWrt）
GOOS=linux GOARCH=arm GOARM=7 go build -tags webui -o sage-wiki-plus .
```

## 🤖 自动化

### 上游同步脚本 (`scripts/sync-upstream.sh`)

检测 [xoai/sage-wiki](https://github.com/xoai/sage-wiki) 是否有新提交，如有则同步代码并自动应用 `patches/` 下的定制补丁。

```bash
./scripts/sync-upstream.sh
```

### 自动发布脚本 (`scripts/auto-release.sh`)

检测仓库是否有新变更（距离上次 Release 的 commit），如果有且超过 1 小时未再次变更，则自动编译并发布 Release。

```bash
./scripts/auto-release.sh
```

### GitHub Actions

仓库已配置自动 CI：

- **`.github/workflows/sync-upstream.yml`** — 每 6 小时检测上游更新
- **`.github/workflows/release.yml`** — 检测变更后自动编译发布

## 🏗️ 目录结构

```
├── cmd/sage-wiki/          # CLI 入口
├── internal/
│   ├── web/                # Web 服务器 + API
│   │   ├── server.go       # 路由 + MCP 修复
│   │   ├── handlers_extra.go # 新增 API 处理器
│   │   ├── static_webui.go # 静态文件嵌入（webui 标签）
│   │   └── dist/           # 前端 SPA
│   │       ├── index.html
│   │       └── assets/
│   │           ├── app.css
│   │           └── app.js
│   ├── compiler/           # 编译引擎
│   ├── hybrid/             # 混合搜索
│   └── ...                 # 其余上游模块
├── scripts/
│   ├── sync-upstream.sh    # 上游同步
│   └── auto-release.sh     # 自动发布
├── patches/                # 定制补丁
└── .github/workflows/      # CI 配置
```

## 🙏 致谢

本项目基于 [xoai/sage-wiki](https://github.com/xoai/sage-wiki) 构建，感谢原作者的杰出工作。

- **原项目**: [xoai/sage-wiki](https://github.com/xoai/sage-wiki) — LLM-compiled personal knowledge base
- 上游使用的 MCP 库: [mark3labs/mcp-go](https://github.com/mark3labs/mcp-go)

## 📋 版本号管理宪法（必须遵循）

> ⚠️ 本规则为本项目的最高规范，所有 Agent 和开发者必须严格遵守。

### 版本格式
采用语义化版本号：`MAJOR.MINOR.PATCH`（如 `1.2.3`）

### 递增规则
| 级别 | 递增 | 适用场景 |
|------|------|---------|
| **PATCH** | +0.0.1 | Bug 修复、小调整、文案修改、配置微调 |
| **MINOR** | +0.1.0 | 新功能、新 API 端点、性能改进、界面优化 |
| **MAJOR** | +1.0.0 | 架构重构、核心逻辑重写、不兼容变更、里程碑更新 |

### 起始版本
以当前已发布在 GitHub Release 的成功编译文件为 **1.0.0** 起点。后续每次修改并 push 到 main/master 分支时，必须根据修改规模递增版本号。

### 版本号来源
- 唯一来源：`cmd/sage-wiki/main.go` 中的 `var version` 默认值
- CI（release.yml）通过 `ldflags` 注入版本号到二进制
- Release tag 格式：`v1.0.0`（纯语义化，不再使用日期+hash）
- **每次 Release 必须附简体中文更新日志**

### 更新日志规范
每次 Release 的 body 必须包含简体中文更新日志，格式：
```
## 更新内容

### 新增
- xxx

### 修复
- xxx

### 改进
- xxx
```

## 📄 许可证

MIT License — 参见 [LICENSE](LICENSE)
