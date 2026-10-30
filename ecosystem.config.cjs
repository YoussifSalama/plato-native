// pm2 process file for a plain-VPS run (no Docker): the API on :3000 and the web app on :3001.
//   pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
// Each app reads its own .env from its folder (the backend loads it itself; Next reads .env.production at build time).
module.exports = {
  apps: [
    {
      name: 'plato-be',
      cwd: './plato-native-be',
      script: 'dist/main.js',
      env: { NODE_ENV: 'production', PORT: 3000 },
      max_memory_restart: '600M',
      time: true,
    },
    {
      name: 'plato-fe',
      cwd: './plato-job-seeker-native-fe',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '500M',
      time: true,
    },
  ],
};
