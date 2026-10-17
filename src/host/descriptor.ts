/**
 * Minimal HID report descriptor parser: extracts what WebHID exposes and the
 * bridge needs, namely top-level collections and their report IDs and sizes.
 */

import type { ReportType } from '../shared/protocol';

export const REPORT_TYPES: readonly ReportType[] = [
	'input',
	'output',
	'feature',
];

const MAIN_TYPES: Record<number, ReportType> = {
	0x8: 'input',
	0x9: 'output',
	0xb: 'feature',
};
const MAIN_COLLECTION = 0xa;
const MAIN_END_COLLECTION = 0xc;

const GLOBAL_USAGE_PAGE = 0x0;
const GLOBAL_REPORT_SIZE = 0x7;
const GLOBAL_REPORT_ID = 0x8;
const GLOBAL_REPORT_COUNT = 0x9;
const GLOBAL_PUSH = 0xa;
const GLOBAL_POP = 0xb;
const LOCAL_USAGE = 0x0;

const LONG_ITEM = 0xfe;
const ITEM_SIZES = [0, 1, 2, 4] as const;

export interface Collection {
	usagePage: number;
	usage: number;
	type: number;
	/** Report size in bits, by report type and report ID. */
	bits: Record<ReportType, Map<number, number>>;
}

export interface ParsedDescriptor {
	collections: Collection[];
	/** Whether the device uses report IDs (and prefixes every report with one). */
	numbered: boolean;
}

interface Globals {
	usagePage: number;
	reportSize: number;
	reportCount: number;
	reportId: number;
}

const readValue = (bytes: Uint8Array, start: number, size: number) => {
	let value = 0;
	for (let i = 0; i < size && start + i < bytes.length; i++) {
		value += (bytes[start + i] ?? 0) * 2 ** (8 * i);
	}
	return value;
};

export const parseDescriptor = (bytes: Uint8Array): ParsedDescriptor => {
	const collections: Collection[] = [];
	const stack: Globals[] = [];
	let globals: Globals = {
		reportCount: 0,
		reportId: 0,
		reportSize: 0,
		usagePage: 0,
	};
	let usages: number[] = [];
	let depth = 0;
	let current: Collection | undefined;
	let numbered = false;

	let i = 0;
	while (i < bytes.length) {
		const prefix = bytes[i] ?? 0;
		if (prefix === LONG_ITEM) {
			i += 3 + (bytes[i + 1] ?? 0);
			continue;
		}
		const size = ITEM_SIZES[prefix & 0x3] ?? 0;
		const itemType = (prefix >> 2) & 0x3;
		const tag = prefix >> 4;
		const value = readValue(bytes, i + 1, size);
		i += 1 + size;

		if (itemType === 1) {
			if (tag === GLOBAL_USAGE_PAGE) globals.usagePage = value;
			else if (tag === GLOBAL_REPORT_SIZE) globals.reportSize = value;
			else if (tag === GLOBAL_REPORT_COUNT) globals.reportCount = value;
			else if (tag === GLOBAL_REPORT_ID) {
				globals.reportId = value;
				numbered = true;
			} else if (tag === GLOBAL_PUSH) stack.push({ ...globals });
			else if (tag === GLOBAL_POP) globals = stack.pop() ?? globals;
		} else if (itemType === 2) {
			if (tag === LOCAL_USAGE) {
				// A 4-byte usage carries its own usage page in the high half.
				usages.push(
					size === 4 ? value : globals.usagePage * 0x10000 + value,
				);
			}
		} else if (itemType === 0) {
			const reportType = MAIN_TYPES[tag];
			if (tag === MAIN_COLLECTION) {
				if (depth === 0) {
					const usage = usages[0] ?? globals.usagePage * 0x10000;
					current = {
						bits: {
							feature: new Map(),
							input: new Map(),
							output: new Map(),
						},
						type: value,
						usage: usage % 0x10000,
						usagePage: Math.floor(usage / 0x10000),
					};
					collections.push(current);
				}
				depth++;
			} else if (tag === MAIN_END_COLLECTION) {
				depth = Math.max(0, depth - 1);
			} else if (reportType && current) {
				const bits = current.bits[reportType];
				bits.set(
					globals.reportId,
					(bits.get(globals.reportId) ?? 0) +
						globals.reportSize * globals.reportCount,
				);
			}
			usages = [];
		}
	}

	return { collections, numbered };
};

/** Report sizes in bytes for one report type, keyed by report ID. */
export const reportSizes = (collection: Collection, type: ReportType) =>
	new Map(
		[...collection.bits[type]].map(([id, bits]) => [
			id,
			Math.ceil(bits / 8),
		]),
	);
