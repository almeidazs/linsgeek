/** hidraw device discovery through sysfs. */

import {
	accessSync,
	constants,
	readdirSync,
	readFileSync,
	realpathSync,
} from 'node:fs';
import { join } from 'node:path';

import type {
	CollectionInfo,
	DeviceInfo,
	ReportType,
} from '../shared/protocol';
import { parseDescriptor, REPORT_TYPES, reportSizes } from './descriptor';

export const SYSFS_HIDRAW = '/sys/class/hidraw';

/** Vendor IDs used by MonsGeek / Akko keyboards in app.monsgeek.com's device table. */
export const ALLOWED_VENDORS = new Set([0x3151, 0x38ee, 0x39ab]);

/**
 * Like Chrome's WebHID blocklist: never expose keyboard/keypad collections,
 * otherwise a page could read everything typed on the keyboard.
 */
const PROTECTED_USAGES = new Set(['1:6', '1:7']);

export interface DiscoveryOptions {
	sysfs?: string;
	devDir?: string;
	allowedVendors?: ReadonlySet<number>;
}

const readText = (path: string) => {
	try {
		return readFileSync(path, 'utf8');
	} catch {
		return undefined;
	}
};

const readBytes = (path: string) => {
	try {
		return new Uint8Array(readFileSync(path));
	} catch {
		return new Uint8Array();
	}
};

const canReadWrite = (path: string) => {
	try {
		accessSync(path, constants.R_OK | constants.W_OK);
		return true;
	} catch {
		return false;
	}
};

const parseUevent = (text = '') =>
	new Map(
		text
			.split('\n')
			.filter((line) => line.includes('='))
			.map((line) => {
				const at = line.indexOf('=');
				return [line.slice(0, at), line.slice(at + 1)] as const;
			}),
	);

/** Describes `/dev/<node>`, or returns `undefined` when it must stay hidden. */
export const describe = (
	node: string,
	{
		sysfs = SYSFS_HIDRAW,
		devDir = '/dev',
		allowedVendors = ALLOWED_VENDORS,
	}: DiscoveryOptions = {},
): DeviceInfo | undefined => {
	const base = join(sysfs, node, 'device');
	const uevent = parseUevent(readText(join(base, 'uevent')));
	const [, vid, pid] = uevent.get('HID_ID')?.split(':') ?? [];
	const vendorId = Number.parseInt(vid ?? '', 16);
	const productId = Number.parseInt(pid ?? '', 16);
	if (
		Number.isNaN(vendorId) ||
		Number.isNaN(productId) ||
		!allowedVendors.has(vendorId)
	) {
		return undefined;
	}

	const { collections: parsed, numbered } = parseDescriptor(
		readBytes(join(base, 'report_descriptor')),
	);
	const exposed = parsed.filter(
		(collection) =>
			!PROTECTED_USAGES.has(
				`${collection.usagePage}:${collection.usage}`,
			),
	);
	if (exposed.length === 0) return undefined;

	let realBase: string;
	try {
		realBase = realpathSync(base);
	} catch {
		return undefined;
	}
	// For USB, the HID device's parent is the interface and its grandparent is
	// the physical device, which every interface of the same keyboard shares.
	const interfaceRaw = readText(join(realBase, '..', 'bInterfaceNumber'));
	const interfaceNumber = interfaceRaw
		? Number.parseInt(interfaceRaw.trim(), 16)
		: Number.NaN;
	const hasInterface = !Number.isNaN(interfaceNumber);
	const physical = hasInterface
		? realpathSync(join(realBase, '..', '..'))
		: realBase;

	const sizes = { feature: {}, input: {}, output: {} } as Record<
		ReportType,
		Record<string, number>
	>;
	for (const collection of exposed) {
		for (const type of REPORT_TYPES) {
			for (const [id, size] of reportSizes(collection, type)) {
				sizes[type][id] = Math.max(sizes[type][id] ?? 0, size);
			}
		}
	}

	const collections: CollectionInfo[] = exposed.map((collection) => ({
		featureReports: [...collection.bits.feature.keys()].sort(
			(a, b) => a - b,
		),
		inputReports: [...collection.bits.input.keys()].sort((a, b) => a - b),
		outputReports: [...collection.bits.output.keys()].sort((a, b) => a - b),
		type: collection.type,
		usage: collection.usage,
		usagePage: collection.usagePage,
	}));

	const path = join(devDir, node);
	return {
		accessible: canReadWrite(path),
		collections,
		interfaceNumber: hasInterface ? interfaceNumber : null,
		key: `${node}|${realBase}`,
		numbered,
		path,
		physical,
		productId,
		productName: uevent.get('HID_NAME') ?? '',
		sizes,
		vendorId,
	};
};

/** Every exposed hidraw node, by key. */
export const enumerateDevices = (options: DiscoveryOptions = {}) => {
	const found = new Map<string, DeviceInfo>();
	let nodes: string[];
	try {
		nodes = readdirSync(options.sysfs ?? SYSFS_HIDRAW).sort();
	} catch {
		return found;
	}
	for (const node of nodes) {
		const info = describe(node, options);
		if (info) found.set(info.key, info);
	}
	return found;
};
