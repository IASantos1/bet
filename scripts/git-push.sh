#!/bin/bash
# Script de commit e push automático para o GitHub
# Uso: bash scripts/git-push.sh "mensagem do commit"

MSG="${1:-"chore: update"}"
BRANCH="${2:-main}"

cd /home/runner/workspace

git add -A
git commit -m "$MSG" 2>/dev/null || echo "Nada novo para commitar"
git push origin "$BRANCH" 2>&1

echo "✅ Push concluído para origin/$BRANCH"
