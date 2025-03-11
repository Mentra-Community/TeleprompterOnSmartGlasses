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
import { TranscriptProcessor } from './utils/src/text-wrapping/TranscriptProcessor';

// TeleprompterManager class to handle teleprompter functionality
class TeleprompterManager {
  private text: string;
  private lineWidth: number;
  private numberOfLines: number;
  private scrollSpeed: number; // Words per minute
  private scrollInterval: number; // Milliseconds between updates
  private transcript: TranscriptProcessor;
  private lines: string[] = []; // All lines of text
  private currentLinePosition: number = 0;
  private linePositionAccumulator: number = 0; // For fractional line advances
  private avgWordsPerLine: number = 0;
  private wordsPerInterval: number = 0; // How many words to advance per interval
  private startTime: number = Date.now(); // Track when teleprompter started for stopwatch
  
  constructor(text: string, lineWidth: number = 38, scrollSpeed: number = 120) {
    this.text = text || this.getDefaultText();
    this.lineWidth = lineWidth;
    this.numberOfLines = 4;
    this.scrollSpeed = 150; // Default to 60 WPM (average reading speed)
    this.scrollInterval = 500; // Update twice per second for smoother scrolling
    
    // Initialize transcript processor for text formatting
    this.transcript = new TranscriptProcessor(lineWidth, this.numberOfLines, this.numberOfLines * 2);
    
    // Process the text into lines
    this.processText();
    
    // Calculate words per interval based on WPM
    this.calculateWordsPerInterval();
    
    // Initialize start time
    this.resetStopwatch();
  }
  
  private processText(): void {
    // Split the text into lines
    this.lines = this.transcript.wrapText(this.text, this.lineWidth);
    this.currentLinePosition = 0;
    this.linePositionAccumulator = 0;
    
    // Calculate average words per line
    this.avgWordsPerLine = this.transcript.estimateWordsPerLine(this.text);
    if (this.avgWordsPerLine <= 0) this.avgWordsPerLine = 5; // Fallback to prevent division by zero
    
    console.log(`Average words per line: ${this.avgWordsPerLine}`);
  }
  
  private calculateWordsPerInterval(): void {
    // Calculate words per interval based on WPM and interval
    // WPM / (60 seconds per minute / interval in seconds)
    this.wordsPerInterval = (this.scrollSpeed / 60) * (this.scrollInterval / 1000);
    
    // Convert words per interval to lines per interval
    const linesPerInterval = this.wordsPerInterval / Math.max(1, this.avgWordsPerLine);
    
    console.log(`Scroll speed: ${this.scrollSpeed} WPM`);
    console.log(`Words per interval (${this.scrollInterval}ms): ${this.wordsPerInterval.toFixed(4)}`);
    console.log(`Estimated lines per interval: ${linesPerInterval.toFixed(4)}`);
  }
  
  // Reset the stopwatch
  private resetStopwatch(): void {
    this.startTime = Date.now();
  }
  
  // Get elapsed time as formatted string (MM:SS)
  private getElapsedTime(): string {
    const elapsedMs = Date.now() - this.startTime;
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  
  // Get current time formatted as HH:MM:SS
  private getCurrentTime(): string {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }
  
  getDefaultText(): string {
    return `Welcome to AugmentOS Teleprompter. This is a default text that will scroll at your set speed. You can replace this with your own content through the settings. The teleprompter will automatically scroll text at a comfortable reading pace. You can adjust the scroll speed (in words per minute), line width, and number of lines through the settings menu. As you read this text, it will continue to scroll upward, allowing you to deliver your presentation smoothly and professionally. You can also use the teleprompter to read your own text. Just enter your text in the settings and the teleprompter will display it for you to read. When you reach the end of the text, the teleprompter will show "END OF TEXT" and then restart from the beginning after a short pause.`;
  }

  setText(newText: string): void {
    this.text = newText || this.getDefaultText();
    this.processText();
    this.calculateWordsPerInterval();
  }

  setScrollSpeed(wordsPerMinute: number): void {
    // Ensure scroll speed is within reasonable bounds
    if (wordsPerMinute < 1) wordsPerMinute = 1;
    if (wordsPerMinute > 500) wordsPerMinute = 500;
    
    this.scrollSpeed = wordsPerMinute;
    this.calculateWordsPerInterval();
    
    console.log(`Scroll speed set to ${this.scrollSpeed} WPM`);
  }

  setLineWidth(width: number): void {
    this.lineWidth = width;
    this.transcript = new TranscriptProcessor(width, this.numberOfLines, this.numberOfLines * 2);
    this.processText();
    this.calculateWordsPerInterval();
  }

  setNumberOfLines(lines: number): void {
    this.numberOfLines = lines;
    this.transcript = new TranscriptProcessor(this.lineWidth, lines, lines * 2);
  }

  setScrollInterval(intervalMs: number): void {
    // Ensure interval is within reasonable bounds
    if (intervalMs < 100) intervalMs = 100; // Minimum 100ms for performance
    if (intervalMs > 2000) intervalMs = 2000; // Maximum 2 seconds for responsiveness
    
    this.scrollInterval = intervalMs;
    this.calculateWordsPerInterval();
  }

  getScrollInterval(): number {
    return this.scrollInterval;
  }

  resetPosition(): void {
    this.currentLinePosition = 0;
    this.linePositionAccumulator = 0;
    this.resetStopwatch(); // Reset the stopwatch when position is reset
  }

  // Advance position based on words per minute
  advancePosition(): void {
    if (this.lines.length === 0) return;
    
    // Calculate how many lines to advance based on WPM
    // Convert words per interval to lines per interval
    const linesPerInterval = this.wordsPerInterval / Math.max(1, this.avgWordsPerLine);
    
    // Add to the accumulator
    this.linePositionAccumulator += linesPerInterval;
    
    // If we've accumulated enough for at least one line, advance
    if (this.linePositionAccumulator >= 1) {
      // Get integer number of lines to advance
      const linesToAdvance = Math.floor(this.linePositionAccumulator);
      // Keep the fractional part for next time
      this.linePositionAccumulator -= linesToAdvance;
      
      // Advance by calculated lines
      this.currentLinePosition += linesToAdvance;
    }
    
    // Cap at the end of text
    if (this.currentLinePosition >= this.lines.length) {
      this.currentLinePosition = this.lines.length;
    }
  }

  // Get current visible text
  getCurrentVisibleText(): string {
    if (this.lines.length === 0) return "No text available";
    
    // Get visible lines
    const visibleLines = this.lines.slice(
      this.currentLinePosition, 
      this.currentLinePosition + this.numberOfLines
    );
    
    // Add padding if needed
    while (visibleLines.length < this.numberOfLines) {
      visibleLines.push("");
    }
    
    // Add progress indicator with stopwatch and current time
    const progressPercent = Math.min(100, Math.round((this.currentLinePosition / this.lines.length) * 100));
    const elapsedTime = this.getElapsedTime();
    const currentTime = this.getCurrentTime();
    const progressText = `[${progressPercent}%] | ${elapsedTime}`;
    
    // Check if we're at the end
    if (this.isAtEnd()) {
      return `${progressText}\n${visibleLines.join('\n')}\n\n*** END OF TEXT ***`;
    }
    
    return `${progressText}\n${visibleLines.join('\n')}`;
  }

  isAtEnd(): boolean {
    return this.currentLinePosition >= this.lines.length - this.numberOfLines;
  }

  // Get total number of lines for debugging
  getTotalLines(): number {
    return this.lines.length;
  }
  
  // Get current line position for debugging
  getCurrentLinePosition(): number {
    return this.currentLinePosition;
  }

  clear(): void {
    this.transcript.clear();
  }
  
  // Get scroll speed in WPM
  getScrollSpeed(): number {
    return this.scrollSpeed;
  }
}

const app = express();
const PORT = 80; // Default http port.
const PACKAGE_NAME = 'com.augmentos.teleprompter';
const API_KEY = 'test_key'; // In production, this would be securely stored

// Track user sessions and their teleprompter managers
const userTeleprompterManagers: Map<string, TeleprompterManager> = new Map();
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
    const response = await axios.get(`http://cloud/tpasettings/user/${PACKAGE_NAME}`, {
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
    const scrollSpeed = scrollSpeedSetting ? Number(scrollSpeedSetting.value) : 0.5; // Default to 0.5 lines per interval
    const customText = customTextSetting ? customTextSetting.value : '';
    
    // Create or update teleprompter manager
    let teleprompterManager = userTeleprompterManagers.get(userId);
    if (!teleprompterManager) {
      teleprompterManager = new TeleprompterManager(customText, lineWidth, scrollSpeed);
      userTeleprompterManagers.set(userId, teleprompterManager);
    } else {
      teleprompterManager.setLineWidth(lineWidth);
      teleprompterManager.setNumberOfLines(numberOfLines);
      teleprompterManager.setScrollSpeed(scrollSpeed);
      if (customText) {
        teleprompterManager.setText(customText);
      }
    }
    
    return teleprompterManager;
  } catch (err) {
    console.error(`Error fetching settings for session ${sessionId}:`, err);
    // Fallback to default values.
    const teleprompterManager = new TeleprompterManager('', 38, 60);
    userTeleprompterManagers.set(userId, teleprompterManager);
    return teleprompterManager;
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
      
      // Clean up WebSocket connection
      activeSessions.delete(sessionId);
      
      // Remove session from user's sessions map
      if (userSessions.has(userId)) {
        const sessions = userSessions.get(userId)!;
        sessions.delete(sessionId);
        if (sessions.size === 0) {
          userSessions.delete(userId);
          // If no more sessions for this user, clean up the teleprompter manager
          userTeleprompterManagers.delete(userId);
        }
      } else {
        console.log(`Session ${sessionId} not found in userSessions map for user ${userId}`);
      }
      
      // Clear any active scroller for this session
      stopScrolling(sessionId);

      // Clear the transcript history
      const teleprompterManager = userTeleprompterManagers.get(userId);
      if (teleprompterManager) {
        teleprompterManager.clear();
        teleprompterManager.resetPosition();
        userTeleprompterManagers.delete(userId);
      }

      // Force garbage collection for any remaining references
      ws.removeAllListeners();
      
      console.log(`Cleanup completed for session ${sessionId}, user ${userId}`);
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
  
  // Get or create teleprompter manager for this user
  let teleprompterManager = userTeleprompterManagers.get(userId);
  if (!teleprompterManager) {
    teleprompterManager = new TeleprompterManager('', 38, 60);
    userTeleprompterManagers.set(userId, teleprompterManager);
  }
  
  // Reset position to start
  teleprompterManager.resetPosition();
  
  // Show initial text
  showTextToUser(sessionId, ws, teleprompterManager.getCurrentVisibleText());
  
  // console.log(`[Session ${sessionId}]: Starting teleprompter with ${teleprompterManager.getTotalSegments()} total segments`);
  
  // Create interval to scroll the text
  const scrollInterval = setInterval(() => {
    // Advance the position
    teleprompterManager.advancePosition();
    
    // Get current text to display
    const textToDisplay = teleprompterManager.getCurrentVisibleText();
    
    // Show the text
    showTextToUser(sessionId, ws, textToDisplay);
    
    // // Check if we've reached the end
    // if (teleprompterManager.isAtEnd()) {
    //   // Show a message that we've reached the end
    //   console.log(`[Session ${sessionId}]: Reached end of teleprompter text`);
      
    //   // After a brief pause, restart from the beginning
    //   setTimeout(() => {
    //     stopScrolling(sessionId);
    //     teleprompterManager.resetPosition();
        
    //     // Display a message that we're restarting
    //     showTextToUser(sessionId, ws, "Restarting teleprompter...");
        
    //     // Restart after a brief pause
    //     setTimeout(() => {
    //       startScrolling(sessionId, userId, ws);
    //     }, 2000);
    //   }, 5000); // Show the end message for 5 seconds
    // }
  }, teleprompterManager.getScrollInterval());
  
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
    console.log(`[Session ${sessionId}]: Stopped scrolling`);
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
  
  // Get the teleprompter manager
  const teleprompterManager = userTeleprompterManagers.get(userId);
  if (!teleprompterManager) {
    console.log(`No teleprompter manager found for user ${userId}`);
    return false;
  }
  
  // Refresh each session
  for (const sessionId of sessionIds) {
    const ws = activeSessions.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log(`Refreshing session ${sessionId}`);
      
      // Stop current scrolling
      stopScrolling(sessionId);
      
      // Show a message about settings update
      showTextToUser(sessionId, ws, "Settings updated. Restarting teleprompter...");
      
      // Restart with new settings after a brief delay
      setTimeout(() => {
        startScrolling(sessionId, userId, ws);
      }, 1500);
    } else {
      console.log(`Session ${sessionId} is not open, removing from tracking`);
      activeSessions.delete(sessionId);
      sessionIds.delete(sessionId);
      stopScrolling(sessionId);
    }
  }
  
  return sessionIds.size > 0;
}

app.post('/settings', (req, res) => {
  try {
    console.log('Received settings update for teleprompter:', req.body);
    const { userIdForSettings, settings } = req.body;
    
    // Extract settings
    const lineWidthSetting = settings.find((s: any) => s.key === 'line_width');
    const numberOfLinesSetting = settings.find((s: any) => s.key === 'number_of_lines');
    const scrollSpeedSetting = settings.find((s: any) => s.key === 'scroll_speed');
    const customTextSetting = settings.find((s: any) => s.key === 'custom_text');

    // Extract values with defaults
    const lineWidth = lineWidthSetting ? convertLineWidth(lineWidthSetting.value) : 38;
    const numberOfLines = numberOfLinesSetting ? Number(numberOfLinesSetting.value) : 3;
    const scrollSpeed = scrollSpeedSetting ? Number(scrollSpeedSetting.value) : 120;
    
    // Get custom text (either from settings or from existing manager if available)
    let customText = '';
    if (customTextSetting && customTextSetting.value) {
      customText = customTextSetting.value;
    } else {
      // If no new text provided, try to get existing text
      const existingManager = userTeleprompterManagers.get(userIdForSettings);
      if (existingManager) {
        // This is a hack to get the existing text - in a real implementation,
        // you might want to add a getText() method to the TeleprompterManager class
        const defaultText = new TeleprompterManager('', 38, 120).getDefaultText();
        const currentText = existingManager.getCurrentVisibleText();
        if (currentText !== defaultText) {
          customText = currentText;
        }
      }
    }
    
    // Instead of updating parameters individually, create a new manager
    const newTeleprompterManager = new TeleprompterManager(
      customText,
      lineWidth,
      scrollSpeed
    );
    
    // Replace the old manager with the new one
    userTeleprompterManagers.set(userIdForSettings, newTeleprompterManager);
    
    console.log(`Created new teleprompter manager for user ${userIdForSettings} with settings: 
      lineWidth: ${lineWidth}
      numberOfLines: ${numberOfLines}
      scrollSpeed: ${scrollSpeed} WPM
      text length: ${customText.length} characters
    `);
    
    // Refresh all active sessions for this user
    refreshUserSessions(userIdForSettings);
    
    res.status(200).json({ status: 'settings updated' });
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
