const { execFile } = require('node:child_process');

const ALLOWED_ACTIONS = ['start', 'stop', 'restart'];

function controlService(unit, action, execFileImpl = execFile) {
  if (!ALLOWED_ACTIONS.includes(action)) {
    return Promise.reject(new Error(`Unsupported systemctl action: ${action}`));
  }
  return new Promise((resolve, reject) => {
    execFileImpl('sudo', ['/usr/bin/systemctl', action, unit], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`systemctl ${action} failed: ${stderr || error.message}`));
        return;
      }
      resolve(stdout);
    });
  });
}

module.exports = { controlService, ALLOWED_ACTIONS };
