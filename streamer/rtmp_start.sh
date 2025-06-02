#!/bin/bash
APP_NAME="$1"
STREAM_KEY="$2"
SERVER="nginx"  # service name in docker-compose

INPUT_URL="rtmp://${SERVER}/${APP_NAME}/${STREAM_KEY}"

PID_DIR="/var/run/face_stream"
LOG_DIR="/var/log/face_stream"
PID_FILE="${PID_DIR}/${APP_NAME}_${STREAM_KEY}.pid"
LOG_FILE="${LOG_DIR}/${APP_NAME}_${STREAM_KEY}.log"

# Create directories if they don't exist
mkdir -p "${PID_DIR}" "${LOG_DIR}"

echo "[$(date)] Starting processor for stream key: ${STREAM_KEY}" >> "${LOG_FILE}"
echo "[$(date)] Input URL: ${INPUT_URL}" >> "${LOG_FILE}"

# Start the processor with just the stream key and input URL
# The processor will load output configuration from filesystem
nohup python3 /app/face_stream_processor.py \
    --stream_key "${STREAM_KEY}" \
    --input_rtmp "${INPUT_URL}" \
    >> "${LOG_FILE}" 2>&1 &

echo $! > "${PID_FILE}"
