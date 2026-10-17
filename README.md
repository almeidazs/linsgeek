# linsgeek

Configure **MonsGeek / Akko keyboards on Linux**, in **any browser**, with the
official web driver at **[app.monsgeek.com](https://app.monsgeek.com/)**: key
remapping, magnetic switch actuation, lighting, macros, Fn layers and more.

The official driver supports only Windows, macOS and Chrome. linsgeek fills the gaps:

| Browser | What you need |
|---|---|
| Chrome, Chromium, Brave, Edge, Vivaldi, Opera | the installer (udev rule only) |
| Zen, LibreWolf, Waterfox, Firefox Developer Edition / Nightly / ESR | the installer **and** the extension |
| Firefox (regular release) | the installer **and** the extension, loaded as a temporary add-on (see below) |

> Unofficial community project, not affiliated with or endorsed by MonsGeek or
> Akko. linsgeek does not modify the official driver: it gives Firefox the
> WebHID API the driver expects, and gives every browser access to the keyboard.

Tested with a **FUN60 PRO**. Other keyboards supported by the web driver
(FUN60 family, M1, M5, …) should work too, since the app does all the work.

## Install

### 1. Run the installer

```bash
curl -fsSL https://raw.githubusercontent.com/almeidazs/linsgeek/main/install.sh | bash
```

It asks for your password once, to install the udev rule. Then **unplug and
replug the keyboard**.

<details>
<summary>What does it install?</summary>

| Path | Purpose |
|---|---|
| `/etc/udev/rules.d/70-linsgeek.rules` | lets the logged-in user access MonsGeek/Akko HID devices (`TAG+="uaccess"`) |
| `~/.local/share/linsgeek/linsgeek` | the native host, a single self-contained binary (x64 or arm64) |
| `~/.local/bin/linsgeek` | the same binary on your `PATH` (`linsgeek doctor`, `linsgeek list`) |
| `~/.mozilla/native-messaging-hosts/linsgeek.json` | registers the host with Firefox and Zen (also `~/.librewolf` and `~/.waterfox` when they exist) |

Options: `--no-udev` skips the udev rule, `--uninstall` removes everything:

```bash
curl -fsSL https://raw.githubusercontent.com/almeidazs/linsgeek/main/install.sh | bash -s -- --uninstall
```

Prefer to read the script first? Clone the repository and run `./install.sh`.
</details>

### 2. Set up your browser

<details open>
<summary><b>Chrome / Chromium / Brave / Edge / Vivaldi / Opera</b></summary>

Nothing else to do. These browsers already support WebHID; they only needed
the udev rule. Go to step 3.

Flatpak builds cannot see HID devices by default:
`flatpak override --user --device=all com.google.Chrome` (use your browser's app ID).
</details>

<details open>
<summary><b>Zen / LibreWolf / Waterfox / Firefox Developer Edition, Nightly or ESR</b></summary>

The extension is not signed by Mozilla, so allow unsigned extensions first:

1. Open `about:config`, search for `xpinstall.signatures.required` and set it to `false`.
2. Download `linsgeek-<version>.xpi` from the [latest release](https://github.com/almeidazs/linsgeek/releases/latest).
3. Open `about:addons` → gear icon → **Install Add-on From File…** → pick the `.xpi`.
4. Accept the permissions ("Access your data for app.monsgeek.com" and
   "Exchange messages with programs other than Firefox").

The installer registers the native host for LibreWolf and Waterfox when their
profile folders exist, so start the browser once before running it. Only Zen
has been tested so far: reports are welcome.
</details>

<details open>
<summary><b>Firefox (regular release)</b></summary>

Regular Firefox never installs unsigned extensions; the `about:config` switch
has no effect there. You can either:

- load it as a **temporary add-on**, which lasts until Firefox closes: go to
  `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick
  the `.xpi`; or
- use [Firefox Developer Edition](https://www.mozilla.org/firefox/developer/)
  or ESR and follow the steps above.

**Ubuntu's default Firefox is a Snap.** It reaches native hosts through the XDG
desktop portal, which has not been tested with linsgeek yet. If the driver says
it cannot reach the native host, use a Firefox from
[Mozilla's APT repository](https://support.mozilla.org/kb/install-firefox-linux).
</details>

<details>
<summary><b>From source</b></summary>

Run `bun run build:extension` in a clone, then go to
`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick
`dist/extension/manifest.json`.
</details>

### 3. Configure the keyboard

1. Connect the keyboard with its **USB cable** or its **2.4 GHz dongle**.
2. Open **https://app.monsgeek.com/** and click **Add Device**.
3. Firefox-based browsers show linsgeek's device picker: select the keyboard
   and click **Connect**. Next time it connects by itself.

## Troubleshooting

```bash
linsgeek doctor
```

checks the browser registration, the udev rule and the connected keyboards.

| Problem | Fix |
|---|---|
| "No compatible device found" | Use the USB cable or the dongle (Bluetooth is untested). Check that `lsusb` lists vendor `3151`, `38ee` or `39ab`. |
| Device shows **NO PERMISSION** | The udev rule is missing or the keyboard was not replugged: run the installer again, then replug. |
| "Cannot reach the native host" | Run the installer, restart the browser and check `linsgeek doctor`. With Snap Firefox, see the Firefox notes above. |
| The page asks to download a plugin ("LiveSync Mode") | LiveSync (audio visualizer, screen sync) needs MonsGeek's Windows-only IoT Manager. The extension turns that setting off on every load, so reload the page. In Chrome, run `localStorage.setItem("IOTSwitch", "false")` in the console and reload. |
| Some symbols come out wrong (e.g. `Fn` + `/` types `;`) | Not a bug: the keyboard sends US key positions, and a non-US system layout (such as Brazilian ABNT2) maps them to other characters. Use a US layout, e.g. *English (US, intl., with dead keys)*. |

## How it works

```
app.monsgeek.com
  │ navigator.hid (WebHID)
  ▼
content/polyfill   page world: HID, HIDDevice, device picker
  │ window.postMessage
  ▼
content/bridge     isolated content script
  │ runtime port
  ▼
background         one native host process per tab
  │ native messaging (stdin/stdout)
  ▼
linsgeek host      sysfs discovery, hidraw ioctls through bun:ffi
  │ HIDIOCSFEATURE / HIDIOCGFEATURE / read / write
  ▼
/dev/hidrawN ──► keyboard
```

Chromium-based browsers skip everything above `/dev/hidrawN`: their built-in
WebHID reads hidraw directly once the udev rule grants access.

**Security**

- The extension runs only on `https://app.monsgeek.com/*`.
- The host exposes only MonsGeek/Akko vendor IDs and, like Chrome, **hides
  keyboard and keypad collections**, so pages can reach the vendor
  configuration interfaces but cannot read your typing.
- The udev rule grants access only to the user at the physical seat
  (`uaccess`), and only for those vendor IDs.
- Granted devices are remembered in the site's `localStorage`
  (`__linsgeekGranted`), like Chrome's per-site permissions.

<details>
<summary>Protocol notes</summary>

From static analysis of the app.monsgeek.com bundle, confirmed against the live
app and a FUN60 PRO. The app changes over time, so treat this as a snapshot.

- **Transports.** In a browser the app uses WebHID. The desktop app (and the
  "IoT SDK" switch) instead talks gRPC-web to local services:
  `hid.HidService` on `127.0.0.1:3838`, orchestrated by `iot_manager_rs` on
  `:6015`. `localStorage.IOTSwitch = true` (set by "LiveSync Mode") forces that path.
- **WebHID surface.** `getDevices`, `requestDevice`, the `disconnect` event,
  `open`, `collections[].usagePage/usage`, `sendFeatureReport`,
  `receiveFeatureReport` (report ID prefixed when non-zero, like Chrome),
  `sendReport` and `inputreport`.
- **FUN60 interfaces.** 0: boot keyboard (`0x01:0x06`) · 1: vendor
  notifications (`0xFFFF:0x01`) · 2: configuration (`0xFFFF:0x02`), feature
  report ID 0, 64 bytes. Vendor IDs `0x3151`, `0x38EE`, `0x39AB`.
- **Commands.** 64-byte feature reports: `byte[0]` = command, checksum
  `byte[7] = 0xFF - sum(byte[0..6])`, and the reply echoes the command in `byte[0]`.
  `0x8F` returns the device ID (u32 LE at `byte[1..4]`, e.g. 2600 = FUN60 PRO)
  and the USB firmware version (`byte[7..8]`). Reads: `0x80` RF version, `0x83`
  polling rate, `0x84` profile, `0x86` debounce, `0x87` LED params, `0x89`
  options, `0x8A` key matrix, `0x8B` macros, `0x90` Fn layer, `0x91` sleep
  time, `0xE5` magnetism, `0xE6` feature list.
</details>

## Development

Requires [Bun](https://bun.sh).

```
src/
  shared/protocol.ts    messages between the extension and the host
  extension/            WebExtension (Manifest V3): background, content/bridge, content/polyfill
  host/                 native host: descriptor parser, sysfs discovery, hidraw I/O, CLI
udev/70-linsgeek.rules
install.sh
```

```bash
bun install
bun run check            # types, oxfmt + oxlint, web-ext lint
bun run fix              # format and autofix
bun run build            # dist/extension + dist/linsgeek-linux-{x64,arm64}
bun run dev:host list    # run the host from source
./install.sh --no-udev   # install from ./dist
```

**Releasing.** Bump `version` in `package.json` (the extension manifest and the
host read it at build time), then run `bun run release`. It runs the checks,
builds both host binaries and the `.xpi`, and publishes a GitHub release with
`linsgeek-linux-x64.gz`, `linsgeek-linux-arm64.gz` and `linsgeek-<version>.xpi`.

The `.xpi` is unsigned by default. To make it installable in regular Firefox,
set `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`
([addons.mozilla.org API keys](https://addons.mozilla.org/developers/addon/api/key/))
before `bun run release`: the extension is then signed as an *unlisted* add-on,
which is never published on the add-ons site.

## License

[Apache-2.0](LICENSE)
