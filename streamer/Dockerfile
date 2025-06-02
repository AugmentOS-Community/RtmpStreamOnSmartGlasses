# syntax=docker/dockerfile:1
# Base image with Python and necessary build tools
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    LC_ALL=C.UTF-8 \
    LANG=C.UTF-8

# 1. Install OS dependencies: nginx with RTMP, FFmpeg, Python, and Supervisor
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip python3-dev \
        nginx libnginx-mod-rtmp \
        ffmpeg \
        supervisor \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# 2. Create directories needed at runtime
RUN mkdir -p /var/log/face_stream /var/run/face_stream /var/lib/face_stream/configs

# 3. Set workdir and copy Python requirements
WORKDIR /app
COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

# 4. Copy application source code and configuration files
COPY . /app

# 5. Nginx configuration (overwrite default)
RUN rm -f /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/nginx.conf

# 6. Supervisor configuration
COPY supervisord.conf /etc/supervisord.conf

# 7. Ensure scripts are executable
RUN chmod +x /app/*.sh

# 8. Expose ports: HTTP 80, RTMP 1935, Config API 8080
EXPOSE 80 1935 8080

# 9. Start both nginx and config API via Supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"] 