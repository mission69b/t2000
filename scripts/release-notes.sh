#!/usr/bin/env bash
# Build grouped Markdown release notes from commit messages since the previous
# tag. We commit straight to main (no PRs), so GitHub's `--generate-notes` comes
# up empty; our commits are emoji-conventional, so group those instead.
#
#   scripts/release-notes.sh <tag>
set -euo pipefail

TAG="${1:?usage: release-notes.sh <tag>}"
PREV="$(git describe --tags --abbrev=0 "${TAG}^" 2>/dev/null || true)"
RANGE="${PREV:+${PREV}..}${TAG}"

# All non-merge subjects in range, minus release-bot + revert/reapply noise.
SUBJECTS="$(git log --no-merges --pretty=format:'%s' "$RANGE" \
  | grep -vE '^(📦 ?)?build: v[0-9]' \
  | grep -vE '^(Revert|Reapply) ' || true)"

# Union of everything we bucket, so "Other" is a true remainder.
KNOWN='^(✨|feat|🐛|fix|💄|🎨|style|design|⚡|perf|♻️|refactor|📝|docs|✅|test|🔧|chore)'

section() { # <title> <regex>
  local body
  body="$(printf '%s\n' "$SUBJECTS" | grep -E "$2" || true)"
  [ -z "$body" ] && return 0
  printf '### %s\n' "$1"
  # Strip the leading emoji token, keep the conventional "type(scope):".
  printf '%s\n' "$body" | sed -E 's/^[^[:space:]]+[[:space:]]+//; s/^/- /'
  printf '\n'
}

{
  section '✨ Features'    '^(✨|feat)'
  section '🐛 Fixes'       '^(🐛|fix)'
  section '🎨 Design & UI' '^(💄|🎨|style|design)'
  section '⚡ Performance'  '^(⚡|perf)'
  section '♻️ Refactor'    '^(♻️|refactor)'
  section '📝 Docs'        '^(📝|docs)'

  OTHER="$(printf '%s\n' "$SUBJECTS" | grep -vE "$KNOWN" || true)"
  if [ -n "$OTHER" ]; then
    printf '### 🔧 Other\n'
    printf '%s\n' "$OTHER" | sed -E 's/^/- /'
    printf '\n'
  fi

  [ -n "$PREV" ] && printf '**Full Changelog**: %s...%s\n' "$PREV" "$TAG"
} | sed '/^$/N;/^\n$/D'  # collapse repeated blank lines
