/** navigator.hid backed by the native host. */

import type { DeviceInfo, HostEvent } from '../../../shared/protocol';
import { chooseDevices } from './chooser';
import { HIDDevice } from './device';
import { fire, HIDConnectionEvent } from './events';
import { grant, isGranted } from './grants';
import { call, rejectAll } from './transport';

export interface HIDDeviceFilter {
	vendorId?: number;
	productId?: number;
	usagePage?: number;
	usage?: number;
}

export interface HIDDeviceRequestOptions {
	filters?: HIDDeviceFilter[];
	exclusionFilters?: HIDDeviceFilter[];
}

const matches = (info: DeviceInfo, filter: HIDDeviceFilter) =>
	(filter.vendorId === undefined || filter.vendorId === info.vendorId) &&
	(filter.productId === undefined || filter.productId === info.productId) &&
	info.collections.some(
		(c) =>
			(filter.usagePage === undefined ||
				filter.usagePage === c.usagePage) &&
			(filter.usage === undefined || filter.usage === c.usage),
	);

export class HID extends EventTarget {
	/** One object per hidraw node, so identity is stable across calls. */
	readonly #devices = new Map<string, HIDDevice>();
	onconnect: ((event: HIDConnectionEvent) => void) | null = null;
	ondisconnect: ((event: HIDConnectionEvent) => void) | null = null;

	#deviceFor(info: DeviceInfo) {
		let device = this.#devices.get(info.key);
		if (!device) {
			device = new HIDDevice(info);
			this.#devices.set(info.key, device);
		}
		return device;
	}

	#drop(key: string) {
		const device = this.#devices.get(key);
		if (!device) return;
		this.#devices.delete(key);
		device.markClosed();
		fire(this, new HIDConnectionEvent('disconnect', { device }));
	}

	async getDevices() {
		const devices = await call('list', {});
		return devices.filter(isGranted).map((info) => this.#deviceFor(info));
	}

	async requestDevice({
		filters = [],
		exclusionFilters = [],
	}: HIDDeviceRequestOptions = {}) {
		let devices: DeviceInfo[] = [];
		let error: string | undefined;
		try {
			devices = await call('list', {});
		} catch (reason) {
			error = `Cannot reach the native host:\n${(reason as Error).message}`;
		}
		const candidates = devices.filter(
			(info) =>
				(filters.length === 0 ||
					filters.some((filter) => matches(info, filter))) &&
				!exclusionFilters.some((filter) => matches(info, filter)),
		);
		const chosen = await chooseDevices(candidates, error);
		grant(chosen);
		return chosen.map((info) => this.#deviceFor(info));
	}

	/** Applies an event pushed by the native host. */
	handleHostEvent(event: HostEvent) {
		switch (event.event) {
			case 'input':
				this.#devices
					.get(event.key)
					?.receiveInput(event.reportId, event.data);
				break;
			case 'connect':
				if (isGranted(event.device)) {
					fire(
						this,
						new HIDConnectionEvent('connect', {
							device: this.#deviceFor(event.device),
						}),
					);
				}
				break;
			case 'disconnect':
				this.#drop(event.device.key);
				break;
			case 'hostDisconnected':
				for (const key of this.#devices.keys()) this.#drop(key);
				rejectAll(event.error);
				break;
		}
	}
}
