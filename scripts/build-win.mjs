// Local one-command Windows .exe packager (`npm run build:win`)
import { execSync } from 'node:child_process';

function run(cmd, extraEnv = {}) {
  console.log('> ' + cmd);
  execSync(cmd, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
}

run('node scripts/generate-icons.mjs');
run('npm run build', { ELECTRON_BUILD: 'true' });
run('npx --yes electron-builder --win nsis portable --x64 --config electron-builder.yml --publish never');
