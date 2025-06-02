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
    const userId = req.authUserId;
    let rtmpUrlToShow: string | undefined;
    let streamStatusToShow;

    if (userId) {
      rtmpUrlToShow = exampleApp.getRtmpUrlForUser(userId);
      streamStatusToShow = exampleApp.getStreamStatusForUser(userId);
    } else {
      rtmpUrlToShow = exampleApp.getDefaultRtmpUrl();
      streamStatusToShow = exampleApp.streamStoppedStatus; // Or a generic stopped status
    }

    res.render('webview', {
      userId: userId,
      rtmpUrl: rtmpUrlToShow,
      streamStatus: streamStatusToShow
    });
  });

  // API endpoint to get current stream status and RTMP URL for the authenticated user
  app.get('/api/stream-info', (req: AuthenticatedRequest, res: any) => {
    const userId = req.authUserId;
    if (!userId) {
      return res.status(401).json({
        rtmpUrl: exampleApp.getDefaultRtmpUrl(),
        streamStatus: exampleApp.streamStoppedStatus,
        userId: null,
        message: "User not authenticated. Showing default info."
      });
    }
    res.json({
      rtmpUrl: exampleApp.getRtmpUrlForUser(userId),
      streamStatus: exampleApp.getStreamStatusForUser(userId),
      userId: userId
    });
  });

  // API endpoint to update RTMP URL for the authenticated user
  app.post('/api/rtmp-url', (req: AuthenticatedRequest, res: any) => {
    const userId = req.authUserId;
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

  // API endpoint to start the stream for the authenticated user
  app.post('/api/start-stream', async (req: AuthenticatedRequest, res: any) => {
    const userId = req.authUserId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated. Cannot start stream.' });
    }
    const { rtmpUrl, highlightFaces } = req.body;
    try {
      await exampleApp.startStreamForUser(userId, rtmpUrl, highlightFaces);
      res.json({ success: true, message: 'Stream start requested for user.' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'Failed to start stream for user.' });
    }
  });

  // API endpoint to stop the stream for the authenticated user
  app.post('/api/stop-stream', async (req: AuthenticatedRequest, res: any) => {
    const userId = req.authUserId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated. Cannot stop stream.' });
    }
    try {
      await exampleApp.stopStreamForUser(userId);
      res.json({ success: true, message: 'Stream stop requested for user.' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'Failed to stop stream for user.' });
    }
  });
}