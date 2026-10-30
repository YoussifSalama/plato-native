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
      // next.config has output: 'standalone', so `next start` would not serve /_next/static. After `npm run build`:
      //   cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public
      script: '.next/standalone/server.js',
      env: { NODE_ENV: 'production', PORT: 3001, HOSTNAME: '0.0.0.0' },
      max_memory_restart: '500M',
      time: true,
    },
  ],
};
