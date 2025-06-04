import { AuthenticatedRequest, TpaServer } from '@augmentos/sdk';
import express from 'express';
import path from 'path';
import { ExampleAugmentOSApp } from './index'; // Import the app class

/**
 * Sets up all Express routes and middleware for the TPA server
 * @param serverInstance The TPA server instance, cast to ExampleAugmentOSApp for specific methods
 */
export function setupExpressRoutes(serverInstance: TpaServer): void {
  const app = serverInstance.getExpressApp();
  const exampleApp = serverInstance as ExampleAugmentOSApp;

  // Set up EJS as the view engine
  app.set('view engine', 'ejs');
  app.engine('ejs', require('ejs').__express);
  app.set('views', path.join(__dirname, 'views'));

  // Serve static files from public/css
  app.use('/css', express.static(path.join(__dirname, '../public/css')) as any);

  // Middleware to parse JSON bodies
  app.use(express.json() as any);

  // Main webview route
  app.get('/webview', (req: AuthenticatedRequest, res: any) => {
    const userId = req.authUserId || 'alex1115alex@gmail.com';
    let rtmpUrlToShow: string | undefined;
    let streamStatusToShow;
    let faceHighlightingEnabled = false;
    let hlsUrl: string | undefined;
    let streamMode: 'rtmp' | 'hls' = 'hls'; // Default to HLS

    if (userId) {
      console.log(`📱 [${userId}] Loading user-specific settings`);
      rtmpUrlToShow = exampleApp.getRtmpUrlForUser(userId);
      streamStatusToShow = exampleApp.getStreamStatusForUser(userId);
      faceHighlightingEnabled = exampleApp.isFaceHighlightingEnabledForUser(userId);
      hlsUrl = exampleApp.getHlsUrlForUser(userId);
      streamMode = exampleApp.getStreamModeForUser(userId);

      // Debug active session state
      exampleApp.debugActiveStates(userId);
    } else {
      console.log(`🚫 No authenticated user - showing default settings`);
      rtmpUrlToShow = exampleApp.getDefaultRtmpUrl();
      streamStatusToShow = exampleApp.streamStoppedStatus; // Or a generic stopped status
    }

    res.render('webview', {
      userId: userId,
      rtmpUrl: rtmpUrlToShow,
      streamStatus: streamStatusToShow,
      faceHighlightingEnabled: faceHighlightingEnabled,
      hlsUrl: hlsUrl,
      streamMode: streamMode
    });
  });

  // API endpoint to get current stream status and RTMP URL for the authenticated user
  app.get('/api/stream-info', (req: AuthenticatedRequest, res: any) => {
    const userId = req.authUserId || 'alex1115alex@gmail.com';
    if (!userId) {
      return res.status(401).json({
        rtmpUrl: exampleApp.getDefaultRtmpUrl(),
        streamStatus: exampleApp.streamStoppedStatus,
        userId: null,
        faceHighlightingEnabled: false,
        hlsUrl: null,
        streamMode: 'hls',
        message: "User not authenticated. Showing default info."
      });
    }
    res.json({
      rtmpUrl: exampleApp.getRtmpUrlForUser(userId),
      streamStatus: exampleApp.getStreamStatusForUser(userId),
      userId: userId,
      faceHighlightingEnabled: exampleApp.isFaceHighlightingEnabledForUser(userId),
      hlsUrl: exampleApp.getHlsUrlForUser(userId),
      streamMode: exampleApp.getStreamModeForUser(userId)
    });
  });

  // API endpoint to update RTMP URL for the authenticated user
  app.post('/api/rtmp-url', (req: AuthenticatedRequest, res: any) => {
    const userId = req.authUserId || 'alex1115alex@gmail.com';
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated.' });
    }

    const { rtmpUrl } = req.body;

    // Validate request body
    if (!rtmpUrl) {
      return res.status(400).json({
        success: false,
        message: 'RTMP URL is required in request body.'
      });
    }

    if (typeof rtmpUrl !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'RTMP URL must be a string.'
      });
    }

    try {
      exampleApp.setRtmpUrlForUser(userId, rtmpUrl);
      res.json({
        success: true,
        message: 'RTMP URL updated successfully for user.',
        newRtmpUrl: rtmpUrl,
        userId: userId
      });
    } catch (error: any) {
      console.error(`Error updating RTMP URL for user ${userId}:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update RTMP URL.'
      });
    }
  });

  // API endpoint to update stream preferences for the authenticated user
  app.post('/api/stream-preferences', (req: AuthenticatedRequest, res: any) => {
    const userId = req.authUserId || 'alex1115alex@gmail.com';
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated.' });
    }

    const { streamMode, faceHighlightingEnabled } = req.body;

    // Validate request body
    if (streamMode && !['rtmp', 'hls', 'simulation'].includes(streamMode)) {
      return res.status(400).json({
        success: false,
        message: 'Stream mode must be either "rtmp", "hls", or "simulation".'
      });
    }

    if (faceHighlightingEnabled !== undefined && typeof faceHighlightingEnabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Face highlighting enabled must be a boolean.'
      });
    }

    try {
      const settings: any = {};
      if (streamMode !== undefined) settings.streamMode = streamMode;
      if (faceHighlightingEnabled !== undefined) settings.faceHighlightingEnabled = faceHighlightingEnabled;

      exampleApp.updatePersistentSettingsForUser(userId, settings);
      res.json({
        success: true,
        message: 'Stream preferences updated successfully.',
        settings: settings,
        userId: userId
      });
    } catch (error: any) {
      console.error(`Error updating stream preferences for user ${userId}:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update stream preferences.'
      });
    }
  });

  // API endpoint to start the stream for the authenticated user
  app.post('/api/start-stream', async (req: AuthenticatedRequest, res: any) => {
    const userId = req.authUserId || 'alex1115alex@gmail.com';
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated. Cannot start stream.' });
    }
    const { rtmpUrl, highlightFaces, streamMode } = req.body;

    // Handle simulation mode - no actual streaming needed
    if (streamMode === 'simulation') {
      console.log(`🎬 [${userId}] Demo mode requested - using sample content`);
      res.json({
        success: true,
        message: 'Demo mode activated - streaming from sample content.',
        mode: 'demo'
      });
      return;
    }

    try {
      await exampleApp.startStreamForUser(userId, rtmpUrl, highlightFaces, streamMode);
      res.json({ success: true, message: 'Stream start requested for user.' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'Failed to start stream for user.' });
    }
  });

  // API endpoint to stop the stream for the authenticated user
  app.post('/api/stop-stream', async (req: AuthenticatedRequest, res: any) => {
    const userId = req.authUserId || 'alex1115alex@gmail.com';
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated. Cannot stop stream.' });
    }

    // Check if user is in simulation mode
    const currentStreamMode = exampleApp.getStreamModeForUser(userId);
    if (currentStreamMode === 'simulation') {
      console.log(`🎬 [${userId}] Demo mode stop requested - disconnecting from sample content`);
      res.json({
        success: true,
        message: 'Demo mode stopped - disconnected from sample content.',
        mode: 'demo'
      });
      return;
    }

    try {
      await exampleApp.stopStreamForUser(userId);
      res.json({ success: true, message: 'Stream stop requested for user.' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'Failed to stop stream for user.' });
    }
  });

  // API endpoint to get detected faces for the authenticated user's stream
  app.get('/api/faces', async (req: AuthenticatedRequest, res: any) => {
    const userId = req.authUserId || 'alex1115alex@gmail.com';
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated.' });
    }

    // Generate the stream key based on user ID (same format as in index.ts)
    const streamKey = `user_${userId.replace(/[@]/g, '_')}`;
    const faceRecognitionServerUrl = 'https://stream.okgodoit.com';

    try {
      const response = await fetch(`${faceRecognitionServerUrl}/api/faces/${streamKey}`);

      if (response.status === 404) {
        return res.json({
          success: true,
          stream_key: streamKey,
          count: 0,
          faces: [],
          message: 'No faces detected yet'
        });
      }

      if (!response.ok) {
        throw new Error(`Face server responded with status: ${response.status}`);
      }

      const facesData = await response.json();
      res.json({
        success: true,
        ...facesData
      });
    } catch (error: any) {
      console.error(`Error fetching faces for user ${userId}:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch detected faces.'
      });
    }
  });

  // API endpoint to rename a face label for the authenticated user's stream
  app.put('/api/faces/rename', async (req: AuthenticatedRequest, res: any) => {
    const userId = req.authUserId || 'alex1115alex@gmail.com';
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated.' });
    }

    const { old_label, new_label } = req.body;

    // Validate request body
    if (!old_label || !new_label) {
      return res.status(400).json({
        success: false,
        message: 'Both old_label and new_label are required.'
      });
    }

    if (typeof old_label !== 'string' || typeof new_label !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Labels must be strings.'
      });
    }

    // Generate the stream key based on user ID
    const streamKey = `user_${userId.replace(/[@]/g, '_')}`;
    const faceRecognitionServerUrl = 'https://stream.okgodoit.com';

    try {
      const response = await fetch(`${faceRecognitionServerUrl}/api/faces/${streamKey}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_label, new_label })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Face server responded with status: ${response.status}`);
      }

      const renameResult = await response.json();
      res.json({
        success: true,
        ...renameResult
      });
    } catch (error: any) {
      console.error(`Error renaming face for user ${userId}:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to rename face label.'
      });
    }
  });
}