module.exports = {
  apps: [
    {
      name: 'dev-mentra-merge',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development'
      }
    },
  ]
};
