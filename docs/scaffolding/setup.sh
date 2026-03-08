#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Setting up enforcement scaffolding..."

mkdir -p scripts
for script in check-secrets.js check-file-sizes.js validate-docs.js; do
  if [ -f "scripts/$script" ]; then
    read -p "  scripts/$script exists. Overwrite? [y/N] " answer
    if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
      echo "  Skipping $script"
      continue
    fi
  fi
  cp "$SCRIPT_DIR/scripts/$script" "scripts/$script"
  echo "  Copied scripts/$script"
done

echo "Installing husky and lint-staged..."
npm install --save-dev husky lint-staged

npx husky init

cp "$SCRIPT_DIR/hooks/pre-commit" .husky/pre-commit
cp "$SCRIPT_DIR/hooks/pre-push" .husky/pre-push
chmod +x .husky/pre-commit .husky/pre-push
echo "  Installed pre-commit and pre-push hooks"

if ! grep -q "lint-staged" package.json; then
  node -e "
    const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf-8'));
    pkg['lint-staged'] = pkg['lint-staged'] || { 'src/**/*.js': ['eslint --fix'] };
    require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  echo "  Added lint-staged config to package.json"
else
  echo "  lint-staged config already exists in package.json"
fi

echo ""
echo "Done! Customize CONFIG objects in scripts/ for your project."
