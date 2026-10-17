/** WebHID event classes, and Chrome-style dispatch to `on<type>` handlers too. */

export class HIDInputReportEvent extends Event {
	readonly device: EventTarget;
	readonly reportId: number;
	readonly data: DataView;

	constructor(
		type: string,
		init: EventInit & {
			device: EventTarget;
			reportId: number;
			data: DataView;
		},
	) {
		super(type, init);
		this.device = init.device;
		this.reportId = init.reportId;
		this.data = init.data;
	}
}

export class HIDConnectionEvent extends Event {
	readonly device: EventTarget;

	constructor(type: string, init: EventInit & { device: EventTarget }) {
		super(type, init);
		this.device = init.device;
	}
}

export const fire = (target: EventTarget, event: Event) => {
	const handler = (target as unknown as Record<string, unknown>)[
		`on${event.type}`
	];
	if (typeof handler === 'function') handler.call(target, event);
	target.dispatchEvent(event);
};
