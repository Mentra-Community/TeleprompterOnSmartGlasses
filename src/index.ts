// augmentos_cloud/packages/apps/teleprompter/src/index.ts
import express from 'express';
import WebSocket from 'ws';
import path from 'path';
import axios from 'axios';

import {
  TpaConnectionInit,
  DataStream,
  DisplayRequest,
  TpaSubscriptionUpdate,
  TpaToCloudMessageType,
  StreamType,
  CloudToGlassesMessageType,
  CloudToTpaMessageType,
  ViewType,
  LayoutType,
} from './sdk';

class TextScrollManager {
  private text: string;
  private lineWidth: number;
  private numberOfLines: number;
  private currentPosition: number;
  private scrollSpeed: number; // Characters per second
  private scrollInterval: number; // Milliseconds between updates

  constructor(text: string, lineWidth: number = 30, numberOfLines: number = 3, scrollSpeed: number = 2) {
    this.text = text || this.getDefaultText();
    this.lineWidth = lineWidth;
    this.numberOfLines = numberOfLines;
    this.currentPosition = 0;
    this.scrollSpeed = scrollSpeed;
    this.scrollInterval = 500; // Default to updating every 500ms
  }

  getDefaultText(): string {
    return `Welcome to AugmentOS Teleprompter. This is a default text that will scroll at your set speed. You can replace this with your own content through the settings. The teleprompter will automatically scroll text at a comfortable reading pace. You can adjust the scroll speed, line width, and number of lines through the settings menu. As you read this text, it will continue to scroll upward, allowing you to deliver your presentation smoothly and professionally.`;
  }

  setText(newText: string): void {
    this.text = newText || this.getDefaultText();
    this.currentPosition = 0;
  }

  setScrollSpeed(charsPerSecond: number): void {
    this.scrollSpeed = charsPerSecond;
  }

  setLineWidth(width: number): void {
    this.lineWidth = width;
  }

  setNumberOfLines(lines: number): void {
    this.numberOfLines = lines;
  }

  setScrollInterval(intervalMs: number): void {
    this.scrollInterval = intervalMs;
  }

  getScrollInterval(): number {
    return this.scrollInterval;
  }

  resetPosition(): void {
    this.currentPosition = 0;
  }

  advancePosition(): void {
    // Move forward by characters based on scroll speed and interval
    const charsToAdvance = Math.ceil((this.scrollSpeed * this.scrollInterval) / 1000);
    this.currentPosition += charsToAdvance;
    
    // Cap at the end of text
    if (this.currentPosition > this.text.length) {
      this.currentPosition = this.text.length;
    }
  }

  getCurrentVisibleText(): string {
    // Calculate how many characters to display
    const totalCharsToDisplay = this.lineWidth * this.numberOfLines;
    
    // Get the relevant portion of text starting from current position
    let displayText = this.text.substring(this.currentPosition);
    
    // Format the text into lines
    let formattedText = '';
    for (let i = 0; i < displayText.length; i += this.lineWidth) {
      const line = displayText.substring(i, i + this.lineWidth);
      formattedText += line + '\n';
      
      // Stop if we've reached the number of lines to display
      if (i >= (this.numberOfLines - 1) * this.lineWidth) {
        break;
      }
    }
    
    return formattedText.trim();
  }

  isAtEnd(): boolean {
    return this.currentPosition >= this.text.length;
  }
}

const app = express();
const PORT = 80; // Default http port.
const PACKAGE_NAME = 'com.augmentos.teleprompter';
const API_KEY = 'test_key'; // In production, this would be securely stored

// Track user sessions and their scroll managers
const userScrollManagers: Map<string, TextScrollManager> = new Map();
const userSessions = new Map<string, Set<string>>(); // userId -> Set<sessionId>
const sessionScrollers: Map<string, NodeJS.Timeout> = new Map(); // sessionId -> scroll interval timer

// Parse JSON bodies
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, './public')));

// Track active sessions
const activeSessions = new Map<string, WebSocket>();

function convertLineWidth(width: string | number): number {
  if (typeof width === 'number') return width;

  switch (width.toLowerCase()) {
    case 'very narrow': return 21;
    case 'narrow': return 30;
    case 'medium': return 38;
    case 'wide': return 44;
    case 'very wide': return 52;
    default: return 38;
  }
}

async function fetchAndApplySettings(sessionId: string, userId: string) {
  try {
    const response = await axios.get(`http://cloud/api/tpasettings/user/${PACKAGE_NAME}`, {
      headers: { Authorization: `Bearer ${userId}` }
    });
    const settings = response.data.settings;
    console.log(`Fetched settings for session ${sessionId}:`, settings);
    
    const lineWidthSetting = settings.find((s: any) => s.key === 'line_width');
    const numberOfLinesSetting = settings.find((s: any) => s.key === 'number_of_lines');
    const scrollSpeedSetting = settings.find((s: any) => s.key === 'scroll_speed');
    const customTextSetting = settings.find((s: any) => s.key === 'custom_text');

    // Apply settings with defaults
    const lineWidth = lineWidthSetting ? convertLineWidth(lineWidthSetting.value) : 38;
    const numberOfLines = numberOfLinesSetting ? Number(numberOfLinesSetting.value) : 3;
    const scrollSpeed = scrollSpeedSetting ? Number(scrollSpeedSetting.value) : 2;
    const customText = customTextSetting ? customTextSetting.value : '';
    
    // Create or update scroll manager
    let scrollManager = userScrollManagers.get(userId);
    if (!scrollManager) {
      scrollManager = new TextScrollManager(customText, lineWidth, numberOfLines, scrollSpeed);
      userScrollManagers.set(userId, scrollManager);
    } else {
      scrollManager.setLineWidth(lineWidth);
      scrollManager.setNumberOfLines(numberOfLines);
      scrollManager.setScrollSpeed(scrollSpeed);
      if (customText) {
        scrollManager.setText(customText);
      }
    }
    
  } catch (err) {
    console.error(`Error fetching settings for session ${sessionId}:`, err);
    // Fallback to default values.
    const scrollManager = new TextScrollManager('', 38, 3, 2);
    userScrollManagers.set(userId, scrollManager);
    return;
  }
}

// Handle webhook call from AugmentOS Cloud
app.post('/webhook', async (req, res) => {
  try {
    const { sessionId, userId } = req.body;
    console.log(`\n\n📜📜📜 Received teleprompter session request for user ${userId}, session ${sessionId}\n\n`);

    // Start WebSocket connection to cloud
    const ws = new WebSocket(`ws://cloud/tpa-ws`);

    ws.on('open', async () => {
      console.log(`\n[Session ${sessionId}]\n connected to augmentos-cloud\n`);
      // Send connection init with session ID
      const initMessage: TpaConnectionInit = {
        type: TpaToCloudMessageType.CONNECTION_INIT,
        sessionId,
        packageName: PACKAGE_NAME,
        apiKey: API_KEY
      };

      console.log(`Sending connection init message to augmentos-cloud for session ${sessionId}`);
      console.log(JSON.stringify(initMessage));
      ws.send(JSON.stringify(initMessage));

      // Fetch and apply settings for the session
      await fetchAndApplySettings(sessionId, userId).catch(err =>
        console.error(`Error in fetchAndApplySettings for session ${sessionId}:`, err)
      );
    });

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(sessionId, userId, ws, message);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    ws.on('close', () => {
      console.log(`Session ${sessionId} disconnected`);
      activeSessions.delete(sessionId);
      
      // Remove session from user's sessions map
      if (userSessions.has(userId)) {
        const sessions = userSessions.get(userId)!;
        sessions.delete(sessionId);
        if (sessions.size === 0) {
          userSessions.delete(userId);
        }
      }
      
      // Clear any active scroller for this session
      stopScrolling(sessionId);
    });

    // Track this session for the user
    if (!userSessions.has(userId)) {
      userSessions.set(userId, new Set());
    }
    userSessions.get(userId)!.add(sessionId);

    activeSessions.set(sessionId, ws);
    
    res.status(200).json({ status: 'connecting' });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function handleMessage(sessionId: string, userId: string, ws: WebSocket, message: any) {
  switch (message.type) {
    case CloudToTpaMessageType.CONNECTION_ACK: {
      // Connection acknowledged, start teleprompter
      console.log(`Session ${sessionId} connected, starting teleprompter`);
      
      // Subscribe to control messages (if needed)
      const subMessage: TpaSubscriptionUpdate = {
        type: TpaToCloudMessageType.SUBSCRIPTION_UPDATE,
        packageName: PACKAGE_NAME,
        sessionId,
        subscriptions: []
      };
      ws.send(JSON.stringify(subMessage));
      
      // Start the teleprompter after a brief delay
      setTimeout(() => {
        startScrolling(sessionId, userId, ws);
      }, 1000);
      
      break;
    }

    case CloudToTpaMessageType.DATA_STREAM: {
      // Handle any control messages if needed
      break;
    }

    default:
      console.log('Unknown message type:', message.type);
  }
}

/**
 * Starts scrolling the teleprompter text for a session
 */
function startScrolling(sessionId: string, userId: string, ws: WebSocket) {
  // Check if we already have a scroller for this session
  if (sessionScrollers.has(sessionId)) {
    stopScrolling(sessionId);
  }
  
  // Get or create scroll manager for this user
  let scrollManager = userScrollManagers.get(userId);
  if (!scrollManager) {
    scrollManager = new TextScrollManager('', 38, 3, 2);
    userScrollManagers.set(userId, scrollManager);
  }
  
  // Reset position to start
  scrollManager.resetPosition();
  
  // Show initial text
  showTextToUser(sessionId, ws, scrollManager.getCurrentVisibleText());
  
  // Create interval to scroll the text
  const scrollInterval = setInterval(() => {
    // Advance the position
    scrollManager.advancePosition();
    
    // Get current text to display
    const textToDisplay = scrollManager.getCurrentVisibleText();
    
    // Show the text
    showTextToUser(sessionId, ws, textToDisplay);
    
    // Check if we've reached the end
    if (scrollManager.isAtEnd()) {
      // Optionally stop scrolling or loop back to the beginning
      stopScrolling(sessionId);
      
      // After a brief pause, restart from the beginning
      setTimeout(() => {
        scrollManager.resetPosition();
        startScrolling(sessionId, userId, ws);
      }, 3000);
    }
  }, scrollManager.getScrollInterval());
  
  // Store the interval
  sessionScrollers.set(sessionId, scrollInterval);
}

/**
 * Stops scrolling for a session
 */
function stopScrolling(sessionId: string) {
  const interval = sessionScrollers.get(sessionId);
  if (interval) {
    clearInterval(interval);
    sessionScrollers.delete(sessionId);
  }
}

/**
 * Sends a display event (text) to the cloud.
 */
function showTextToUser(sessionId: string, ws: WebSocket, text: string) {
  console.log(`[Session ${sessionId}]: Text to show: \n${text}`);

  const displayRequest: DisplayRequest = {
    type: TpaToCloudMessageType.DISPLAY_REQUEST,
    view: ViewType.MAIN,
    packageName: PACKAGE_NAME,
    sessionId,
    layout: {
      layoutType: LayoutType.TEXT_WALL,
      text: text
    },
    timestamp: new Date(),
    durationMs: 10 * 1000, // 10 seconds timeout in case updates stop
    forceDisplay: true
  };

  ws.send(JSON.stringify(displayRequest));
}

/**
 * Refreshes all sessions for a user after settings changes.
 */
function refreshUserSessions(userId: string) {
  const sessionIds = userSessions.get(userId);
  if (!sessionIds || sessionIds.size === 0) {
    console.log(`No active sessions found for user ${userId}`);
    return false;
  }
  
  console.log(`Refreshing ${sessionIds.size} sessions for user ${userId}`);
  
  // Get the scroll manager
  const scrollManager = userScrollManagers.get(userId);
  if (!scrollManager) {
    console.log(`No scroll manager found for user ${userId}`);
    return false;
  }
  
  // Refresh each session
  for (const sessionId of sessionIds) {
    const ws = activeSessions.get(sessionId);
    if (ws && ws.readyState === 1) {
      console.log(`Refreshing session ${sessionId}`);
      
      // Stop current scrolling
      stopScrolling(sessionId);
      
      // Restart with new settings
      setTimeout(() => {
        startScrolling(sessionId, userId, ws);
      }, 500);
    } else {
      console.log(`Session ${sessionId} is not open, removing from tracking`);
      activeSessions.delete(sessionId);
      sessionIds.delete(sessionId);
    }
  }
  
  return sessionIds.size > 0;
}

app.post('/settings', (req, res) => {
  try {
    console.log('Received settings update for teleprompter:', req.body);
    const { userIdForSettings, settings } = req.body;
    
    const lineWidthSetting = settings.find((s: any) => s.key === 'line_width');
    const numberOfLinesSetting = settings.find((s: any) => s.key === 'number_of_lines');
    const scrollSpeedSetting = settings.find((s: any) => s.key === 'scroll_speed');
    const customTextSetting = settings.find((s: any) => s.key === 'custom_text');

    // Get or create scroll manager
    let scrollManager = userScrollManagers.get(userIdForSettings);
    if (!scrollManager) {
      scrollManager = new TextScrollManager('', 38, 3, 2);
      userScrollManagers.set(userIdForSettings, scrollManager);
    }
    
    // Update settings
    if (lineWidthSetting) {
      const lineWidth = convertLineWidth(lineWidthSetting.value);
      scrollManager.setLineWidth(lineWidth);
    }
    
    if (numberOfLinesSetting) {
      const numberOfLines = Number(numberOfLinesSetting.value);
      if (!isNaN(numberOfLines) && numberOfLines > 0) {
        scrollManager.setNumberOfLines(numberOfLines);
      }
    }
    
    if (scrollSpeedSetting) {
      const scrollSpeed = Number(scrollSpeedSetting.value);
      if (!isNaN(scrollSpeed) && scrollSpeed > 0) {
        scrollManager.setScrollSpeed(scrollSpeed);
      }
    }
    
    if (customTextSetting) {
      scrollManager.setText(customTextSetting.value);
    }
    
    // Refresh all active sessions for this user
    refreshUserSessions(userIdForSettings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Internal server error updating settings' });
  }
});

// Add a route to verify the server is running
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', app: PACKAGE_NAME });
});

app.listen(PORT, () => {
  console.log(`${PACKAGE_NAME} server running on port ${PORT}`);
});