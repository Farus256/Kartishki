import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogStore } from '../apps/server/src/catalog.ts';
import { bundledCatalogFile } from '../apps/server/src/catalogFile.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destCatalog = bundledCatalogFile();
const destDir = dirname(destCatalog);
const ALLOWED = /^(apps\/server\/data\/catalog\.json|apps\/server\/data\/portraits\/[a-f0-9]{64}\.(png|jpeg|webp)|apps\/server\/data\/music\/[a-f0-9]{64}\.(mp3|mpeg|wav|ogg|webm))$/;
const SECRET = /(?:^|[\\/])(?:\.env(?:\..+)?|.+\.(?:pem|key|p12)|credentials(?:\..+)?|node_modules|dist)(?:$|[\\/])/i;
const PORTRAIT = /\/api\/portraits\/([a-f0-9]{64}\.(?:png|jpeg|webp))/i;
const MUSIC = /\/api\/music\/([a-f0-9]{64}\.(?:mp3|mpeg|wav|ogg|webm))/i;

type Mode = 'validate' | 'dry-run' | 'deploy';

function fail(message: string): never {
  console.error(`deploy:cards: ${message}`);
  process.exit(1);
}

function posix(from: string) {
  return from.split(sep).join('/');
}

function git(args: string[], opts: { allowFail?: boolean } = {}): SpawnSyncReturns<string> {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', shell: false });
  if (result.error) fail(`git ${args[0]} failed: ${result.error.message}`);
  if (!opts.allowFail && result.status !== 0) fail(`git ${args.join(' ')} failed\n${result.stderr || result.stdout}`);
  return result;
}

function run(command: string, label: string) {
  console.log(`\n> ${label}`);
  const result = spawnSync(command, { cwd: root, encoding: 'utf8', shell: true, stdio: 'inherit' });
  if (result.status !== 0) fail(`${label} failed`);
}

function walkAssets(value: unknown, portraits: Set<string>, music: Set<string>) {
  if (typeof value === 'string') {
    const portrait = value.match(PORTRAIT);
    const track = value.match(MUSIC);
    if (portrait) portraits.add(portrait[1]!);
    if (track) music.add(track[1]!);
    return;
  }
  if (Array.isArray(value)) { for (const item of value) walkAssets(item, portraits, music); return; }
  if (value && typeof value === 'object') for (const item of Object.values(value)) walkAssets(item, portraits, music);
}

function collectAssets(catalog: unknown) {
  const portraits = new Set<string>();
  const music = new Set<string>();
  walkAssets(catalog, portraits, music);
  return { portraits, music };
}

function isSecret(path: string) {
  return SECRET.test(path) || path.includes('..') || /(?:^|[\\/])(?:PNG|Spritesheets|Vector)(?:$|[\\/])/i.test(path);
}

function repoPath(abs: string) {
  return posix(relative(root, abs));
}

function copyInto(from: string, to: string) {
  if (resolve(from) === resolve(to)) return;
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

function parseMode(argv: string[]): Mode {
  if (argv.includes('--validate')) return 'validate';
  if (argv.includes('--dry-run')) return 'dry-run';
  return 'deploy';
}

function currentBranch() {
  const name = git(['branch', '--show-current']).stdout.trim();
  if (!name) fail('detached HEAD; checkout a branch before deploying cards');
  return name;
}

function loadCatalog(file: string) {
  if (!existsSync(file) || !statSync(file).isFile()) fail(`catalog not found: ${file}`);
  try { return new CatalogStore(file).snapshot(); }
  catch (error) { fail(`catalog is invalid: ${error instanceof Error ? error.message : error}`); }
}

const mode = parseMode(process.argv.slice(2));
const sourceCatalog = resolve(process.env.CATALOG_FILE?.trim() || destCatalog);
const sourceDir = dirname(sourceCatalog);

console.log(`Kartishki card ${mode}`);
console.log(`branch: ${currentBranch()}`);
console.log(`source: ${sourceCatalog}`);
console.log(`shipped: ${destCatalog}`);

if (existsSync(`${destCatalog}.tmp`)) unlinkSync(`${destCatalog}.tmp`);

const catalog = loadCatalog(sourceCatalog);
const assets = collectAssets(catalog);
const required: string[] = [destCatalog];

for (const [kind, names] of [['portraits', assets.portraits], ['music', assets.music]] as const) {
  for (const name of names) {
    const from = join(sourceDir, kind, name);
    const to = join(destDir, kind, name);
    if (!existsSync(from)) fail(`missing runtime asset ${kind}/${name}`);
    copyInto(from, to);
    required.push(to);
  }
}
copyInto(sourceCatalog, destCatalog);
loadCatalog(destCatalog);

const allow = [...new Set(required.map(repoPath))].sort();
if (allow.some(path => !ALLOWED.test(path) || isSecret(path))) fail(`refusing non-production path:\n${allow.filter(path => !ALLOWED.test(path) || isSecret(path)).join('\n')}`);

console.log('\nProduction card files:');
for (const path of allow) console.log(`  ${path}`);
console.log(`catalog version ${catalog.version}, ${catalog.cards.length} cards, ${assets.portraits.size} portraits, ${assets.music.size} music tracks`);
console.log('client bundle: skip (catalog and assets load from the server at runtime)');

const dirty = git(['status', '--porcelain']).stdout.split(/\r?\n/).map(line => line.trimEnd()).filter(Boolean);
const unrelated = dirty.filter(line => {
  const path = line.slice(3).replace(/\\/g, '/').replace(/^"/, '').replace(/"$/, '');
  return !allow.includes(path) && !path.startsWith('apps/server/data/');
});
if (unrelated.length) {
  console.log('\nUnrelated working-tree changes (not staged by this command):');
  for (const line of unrelated) console.log(`  ${line}`);
}

const stagedNow = git(['diff', '--cached', '--name-only', '-z']).stdout.split('\0').filter(Boolean).map(path => posix(path));
const foreignStaged = stagedNow.filter(path => !allow.includes(path));
if (foreignStaged.length) fail(`index already has unrelated staged files; unstage them first:\n${foreignStaged.join('\n')}`);

if (mode === 'validate') {
  console.log('\nValidation OK. Nothing committed or pushed.');
  process.exit(0);
}

run('npx tsx --test apps/server/test/catalog.test.ts apps/server/test/deploy.test.ts', 'card tests');
run('npm run build -w @kartishki/server', 'server build');
loadCatalog(destCatalog);
console.log('clean server build can load the shipped catalog');

git(['add', '--', ...allow]);
const staged = git(['diff', '--cached', '--name-only', '-z']).stdout.split('\0').filter(Boolean).map(path => posix(path));
if (staged.some(path => !allow.includes(path) || isSecret(path))) {
  git(['reset', '-q', 'HEAD', '--', ...staged], { allowFail: true });
  fail(`refusing to commit unexpected staged files:\n${staged.join('\n')}`);
}

console.log('\nStaged for commit:');
if (!staged.length) console.log('  (none — catalog already matches git)');
else for (const path of staged) console.log(`  ${path}`);

if (mode === 'dry-run') {
  if (staged.length) git(['reset', '-q', 'HEAD', '--', ...staged]);
  console.log('\nDry-run OK. Nothing committed or pushed.');
  process.exit(0);
}

if (!staged.length) {
  console.log('\nNo card changes to commit. Push skipped.');
  process.exit(0);
}

const branch = currentBranch();
console.log(`\nCommitting on ${branch}`);
git(['commit', '-m', 'Update card catalog']);
console.log(`Pushing ${branch} to origin (no force)`);
git(['push', '-u', 'origin', 'HEAD']);
console.log('\nPushed. Render will rebuild the backend from this commit.');
console.log('Cloudflare Pages may also rebuild if the branch is connected; the client bundle does not embed the catalog.');
