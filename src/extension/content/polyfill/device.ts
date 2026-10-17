/** HIDDevice backed by the native host. */

import type { DeviceInfo } from '../../../shared/protocol';
import { fire, HIDInputReportEvent } from './events';
import { revoke } from './grants';
import { call, toBytes, toDataView } from './transport';

const reportInfos = (ids: readonly number[]) =>
	ids.map((reportId) => ({ items: [], reportId }));

export class HIDDevice extends EventTarget {
	readonly #info: DeviceInfo;
	#opened = false;
	oninputreport: ((event: HIDInputReportEvent) => void) | null = null;

	constructor(info: DeviceInfo) {
		super();
		this.#info = info;
	}

	get vendorId() {
		return this.#info.vendorId;
	}

	get productId() {
		return this.#info.productId;
	}

	get productName() {
		return this.#info.productName;
	}

	get opened() {
		return this.#opened;
	}

	get collections() {
		return this.#info.collections.map((c) => ({
			children: [],
			featureReports: reportInfos(c.featureReports),
			inputReports: reportInfos(c.inputReports),
			outputReports: reportInfos(c.outputReports),
			type: c.type,
			usage: c.usage,
			usagePage: c.usagePage,
		}));
	}

	async open() {
		if (this.#opened) return;
		await call('open', { key: this.#info.key });
		this.#opened = true;
	}

	async close() {
		if (!this.#opened) return;
		this.#opened = false;
		await call('close', { key: this.#info.key });
	}

	async forget() {
		await this.close();
		revoke(this.#info);
	}

	async sendReport(reportId: number, data: BufferSource) {
		this.#requireOpen();
		await call('sendReport', {
			data: toBytes(data),
			key: this.#info.key,
			reportId,
		});
	}

	async sendFeatureReport(reportId: number, data: BufferSource) {
		this.#requireOpen();
		await call('sendFeature', {
			data: toBytes(data),
			key: this.#info.key,
			reportId,
		});
	}

	async receiveFeatureReport(reportId: number) {
		this.#requireOpen();
		const bytes = await call('getFeature', {
			key: this.#info.key,
			reportId,
		});
		// Chrome includes the report ID as the first byte of numbered reports.
		return toDataView(reportId === 0 ? bytes : [reportId, ...bytes]);
	}

	#requireOpen() {
		if (!this.#opened) {
			throw new DOMException(
				'The device must be opened first.',
				'InvalidStateError',
			);
		}
	}

	/** Called when the device or the native host goes away. */
	markClosed() {
		this.#opened = false;
	}

	/** Delivers an input report from the native host. */
	receiveInput(reportId: number, bytes: readonly number[]) {
		fire(
			this,
			new HIDInputReportEvent('inputreport', {
				data: toDataView(bytes),
				device: this,
				reportId,
			}),
		);
	}
}
