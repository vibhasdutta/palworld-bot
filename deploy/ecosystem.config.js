module.exports = {
  apps: [
    {
      name: 'palworld',
      script: '/home/morfit/palworld/PalServer.sh',
      interpreter: 'bash',
      cwd: '/home/morfit/palworld',
      autorestart: false,
      max_restarts: 10,
    },
    {
      name: 'palworld-bot',
      script: '/home/morfit/palworld-bot/src/index.js',
      cwd: '/home/morfit/palworld-bot',
      node_args: '--env-file=.env',
      autorestart: true,
      max_memory_restart: '250M',
    },
  ],
};
