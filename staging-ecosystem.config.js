module.exports = {
  apps: [
    {
      name: 'staging-mentra-teleprompter',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'staging'
      }
    },
  ]
};
