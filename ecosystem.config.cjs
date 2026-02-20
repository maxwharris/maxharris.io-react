module.exports = {
  apps: [{
    name: 'maxharris-api',
    script: 'index.js',
    cwd: '/var/www/maxharris.io/server',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: '/var/www/maxharris.io/logs/api-err.log',
    out_file: '/var/www/maxharris.io/logs/api-out.log',
    log_file: '/var/www/maxharris.io/logs/api-combined.log',
    time: true
  }]
};
