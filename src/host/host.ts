/** Native host: serves requests from the extension and pushes device events. */

import pkg from '../../package.json';
import type {
	DeviceInfo,
	HostEvent,
	Request,
	Response,
	Result,
} from '../shared/protocol';
import { enumerateDevices } from './devices';
import { HidrawDevice, type InputListener } from './hidraw';
import { type Channel, FrameReader, stdoutChannel } from './messaging';

const HOTPLUG_INTERVAL_MS = 1000;

interface OpenDevice {
	sendFeature(reportId: number, data: readonly number[]): void;
	getFeature(reportId: number): Uint8Array;
	sendReport(reportId: number, data: readonly number[]): void;
	close(): void;
}

export interface HostOptions {
	channel?: Channel;
	enumerate?: () => Map<string, DeviceInfo>;
	open?: (info: DeviceInfo, onInput: InputListener) => OpenDevice;
}

export class Host {
	readonly #channel: Channel;
	readonly #enumerate: () => Map<string, DeviceInfo>;
	readonly #openDevice: (
		info: DeviceInfo,
		onInput: InputListener,
	) => OpenDevice;
	readonly #opened = new Map<string, OpenDevice>();
	#known: Map<string, DeviceInfo>;

	constructor({
		channel = stdoutChannel,
		enumerate = () => enumerateDevices(),
		open = (info, onInput) => new HidrawDevice(info, onInput),
	}: HostOptions = {}) {
		this.#channel = channel;
		this.#enumerate = enumerate;
		this.#openDevice = open;
		this.#known = enumerate();
	}

	#emit(event: HostEvent) {
		this.#channel.send(event);
	}

	readonly #onInput: InputListener = (key, reportId, data) =>
		this.#emit({ data: [...data], event: 'input', key, reportId });

	/** Diffs the device list and emits connect/disconnect events. */
	pollDevices() {
		const current = this.#enumerate();
		for (const [key, device] of this.#known) {
			if (current.has(key)) continue;
			this.#opened.get(key)?.close();
			this.#opened.delete(key);
			this.#emit({ device, event: 'disconnect' });
		}
		for (const [key, device] of current) {
			if (!this.#known.has(key)) this.#emit({ device, event: 'connect' });
		}
		this.#known = current;
	}

	#device(key: string) {
		const device = this.#opened.get(key);
		if (!device) throw new Error('device not open');
		return device;
	}

	handle(request: Request): Result<Request['op']> {
		switch (request.op) {
			case 'version':
				return { name: pkg.name, version: pkg.version };
			case 'list':
				return [...this.#known.values()];
			case 'open': {
				if (!this.#opened.has(request.key)) {
					const info = this.#known.get(request.key);
					if (!info) throw new Error('device not found');
					this.#opened.set(
						request.key,
						this.#openDevice(info, this.#onInput),
					);
				}
				return true;
			}
			case 'close':
				this.#opened.get(request.key)?.close();
				this.#opened.delete(request.key);
				return true;
			case 'sendFeature':
				this.#device(request.key).sendFeature(
					request.reportId,
					request.data,
				);
				return true;
			case 'getFeature':
				return [
					...this.#device(request.key).getFeature(request.reportId),
				];
			case 'sendReport':
				this.#device(request.key).sendReport(
					request.reportId,
					request.data,
				);
				return true;
			default:
				throw new Error(
					`unknown op ${JSON.stringify((request as { op: unknown }).op)}`,
				);
		}
	}

	/** Answers one request, reporting every failure back to the page. */
	respond(request: Request) {
		let response: Response;
		try {
			response = {
				id: request.id,
				ok: true,
				result: this.handle(request),
			};
		} catch (error) {
			response = {
				error: error instanceof Error ? error.message : String(error),
				id: request.id,
				ok: false,
			};
		}
		this.#channel.send(response);
	}

	closeAll() {
		for (const device of this.#opened.values()) device.close();
		this.#opened.clear();
	}

	/** Serves the browser over stdin/stdout until it closes the pipe. */
	serve() {
		const reader = new FrameReader();
		const hotplug = setInterval(
			() => this.pollDevices(),
			HOTPLUG_INTERVAL_MS,
		);
		process.stdin.on('data', (chunk: Buffer) => {
			for (const message of reader.push(chunk))
				this.respond(message as Request);
		});
		process.stdin.on('end', () => {
			clearInterval(hotplug);
			this.closeAll();
			process.exit(0);
		});
	}
}
