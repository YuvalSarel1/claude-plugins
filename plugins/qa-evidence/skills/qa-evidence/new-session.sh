#!/usr/bin/env bash
# Create a QA session directory and print the commands that follow.
#
#   ./new-session.sh <slug> [YYYY-MM-DD]
#
# Produces $QA_HOME/sessions/<date>-<slug>/ (QA_SESSIONS_DIR overrides) containing:
#   findings.json     seeded from templates/findings.example.json, rows emptied
#   NOTES.md          copied from $QA_HOME/templates/NOTES.md, else TEMPLATE.md
#   jobs.mjs          copied from $QA_HOME/templates/jobs.mjs, else demo/jobs.mjs; out rewritten to ./shots
#   sweep.config.mjs  copied from $QA_HOME/templates/sweep.config.mjs, else demo/sweep.config.mjs
#   shots/            empty, capture output lands here
#
# Both configs are .mjs because both tools import them as ES modules. Both are
# COPIED, never symlinked: a session edits its own jobs and sweep config, and a
# symlink would write those edits back into the shared example and silently
# change what every past session claims it ran.
#
# Refuses to touch an existing session directory. A failed run cleans up after
# itself, so a half-built directory never wedges the slug.

set -euo pipefail

# QA is the skill folder (resolved through a symlink); sessions go in your project, not here.
QA="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
# QA_HOME is the project's knowledge folder (see SKILL.md, First use); default ./qa.
QA_HOME="${QA_HOME:-$PWD/qa}"
SESSIONS="${QA_SESSIONS_DIR:-$QA_HOME/sessions}"

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

# ---- arguments ---------------------------------------------------------------

SLUG="${1:-}"
DATE="${2:-$(date +%F)}"

[ -n "$SLUG" ] || die "usage: new-session.sh <slug> [YYYY-MM-DD]"
case "$SLUG" in
  *[![:lower:][:digit:]-]* | -* | *- | "") die "slug must be lowercase letters, digits and hyphens: got '$SLUG'" ;;
esac
case "$DATE" in
  [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
  *) die "date must be YYYY-MM-DD: got '$DATE'" ;;
esac
command -v node >/dev/null 2>&1 || die "node is required (the tools need Node 22+)"

DIR="$SESSIONS/$DATE-$SLUG"
[ -e "$DIR" ] && die "$DIR already exists, refusing to clobber it"

# Anything after this point that fails takes the half-built directory with it.
trap 'rc=$?; [ "$rc" -ne 0 ] && [ -n "${DIR:-}" ] && [ -d "$DIR" ] && rm -rf "$DIR"; exit $rc' EXIT

# ---- sources -----------------------------------------------------------------
# One canonical path each. A missing source is not fatal: the session still gets
# a marked stub in the right schema, so the operator can start and fill the gap.

FINDINGS_SRC="$QA/templates/findings.example.json"
# House templates in $QA_HOME/templates/ win over the shipped demo ones.
pick() { [ -f "$QA_HOME/templates/$1" ] && echo "$QA_HOME/templates/$1" || echo "$2"; }
JOBS_SRC="$(pick jobs.mjs "$QA/demo/jobs.mjs")"
SWEEP_SRC="$(pick sweep.config.mjs "$QA/demo/sweep.config.mjs")"
NOTES_SRC="$(pick NOTES.md "$QA/TEMPLATE.md")"

STUBBED=""
stub() { STUBBED="$STUBBED $1"; }

# ---- build -------------------------------------------------------------------

mkdir -p "$DIR/shots"

# findings.json keeps the four categories and drops the example rows. The schema
# is the one tools/review.mjs validates: title, subtitle, storageKey, categories,
# items. Anything else in the file is ignored by the generator.
[ -f "$FINDINGS_SRC" ] || { stub findings.json; FINDINGS_SRC=""; }
node -e 'const [src, k, t] = process.argv.slice(1);
  const categories = src ? JSON.parse(require("fs").readFileSync(src, "utf8")).categories : undefined;
  console.log(JSON.stringify({ title: t, subtitle: "", storageKey: k, categories, items: [] }, null, 2));' \
  "$FINDINGS_SRC" "$DATE-$SLUG" "$SLUG review" > "$DIR/findings.json"

if [ -f "$NOTES_SRC" ]; then
  cp "$NOTES_SRC" "$DIR/NOTES.md"
else
  stub NOTES.md
  printf '# %s\n\nTEMPLATE.md was missing, write the scope by hand.\n' "$DATE-$SLUG" > "$DIR/NOTES.md"
fi

# The demo configs find app.html via import.meta.url, which in a copy would point at
# the session dir; pin them to the shipped demo so a fresh session still runs.
# ponytail: sed on one token, breaks only if the skill path holds a | or &.
pin() { case "$1" in "$QA/demo/"*) sed "s|import\.meta\.url|'file://$QA/demo/'|g" ;; *) cat ;; esac; }

# The jobs file carries its own output directory, so the copy is pointed at this
# session's shots/ rather than at the shared example directory.
if [ -f "$JOBS_SRC" ]; then
  sed -E "s|^([[:space:]]*)out:[[:space:]]*'[^']*',|\1out: './shots',|" "$JOBS_SRC" | pin "$JOBS_SRC" > "$DIR/jobs.mjs"
  grep -q "out: './shots'," "$DIR/jobs.mjs" || die "could not repoint out in $JOBS_SRC, set it by hand"
else
  stub jobs.mjs
  printf "export default { out: './shots', tabs: 3, jobs: [] };\n" > "$DIR/jobs.mjs"
fi

if [ -f "$SWEEP_SRC" ]; then
  pin "$SWEEP_SRC" < "$SWEEP_SRC" > "$DIR/sweep.config.mjs"
else
  stub sweep.config.mjs
  printf "export default { base: 'https://app.example.com', states: [], surfaces: [] };\n" > "$DIR/sweep.config.mjs"
fi

trap - EXIT

# ---- report ------------------------------------------------------------------

printf 'created %s\n' "${DIR#$HOME/}"
printf '  findings.json  NOTES.md  jobs.mjs  sweep.config.mjs  shots/\n'
printf '  storageKey=%s\n' "$DATE-$SLUG"
[ -n "$STUBBED" ] && printf 'warning: source missing, wrote empty stubs for:%s\n' "$STUBBED"

# A tool that is not on disk is printed with the marker at the end of the line,
# never mid-command, so a pasted line cannot silently lose its arguments.
note() { [ -f "$QA/tools/$1" ] || printf '   # MISSING %s' "$QA/tools/$1"; }

cat <<EOF

Next, in order:

  1. $QA/launch-chrome.sh <your app url>
     Signed-in Chrome with CDP on :9222, its own profile. Skip if curl -s localhost:9222/json/version answers.

  2. \$EDITOR $DIR/sweep.config.mjs $DIR/jobs.mjs
     Copies of your templates, or of the demo (they run against demo/app.html as is):
     replace the app, surfaces, states and ids with yours.

  3. node $QA/tools/sweep.mjs $DIR/sweep.config.mjs $DIR/sweep.json$(note sweep.mjs)
     Matrix probe. Read sweep.json before writing a single row: rows quote measurements.

  4. node $QA/tools/shots.mjs $DIR/jobs.mjs$(note shots.mjs)
     Annotated capture into $DIR/shots. Add --list first. Any job MISS or OFFSCREEN
     has no evidence, so fix the locator or drop the row.

  5. node $QA/tools/review.mjs $DIR/findings.json -o $DIR/review.html$(note review.mjs)
     open $DIR/review.html
     Review page over findings.json. Tick rows, then Copy report.

Rules worth rereading first: $QA/rules/taxonomy.md and $QA/rules/evidence.md.
EOF
