# Patches — sage-wiki-plus 定制补丁

本目录存放相对于上游 [xoai/sage-wiki](https://github.com/xoai/sage-wiki) 的差异补丁。

## 补丁列表

- `fix-mcp-cors.patch` — 修复 MCP origin 检查 + 增加 CORS 支持
- `add-extra-apis.patch` — 新增 API 接口（上传/配置/编译/编辑等）
- `replace-webui.patch` — 替换 WebUI 为手机适配 SPA

## 使用方式

自动应用：`scripts/sync-upstream.sh` 会在同步上游后自动应用所有 `.patch` 文件。

手动应用：
```bash
git apply patches/fix-mcp-cors.patch
```

生成补丁：
```bash
git format-patch main --stdout > patches/xxx.patch
```
