#!/usr/bin/env python3
"""
config_api_server.py

Simple REST API server for managing stream processing configurations.
Runs on port 8080 and saves/loads JSON configs for each stream key.
"""

import json
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Configuration storage directory
CONFIG_DIR = "/var/lib/face_stream/configs"

class ConfigAPIHandler(BaseHTTPRequestHandler):
    """HTTP request handler for stream configuration API"""
    
    def _send_json_response(self, status_code, data):
        """Send JSON response with given status code and data"""
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
    
    def _get_config_path(self, stream_key):
        """Get filesystem path for a stream key's config"""
        # Sanitize stream key to prevent directory traversal
        safe_key = "".join(c for c in stream_key if c.isalnum() or c in ('_', '-'))
        return os.path.join(CONFIG_DIR, f"{safe_key}.json")
    
    def do_GET(self):
        """Handle GET requests to retrieve stream configuration"""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/api/stream-config':
            query_params = parse_qs(parsed_path.query)
            stream_key = query_params.get('stream_key', [''])[0]
            
            if not stream_key:
                self._send_json_response(400, {"error": "stream_key parameter required"})
                return
            
            config_path = self._get_config_path(stream_key)
            
            if os.path.exists(config_path):
                try:
                    with open(config_path, 'r') as f:
                        config = json.load(f)
                    self._send_json_response(200, config)
                except Exception as e:
                    self._send_json_response(500, {"error": f"Failed to read config: {str(e)}"})
            else:
                self._send_json_response(404, {"error": "Configuration not found"})
        else:
            self._send_json_response(404, {"error": "Endpoint not found"})
    
    def do_POST(self):
        """Handle POST requests to save stream configuration"""
        if self.path == '/api/stream-config':
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                self._send_json_response(400, {"error": "Request body required"})
                return
            
            try:
                body = self.rfile.read(content_length)
                data = json.loads(body.decode('utf-8'))
                
                # Validate required fields
                stream_key = data.get('stream_key')
                if not stream_key:
                    self._send_json_response(400, {"error": "stream_key field required"})
                    return
                
                # Ensure config directory exists
                os.makedirs(CONFIG_DIR, exist_ok=True)
                
                # Save configuration
                config_path = self._get_config_path(stream_key)
                
                # Store all processing parameters
                config = {
                    "stream_key": stream_key,
                    "output_rtmp": data.get('output_rtmp'),
                    "output_hls_dir": data.get('output_hls_dir'),
                    "detect_every": data.get('detect_every', 1),
                    "similarity_threshold": data.get('similarity_threshold', 0.3)
                }
                
                with open(config_path, 'w') as f:
                    json.dump(config, f, indent=2)
                
                self._send_json_response(200, {"message": "Configuration saved", "config": config})
                
            except json.JSONDecodeError:
                self._send_json_response(400, {"error": "Invalid JSON"})
            except Exception as e:
                self._send_json_response(500, {"error": f"Failed to save config: {str(e)}"})
        else:
            self._send_json_response(404, {"error": "Endpoint not found"})
    
    def do_DELETE(self):
        """Handle DELETE requests to remove stream configuration"""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/api/stream-config':
            query_params = parse_qs(parsed_path.query)
            stream_key = query_params.get('stream_key', [''])[0]
            
            if not stream_key:
                self._send_json_response(400, {"error": "stream_key parameter required"})
                return
            
            config_path = self._get_config_path(stream_key)
            
            if os.path.exists(config_path):
                try:
                    os.remove(config_path)
                    self._send_json_response(200, {"message": "Configuration deleted"})
                except Exception as e:
                    self._send_json_response(500, {"error": f"Failed to delete config: {str(e)}"})
            else:
                self._send_json_response(404, {"error": "Configuration not found"})
        else:
            self._send_json_response(404, {"error": "Endpoint not found"})
    
    def log_message(self, format, *args):
        """Override to customize logging"""
        sys.stderr.write(f"[ConfigAPI] {format % args}\n")

def main():
    """Run the configuration API server"""
    server_address = ('', 8080)
    httpd = HTTPServer(server_address, ConfigAPIHandler)
    print(f"Configuration API server listening on port 8080")
    print(f"Storing configs in: {CONFIG_DIR}")
    httpd.serve_forever()

if __name__ == "__main__":
    main() 