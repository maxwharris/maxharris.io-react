module.exports = {
  apps: [{
    name: 'maxharris-io',
    script: 'npm',
    args: 'run preview',
    cwd: '/var/www/maxharris.io',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 4173
    },
    error_file: '/var/www/maxharris.io/logs/err.log',
    out_file: '/var/www/maxharris.io/logs/out.log',
    log_file: '/var/www/maxharris.io/logs/combined.log',
    time: true
  }]
};
