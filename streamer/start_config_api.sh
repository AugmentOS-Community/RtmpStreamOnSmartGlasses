#!/bin/bash
# start_config_api.sh
# Start the configuration API server

LOG_DIR="/var/log/face_stream"
PID_DIR="/var/run/face_stream"
CONFIG_DIR="/var/lib/face_stream/configs"

# Create necessary directories
mkdir -p "${LOG_DIR}" "${PID_DIR}" "${CONFIG_DIR}"

# Start the configuration API server
echo "[$(date)] Starting configuration API server on port 8080" >> "${LOG_DIR}/config_api.log"

nohup python3 /app/config_api_server.py >> "${LOG_DIR}/config_api.log" 2>&1 &
echo $! > "${PID_DIR}/config_api.pid"

echo "Configuration API server started (PID: $(cat ${PID_DIR}/config_api.pid))" 