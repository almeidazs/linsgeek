/**
 * Device picker shown by navigator.hid.requestDevice(). Like Chrome's, it lists
 * one entry per physical keyboard and grants all of its matching interfaces.
 */

import type { DeviceInfo } from '../../../shared/protocol';

const STYLE = `
	.backdrop { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center;
		justify-content: center; background: #0008; font: 14px system-ui, sans-serif }
	.dialog { width: min(440px, 92vw); padding: 18px; border-radius: 10px; background: #fff; color: #111;
		box-shadow: 0 10px 40px #0006 }
	h3 { margin: 0 0 4px; font-size: 16px }
	p { margin: 0 0 12px; color: #555 }
	label { display: flex; gap: 10px; align-items: center; margin-bottom: 6px; padding: 8px;
		border: 1px solid #ddd; border-radius: 6px; cursor: pointer }
	small { color: #777 }
	.error { color: #b00020; white-space: pre-wrap }
	.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px }
	button { padding: 7px 14px; border: 1px solid #bbb; border-radius: 6px; background: #f4f4f4; cursor: pointer }
	button.primary { border-color: #1a73e8; background: #1a73e8; color: #fff }`;

const hex = (value: number) => value.toString(16).padStart(4, '0');

type Props = Record<string, string | boolean | (() => void)>;

const element = <K extends keyof HTMLElementTagNameMap>(
	tag: K,
	props: Props = {},
	children: Node[] = [],
): HTMLElementTagNameMap[K] => {
	const node = document.createElement(tag);
	Object.assign(node, props);
	node.append(...children);
	return node;
};

const groupByPhysical = (devices: readonly DeviceInfo[]) => {
	const groups = new Map<string, DeviceInfo[]>();
	for (const device of devices) {
		const group = groups.get(device.physical);
		if (group) group.push(device);
		else groups.set(device.physical, [device]);
	}
	return [...groups.values()];
};

const describeGroup = (group: readonly DeviceInfo[]) => {
	const [first] = group;
	if (!first) return '';
	const interfaces = group
		.map((device) => device.interfaceNumber ?? '?')
		.join(', ');
	const permission = group.every((device) => device.accessible)
		? ''
		: ' · NO PERMISSION (udev rule missing?)';
	return `${hex(first.vendorId)}:${hex(first.productId)} · interfaces ${interfaces}${permission}`;
};

export const chooseDevices = (
	candidates: readonly DeviceInfo[],
	error?: string,
) =>
	new Promise<DeviceInfo[]>((resolve) => {
		const host = document.createElement('div');
		const root = host.attachShadow({ mode: 'open' });
		const groups = groupByPhysical(candidates);
		const list = element('div');

		const message =
			error ??
			(groups.length === 0
				? 'No compatible device found.\nCheck the USB cable, then run `linsgeek doctor` in a terminal.'
				: undefined);
		if (message)
			list.append(
				element('p', { className: 'error', textContent: message }),
			);

		const checkboxes = groups.map((group, index) => {
			const checkbox = element('input', {
				checked: index === 0,
				type: 'checkbox',
			});
			list.append(
				element('label', {}, [
					checkbox,
					element('span', {}, [
						element('b', {
							textContent: group[0]?.productName || 'HID device',
						}),
						element('br'),
						element('small', { textContent: describeGroup(group) }),
					]),
				]),
			);
			return checkbox;
		});

		const finish = (chosen: DeviceInfo[]) => {
			host.remove();
			resolve(chosen);
		};

		root.append(
			element('style', { textContent: STYLE }),
			element('div', { className: 'backdrop' }, [
				element('div', { className: 'dialog' }, [
					element('h3', {
						textContent: `${location.host} wants to connect to a HID device`,
					}),
					element('p', { textContent: 'Linsgeek' }),
					list,
					element('div', { className: 'actions' }, [
						element('button', {
							onclick: () => finish([]),
							textContent: 'Cancel',
						}),
						element('button', {
							className: 'primary',
							onclick: () =>
								finish(
									groups
										.filter(
											(_, i) => checkboxes[i]?.checked,
										)
										.flat(),
								),
							textContent: 'Connect',
						}),
					]),
				]),
			]),
		);
		(document.body ?? document.documentElement).append(host);
	});
