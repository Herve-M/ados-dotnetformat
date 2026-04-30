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

const taskJsonFiles = glob.sync('src/*/*/tsconfig.json');
taskJsonFiles.forEach(file => {
  const dir = path.dirname(file);
  if (fs.existsSync(path.join(dir, 'tsconfig.json'))) {
    run('npx tsc --project tsconfig.json', dir);
  }
});