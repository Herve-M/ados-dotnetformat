const { execSync } = require('child_process');
const glob = require('glob');
const path = require('path');
const fs = require('fs');

function run(command, cwd) {
  try {
    execSync(command, { stdio: 'inherit', cwd });
  } catch (err) {
    console.error(`Error running "${command}" in ${cwd}`);
    process.exit(1);
  }
}

run('npm install npm ci --no-audit --no-progress', process.cwd());

const taskJsonFiles = glob.sync('src/**/task.json');
taskJsonFiles.forEach(file => {
  const dir = path.dirname(file);
  if (fs.existsSync(path.join(dir, 'package.json'))) {
    console.log(`Running npm install npm ci --no-audit --no-progress in ${dir}...`);
    run('npm install npm ci --no-audit --no-progress', dir);
  }
});