// npm run release -- --addition,subtraction
const { series } = require('gulp');
const fs = require('fs');
const { join } = require('path');
const { exec } = require('child_process');
const { RunCommand } = require('@lerna/run');
const { PublishCommand } = require('@lerna/publish');
const git = require('simple-git/promise')(__dirname);
const sync = require('./scripts/preversion/sync.js');

const stableBranch = 'master';
const releaseBranch = 'release';
const ignored = ['.git', '.log', 'node_modules', '.lock', 'packages', '.md', 'package-lock'];
const packagesDirectory = join(__dirname, '/packages/');
let packagesDirNamesToRelease = [];
let packagesNamesToRelease = [];

const readDirPromise = (directory) => {
    return new Promise((resolve, reject) => {
        fs.readdir(directory, (err, files) => {
            if (err) {
                return reject(err);
            }

            resolve(files);
        });
    });
};

const getPackageName = (dirName) => {
    return new Promise((resolve, reject) => {
        fs.readFile(join(packagesDirectory, dirName, 'package.json'), 'UTF-8', (err, data) => {
            if (err) {
                return reject(err);
            }

            const pkgJson = JSON.parse(data);

            resolve(pkgJson.name);
        });
    });
};

const validateReleasePackages = async () => {
    packagesDirNamesToRelease = process.argv[3].replace('--', '').split(',');

    const areNamesValidType = packagesDirNamesToRelease.every((name) => (typeof name === 'string') && name.length > 0);

    if (!areNamesValidType) {
        throw new Error(`Invalid packages names: ${JSON.stringify(packagesDirNamesToRelease)}`);
    }

    const areNamesExisting = packagesDirNamesToRelease.every((pkgName) => fs.existsSync(join(packagesDirectory, pkgName)));

    if (!areNamesExisting) {
        throw new Error(`Non-existent packages names: ${JSON.stringify(packagesDirNamesToRelease)}`);
    }

    packagesNamesToRelease = await Promise.all(packagesDirNamesToRelease.map((dirName) => getPackageName(dirName)));

    console.log('All packages are validated and existing');
};

const checkout = async (branchName) => {
    await git.checkout(branchName);
};

const checkoutRelease = async () => {
    await checkout(releaseBranch);
};

const checkoutMaster = async () => {
    await checkout(stableBranch);
};

const syncAllContentsExceptPackages = async () => {
    const rootContents = await readDirPromise(__dirname);

    const itemToSync = rootContents.filter((element) => !ignored.some((igElement) => element.includes(igElement)));
    itemToSync.push('.gitignore');

    for (const item of itemToSync) {
        console.log(`checking out ${item}`);
        await git.raw(['checkout', stableBranch, item]);
    }
};

const syncPackagesToRelease = async () => {
    for (const packageName of packagesDirNamesToRelease) {
        console.log(`checking out ${packageName}`);
        await git.raw(['checkout', stableBranch, `packages/${packageName}`]);
    }
};

const yarnInstall = () => {
    return new Promise((resolve, reject) => {
        const child = exec('yarn', (err, stdout) => {
            console.log(stdout);
        });
        child.on('error', reject);
        child.on('exit', resolve);
    });
};

const executeConditionalScript = async (script) => {
    const scope = packagesNamesToRelease.length === 1 ?
        packagesNamesToRelease[0] :
        `{${packagesNamesToRelease.join(',')}}`;

    const command = new RunCommand({ script, scope });
    await command.runner;
};

const conditionalLernaTest = async () => {
    await executeConditionalScript('test');
};

const conditionalLernaBuild = async () => {
    await executeConditionalScript('build');
};

const versionSync = async () => {
    await sync(git, false);
};

const addCommit = async (message) => {
    await git.add('.');
    await git.commit(message, undefined, { '--no-verify': null });
};

const commitPreReleaseSync = async () => {
    await addCommit('Pre-release sync and build');
};

const commitIsolatedPackages = async () => {
    await addCommit('Release package/s isolated');
};

const publish = async () => {
    const command = new PublishCommand({});
    await command.runner;
};

const stableSyncPush = async () => {
    for (const packageName of packagesDirNamesToRelease) {
        console.log(`checking out ${packageName}`);
        await git.raw(['checkout', releaseBranch, `packages/${packageName}`]);
    }
    await addCommit('[post-release] Release and sync completed');
    await git.push();
};

exports.release = series(
    validateReleasePackages,
    checkoutRelease,
    syncAllContentsExceptPackages,
    syncPackagesToRelease,
    yarnInstall,
    conditionalLernaTest,
    conditionalLernaBuild,
    commitPreReleaseSync,
    versionSync,
    commitIsolatedPackages,
    publish,
    checkoutMaster,
    stableSyncPush
);
