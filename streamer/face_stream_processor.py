#!/usr/bin/env python3
"""
face_stream_processor.py

Real-Time Face Detection & Recognition (SCRFD + ArcFace) on CPU.
Supports:
  • Input: RTMP stream or Local video file
  • Output: RTMP stream or HLS (HTTP Live Streaming) directory
  • Optimized mode: run detection only every Nth frame
  • Configuration: loads from filesystem config files with command line fallback
"""

import argparse
import os
import sys
import subprocess
import cv2
import numpy as np
import json
from insightface.app import FaceAnalysis

# Configuration storage directory
CONFIG_DIR = "/var/lib/face_stream/configs"

def load_stream_config(stream_key):
    """
    Load configuration for a stream key from filesystem.
    Returns config dict or None if not found.
    """
    if not stream_key:
        return None
    
    # Sanitize stream key to match what the API server does
    safe_key = "".join(c for c in stream_key if c.isalnum() or c in ('_', '-'))
    config_path = os.path.join(CONFIG_DIR, f"{safe_key}.json")
    
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Warning: Failed to load config from {config_path}: {e}")
    
    return None

def parse_args():
    parser = argparse.ArgumentParser(
        description="Real-Time Face Detection & Recognition (SCRFD + ArcFace) on CPU. "
                    "Supports RTMP or file input, and RTMP or HLS output, "
                    "with optional optimized detection every Nth frame. "
                    "Configuration is loaded from filesystem if available."
    )
    
    # Stream key for loading config
    parser.add_argument(
        "--stream_key", type=str,
        help="Stream key to load configuration for (from filesystem)"
    )
    
    # Input: either RTMP or local file
    group_in = parser.add_mutually_exclusive_group()
    group_in.add_argument(
        "--input_rtmp", type=str,
        help="RTMP URL to ingest from, e.g. rtmp://localhost/live/incoming"
    )
    group_in.add_argument(
        "--input_file", type=str,
        help="Path to local video file, e.g. /path/to/video.mp4"
    )
    
    # Output: either RTMP or HLS
    group_out = parser.add_mutually_exclusive_group()
    group_out.add_argument(
        "--output_rtmp", type=str,
        help="RTMP URL to publish annotated video, e.g. rtmp://localhost/live/processed"
    )
    group_out.add_argument(
        "--output_hls_dir", type=str,
        help="Directory to write HLS output (segments + .m3u8), e.g. /var/www/html/hls"
    )
    
    parser.add_argument(
        "--detect_every", type=int, default=1,
        help="Run face detection once every Nth frame (default: 1 → every frame)."
    )
    parser.add_argument(
        "--similarity_threshold", type=float, default=0.3,
        help="Cosine similarity threshold for matching faces (default: 0.3)."
    )
    
    args = parser.parse_args()
    
    # Try to load config from filesystem based on stream_key
    if args.stream_key:
        config = load_stream_config(args.stream_key)
        if config:
            print(f"Loaded configuration for stream key: {args.stream_key}")
            
            # Override args with config values if not already set via command line
            if not args.output_rtmp and config.get('output_rtmp'):
                args.output_rtmp = config['output_rtmp']
            if not args.output_hls_dir and config.get('output_hls_dir'):
                args.output_hls_dir = config['output_hls_dir']
            if args.detect_every == 1 and 'detect_every' in config:
                args.detect_every = config['detect_every']
            if args.similarity_threshold == 0.3 and 'similarity_threshold' in config:
                args.similarity_threshold = config['similarity_threshold']
    
    # Validate that we have required arguments (either from config or command line)
    if not (args.input_rtmp or args.input_file):
        parser.error("Either --input_rtmp or --input_file is required")
    if not (args.output_rtmp or args.output_hls_dir):
        parser.error("Either --output_rtmp or --output_hls_dir is required")
    
    return args

def launch_ffmpeg_subprocess(frame_width, frame_height, fps,
                              output_rtmp=None, output_hls_dir=None):
    """
    Launch FFmpeg subprocess to read raw BGR frames from stdin and either:
      - Stream to RTMP (via FLV/H.264), or
      - Write HLS segments (.ts) + playlist (.m3u8)
    Returns: subprocess.Popen object (with stdin open).
    """
    # Base input options: rawvideo from stdin
    input_args = [
        "ffmpeg",
        "-y",  # overwrite outputs
        "-f", "rawvideo",
        "-pix_fmt", "bgr24",
        "-s", f"{frame_width}x{frame_height}",
        "-r", str(fps),
        "-i", "-",  # read from stdin
    ]
    # Common encoding: H.264, low-latency
    common_enc = [
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-tune", "zerolatency",
        "-pix_fmt", "yuv420p"
    ]

    if output_rtmp:
        cmd = input_args + common_enc + ["-f", "flv", output_rtmp]
        return subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT
        )
    else:
        # HLS path - ensure output dir exists
        os.makedirs(output_hls_dir, exist_ok=True)
        keyint = int(fps * 2)  # 2-second keyframe interval
        hls_opts = [
            "-g", str(keyint),
            "-keyint_min", str(keyint),
            "-sc_threshold", "0",
            "-b:v", "1500k",
            "-maxrate", "1500k",
            "-bufsize", "3000k",
            "-f", "hls",
            "-hls_time", "2",
            "-hls_list_size", "5",
            "-hls_flags", "delete_segments",
            "-hls_segment_filename", f"{output_hls_dir}/segment_%04d.ts",
            f"{output_hls_dir}/stream.m3u8"
        ]
        cmd = input_args + common_enc + hls_opts
        return subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT
        )

def find_matching_face_idx(emb, known_embeddings, threshold):
    """
    Returns index of matching face in known_embeddings if cosine ≥ threshold.
    Otherwise returns None.
    """
    if not known_embeddings:
        return None
    sims = [float(np.dot(emb, known_emb)) for known_emb in known_embeddings]
    max_idx = int(np.argmax(sims))
    if sims[max_idx] >= threshold:
        return max_idx
    return None

def main():
    args = parse_args()

    # 1. Open VideoCapture for input (RTMP or file)
    if args.input_rtmp:
        cap = cv2.VideoCapture(args.input_rtmp)
        if not cap.isOpened():
            sys.exit(f"Error: Cannot open RTMP stream {args.input_rtmp}")
    else:
        if not os.path.isfile(args.input_file):
            sys.exit(f"Error: Input file does not exist: {args.input_file}")
        cap = cv2.VideoCapture(args.input_file)
        if not cap.isOpened():
            sys.exit(f"Error: Cannot open video file {args.input_file}")

    # 2. Get input properties: width, height, fps
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps != fps:  # check for NaN
        fps = 20.0  # fallback if unknown
    print(f"Input resolution: {frame_width}x{frame_height}, FPS: {fps:.2f}")

    # 3. Launch FFmpeg subprocess for output (RTMP or HLS)
    if args.output_rtmp:
        ffmpeg_proc = launch_ffmpeg_subprocess(
            frame_width, frame_height, fps, output_rtmp=args.output_rtmp
        )
        print(f"Streaming annotated video to RTMP: {args.output_rtmp}")
    else:
        ffmpeg_proc = launch_ffmpeg_subprocess(
            frame_width, frame_height, fps, output_hls_dir=args.output_hls_dir
        )
        print(f"Writing HLS to directory: {args.output_hls_dir}")
        print(f"Playlist available at: {args.output_hls_dir}/stream.m3u8")

    # 4. Initialize InsightFace: SCRFD (detector) + ArcFace (recognizer) on CPU
    app = FaceAnalysis(
        name="buffalo_sc",
        providers=["CPUExecutionProvider"],
        root="/opt/face_stream/insightface_models"
    )

    app.prepare(ctx_id=0, det_size=(480, 480))
    print("Loaded InsightFace buffalo_sc (SCRFD + ArcFace) on CPU.")

    # 5. Data structures for labeling
    known_embeddings = []   # normalized embeddings
    known_labels = []       # strings like "Person 1", "Person 2"
    next_id = 1             # integer ID to assign next new face
    last_faces_info = []    # list of dicts: {"bbox": (x1,y1,x2,y2), "label": str}

    # 6. Main processing loop
    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            print("Stream ended or cannot read frame. Exiting loop.")
            break

        # Run detection+recognition only every args.detect_every frames
        if frame_idx % args.detect_every == 0:
            last_faces_info = []
            faces = app.get(frame)  # returns a list of face objects
            for face in faces:
                bbox = face.bbox.astype(int)       # [x1, y1, x2, y2]
                embedding = face.embedding          # 512-dim vector
                emb_norm = embedding / np.linalg.norm(embedding)

                # Match existing face or assign new label
                idx = find_matching_face_idx(
                    emb_norm, known_embeddings, args.similarity_threshold
                )
                if idx is not None:
                    label = known_labels[idx]
                else:
                    label = f"Person {next_id}"
                    known_labels.append(label)
                    known_embeddings.append(emb_norm)
                    next_id += 1

                # Store for drawing
                x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
                last_faces_info.append({"bbox": (x1, y1, x2, y2), "label": label})

        # Draw bounding boxes & labels from last_faces_info
        for info in last_faces_info:
            x1, y1, x2, y2 = info["bbox"]
            label = info["label"]
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(frame, label, (x1, y1 - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2, cv2.LINE_AA)

        # Write annotated frame (raw BGR) into FFmpeg stdin
        try:
            ffmpeg_proc.stdin.write(frame.tobytes())
        except BrokenPipeError:
            print("FFmpeg pipe closed. Exiting.")
            break

        frame_idx += 1

    # Cleanup
    cap.release()
    try:
        ffmpeg_proc.stdin.close()
        ffmpeg_proc.wait(timeout=5)
    except Exception:
        ffmpeg_proc.kill()
    print("Processor exiting. Cleaned up resources.")

if __name__ == "__main__":
    main()
