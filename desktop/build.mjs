/**
 * [INPUT]: ../package.json (the game's version, the only place it is written); the repository's web build (vite);
 *          electron-builder; ./icon.png (1024 px, the same art as the Android launcher icon).
 * [OUTPUT]: `node desktop/build.mjs` builds the game with relative paths into ../dist-desktop/, then packs the
 *           desktop app for the machine it runs on into desktop/release/:
 *             macOS   WronglyDrawn-<v>-mac-arm64.dmg and -mac-x64.dmg (ad-hoc signed, not notarized)
 *             Windows WronglyDrawn-<v>-windows-setup.exe (one-click installer for the current user, no admin)
 *             Linux   WronglyDrawn-<v>-linux-x86_64.AppImage
 *           `--dir` packs an unpacked app only (fast, for the smoke check); `--skip-web` reuses ../dist-desktop/.
 * [POS]: desktop/. Called by .github/workflows/release.yml on each operating system, and by hand for a local build.
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, Platform } from 'electron-builder';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const args = process.argv.slice(2);
const web = path.join(root, 'dist-desktop');

if (!args.includes('--skip-web')) {
  execFileSync('npm', ['run', 'build', '--', '--base', './', '--outDir', web, '--emptyOutDir'], {
    cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, VITE_RELEASE_ID: process.env.VITE_RELEASE_ID || `desktop-v${version}` },
  });
}
if (!fs.existsSync(path.join(web, 'index.html'))) throw new Error(`no web build in ${web}`);

const dir = args.includes('--dir');
const platform = { darwin: Platform.MAC, win32: Platform.WINDOWS, linux: Platform.LINUX }[process.platform];
const target = (name, arch) => [{ target: dir ? 'dir' : name, arch }];

// a local Apple Development certificate is not for distribution: never let the build pick it up
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';

await build({
  projectDir: here,
  targets: platform.createTarget(),
  config: {
    appId: 'top.maequeen.wronglydrawn',
    productName: 'Wrongly Drawn',
    executableName: 'WronglyDrawn',
    copyright: '© 2026 巴特歪',
    extraMetadata: { version },
    directories: { output: 'release', buildResources: '.' },
    files: ['main.mjs', 'package.json'],
    extraResources: [{ from: web, to: 'game' }],
    icon: 'icon.png',
    publish: null,
    mac: {
      target: target('dmg', ['arm64', 'x64']),
      category: 'public.app-category.games',
      identity: '-',            // ad-hoc signature: Apple Silicon refuses to run unsigned code at all
      hardenedRuntime: false,
      notarize: false,
      artifactName: 'WronglyDrawn-${version}-mac-${arch}.${ext}',
    },
    dmg: { title: '错画之城 Wrongly Drawn ${version}' },
    win: { target: target('nsis', ['x64']), artifactName: 'WronglyDrawn-${version}-windows-setup.${ext}' },
    nsis: { oneClick: true, perMachine: false, shortcutName: '错画之城 Wrongly Drawn', deleteAppDataOnUninstall: false },
    linux: {
      target: target('AppImage', ['x64']),
      category: 'Game',
      synopsis: '错画之城 Wrongly Drawn',
      artifactName: 'WronglyDrawn-${version}-linux-x86_64.${ext}',
    },
  },
});
console.log(`desktop ${version} packed into ${path.join(here, 'release')}`);
