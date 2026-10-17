/** WebExtension native messaging framing: u32 native-endian length + UTF-8 JSON. */

const HEADER_SIZE = 4;

export interface Channel {
	send(message: unknown): void;
}

/** Writes framed messages to stdout. */
export const stdoutChannel: Channel = {
	send(message) {
		const body = Buffer.from(JSON.stringify(message), 'utf8');
		const header = Buffer.alloc(HEADER_SIZE);
		header.writeUInt32LE(body.length);
		process.stdout.write(Buffer.concat([header, body]));
	},
};

/** Splits a byte stream into framed JSON messages. */
export class FrameReader {
	#pending = Buffer.alloc(0);

	push(chunk: Uint8Array): unknown[] {
		this.#pending = Buffer.concat([this.#pending, chunk]);
		const messages: unknown[] = [];
		while (this.#pending.length >= HEADER_SIZE) {
			const length = this.#pending.readUInt32LE(0);
			if (this.#pending.length < HEADER_SIZE + length) break;
			const body = this.#pending.subarray(
				HEADER_SIZE,
				HEADER_SIZE + length,
			);
			messages.push(JSON.parse(body.toString('utf8')));
			this.#pending = this.#pending.subarray(HEADER_SIZE + length);
		}
		return messages;
	}
}
