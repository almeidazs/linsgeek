/**
 * linsgeek command line entry point.
 *
 * Browsers start the native host with extra arguments (manifest path,
 * extension ID), so anything that is not a known command runs the host.
 */

import pkg from '../../package.json';
import { enumerateDevices } from './devices';
import { doctor } from './doctor';
import { Host } from './host';

const USAGE = `usage: linsgeek [command]

commands:
  doctor    check the installation and the connected keyboards
  list      print the exposed HID interfaces as JSON
  version   print the version

Without a command, linsgeek runs as the browser's native messaging host.
`;

const commands: Record<string, () => number | undefined> = {
	'--help': () => (process.stdout.write(USAGE), 0),
	'--version': () => (console.log(pkg.version), 0),
	doctor,
	help: () => (process.stdout.write(USAGE), 0),
	list: () => (
		console.log(JSON.stringify([...enumerateDevices().values()], null, 2)),
		0
	),
	version: () => (console.log(pkg.version), 0),
};

const command = commands[process.argv[2] ?? ''];
if (command) {
	process.exit(command() ?? 0);
} else if (process.stdin.isTTY) {
	process.stdout.write(USAGE);
	process.exit(2);
} else {
	new Host().serve();
}
