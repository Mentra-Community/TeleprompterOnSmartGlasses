module.exports = {
  apps: [
    {
      name: 'prod-mentra-teleprompter',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      }
    },
  ]
};
