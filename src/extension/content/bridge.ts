/**
 * Isolated-world content script: relays messages between the page polyfill
 * (window.postMessage) and the background script (runtime port).
 */

import {
	type HostMessage,
	isEvent,
	MESSAGE_TAG,
	PORT_NAME,
} from '../../shared/protocol';

const port = browser.runtime.connect({ name: PORT_NAME });

const toPage = (message: HostMessage) => {
	const envelope = isEvent(message)
		? { [MESSAGE_TAG]: 'event', payload: message }
		: { [MESSAGE_TAG]: 'response', ...message };
	window.postMessage(envelope, window.location.origin);
};

port.onMessage.addListener((message) => toPage(message as HostMessage));
port.onDisconnect.addListener(() =>
	toPage({ error: 'Extension port closed', event: 'hostDisconnected' }),
);

window.addEventListener('message', (event: MessageEvent) => {
	if (event.source !== window || event.data?.[MESSAGE_TAG] !== 'request')
		return;
	const { [MESSAGE_TAG]: _tag, ...request } = event.data as Record<
		string,
		unknown
	>;
	port.postMessage(request);
});
