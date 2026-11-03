#!/usr/bin/env bash
# Publish a signed release APK to the self-hosted F-Droid repo (issue #287).
#
#   scripts/fdroid-publish.sh --version 0.2.0      # real release
#   scripts/fdroid-publish.sh --dry-run            # pipeline proof (throwaway keys ok)
#
# Builds :app:assembleRelease signed with the upload key, runs `fdroid update`
# in a temp workdir seeded from the committed static/fdroid/, verifies the
# signed index like the F-Droid client does, then writes:
#   static/fdroid/repo/ + static/fdroid/archive/   (served by Vercel)
#   static/fdroid/qr.svg                           (add-repo QR for /android)
#   src/lib/fdroid/published.json                  (public fingerprint + latest APK)
#
# Keys, two modes (docs/guides/fdroid-repo.md):
#   file mode: apps/android/keystore.properties (or FP_KEYSTORE_PROPERTIES) for the
#              upload key; FDROID_REPO_KEYSTORE=<path> for the repo key; passwords
#              from FDROID_REPO_KEYSTORE_PASSWORD / FDROID_REPO_KEY_PASSWORD or prompted.
#   env mode:  FP_UPLOAD_KEYSTORE_B64, FP_UPLOAD_KEYSTORE_PASSWORD, FP_UPLOAD_KEY_ALIAS,
#              FP_UPLOAD_KEY_PASSWORD, FDROID_REPO_KEYSTORE_B64,
#              FDROID_REPO_KEYSTORE_PASSWORD, FDROID_REPO_KEY_PASSWORD
#              (decoded into a chmod-700 temp dir outside git, removed on exit).
# Both keystores must live OUTSIDE the git tree; the script refuses otherwise.
#
# Other env: FDROID_REPO_KEY_ALIAS (default repokey), FP_GRADLE_ARGS (extra gradle
# args), ANDROID_HOME (else sdk.dir from apps/android/local.properties),
# FDROID_BIN / FDROID_PYTHON (else `fdroid` on PATH and its interpreter).
set -euo pipefail
set +x

die() { echo "fdroid-publish: ERROR: $*" >&2; exit 1; }
warn() { echo "fdroid-publish: WARNING: $*" >&2; }
log() { echo "fdroid-publish: $*"; }

VERSION=""
DRY_RUN=0
while [ $# -gt 0 ]; do
	case "$1" in
		--version) VERSION="${2:-}"; shift 2 ;;
		--version=*) VERSION="${1#--version=}"; shift ;;
		--dry-run) DRY_RUN=1; shift ;;
		-h|--help) sed -n '2,26p' "$0"; exit 0 ;;
		*) die "unknown argument: $1" ;;
	esac
done

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
ANDROID_DIR="$ROOT/apps/android"
PUBLISHED_JSON="$ROOT/src/lib/fdroid/published.json"
STATIC_FDROID="$ROOT/static/fdroid"
APP_ID="com.familyplanz.app"

# --- helpers -----------------------------------------------------------------

abspath() { realpath -m -- "$1"; }

# Refuses any secret path inside the git tree (gitignored or not).
assert_outside_tree() {
	local label="$1" p
	p="$(abspath "$2")"
	case "$p/" in
		"$ROOT"/*) die "$label ($p) is inside the git tree $ROOT. Move it outside the repo." ;;
	esac
}

SECRETS_DIR=""
WORK_DIR=""
cleanup() {
	set +x
	[ -n "$SECRETS_DIR" ] && rm -rf -- "$SECRETS_DIR"
	[ -n "$WORK_DIR" ] && rm -rf -- "$WORK_DIR"
	return 0
}
trap cleanup EXIT INT TERM

secrets_dir() {
	if [ -z "$SECRETS_DIR" ]; then
		SECRETS_DIR="$(mktemp -d)"
		chmod 700 "$SECRETS_DIR"
		assert_outside_tree "temp secrets dir (TMPDIR)" "$SECRETS_DIR"
	fi
}

require_env() {
	local name
	for name in "$@"; do
		[ -n "${!name:-}" ] || die "env mode needs $name"
	done
}

prop() { # prop <file> <key> — value of a java .properties key (simple key=value)
	sed -n "s/^[[:space:]]*$2[[:space:]]*=[[:space:]]*//p" "$1" | tail -n 1 | sed 's/[[:space:]]*$//'
}

# --- tools -------------------------------------------------------------------

FDROID_BIN="${FDROID_BIN:-$(command -v fdroid || true)}"
[ -n "$FDROID_BIN" ] || die "fdroid not found: pip install fdroidserver (see docs/guides/fdroid-repo.md)"
if [ -z "${FDROID_PYTHON:-}" ]; then
	shebang="$(head -n 1 "$FDROID_BIN")"
	FDROID_PYTHON="${shebang#\#!}"
	case "$FDROID_PYTHON" in *python*) ;; *) FDROID_PYTHON=python3 ;; esac
fi
"$FDROID_PYTHON" -c 'import fdroidserver, qrcode' 2>/dev/null ||
	die "$FDROID_PYTHON cannot import fdroidserver + qrcode; set FDROID_PYTHON"

if [ -z "${ANDROID_HOME:-}" ] && [ -f "$ANDROID_DIR/local.properties" ]; then
	ANDROID_HOME="$(prop "$ANDROID_DIR/local.properties" sdk.dir)"
fi
[ -n "${ANDROID_HOME:-}" ] || die "set ANDROID_HOME (or sdk.dir in apps/android/local.properties)"
export ANDROID_HOME
APKSIGNER="$(find "$ANDROID_HOME/build-tools" -mindepth 2 -maxdepth 2 -name apksigner 2>/dev/null | sort -V | tail -n 1 || true)"
[ -x "$APKSIGNER" ] || die "apksigner not found under $ANDROID_HOME/build-tools"
PATH="$(dirname "$APKSIGNER"):$PATH"
export PATH

# --- version -----------------------------------------------------------------

if [ -z "$VERSION" ] && [ -n "${FP_RELEASE_TAG:-}" ]; then VERSION="${FP_RELEASE_TAG#android-v}"; fi
GRADLE_VERSION_ARGS=()
VERSION_CODE=""
if [ -n "$VERSION" ]; then
	[[ "$VERSION" =~ ^([0-9]+)\.([0-9]{1,3})\.([0-9]{1,3})$ ]] ||
		die "--version must be X.Y.Z (minor, patch <= 999), got '$VERSION'"
	VERSION_CODE=$((10#${BASH_REMATCH[1]} * 1000000 + 10#${BASH_REMATCH[2]} * 1000 + 10#${BASH_REMATCH[3]}))
	GRADLE_VERSION_ARGS=("-PfpVersionCode=$VERSION_CODE" "-PfpVersionName=$VERSION")
elif [ "$DRY_RUN" -eq 0 ]; then
	die "--version X.Y.Z is required for a real publish (versionCode must grow every release)"
fi

read_published() { # read_published <field> → fingerprint | latest.versionCode
	"$FDROID_PYTHON" -I -c '
import json, sys
d = json.load(open(sys.argv[1]))
v = d.get("fingerprint") if sys.argv[2] == "fingerprint" else (d.get("latest") or {}).get("versionCode")
print(v or "")' "$PUBLISHED_JSON" "$1"
}
PUBLISHED_FP="$(read_published fingerprint)"
PUBLISHED_CODE="$(read_published code)"
if [ -n "$VERSION_CODE" ] && [ -n "$PUBLISHED_CODE" ] && [ "$VERSION_CODE" -le "$PUBLISHED_CODE" ]; then
	msg="versionCode $VERSION_CODE ($VERSION) is not above the published $PUBLISHED_CODE"
	if [ "$DRY_RUN" -eq 1 ]; then warn "$msg (dry run, continuing)"; else die "$msg"; fi
fi

# --- upload (APK) key --------------------------------------------------------

if [ -n "${FP_UPLOAD_KEYSTORE_B64:-}" ]; then
	log "upload key: env mode"
	require_env FP_UPLOAD_KEYSTORE_PASSWORD FP_UPLOAD_KEY_ALIAS FP_UPLOAD_KEY_PASSWORD
	secrets_dir
	base64 -d > "$SECRETS_DIR/upload.jks" <<<"$FP_UPLOAD_KEYSTORE_B64" || die "FP_UPLOAD_KEYSTORE_B64 is not valid base64"
	# printf is a shell builtin: the values never reach a process argv.
	{
		printf 'storeFile=%s\n' "$SECRETS_DIR/upload.jks"
		printf 'storePassword=%s\n' "$FP_UPLOAD_KEYSTORE_PASSWORD"
		printf 'keyAlias=%s\n' "$FP_UPLOAD_KEY_ALIAS"
		printf 'keyPassword=%s\n' "$FP_UPLOAD_KEY_PASSWORD"
	} > "$SECRETS_DIR/keystore.properties"
	chmod 600 "$SECRETS_DIR/upload.jks" "$SECRETS_DIR/keystore.properties"
	export FP_KEYSTORE_PROPERTIES="$SECRETS_DIR/keystore.properties"
else
	log "upload key: file mode"
	props="${FP_KEYSTORE_PROPERTIES:-$ANDROID_DIR/keystore.properties}"
	[ -f "$props" ] || die "no $props — create it (docs/guides/android-release.md) or use env mode"
	store="$(prop "$props" storeFile)"
	[ -n "$store" ] || die "storeFile missing in $props"
	case "$store" in /*) ;; *) store="$ANDROID_DIR/$store" ;; esac
	[ -f "$store" ] || die "upload keystore $store not found"
	FP_KEYSTORE_PROPERTIES="$(abspath "$props")"
	export FP_KEYSTORE_PROPERTIES
fi
assert_outside_tree "upload keystore" "$(
	store="$(prop "$FP_KEYSTORE_PROPERTIES" storeFile)"
	case "$store" in /*) echo "$store" ;; *) echo "$ANDROID_DIR/$store" ;; esac
)"

# --- repo (index) key --------------------------------------------------------

export FDROID_REPO_KEY_ALIAS="${FDROID_REPO_KEY_ALIAS:-repokey}"
if [ -n "${FDROID_REPO_KEYSTORE_B64:-}" ]; then
	log "repo key: env mode"
	require_env FDROID_REPO_KEYSTORE_PASSWORD FDROID_REPO_KEY_PASSWORD
	secrets_dir
	base64 -d > "$SECRETS_DIR/repo.jks" <<<"$FDROID_REPO_KEYSTORE_B64" || die "FDROID_REPO_KEYSTORE_B64 is not valid base64"
	chmod 600 "$SECRETS_DIR/repo.jks"
	export FDROID_REPO_KEYSTORE="$SECRETS_DIR/repo.jks"
else
	log "repo key: file mode"
	[ -n "${FDROID_REPO_KEYSTORE:-}" ] || die "set FDROID_REPO_KEYSTORE=<path to repo keystore> (or env mode)"
	[ -f "$FDROID_REPO_KEYSTORE" ] || die "repo keystore $FDROID_REPO_KEYSTORE not found"
	FDROID_REPO_KEYSTORE="$(abspath "$FDROID_REPO_KEYSTORE")"
	export FDROID_REPO_KEYSTORE
	if [ -z "${FDROID_REPO_KEYSTORE_PASSWORD:-}" ]; then
		read -rsp "Repo keystore password: " FDROID_REPO_KEYSTORE_PASSWORD; echo
	fi
	if [ -z "${FDROID_REPO_KEY_PASSWORD:-}" ]; then
		read -rsp "Repo key password (Enter = same): " FDROID_REPO_KEY_PASSWORD; echo
		FDROID_REPO_KEY_PASSWORD="${FDROID_REPO_KEY_PASSWORD:-$FDROID_REPO_KEYSTORE_PASSWORD}"
	fi
fi
assert_outside_tree "repo keystore" "$FDROID_REPO_KEYSTORE"
export FDROID_REPO_KEYSTORE_PASSWORD FDROID_REPO_KEY_PASSWORD

# keytool reads the password from the env (:env), never from argv.
REPO_FP="$(keytool -exportcert -alias "$FDROID_REPO_KEY_ALIAS" -keystore "$FDROID_REPO_KEYSTORE" \
	-storepass:env FDROID_REPO_KEYSTORE_PASSWORD | sha256sum | cut -d' ' -f1 | tr 'a-f' 'A-F')" ||
	die "cannot read alias $FDROID_REPO_KEY_ALIAS from the repo keystore"
[[ "$REPO_FP" =~ ^[0-9A-F]{64}$ ]] || die "could not compute the repo key fingerprint"
if [ -n "$PUBLISHED_FP" ] && [ "$PUBLISHED_FP" != "$REPO_FP" ]; then
	msg="repo key fingerprint $REPO_FP differs from the published $PUBLISHED_FP — every installed client would reject the new index"
	if [ "$DRY_RUN" -eq 1 ]; then warn "$msg (dry run, continuing)"; else die "$msg"; fi
fi
log "repo key fingerprint: $REPO_FP"

# --- build -------------------------------------------------------------------

log "building :app:assembleRelease ${VERSION:+(versionName $VERSION, versionCode $VERSION_CODE)}"
# shellcheck disable=SC2086 # FP_GRADLE_ARGS is intentionally word-split
(cd "$ANDROID_DIR" && ./gradlew ${FP_GRADLE_ARGS:-} :app:assembleRelease ${GRADLE_VERSION_ARGS[@]+"${GRADLE_VERSION_ARGS[@]}"})
APK="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
[ -f "$APK" ] || die "no signed $APK (an unsigned build is app-release-unsigned.apk: check the upload key)"
"$APKSIGNER" verify "$APK" || die "apksigner rejects $APK"

# --- fdroid update in a throwaway workdir -------------------------------------

WORK_DIR="$(mktemp -d)"
assert_outside_tree "fdroid workdir (TMPDIR)" "$WORK_DIR"
cp "$ROOT/fdroid/config.yml" "$WORK_DIR/config.yml"
chmod 600 "$WORK_DIR/config.yml"
cp -R "$ROOT/fdroid/metadata" "$WORK_DIR/metadata"
# The launcher icon is adaptive XML only, so fdroid cannot pull a PNG from the
# APK; ship the brand raster as the fastlane-style app icon instead.
cp "$ROOT/static/icon-512.png" "$WORK_DIR/metadata/$APP_ID/en-US/icon.png"
# config.yml repo_icon/archive_icon are resolved relative to the workdir.
cp "$ROOT/static/icon-512.png" "$WORK_DIR/familyplanz.png"
for section in repo archive; do
	mkdir -p "$WORK_DIR/$section"
	# The committed repo is the source of truth for earlier releases.
	if compgen -G "$STATIC_FDROID/$section/*.apk" > /dev/null; then
		cp "$STATIC_FDROID/$section/"*.apk "$WORK_DIR/$section/"
	fi
done
ACTUAL_CODE="$("$FDROID_PYTHON" -I -c '
import sys
from fdroidserver.common import get_apk_id_androguard
appid, code, _name = get_apk_id_androguard(sys.argv[1])
assert appid == sys.argv[2], appid
print(code)' "$APK" "$APP_ID")" || die "cannot read versionCode from $APK"
APK_NAME="${APP_ID}_${ACTUAL_CODE}.apk"
if [ -e "$WORK_DIR/repo/$APK_NAME" ] || [ -e "$WORK_DIR/archive/$APK_NAME" ]; then
	[ "$DRY_RUN" -eq 1 ] || die "$APK_NAME is already published; bump --version"
	rm -f "$WORK_DIR/repo/$APK_NAME" "$WORK_DIR/archive/$APK_NAME"
	warn "replacing already-published $APK_NAME (dry run)"
fi
cp "$APK" "$WORK_DIR/repo/$APK_NAME"

log "fdroid update"
(cd "$WORK_DIR" && "$FDROID_BIN" update)

# --- verify like the client, write the public outputs --------------------------

VERIFY_ARGS=()
if [ "$DRY_RUN" -eq 1 ]; then VERIFY_ARGS=(--allow-mixed-signers); fi
OUT_STAGE="$WORK_DIR/out"
mkdir -p "$OUT_STAGE"
"$FDROID_PYTHON" -I "$ROOT/scripts/fdroid-verify.py" \
	--repo "$WORK_DIR/repo" --fingerprint "$REPO_FP" --apk "$APK_NAME" \
	--repo-url "https://familyplanz.com/fdroid/repo" \
	--published-json "$OUT_STAGE/published.json" --qr-svg "$OUT_STAGE/qr.svg" \
	${VERIFY_ARGS[@]+"${VERIFY_ARGS[@]}"}

rm -rf "$STATIC_FDROID/repo" "$STATIC_FDROID/archive"
mkdir -p "$STATIC_FDROID"
cp -R "$WORK_DIR/repo" "$STATIC_FDROID/repo"
cp -R "$WORK_DIR/archive" "$STATIC_FDROID/archive"
rm -rf "$STATIC_FDROID/repo/status" "$STATIC_FDROID/archive/status"
cp "$OUT_STAGE/qr.svg" "$STATIC_FDROID/qr.svg"
cp "$OUT_STAGE/published.json" "$PUBLISHED_JSON"

log "published $APK_NAME — fingerprint $REPO_FP"
log "wrote static/fdroid/{repo,archive,qr.svg} and src/lib/fdroid/published.json"
if [ "$DRY_RUN" -eq 1 ]; then
	warn "DRY RUN: do not commit these outputs (git checkout -- static/fdroid src/lib/fdroid/published.json && git clean -fdx static/fdroid)"
else
	log "next: commit static/fdroid + src/lib/fdroid/published.json and deploy"
fi
