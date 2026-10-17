/**
 * WebHID polyfill. Runs in the page (MAIN world) before the app's scripts and
 * implements the subset of navigator.hid that app.monsgeek.com uses.
 */

import { HIDDevice } from './device';
import { HIDConnectionEvent, HIDInputReportEvent } from './events';
import { HID } from './hid';
import { listen } from './transport';

const IOT_SWITCH_KEY = 'IOTSwitch';

const install = () => {
	if ('hid' in navigator) return; // Chromium already has WebHID.

	// "LiveSync Mode" stores IOTSwitch=true, which makes the app require the
	// Windows-only IoT Manager on every load. It cannot work here, so reset it.
	try {
		if (localStorage.getItem(IOT_SWITCH_KEY) !== 'false')
			localStorage.setItem(IOT_SWITCH_KEY, 'false');
	} catch {
		// Storage unavailable: nothing to reset.
	}

	const hid = new HID();
	listen((event) => hid.handleHostEvent(event));

	Object.defineProperty(Navigator.prototype, 'hid', {
		configurable: true,
		enumerable: true,
		get: () => hid,
	});
	Object.assign(window, {
		HID,
		HIDConnectionEvent,
		HIDDevice,
		HIDInputReportEvent,
	});
};

install();
