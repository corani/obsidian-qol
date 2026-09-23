#!/usr/bin/env bash
# Usage: ./release.sh [version]
# Without arguments: bumps the patch version of the current version in package.json
# With argument: uses the specified version
# Examples:
#   ./release.sh          # 0.1.2 -> 0.1.3
#   ./release.sh 0.2.0
#   ./release.sh 0.2.0-beta.1
set -euo pipefail

if [[ -z "${1:-}" ]]; then
  CURRENT="$(jq -r '.version' package.json)"
  # Split X.Y.Z, bump Z (strip any pre-release suffix first)
  BASE="${CURRENT%%-*}"
  IFS='.' read -r MAJOR MINOR PATCH <<< "$BASE"
  VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))"
  echo "No version specified -- bumping patch: $CURRENT -> $VERSION"
else
  VERSION="$1"
fi

# Validate semver-ish format
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9._-]+)?$ ]]; then
  echo "Error: version must be in the form X.Y.Z or X.Y.Z-suffix" >&2
  exit 1
fi

BRANCH="release/$VERSION"
DEFAULT_BRANCH="$(git remote show origin | awk '/HEAD branch/ {print $NF}')"

# Ensure working tree is clean
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: working tree has uncommitted changes" >&2
  exit 1
fi

# Fetch latest
git fetch origin

# Create a release branch from the default branch
git checkout -b "$BRANCH" "origin/$DEFAULT_BRANCH"

# Bump version in manifest.json and package.json
jq --arg v "$VERSION" '.version = $v' manifest.json > manifest.tmp.json && mv manifest.tmp.json manifest.json
jq --arg v "$VERSION" '.version = $v' package.json  > package.tmp.json  && mv package.tmp.json  package.json

git add manifest.json package.json
git commit -m "chore: release $VERSION"

# Push the release branch and tag
git push origin "$BRANCH"
git tag "$VERSION"
git push origin "$VERSION"

echo "Tag $VERSION pushed -- GitHub Actions will build and publish the release."
echo ""

# Open a PR to merge the version bump back to the default branch
gh pr create \
  --base "$DEFAULT_BRANCH" \
  --head "$BRANCH" \
  --title "chore: release $VERSION" \
  --body "Version bump for release \`$VERSION\`. Merge after the GitHub release is published."

echo ""
echo "Done. Monitor the release at: $(gh repo view --json url -q .url)/releases"
