/** Request/response transport to the bridge content script over window.postMessage. */

import {
	type HostEvent,
	MESSAGE_TAG,
	type Operation,
	type Params,
	type Response,
	type Result,
} from '../../../shared/protocol';

interface Pending {
	resolve(value: unknown): void;
	reject(reason: Error): void;
}

const pending = new Map<number, Pending>();
let nextId = 1;

export const call = <O extends Operation>(
	op: O,
	params: Params<O>,
): Promise<Result<O>> =>
	new Promise((resolve, reject) => {
		const id = nextId++;
		pending.set(id, {
			reject,
			resolve: resolve as (value: unknown) => void,
		});
		window.postMessage(
			{ [MESSAGE_TAG]: 'request', id, op, ...params },
			window.location.origin,
		);
	});

/** Rejects every in-flight request, e.g. when the native host goes away. */
export const rejectAll = (message: string) => {
	for (const [id, request] of pending) {
		pending.delete(id);
		request.reject(new DOMException(message, 'NetworkError'));
	}
};

/** Starts dispatching responses and forwards host events to `onEvent`. */
export const listen = (onEvent: (event: HostEvent) => void) => {
	window.addEventListener('message', (event: MessageEvent) => {
		if (event.source !== window || !event.data) return;
		const tag = event.data[MESSAGE_TAG];
		if (tag === 'event') {
			onEvent(event.data.payload as HostEvent);
		} else if (tag === 'response') {
			const response = event.data as Response;
			const request = pending.get(response.id);
			if (!request) return;
			pending.delete(response.id);
			if (response.ok) request.resolve(response.result);
			else
				request.reject(
					new DOMException(response.error, 'NotAllowedError'),
				);
		}
	});
};

export const toBytes = (data: BufferSource): number[] => {
	if (data instanceof ArrayBuffer) return [...new Uint8Array(data)];
	if (ArrayBuffer.isView(data)) {
		return [
			...new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
		];
	}
	throw new TypeError('data must be an ArrayBuffer or ArrayBufferView');
};

export const toDataView = (bytes: readonly number[]) =>
	new DataView(Uint8Array.from(bytes).buffer);
