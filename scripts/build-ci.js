const { execSync } = require('child_process');
const glob = require('glob');
const path = require('path');
const fs = require('fs');

function run(command, cwd) {
  console.debug(`${command} in ${cwd}...`);
  try {
    execSync(command, { stdio: 'inherit', cwd });
  } catch (err) {
    console.error(`Error running "${command}" in ${cwd}`);
    process.exit(1);
  }
}

function copy(src, dest) {
  try {
    execSync(`cp -r "${src}" "${dest}"`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`Error copying from ${src} to ${dest}`);
    process.exit(1);
  }
}

const taskJsonFiles = glob.sync('src/*/*/tsconfig.production.json');
taskJsonFiles.forEach(file => {
    const dir = path.dirname(file);
    const version = dir.split('/')[2];
    const distDir = path.join(dir, 'dist', version);

    if (fs.existsSync(path.join(dir, 'tsconfig.production.json'))) {
        run('npx tsc --project tsconfig.production.json', dir);

        glob.sync(path.join(dir, '*.json')).forEach(jsonFile => {
            copy(jsonFile, distDir);
        });

        const iconFile = path.join(dir, 'icon.png');
        if (fs.existsSync(iconFile)) {
            copy(iconFile, distDir);
        }

        run('npm ci --omit=dev --no-audit --no-progress', distDir);
    } else {
        log.error(`Failed running for ${file}`)
    }
});

const distFolders = glob.sync('src/*/*/dist/*');
distFolders.forEach(distFolder => {
  const folderToCopy = path.dirname(distFolder);
  const destination = path.resolve(distFolder, '../../..');
  console.debug(`${folderToCopy} to ${destination}`);
  try {
    execSync(`cp -r "${folderToCopy}" "${destination}"`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`Error copying ${folderToCopy} to ${destination}`);
    process.exit(1);
  }
});