# Stream Configuration API Usage

The RTMP stream processor now supports dynamic configuration through a REST API. You can configure processing parameters for each stream key before or during streaming.

## API Endpoints

All API endpoints are available on port 80 under the `/api/` path.

### Save Stream Configuration

**POST** `/api/stream-config`

Saves processing configuration for a specific stream key.

**Request Body (JSON):**
```json
{
    "stream_key": "mystream",
    "output_rtmp": "rtmp://localhost/live/mystream_processed",
    "detect_every": 2,
    "similarity_threshold": 0.4
}
```

**Parameters:**
- `stream_key` (required): The incoming stream key to configure
- `output_rtmp` (optional): RTMP URL to publish processed video to
- `output_hls_dir` (optional): Directory path for HLS output (alternative to RTMP)
- `detect_every` (optional): Run face detection every N frames (default: 1)
- `similarity_threshold` (optional): Face matching threshold 0.0-1.0 (default: 0.3)

**Note:** You must specify either `output_rtmp` or `output_hls_dir`, but not both.

**Example:**
```bash
curl -X POST http://localhost/api/stream-config \
  -H "Content-Type: application/json" \
  -d '{
    "stream_key": "test123",
    "output_rtmp": "rtmp://streaming.example.com/live/face_detected",
    "detect_every": 3,
    "similarity_threshold": 0.5
  }'
```

### Get Stream Configuration

**GET** `/api/stream-config?stream_key=<key>`

Retrieves the saved configuration for a stream key.

**Example:**
```bash
curl http://localhost/api/stream-config?stream_key=test123
```

### Delete Stream Configuration

**DELETE** `/api/stream-config?stream_key=<key>`

Removes the saved configuration for a stream key.

**Example:**
```bash
curl -X DELETE http://localhost/api/stream-config?stream_key=test123
```

## Workflow

1. **Configure a stream** before starting:
   ```bash
   # Set up configuration for stream key "mystream"
   curl -X POST http://localhost/api/stream-config \
     -H "Content-Type: application/json" \
     -d '{
       "stream_key": "mystream",
       "output_rtmp": "rtmp://output.server.com/live/faces",
       "detect_every": 2
     }'
   ```

2. **Start streaming** to the configured key:
   ```bash
   # Stream from your device/app to:
   rtmp://your-server/live/mystream
   ```

3. **The processor automatically**:
   - Loads configuration when the stream starts
   - Processes faces according to your settings
   - Outputs to your specified RTMP URL or HLS directory

4. **Update configuration** anytime (takes effect on next stream):
   ```bash
   curl -X POST http://localhost/api/stream-config \
     -H "Content-Type: application/json" \
     -d '{
       "stream_key": "mystream",
       "output_rtmp": "rtmp://different.server.com/live/newstream",
       "detect_every": 5,
       "similarity_threshold": 0.6
     }'
   ```

## Configuration Storage

Configurations are stored as JSON files in `/var/lib/face_stream/configs/` with the pattern `<stream_key>.json`.

## Default Behavior

If no configuration is found for a stream key, the processor will fail to start unless all required parameters are provided via command line (legacy mode). 