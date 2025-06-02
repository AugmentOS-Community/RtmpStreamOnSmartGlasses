#!/bin/bash
APP_NAME="$1"
STREAM_KEY="$2"

PID_DIR="/var/run/face_stream"
LOG_DIR="/var/log/face_stream"
PID_FILE="${PID_DIR}/${APP_NAME}_${STREAM_KEY}.pid"
LOG_FILE="${LOG_DIR}/${APP_NAME}_${STREAM_KEY}.log"

if [ -f "${PID_FILE}" ]; then
    PID=$(cat "${PID_FILE}")
    if kill -0 "${PID}" 2>/dev/null; then
        echo "[$(date)] Stopping processor PID ${PID}" >> "${LOG_FILE}"
        kill "${PID}"
        sleep 1
        if kill -0 "${PID}" 2>/dev/null; then
            echo "[$(date)] Killing force PID ${PID}" >> "${LOG_FILE}"
            kill -9 "${PID}"
        fi
    else
        echo "[$(date)] No process ${PID} found" >> "${LOG_FILE}"
    fi
    rm -f "${PID_FILE}"
else
    echo "[$(date)] No PID file for ${APP_NAME}_${STREAM_KEY}" >> "${LOG_FILE}"
fi
