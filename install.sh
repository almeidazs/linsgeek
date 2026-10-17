#!/usr/bin/env bash
# Installs linsgeek for the current user: the native host used by
# Firefox-based browsers, plus the udev rule every browser needs.
#
#   curl -fsSL https://raw.githubusercontent.com/almeidazs/linsgeek/main/install.sh | bash
#
# Options: --no-udev    skip the udev rule (no sudo)
#          --uninstall  remove everything this script installed
set -euo pipefail

REPO="${LINSGEEK_REPO:-almeidazs/linsgeek}"
VERSION="${LINSGEEK_VERSION:-latest}"

NAME="linsgeek"
EXTENSION_ID="linsgeek@almeidazs.com"
PREFIX="${XDG_DATA_HOME:-$HOME/.local/share}/linsgeek"
BIN_LINK="$HOME/.local/bin/linsgeek"
UDEV_RULE="/etc/udev/rules.d/70-linsgeek.rules"
TMP_DIR=""

# Native messaging manifest directories (keep in sync with src/host/doctor.ts).
# ~/.mozilla serves Firefox and Zen; the others only when that browser exists.
ALWAYS_DIR="$HOME/.mozilla/native-messaging-hosts"
OPTIONAL_DIRS=(
	"$HOME/.librewolf:$HOME/.librewolf/native-messaging-hosts"
	"$HOME/.waterfox:$HOME/.waterfox/native-messaging-hosts"
)

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
die() {
	printf 'error: %s\n' "$*" >&2
	exit 1
}

as_root() {
	if [[ $EUID -eq 0 ]]; then "$@"; else sudo "$@"; fi
}

download() {
	curl -fsSL --retry 2 "$1" -o "$2" || die "download failed: $1"
}

release_url() {
	if [[ "$VERSION" == "latest" ]]; then
		echo "https://github.com/$REPO/releases/latest/download/$1"
	else
		echo "https://github.com/$REPO/releases/download/$VERSION/$1"
	fi
}

manifest_dirs() {
	echo "$ALWAYS_DIR"
	local entry
	for entry in "${OPTIONAL_DIRS[@]}"; do
		[[ -d "${entry%%:*}" ]] && echo "${entry#*:}"
	done
	return 0
}

# The directory of this script when it runs from a checkout, empty when piped.
checkout_dir() {
	local script="${BASH_SOURCE[0]:-}"
	[[ -n "$script" && -f "$script" ]] || return 0
	local dir
	dir="$(cd "$(dirname "$script")" && pwd)"
	[[ -f "$dir/udev/70-linsgeek.rules" ]] && echo "$dir"
	return 0
}

arch() {
	case "$(uname -m)" in
		x86_64 | amd64) echo x64 ;;
		aarch64 | arm64) echo arm64 ;;
		*) die "unsupported CPU architecture: $(uname -m)" ;;
	esac
}

install_host() {
	local checkout="$1" tmp="$2" binary
	binary="linsgeek-linux-$(arch)"
	mkdir -p "$PREFIX" "$(dirname "$BIN_LINK")"

	if [[ -n "$checkout" && -x "$checkout/dist/$binary" ]]; then
		install -m 755 "$checkout/dist/$binary" "$PREFIX/$NAME"
		info "host     -> $PREFIX/$NAME (from ./dist)"
	else
		info "downloading $binary ($VERSION)"
		download "$(release_url "$binary.gz")" "$tmp/$binary.gz"
		gunzip -f "$tmp/$binary.gz"
		install -m 755 "$tmp/$binary" "$PREFIX/$NAME"
		info "host     -> $PREFIX/$NAME"
	fi
	ln -sf "$PREFIX/$NAME" "$BIN_LINK"

	local dir
	while read -r dir; do
		mkdir -p "$dir"
		cat >"$dir/$NAME.json" <<JSON
{
	"name": "$NAME",
	"description": "linsgeek: WebHID for MonsGeek keyboards on Linux",
	"path": "$PREFIX/$NAME",
	"type": "stdio",
	"allowed_extensions": ["$EXTENSION_ID"]
}
JSON
		info "manifest -> $dir/$NAME.json"
	done < <(manifest_dirs)
}

install_udev() {
	local checkout="$1" tmp="$2" rule
	if [[ -n "$checkout" ]]; then
		rule="$checkout/udev/70-linsgeek.rules"
	else
		rule="$tmp/70-linsgeek.rules"
		download "https://raw.githubusercontent.com/$REPO/main/udev/70-linsgeek.rules" "$rule"
	fi
	if [[ -f "$UDEV_RULE" ]] && cmp -s "$rule" "$UDEV_RULE"; then
		info "udev     -> $UDEV_RULE (up to date)"
		return
	fi
	info "installing the udev rule (asks for your password)"
	as_root install -m 644 "$rule" "$UDEV_RULE"
	as_root udevadm control --reload-rules
	as_root udevadm trigger --subsystem-match=hidraw
	info "udev     -> $UDEV_RULE"
}

uninstall() {
	local with_udev="$1" dir
	bold "Uninstalling linsgeek"
	rm -rf "$PREFIX"
	[[ -L "$BIN_LINK" ]] && rm -f "$BIN_LINK"
	for dir in "$ALWAYS_DIR" "${OPTIONAL_DIRS[@]#*:}"; do
		rm -f "$dir/$NAME.json"
	done
	info "removed the native host and its browser registration"
	if [[ $with_udev -eq 1 && -e "$UDEV_RULE" ]]; then
		as_root rm -f "$UDEV_RULE"
		as_root udevadm control --reload-rules
		info "removed $UDEV_RULE"
	fi
	info "Remove the browser extension from its add-ons page."
}

main() {
	local with_udev=1 remove=0 arg
	for arg in "$@"; do
		case "$arg" in
			--no-udev) with_udev=0 ;;
			--uninstall) remove=1 ;;
			-h | --help)
				sed -n '2,8p' "${BASH_SOURCE[0]:-/dev/null}" 2>/dev/null || true
				exit 0
				;;
			*) die "unknown option: $arg" ;;
		esac
	done

	[[ "$(uname -s)" == "Linux" ]] || die "linsgeek only supports Linux"
	[[ $EUID -ne 0 ]] || die "run as your normal user, not root (sudo is only used for the udev rule)"

	if [[ $remove -eq 1 ]]; then
		uninstall "$with_udev"
		return
	fi

	local checkout
	checkout="$(checkout_dir)"
	TMP_DIR="$(mktemp -d)"
	trap 'rm -rf "$TMP_DIR"' EXIT
	[[ -n "$checkout" ]] || command -v curl >/dev/null || die "curl is required"

	bold "Installing linsgeek"
	install_host "$checkout" "$TMP_DIR"
	if [[ $with_udev -eq 1 ]]; then
		install_udev "$checkout" "$TMP_DIR"
	else
		info "udev     -> skipped (--no-udev)"
	fi

	echo
	bold "Next steps"
	info "1. Unplug and replug the keyboard."
	info "2. Firefox / Zen / LibreWolf: install the extension from"
	info "   https://github.com/$REPO/releases/latest"
	info "   Chrome / Chromium / Brave / Edge: nothing else is needed."
	info "3. Open https://app.monsgeek.com/ and click \"Add Device\"."
	info "Troubleshooting: linsgeek doctor"
	case ":$PATH:" in
		*":$HOME/.local/bin:"*) ;;
		*) info "(~/.local/bin is not in your PATH: run $BIN_LINK doctor)" ;;
	esac
}

main "$@"
