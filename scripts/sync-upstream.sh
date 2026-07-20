#!/bin/bash
# sync-upstream.sh — 检测 xoai/sage-wiki 上游更新，同步代码并打补丁
set -euo pipefail

UPSTREAM_REPO="https://github.com/xoai/sage-wiki.git"
UPSTREAM_BRANCH="main"
UPSTREAM_DIR="/tmp/sage-wiki-upstream"
PATCHES_DIR="$(dirname "$0")/../patches"

echo "🔍 检测上游更新: xoai/sage-wiki"

# 获取上游最新 commit
LATEST=$(git ls-remote "$UPSTREAM_REPO" "refs/heads/$UPSTREAM_BRANCH" | awk '{print $1}')
echo "   上游最新 commit: $LATEST"

# 检查上次同步记录
SYNC_FILE="$(dirname "$0")/../.last_upstream_sync"
if [ -f "$SYNC_FILE" ]; then
    LAST_SYNC=$(cat "$SYNC_FILE")
    if [ "$LAST_SYNC" = "$LATEST" ]; then
        echo "✅ 上游无更新，跳过"
        exit 0
    fi
fi

echo "📦 检测到上游更新，开始同步..."

# 完整克隆上游
rm -rf "$UPSTREAM_DIR"
git clone --depth 1 "$UPSTREAM_REPO" "$UPSTREAM_DIR" 2>/dev/null

# 记录同步前版本
BEFORE_COMMIT=$(git rev-parse HEAD)

# 复制上游文件（排除 .git 和当前定制文件）
echo "📋 同步文件..."
cd "$UPSTREAM_DIR"
# 使用 tar 排除 .git 后复制到工作区
WORKSPACE="$(dirname "$0")/.."
cd "$WORKSPACE"

# 暂存定制文件
TMP_DIR=$(mktemp -d)
SAVED_FILES=(
    "README.md"
    "internal/web/handlers_extra.go"
    "internal/web/server.go"
    "internal/web/dist/index.html"
    "internal/web/dist/assets/app.css"
    "internal/web/dist/assets/app.js"
    "scripts/sync-upstream.sh"
    "scripts/auto-release.sh"
    "patches"
    ".github/workflows/sync-upstream.yml"
    ".github/workflows/release.yml"
)

for f in "${SAVED_FILES[@]}"; do
    if [ -e "$f" ]; then
        mkdir -p "$TMP_DIR/$(dirname $f)"
        cp -a "$f" "$TMP_DIR/$f"
    fi
done

# 清空工作区（保留 .git）
find . -maxdepth 1 -not -name '.git' -not -name '.' -not -name '..' -exec rm -rf {} + 2>/dev/null || true

# 从上游复制
cd "$UPSTREAM_DIR"
tar cf - --exclude='.git' . | (cd "$WORKSPACE" && tar xf -)

# 还原定制文件
cd "$WORKSPACE"
for f in "${SAVED_FILES[@]}"; do
    if [ -e "$TMP_DIR/$f" ]; then
        mkdir -p "$(dirname $f)"
        cp -a "$TMP_DIR/$f" "$f"
    fi
done

rm -rf "$TMP_DIR"

# 应用 patches 目录下的补丁
if [ -d "$PATCHES_DIR" ]; then
    echo "🩹 应用定制补丁..."
    for patch in "$PATCHES_DIR"/*.patch; do
        [ -f "$patch" ] || continue
        echo "  应用: $(basename $patch)"
        git apply "$patch" 2>/dev/null || echo "  ⚠️  补丁 $patch 应用失败（可能已包含）"
    done
fi

# 修复模块路径
find . -name '*.go' -exec sed -i 's|github.com/xoai/sage-wiki|github.com/Black0Bag/sage-wiki-plus|g' {} +
sed -i 's|module github.com/xoai/sage-wiki|module github.com/Black0Bag/sage-wiki-plus|' go.mod 2>/dev/null || true

# 更新 go.sum
go mod tidy 2>/dev/null || echo "⚠️ go mod tidy 跳过（可手动执行）"

# 记录同步
echo "$LATEST" > "$SYNC_FILE"
AFTER_COMMIT=$(git rev-parse HEAD)

if [ "$BEFORE_COMMIT" != "$AFTER_COMMIT" ]; then
    echo "✅ 同步完成！有新的变更。"
    echo "   变更: $BEFORE_COMMIT → $AFTER_COMMIT"
    # 自动 commit
    git add -A
    git commit -m "chore: sync upstream to $LATEST" --allow-empty 2>/dev/null || true
    echo "   已自动 commit"
else
    echo "✅ 同步完成，无代码变更（仅补丁维护）"
fi

# 清理
rm -rf "$UPSTREAM_DIR"
echo "🎉 完毕"
