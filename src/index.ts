import { TpaServer, TpaSession, RtmpStreamStatus, GlassesToCloudMessageType } from '@augmentos/sdk';
import { setupExpressRoutes } from './webview';
import path from 'path';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const PACKAGE_NAME = process.env.PACKAGE_NAME;
const AUGMENTOS_API_KEY = process.env.AUGMENTOS_API_KEY;

/**
 * Represents the user-specific stream state for each active session
 */
interface UserStreamState {
  rtmpUrl: string;
  streamStatus: RtmpStreamStatus;
  session: TpaSession;
  faceHighlightingEnabled?: boolean;
  hlsUrl?: string; // Add HLS URL tracking
  streamMode?: 'rtmp' | 'hls' | 'simulation'; // Add simulation mode
}

/**
 * Represents persistent user settings that survive session disconnections
 */
interface UserPersistentSettings {
  rtmpUrl: string;
  streamMode?: 'rtmp' | 'hls' | 'simulation'; // Add simulation mode
  faceHighlightingEnabled?: boolean;
}

class ExampleAugmentOSApp extends TpaServer {
  // Map userId to their session and stream state
  private activeUserStates: Map<string, UserStreamState> = new Map();

  // Map userId to their persistent settings (survives disconnections)
  private persistentUserSettings: Map<string, UserPersistentSettings> = new Map();

  private defaultRtmpUrl: string = 'rtmp://0.0.0.0/s/streamKey';

  constructor() {
    if (!PACKAGE_NAME || !AUGMENTOS_API_KEY) {
      throw new Error("PACKAGE_NAME and API_KEY must be set");
    }
    super({
      packageName: PACKAGE_NAME,
      apiKey: AUGMENTOS_API_KEY,
      port: PORT,
      publicDir: path.join(__dirname, '../public'),
      augmentOSWebsocketUrl: 'ws://localhost:80/ws'
    });
    setupExpressRoutes(this);
  }

  private getInitialStreamStatus(): RtmpStreamStatus {
    return { type: GlassesToCloudMessageType.RTMP_STREAM_STATUS, status: 'stopped', timestamp: new Date() };
  }

  /**
   * Updates the RTMP URL for a specific user
   * @param userId - The user ID to update the RTMP URL for
   * @param newUrl - The new RTMP URL to set
   * @throws {Error} If the URL is invalid or user has no active session
   */
  public setRtmpUrlForUser(userId: string, newUrl: string): void {
    // Basic URL validation
    if (!newUrl || typeof newUrl !== 'string') {
      throw new Error('RTMP URL must be a non-empty string');
    }

    // Basic RTMP URL format validation
    if (!newUrl.startsWith('rtmp://') && !newUrl.startsWith('rtmps://')) {
      console.warn(`Warning: RTMP URL for user ${userId} does not start with rtmp:// or rtmps://`);
    }

    // Get existing persistent settings or create new ones
    const existingSettings = this.persistentUserSettings.get(userId) || { rtmpUrl: this.defaultRtmpUrl };

    // Save to persistent storage with updated RTMP URL
    this.persistentUserSettings.set(userId, {
      ...existingSettings,
      rtmpUrl: newUrl
    });

    const userState = this.activeUserStates.get(userId);
    if (userState) {
      const previousUrl = userState.rtmpUrl;
      userState.rtmpUrl = newUrl;
      console.log(`RTMP URL updated for user ${userId}: ${previousUrl} -> ${newUrl}`);

      // Notify the user's glasses that the URL has been updated
      userState.session.layouts.showTextWall(`RTMP URL updated to: ${newUrl}`);
    } else {
      console.log(`RTMP URL saved for user ${userId} (no active session): ${newUrl}`);
    }
  }

  /**
   * Updates persistent settings for a user
   * @param userId - The user ID to update settings for
   * @param settings - Partial settings to update
   */
  public updatePersistentSettingsForUser(userId: string, settings: Partial<UserPersistentSettings>): void {
    const existingSettings = this.persistentUserSettings.get(userId) || { rtmpUrl: this.defaultRtmpUrl };

    // Merge new settings with existing ones
    const updatedSettings = { ...existingSettings, ...settings };
    this.persistentUserSettings.set(userId, updatedSettings);

    // Update active session state if user is connected
    const userState = this.activeUserStates.get(userId);
    if (userState) {
      if (settings.streamMode !== undefined) {
        userState.streamMode = settings.streamMode;
      }
      if (settings.faceHighlightingEnabled !== undefined) {
        userState.faceHighlightingEnabled = settings.faceHighlightingEnabled;
      }
      if (settings.rtmpUrl !== undefined) {
        userState.rtmpUrl = settings.rtmpUrl;
      }
    }

    console.log(`Persistent settings updated for user ${userId}:`, settings);
  }

  /**
   * Gets the RTMP URL for a specific user
   * @param userId - The user ID to get the RTMP URL for
   * @returns The user's RTMP URL or the default URL if user not found
   */
  public getRtmpUrlForUser(userId: string): string | undefined {
    // Check persistent storage first, then active state, then default
    const persistentSettings = this.persistentUserSettings.get(userId);
    if (persistentSettings) {
      return persistentSettings.rtmpUrl;
    }

    return this.activeUserStates.get(userId)?.rtmpUrl || this.defaultRtmpUrl;
  }

  /**
   * Gets the default RTMP URL
   * @returns The default RTMP URL
   */
  public getDefaultRtmpUrl(): string {
    return this.defaultRtmpUrl;
  }

  /**
   * Gets the stream status for a specific user
   * @param userId - The user ID to get the stream status for
   * @returns The user's stream status or a default stopped status
   */
  public getStreamStatusForUser(userId: string): RtmpStreamStatus | undefined {
    return this.activeUserStates.get(userId)?.streamStatus || this.getInitialStreamStatus();
  }

  /**
   * Checks if face highlighting is enabled for a specific user
   * @param userId - The user ID to check
   * @returns Whether face highlighting is enabled
   */
  public isFaceHighlightingEnabledForUser(userId: string): boolean {
    // Check persistent storage first, then active state, then default to true
    const persistentSettings = this.persistentUserSettings.get(userId);
    if (persistentSettings && persistentSettings.faceHighlightingEnabled !== undefined) {
      return persistentSettings.faceHighlightingEnabled;
    }

    return this.activeUserStates.get(userId)?.faceHighlightingEnabled ?? true;
  }

  public streamStoppedStatus: RtmpStreamStatus = { type: GlassesToCloudMessageType.RTMP_STREAM_STATUS, status: 'stopped', timestamp: new Date() };

  /**
   * Debug method to check active sessions
   * @param userId - The user ID to check for
   */
  public debugActiveStates(userId?: string): void {
    console.log(`🔍 Active session debug:`);
    console.log(`Total active sessions: ${this.activeUserStates.size}`);
    console.log(`Active user IDs: [${Array.from(this.activeUserStates.keys()).join(', ')}]`);

    if (userId) {
      const hasActiveState = this.activeUserStates.has(userId);
      console.log(`User "${userId}" has active session: ${hasActiveState}`);

      if (hasActiveState) {
        const userState = this.activeUserStates.get(userId);
        console.log(`User state:`, {
          rtmpUrl: userState?.rtmpUrl,
          streamMode: userState?.streamMode,
          faceHighlightingEnabled: userState?.faceHighlightingEnabled,
          streamStatus: userState?.streamStatus?.status
        });
      }
    }

    console.log(`Persistent settings for all users:`,
      Object.fromEntries(this.persistentUserSettings.entries())
    );
  }

  // Method to start stream for a user
  public async startStreamForUser(userId: string, rtmpUrl?: string, highlightFaces?: boolean, streamMode?: 'rtmp' | 'hls' | 'simulation'): Promise<void> {
    console.log(`🔍 [${userId}] Attempting to start stream - checking active session...`);
    this.debugActiveStates(userId);

    const userState = this.activeUserStates.get(userId);
    if (!userState) {
      console.error(`❌ [${userId}] No active session for user - glasses may not be connected`);
      throw new Error("No active session for user to start stream. Please ensure glasses are connected and paired.");
    }

    // Default to HLS mode if not specified
    const mode = streamMode || 'hls';
    userState.streamMode = mode;

    // Handle simulation mode - no actual streaming needed
    if (mode === 'simulation') {
      console.log(`🎥 [${userId}] Demo mode - connecting to sample content source`);

      // Update the face highlighting state for simulation
      userState.faceHighlightingEnabled = highlightFaces;

      // Save preferences to persistent storage
      this.updatePersistentSettingsForUser(userId, {
        streamMode: mode,
        faceHighlightingEnabled: highlightFaces
      });

      console.log(`✅ [${userId}] Demo content source connected with settings:`, {
        streamMode: mode,
        faceHighlightingEnabled: highlightFaces
      });

      return; // Skip the rest of the streaming setup
    }

    // HLS mode requires face highlighting
    if (mode === 'hls') {
      highlightFaces = true;
    }

    let urlToUse = rtmpUrl || userState.rtmpUrl || this.defaultRtmpUrl;

    // Update the face highlighting state
    userState.faceHighlightingEnabled = highlightFaces;

    // Save preferences to persistent storage
    this.updatePersistentSettingsForUser(userId, {
      streamMode: mode,
      faceHighlightingEnabled: highlightFaces
    });

    // Log all current settings before starting
    console.log(`🚀 [${userId}] Starting stream with settings:`, {
      streamMode: mode,
      rtmpUrl: urlToUse,
      originalRtmpUrl: rtmpUrl,
      userStateRtmpUrl: userState.rtmpUrl,
      highlightFaces: highlightFaces,
      faceHighlightingEnabled: userState.faceHighlightingEnabled,
      hlsUrl: userState.hlsUrl,
      persistentSettings: this.persistentUserSettings.get(userId)
    });

    // If face highlighting is enabled, configure the face recognition server
    if (highlightFaces) {
      try {
        // Generate a unique stream key for this user
        const streamKey = `user_${userId.replace(/[@]/g, '_')}`;
        const faceRecognitionServerUrl = 'https://stream.okgodoit.com';

        // Prepare configuration based on stream mode
        const configBody: any = {
          detect_every: 5, // Detect faces every 5 frames for performance
          similarity_threshold: 0.3 // Reasonable threshold for face matching
        };

        // Configure output based on mode
        if (mode === 'hls') {
          configBody.output_hls = true;
        } else {
          configBody.output_rtmp = urlToUse;
        }

        // Configure the face recognition server
        const configResponse = await fetch(`${faceRecognitionServerUrl}/api/config/${streamKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(configBody)
        });

        if (!configResponse.ok) {
          throw new Error(`Failed to configure face recognition: ${configResponse.statusText}`);
        }

        const configResult = await configResponse.json();
        console.log(`✅ [${userId}] Face recognition configured for stream key ${streamKey}:`, configResult);

        // Store HLS URL if available
        if (configResult.output_url && mode === 'hls') {
          userState.hlsUrl = configResult.output_url;
          console.log(`📺 [${userId}] HLS stream will be available at: ${userState.hlsUrl}`);
        }

        // Update the URL to stream to the face recognition server
        urlToUse = `rtmp://stream.okgodoit.com/live/${streamKey}`;
        console.log(`🎯 [${userId}] Streaming to face recognition server at: ${urlToUse}`);

      } catch (error: any) {
        console.error(`❌ [${userId}] Failed to configure face recognition:`, error);
        throw new Error(`Failed to configure face recognition: ${error.message}`);
      }
    } else {
      // No face highlighting - only valid for RTMP mode
      if (mode === 'hls') {
        console.error(`❌ [${userId}] HLS mode requires face highlighting`);
        throw new Error('HLS mode requires face highlighting to be enabled');
      }
      console.log(`📡 [${userId}] Direct RTMP streaming (no face highlighting) to: ${urlToUse}`);
    }

    userState.rtmpUrl = urlToUse; // Update the user's state with the URL being used

    const streamModeText = mode === 'hls' ?
      "Starting stream with face highlighting (HLS)..." :
      (highlightFaces ? "Starting stream with face highlighting (RTMP)..." : "Starting RTMP stream...");

    console.log(`🎬 [${userId}] Attempting to start stream to URL ${urlToUse}`);
    userState.session.layouts.showTextWall(streamModeText);
    try {
      await userState.session.streaming.requestStream({
        rtmpUrl: urlToUse,
        video: { width: 1280, height: 720, bitrate: 2000000, frameRate: 30 },
        audio: { bitrate: 128000, sampleRate: 44100, echoCancellation: true, noiseSuppression: true }
      });
      console.log(`✅ [${userId}] RTMP stream requested successfully via web`);
      // Status will be updated by onStatus handler
    } catch (error: any) {
      console.error(`❌ [${userId}] Failed to start stream:`, error);
      userState.session.layouts.showTextWall(`Failed to start stream: ${error.message}`);
      // Update status to reflect error if possible, or rely on onStatus
      userState.streamStatus = { ...this.getInitialStreamStatus(), status: 'error', errorDetails: error.message, timestamp: new Date()};
      throw error;
    }
  }

  /**
   * Gets the HLS URL for a specific user if available
   * @param userId - The user ID to get the HLS URL for
   * @returns The user's HLS URL or undefined if not available
   */
  public getHlsUrlForUser(userId: string): string | undefined {
    return this.activeUserStates.get(userId)?.hlsUrl;
  }

  /**
   * Gets the stream mode for a specific user
   * @param userId - The user ID to get the stream mode for
   * @returns The user's stream mode or 'hls' as default
   */
  public getStreamModeForUser(userId: string): 'rtmp' | 'hls' | 'simulation' {
    // Check persistent storage first, then active state, then default to 'hls'
    const persistentSettings = this.persistentUserSettings.get(userId);
    if (persistentSettings && persistentSettings.streamMode) {
      return persistentSettings.streamMode;
    }

    return this.activeUserStates.get(userId)?.streamMode || 'hls';
  }

  // Method to stop stream for a user
  public async stopStreamForUser(userId: string): Promise<void> {
    console.log(`🔍 [${userId}] Attempting to stop stream - checking active session...`);
    this.debugActiveStates(userId);

    const userState = this.activeUserStates.get(userId);
    if (!userState) {
      console.error(`❌ [${userId}] No active session for user - glasses may not be connected`);
      throw new Error("No active session for user to stop stream. Please ensure glasses are connected and paired.");
    }

    // Log current settings when stopping
    console.log(`🛑 [${userId}] Stopping stream with current settings:`, {
      streamMode: userState.streamMode,
      rtmpUrl: userState.rtmpUrl,
      faceHighlightingEnabled: userState.faceHighlightingEnabled,
      hlsUrl: userState.hlsUrl,
      currentStatus: userState.streamStatus?.status,
      persistentSettings: this.persistentUserSettings.get(userId)
    });

    console.log(`Attempting to stop stream for user ${userId}`);
    userState.session.layouts.showTextWall("Stopping RTMP stream via web...");
    try {
      await userState.session.streaming.stopStream();
      console.log(`✅ [${userId}] Stream stop requested successfully via web`);
      // Status will be updated by onStatus handler
    } catch (error: any) {
      console.error(`❌ [${userId}] Failed to stop stream:`, error);
      userState.session.layouts.showTextWall(`Failed to stop stream: ${error.message}`);
      userState.streamStatus = { ...this.getInitialStreamStatus(), status: 'error', errorDetails: error.message, timestamp: new Date()};
      throw error;
    }
  }

  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`🔌 [${userId}] New session started: ${sessionId}`);
    this.debugActiveStates(); // Show current state before adding new session

    // Get the user's persistent settings or use defaults
    const persistentSettings = this.persistentUserSettings.get(userId);
    const userRtmpUrl = persistentSettings?.rtmpUrl || this.defaultRtmpUrl;
    const userStreamMode = persistentSettings?.streamMode || 'hls';
    const userFaceHighlighting = persistentSettings?.faceHighlightingEnabled ?? true;

    // Initialize state for this user with their persistent settings
    const userState: UserStreamState = {
      rtmpUrl: userRtmpUrl,
      streamStatus: this.getInitialStreamStatus(),
      session: session,
      streamMode: userStreamMode,
      faceHighlightingEnabled: userFaceHighlighting,
    };
    this.activeUserStates.set(userId, userState);

    console.log(`✅ [${userId}] Session state initialized with settings:`, {
      rtmpUrl: userRtmpUrl,
      streamMode: userStreamMode,
      faceHighlightingEnabled: userFaceHighlighting
    });
    this.debugActiveStates(); // Show state after adding session

    session.layouts.showTextWall("Photo & Streaming App Ready! Face highlighting available.");
    // ... (rest of initial photo logic if any, currently commented out)

    const cleanup = [
      session.events.onConnected(async (data) => {
        console.log(`Glass connected for user ${userId}! Starting RTMP stream check...`);
        session.layouts.showTextWall('Connected! Starting RTMP stream...');
        try {
          await session.streaming.requestStream({
            rtmpUrl: userState.rtmpUrl, // Use user-specific RTMP URL
            video: { width: 1280, height: 720, bitrate: 2000000, frameRate: 30 },
            audio: { bitrate: 128000, sampleRate: 44100, echoCancellation: true, noiseSuppression: true }
          });
          console.log('Initial RTMP stream requested successfully for user:', userId);
        } catch (error: any) {
          console.error('Error capturing initial photo or starting stream:', error);
          session.layouts.showTextWall("Failed to take initial photo/stream: " + error.message);
          userState.streamStatus = { ...this.getInitialStreamStatus(), status: 'error', errorDetails: error.message, timestamp: new Date()};
        }
        const photoUrl = await session.requestPhoto({ saveToGallery: true });
      }),
      session.events.onTranscription(async (data) => {
        session.layouts.showTextWall(data.text, { durationMs: data.isFinal ? 3000 : undefined });
        if (data.isFinal && data.text.toLowerCase().includes("photo")) { /* ... photo logic ... */ }

        if (data.isFinal && data.text.toLowerCase().includes("stop streaming")) {
          try {
            console.log("Stop streaming command detected for user:", userId);
            session.layouts.showTextWall("Stopping RTMP stream...");
            await session.streaming.stopStream();
            console.log("Stream stopped successfully by voice for user:", userId);
            // userState.streamStatus will be updated by onStatus
          } catch (error: any) {
            console.error("Error stopping stream by voice:", error);
            session.layouts.showTextWall("Failed to stop streaming: " + error.message);
            userState.streamStatus = { ...this.getInitialStreamStatus(), status: 'error', errorDetails: error.message, timestamp: new Date()};
          }
        }

        if (data.isFinal && data.text.toLowerCase().includes("start streaming")) {
          try {
            console.log("Start streaming command detected for user:", userId);
            session.layouts.showTextWall("Starting RTMP stream...");
            await session.streaming.requestStream({
              rtmpUrl: userState.rtmpUrl, // Use user-specific RTMP URL
              video: { width: 1280, height: 720, bitrate: 2000000, frameRate: 30 },
              audio: { bitrate: 128000, sampleRate: 44100, echoCancellation: true, noiseSuppression: true }
            });
            console.log("RTMP stream started successfully by voice for user:", userId);
            // userState.streamStatus will be updated by onStatus
          } catch (error: any) {
            console.error("Error starting stream by voice:", error);
            session.layouts.showTextWall("Failed to start streaming: " + error.message);
            userState.streamStatus = { ...this.getInitialStreamStatus(), status: 'error', errorDetails: error.message, timestamp: new Date()};
          }
        }
      }),
      session.events.onPhoneNotifications((data) => { }),
      session.events.onGlassesBattery((data) => { }),
      session.events.onError((error) => { console.error('Session Error for user '+ userId + ':', error); }),
      session.streaming.onStatus((status: RtmpStreamStatus) => {
        console.log(`Stream status update for user ${userId}: ${status.status}`, status);
        const currentUserState = this.activeUserStates.get(userId);
        if (currentUserState) {
            currentUserState.streamStatus = { ...status, timestamp: new Date() };
            // Propagate essential parts of status for UI update to glasses
            switch (status.status) {
                case 'initializing':
                    session.layouts.showTextWall('Stream is initializing...');
                    break;
                case 'active':
                    session.layouts.showTextWall('Stream is active and running!');
                    break;
                case 'error':
                    session.layouts.showTextWall(`Stream error: ${status.errorDetails}`);
                    break;
                case 'stopped':
                    session.layouts.showTextWall('Stream has stopped');
                    // Ensure the type is correctly set for a definitive stopped state
                    currentUserState.streamStatus.type = GlassesToCloudMessageType.RTMP_STREAM_STATUS;
                    currentUserState.streamStatus.status = 'stopped'; // Force status if not already
                    break;
            }
        } else {
            console.warn("Received stream status for a user with no active state object:", userId);
        }
      }),
      session.events.onDisconnected((data: string | { message: string; code: number; reason: string; wasClean: boolean; permanent?: boolean }) => {
        const reason = typeof data === 'string' ? data : data.reason;
        console.log(`🔌 [${userId}] Session ${sessionId} disconnected. Reason: ${reason}`);

        // Only remove the active session state, preserve persistent settings
        this.activeUserStates.delete(userId);
        console.log(`🗑️ [${userId}] Active session removed. Active sessions remaining: ${this.activeUserStates.size}. Persistent settings preserved.`);
        this.debugActiveStates(); // Show state after removal
      })
    ];

    cleanup.forEach(handler => {
      if (handler && typeof handler === 'function') {
        this.addCleanupHandler(handler);
      }
    });
  }
}

const app = new ExampleAugmentOSApp();
app.start().catch(console.error);

export { ExampleAugmentOSApp };