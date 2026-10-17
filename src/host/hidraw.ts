/** hidraw I/O: feature reports through ioctl (bun:ffi), input reports by polling. */

import { dlopen, FFIType, ptr, read } from 'bun:ffi';
import { closeSync, constants, openSync, readSync, writeSync } from 'node:fs';
import { constants as osConstants } from 'node:os';

import type { DeviceInfo } from '../shared/protocol';

const DEFAULT_FEATURE_SIZE = 64;
const MAX_REPORT_SIZE = 4096;
const POLL_INTERVAL_MS = 4;

const libc = (() => {
	const symbols = {
		__errno_location: { args: [], returns: FFIType.ptr },
		ioctl: {
			args: [FFIType.i32, FFIType.u64, FFIType.ptr],
			returns: FFIType.i32,
		},
	} as const;
	try {
		return dlopen('libc.so.6', symbols).symbols;
	} catch {
		return dlopen('libc.so', symbols).symbols;
	}
})();

const errnoNames = new Map(
	Object.entries(osConstants.errno).map(
		([name, code]) => [code, name] as const,
	),
);

/** `_IOC(_IOC_READ | _IOC_WRITE, 'H', nr, size)` from <linux/hidraw.h>. */
export const hidIoctl = (nr: number, size: number) =>
	BigInt(3 * 2 ** 30 + size * 2 ** 16 + 0x48 * 2 ** 8 + nr);

export const HIDIOCSFEATURE = (size: number) => hidIoctl(0x06, size);
export const HIDIOCGFEATURE = (size: number) => hidIoctl(0x07, size);

const ioctl = (fd: number, request: bigint, buffer: Uint8Array) => {
	const result = libc.ioctl(fd, request, ptr(buffer));
	if (result < 0) {
		const errnoPointer = libc.__errno_location();
		const errno = errnoPointer ? read.i32(errnoPointer, 0) : 0;
		throw new Error(
			`ioctl failed: ${errnoNames.get(errno) ?? `errno ${errno}`}`,
		);
	}
	return result;
};

const isWouldBlock = (error: unknown) =>
	(error as NodeJS.ErrnoException).code === 'EAGAIN';

export type InputListener = (
	key: string,
	reportId: number,
	data: Uint8Array,
) => void;

/** An opened hidraw node. */
export class HidrawDevice {
	readonly #info: DeviceInfo;
	readonly #fd: number;
	readonly #timer: ReturnType<typeof setInterval>;
	readonly #buffer = new Uint8Array(MAX_REPORT_SIZE);
	#closed = false;

	constructor(info: DeviceInfo, onInput: InputListener) {
		this.#info = info;
		this.#fd = openSync(info.path, constants.O_RDWR | constants.O_NONBLOCK);
		this.#timer = setInterval(() => this.#drain(onInput), POLL_INTERVAL_MS);
	}

	/** Reads every pending input report. */
	#drain(onInput: InputListener) {
		while (!this.#closed) {
			let length: number;
			try {
				length = readSync(this.#fd, this.#buffer);
			} catch (error) {
				if (!isWouldBlock(error)) this.close();
				return;
			}
			if (length <= 0) return;
			const report = this.#buffer.slice(0, length);
			if (this.#info.numbered)
				onInput(this.#info.key, report[0] ?? 0, report.subarray(1));
			else onInput(this.#info.key, 0, report);
		}
	}

	sendFeature(reportId: number, data: readonly number[]) {
		ioctl(
			this.#fd,
			HIDIOCSFEATURE(data.length + 1),
			Uint8Array.from([reportId, ...data]),
		);
	}

	/** Returns the report payload without its leading report ID byte. */
	getFeature(reportId: number) {
		const size = this.#info.sizes.feature[reportId] ?? DEFAULT_FEATURE_SIZE;
		const buffer = new Uint8Array(size + 1);
		buffer[0] = reportId;
		const length = ioctl(this.#fd, HIDIOCGFEATURE(buffer.length), buffer);
		return buffer.slice(1, length);
	}

	sendReport(reportId: number, data: readonly number[]) {
		writeSync(this.#fd, Uint8Array.from([reportId, ...data]));
	}

	close() {
		if (this.#closed) return;
		this.#closed = true;
		clearInterval(this.#timer);
		try {
			closeSync(this.#fd);
		} catch {
			// Already gone (device unplugged).
		}
	}
}
