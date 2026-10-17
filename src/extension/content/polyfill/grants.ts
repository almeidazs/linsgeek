/** Granted interfaces, remembered per origin in localStorage like Chrome's site permissions. */

import type { DeviceInfo } from '../../../shared/protocol';

const STORAGE_KEY = '__linsgeekGranted';

const grantId = (info: DeviceInfo) =>
	[
		info.vendorId,
		info.productId,
		info.interfaceNumber,
		...info.collections.map((c) => `${c.usagePage}:${c.usage}`),
	].join('|');

const load = (): Set<string> => {
	try {
		return new Set(
			JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[],
		);
	} catch {
		return new Set();
	}
};

const save = (grants: Set<string>) => {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify([...grants]));
	} catch {
		// Storage unavailable: permissions last for this page only.
	}
};

export const isGranted = (info: DeviceInfo) => load().has(grantId(info));

export const grant = (infos: readonly DeviceInfo[]) => {
	const grants = load();
	for (const info of infos) grants.add(grantId(info));
	save(grants);
};

export const revoke = (info: DeviceInfo) => {
	const grants = load();
	grants.delete(grantId(info));
	save(grants);
};
