import { readFileSync, writeFileSync } from 'node:fs';

import { defineConfig, type UserConfig } from 'tsdown';

import pkg from './package.json';

const outDir = 'dist/extension';

/** Extension scripts are classic scripts, so each one is its own IIFE bundle. */
const entries = {
	background: 'src/extension/background.ts',
	'content/bridge': 'src/extension/content/bridge.ts',
	'content/polyfill': 'src/extension/content/polyfill/index.ts',
};

const writeManifest = () => {
	// The manifest version always follows package.json.
	const manifest = JSON.parse(
		readFileSync('src/extension/manifest.json', 'utf8'),
	);
	manifest.version = pkg.version;
	writeFileSync(
		`${outDir}/manifest.json`,
		`${JSON.stringify(manifest, null, '\t')}\n`,
	);
};

const scripts = Object.entries(entries).map(
	([name, source], index, all): UserConfig => ({
		clean: index === 0,
		entry: { [name]: source },
		format: 'iife',
		minify: false,
		outDir,
		// tsdown always adds an ".iife" suffix; the manifest expects plain names.
		outputOptions: { entryFileNames: '[name].js' },
		platform: 'browser',
		sourcemap: false,
		target: 'firefox140',
		treeshake: true,
		...(index === all.length - 1 && {
			copy: [{ from: 'src/extension/icons', to: outDir }],
			hooks: { 'build:done': writeManifest },
		}),
	}),
);

export default defineConfig(scripts);
