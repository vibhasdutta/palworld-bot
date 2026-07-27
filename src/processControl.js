const { execFile } = require('node:child_process');

const ALLOWED_ACTIONS = ['start', 'stop', 'restart'];

function controlService(pm2Name, action, execFileImpl = execFile) {
  if (!ALLOWED_ACTIONS.includes(action)) {
    return Promise.reject(new Error(`Unsupported pm2 action: ${action}`));
  }
  return new Promise((resolve, reject) => {
    execFileImpl('pm2', [action, pm2Name], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`pm2 ${action} failed: ${stderr || error.message}`));
        return;
      }
      resolve(stdout);
    });
  });
}

module.exports = { controlService, ALLOWED_ACTIONS };
