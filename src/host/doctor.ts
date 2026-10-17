/** `linsgeek doctor`: checks the installation and the connected keyboards. */

import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import pkg from '../../package.json';
import { NATIVE_HOST } from '../shared/protocol';
import { enumerateDevices } from './devices';

export const UDEV_RULE = '/etc/udev/rules.d/70-linsgeek.rules';

/** Native messaging manifest directories. Keep in sync with install.sh. */
export const MANIFEST_DIRS = {
	'Firefox / Zen': '.mozilla/native-messaging-hosts',
	LibreWolf: '.librewolf/native-messaging-hosts',
	Waterfox: '.waterfox/native-messaging-hosts',
} as const;

const hex = (value: number) => value.toString(16).padStart(4, '0');

const isExecutable = (path: string) => {
	try {
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
};

export const doctor = () => {
	let healthy = true;
	const check = (ok: boolean, text: string, hint: string) => {
		healthy &&= ok;
		console.log(`  [${ok ? 'ok' : '!!'}] ${text}`);
		if (!ok) console.log(`       -> ${hint}`);
	};

	console.log(`linsgeek ${pkg.version}`);

	console.log('\nBrowser registration:');
	let registered = false;
	for (const [browser, dir] of Object.entries(MANIFEST_DIRS)) {
		const manifest = join(homedir(), dir, `${NATIVE_HOST}.json`);
		if (!existsSync(manifest)) continue;
		registered = true;
		let target = '';
		try {
			target =
				(
					JSON.parse(readFileSync(manifest, 'utf8')) as {
						path?: string;
					}
				).path ?? '';
		} catch {
			// Reported below as a missing host.
		}
		check(
			isExecutable(target),
			`${browser}: ${manifest}`,
			`host "${target}" is missing, run the installer again`,
		);
	}
	if (!registered)
		check(false, 'no native messaging manifest found', 'run the installer');
	if (existsSync('/snap/bin/firefox')) {
		console.log(
			'  [i]  Snap Firefox detected: it reaches native hosts through the XDG portal; if that fails, use the .deb Firefox (see README).',
		);
	}

	console.log('\nPermissions:');
	check(
		existsSync(UDEV_RULE),
		`udev rule ${UDEV_RULE}`,
		'run the installer (it asks for sudo once)',
	);

	console.log('\nKeyboards:');
	const devices = [...enumerateDevices().values()];
	if (devices.length === 0) {
		check(
			false,
			'no MonsGeek/Akko configuration interface found',
			'connect the keyboard with its USB cable or 2.4 GHz dongle, and check `lsusb`',
		);
	}
	for (const device of devices) {
		const usages = device.collections
			.map((c) => `${hex(c.usagePage)}:${hex(c.usage)}`)
			.join(', ');
		check(
			device.accessible,
			`${device.path}  ${hex(device.vendorId)}:${hex(device.productId)}  interface ${device.interfaceNumber ?? '?'}  ${device.productName}  [${usages}]`,
			'no read/write access: replug the keyboard after installing the udev rule',
		);
	}

	console.log(
		`\n${healthy ? 'Everything looks good.' : 'Some checks failed.'}`,
	);
	return healthy ? 0 : 1;
};
