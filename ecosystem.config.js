module.exports = {
  "apps": [
    {
      "name": "error-book-backend",
      "script": "./src/index.js",
      "cwd": "/home/gpssong/error-book/backend",
      "instances": 1,
      "exec_mode": "fork",
      "env": {
        "NODE_ENV": "production",
        "PORT": "3001",
        "HOST": "127.0.0.1"
      },
      "out_file": "/home/gpssong/error-book/backend/logs/out.log",
      "error_file": "/home/gpssong/error-book/backend/logs/error.log",
      "merge_logs": true,
      "time": true,
      "autorestart": true,
      "max_memory_restart": "500M",
      "min_uptime": "5s",
      "listen_timeout": 10000,
      "wait_ready": true
    }
  ]
}
