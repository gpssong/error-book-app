#!/bin/bash
# GitHub Upload Setup Script

set -e

echo "🚀 错题本App GitHub Upload Setup"
echo ""
echo "This script will:"
echo "1. Ask for your GitHub Personal Access Token (PAT)"
echo "2. Create the repository on GitHub"
echo "3. Push all the code"
echo ""

# Check if gh is available
if command -v gh &> /dev/null; then
    echo "✓ GitHub CLI found"
    GH_CMD="gh"
else
    echo "✗ GitHub CLI not found"
    exit 1
fi

# Authenticate with PAT
read -p "Enter your GitHub PAT (with repo scope): " GITHUB_TOKEN
export GH_TOKEN="$GITHUB_TOKEN"

# Verify auth
if ! gh auth status &> /dev/null; then
    echo "Setting up authentication..."
    echo "$GITHUB_TOKEN" | gh auth login --with-token
fi

# Create repo and push
cd /Users/tongban/projects/error-book-app

if gh repo create error-book-app --public --description "错题本App - 拍照识题+AI讲解+手写批注" --source=. --remote=origin --push; then
    echo ""
    echo "✅ Successfully uploaded to GitHub!"
    gh repo view --web
else
    echo ""
    echo "❌ Failed to create repo. It might already exist."
    echo "Trying to push to existing repo..."
    git remote add origin git@github.com:gpssong/error-book-app.git 2>/dev/null || true
    git push -u origin main
    echo "✅ Pushed to existing repo!"
fi
