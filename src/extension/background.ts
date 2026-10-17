/** Relays each page connection to its own native host process. */

import {
	NATIVE_HOST,
	PORT_NAME,
	type HostMessage,
	type Request,
} from '../shared/protocol';

browser.runtime.onConnect.addListener((page) => {
	if (page.name !== PORT_NAME) return;

	let native: browser.runtime.Port | undefined =
		browser.runtime.connectNative(NATIVE_HOST);
	let pageGone = false;
	const toPage = (message: HostMessage) => {
		if (!pageGone) page.postMessage(message);
	};

	native.onMessage.addListener((message) => toPage(message as HostMessage));
	native.onDisconnect.addListener((port) => {
		native = undefined;
		const reason = port.error?.message ?? 'native host exited';
		toPage({
			error: `${reason}. Is linsgeek installed? Run: linsgeek doctor`,
			event: 'hostDisconnected',
		});
	});

	page.onMessage.addListener((message) => {
		const request = message as Request;
		if (native) native.postMessage(request);
		else
			toPage({
				error: 'Native host is not running',
				id: request.id,
				ok: false,
			});
	});
	page.onDisconnect.addListener(() => {
		pageGone = true;
		native?.disconnect();
	});
});
