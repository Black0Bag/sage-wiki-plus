#!/bin/bash
# auto-release.sh — 检测本仓变更，1小时后自动编译并发布 Release
set -euo pipefail

WORKSPACE="$(dirname "$0")/.."
cd "$WORKSPACE"

RELEASE_FILE=".last_release_tag"
COOLDOWN_FILE=".release_cooldown"
COOLDOWN_SECONDS=3600  # 1小时

echo "🔍 检测是否有新变更..."

# 获取上次 Release 的 tag
LAST_TAG=""
if [ -f "$RELEASE_FILE" ]; then
    LAST_TAG=$(cat "$RELEASE_FILE")
fi

# 获取最新 tag（如果没有记录）
if [ -z "$LAST_TAG" ]; then
    LAST_TAG=$(git tag --sort=-v:refname 2>/dev/null | head -1) || true
fi

# 确定比较范围
if [ -n "$LAST_TAG" ]; then
    echo "   上次发布: $LAST_TAG"
    NEW_COMMITS=$(git log "$LAST_TAG"..HEAD --oneline 2>/dev/null | wc -l)
else
    echo "   首次发布检测"
    NEW_COMMITS=$(git log --oneline 2>/dev/null | wc -l)
fi

if [ "$NEW_COMMITS" -eq 0 ]; then
    echo "✅ 无新变更，跳过"
    exit 0
fi

echo "📝 检测到 $NEW_COMMITS 个新 commit"

# 检查冷却时间
if [ -f "$COOLDOWN_FILE" ]; then
    COOLDOWN_AT=$(cat "$COOLDOWN_FILE")
    NOW=$(date +%s)
    ELAPSED=$((NOW - COOLDOWN_AT))
    if [ $ELAPSED -lt $COOLDOWN_SECONDS ]; then
        REMAINING=$((COOLDOWN_SECONDS - ELAPSED))
        echo "⏳ 冷却中，还需 ${REMAINING}s，跳过"
        exit 0
    fi
fi

# 设置/更新冷却时间
date +%s > "$COOLDOWN_FILE"
echo "⏳ 冷却计时器已设（1小时）"

# 检查是否是第二次执行（冷却已过）
if [ -f ".release_pending" ]; then
    echo "🚀 冷却已过，开始编译发布..."
    rm -f ".release_pending"

    # 编译
    echo "🔨 编译 sage-wiki-plus..."
    go build -tags webui -o sage-wiki-plus . 2>&1

    # 生成版本号
    VERSION="v$(date +%Y.%-m.%-d)-$(git rev-parse --short HEAD)"
    echo "   版本: $VERSION"

    # 创建 Git tag
    git tag -a "$VERSION" -m "自动发布 $VERSION"
    git push origin "$VERSION" 2>/dev/null || true

    # 使用 GitHub CLI 创建 Release（如果可用）
    if command -v gh &>/dev/null; then
        echo "📦 创建 GitHub Release..."
        # 生成变更日志
        if [ -n "$LAST_TAG" ]; then
            NOTES=$(git log "$LAST_TAG"..HEAD --oneline --no-decorate 2>/dev/null | head -50)
        else
            NOTES=$(git log --oneline --no-decorate 2>/dev/null | head -50)
        fi

        # 打包二进制
        tar czf "sage-wiki-plus-${VERSION}.tar.gz" sage-wiki-plus

        gh release create "$VERSION" \
            --title "sage-wiki-plus $VERSION" \
            --notes "## 自动发布\n\n### 变更\n$NOTES\n\n---\n自动编译于 $(date '+%Y-%m-%d %H:%M:%S %Z')" \
            "sage-wiki-plus-${VERSION}.tar.gz" \
            sage-wiki-plus

        echo "✅ Release $VERSION 已发布"
    else
        echo "⚠️  gh CLI 不可用，请手动创建 Release"
        echo "   tag: $VERSION"
        echo "   binary: sage-wiki-plus"
    fi

    # 记录
    echo "$VERSION" > "$RELEASE_FILE"
    rm -f "$COOLDOWN_FILE"
    echo "✅ 完成"
else
    # 第一次检测到变更，设置待发布标记
    echo ".release_pending" > ".release_pending"
    echo "⏳ 变更已记录，将在 1 小时后自动编译发布"
    echo "   如果 1 小时内有新变更，冷却计时器会重置"
fi
