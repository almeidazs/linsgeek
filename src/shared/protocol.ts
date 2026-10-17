/**
 * Messages exchanged between the extension and the linsgeek native host.
 *
 * page polyfill ⇄ (window.postMessage) ⇄ bridge ⇄ (runtime port) ⇄
 * background ⇄ (native messaging) ⇄ host
 */

export const NATIVE_HOST = 'linsgeek';
export const PORT_NAME = 'linsgeek';
/** Marks linsgeek messages on window.postMessage. */
export const MESSAGE_TAG = '__linsgeek';

export type ReportType = 'input' | 'output' | 'feature';

export interface CollectionInfo {
	usagePage: number;
	usage: number;
	/** HID collection type (1 = application). */
	type: number;
	inputReports: number[];
	outputReports: number[];
	featureReports: number[];
}

export interface DeviceInfo {
	/** Stable identifier of one hidraw node while it stays plugged in. */
	key: string;
	path: string;
	/** Shared by every interface of the same physical device. */
	physical: string;
	vendorId: number;
	productId: number;
	productName: string;
	interfaceNumber: number | null;
	/** Whether reports are prefixed with a report ID. */
	numbered: boolean;
	collections: CollectionInfo[];
	/** Report sizes in bytes, by type and report ID. */
	sizes: Record<ReportType, Record<string, number>>;
	/** Whether the current user can read and write the node. */
	accessible: boolean;
}

export interface VersionInfo {
	name: string;
	version: string;
}

interface Requests {
	version: { params: Record<never, never>; result: VersionInfo };
	list: { params: Record<never, never>; result: DeviceInfo[] };
	open: { params: { key: string }; result: true };
	close: { params: { key: string }; result: true };
	sendFeature: {
		params: { key: string; reportId: number; data: number[] };
		result: true;
	};
	getFeature: { params: { key: string; reportId: number }; result: number[] };
	sendReport: {
		params: { key: string; reportId: number; data: number[] };
		result: true;
	};
}

export type Operation = keyof Requests;
export type Params<O extends Operation> = Requests[O]['params'];
export type Result<O extends Operation> = Requests[O]['result'];

export type Request = {
	[O in Operation]: { id: number; op: O } & Params<O>;
}[Operation];

export type Response =
	| { id: number; ok: true; result: unknown }
	| { id: number; ok: false; error: string };

export type HostEvent =
	| { event: 'input'; key: string; reportId: number; data: number[] }
	| { event: 'connect'; device: DeviceInfo }
	| { event: 'disconnect'; device: DeviceInfo }
	/** Synthesized by the extension when the native host goes away. */
	| { event: 'hostDisconnected'; error: string };

export type HostMessage = Response | HostEvent;

export const isEvent = (message: HostMessage): message is HostEvent =>
	'event' in message;
