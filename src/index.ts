// augmentos_cloud/packages/apps/teleprompter/src/index.ts
import express from 'express';
import WebSocket from 'ws';
import path from 'path';

import {
  TpaConnectionInit,
  DisplayRequest,
  TpaSubscriptionUpdate,
  TpaToCloudMessageType,
  CloudToTpaMessageType,
  ViewType,
  LayoutType,
} from './sdk';
import { TranscriptProcessor } from './utils/src/text-wrapping/TranscriptProcessor';
import { fetchSettings, getUserLineWidth, getUserNumberOfLines, getUserScrollSpeed, getUserCustomText } from './settings_handler';

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
  private endTimestamp: number | null = null; // Track when we reach the end of text
  private showingEndMessage: boolean = false; // Track if we're showing the END OF TEXT message
  
  constructor(text: string, lineWidth: number = 38, scrollSpeed: number = 120) {
    this.text = text || this.getDefaultText();
    this.lineWidth = lineWidth;
    this.numberOfLines = 4;
    this.scrollSpeed = scrollSpeed;
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
    this.endTimestamp = null;
    this.showingEndMessage = false;
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
    
    // Cap at the end of text (when last line is at bottom of display)
    const maxPosition = this.lines.length - this.numberOfLines;
    if (this.currentLinePosition >= maxPosition) {
      this.currentLinePosition = maxPosition;
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
    const progressPercent = Math.min(100, Math.round((this.currentLinePosition / (this.lines.length - this.numberOfLines)) * 100));
    const elapsedTime = this.getElapsedTime();
    const currentTime = this.getCurrentTime();
    const progressText = `[${progressPercent}%] | ${elapsedTime}`;
    
    // Check if we're at the end
    if (this.isAtEnd()) {
      // If we've been at the end for less than 3 seconds, show the last text
      if (this.endTimestamp) {
        const timeAtEnd = Date.now() - this.endTimestamp;
        if (timeAtEnd < 10000) {
          return `${progressText}\n${visibleLines.join('\n')}`;
        }
        // After 3 seconds, start showing END OF TEXT
        this.showingEndMessage = true;
      }
    }
    
    // If we're showing the end message, show it
    if (this.showingEndMessage) {
      return `${progressText}\n\n*** END OF TEXT ***`;
    }
    
    return `${progressText}\n${visibleLines.join('\n')}`;
  }

  isAtEnd(): boolean {
    // Consider at end when last line is at bottom of display
    const isEnd = this.currentLinePosition >= this.lines.length - this.numberOfLines;
    if (isEnd && this.endTimestamp === null) {
      this.endTimestamp = Date.now();
      console.log('Reached end of text, starting 3 second countdown');
    }
    return isEnd;
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

  isShowingEndMessage(): boolean {
    return this.showingEndMessage;
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
      await fetchSettings(userId);
      
      // Create or update teleprompter manager with user settings
      const lineWidth = getUserLineWidth(userId);
      const scrollSpeed = getUserScrollSpeed(userId);
      const customText = getUserCustomText(userId);
      
      let teleprompterManager = userTeleprompterManagers.get(userId);
      if (!teleprompterManager) {
        teleprompterManager = new TeleprompterManager(customText, lineWidth, scrollSpeed);
        userTeleprompterManagers.set(userId, teleprompterManager);
      } else {
        teleprompterManager.setLineWidth(lineWidth);
        teleprompterManager.setScrollSpeed(scrollSpeed);
        if (customText) {
          teleprompterManager.setText(customText);
        }
      }
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
  
  // Create interval to scroll the text
  const scrollInterval = setInterval(() => {
    // Advance the position
    teleprompterManager.advancePosition();
    
    // Get current text to display
    const textToDisplay = teleprompterManager.getCurrentVisibleText();
    
    // Show the text
    showTextToUser(sessionId, ws, textToDisplay);
    
    // Check if we've reached the end
    if (teleprompterManager.isAtEnd()) {
      // Stop the scrolling but keep showing text
      stopScrolling(sessionId);
      console.log(`[Session ${sessionId}]: Reached end of teleprompter text`);
      
      // Create a new interval to keep showing text after scrolling stops
      const endInterval = setInterval(() => {
        const endText = teleprompterManager.getCurrentVisibleText();
        showTextToUser(sessionId, ws, endText);
        
        // If we're showing the end message, stop this interval
        if (teleprompterManager.isShowingEndMessage()) {
          clearInterval(endInterval);
          console.log(`[Session ${sessionId}]: Finished showing end message`);
        }
      }, 500); // Update every 500ms
    }
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

app.post('/settings', async (req, res) => {
  try {
    console.log('Received settings update for teleprompter:', req.body);
    const { userIdForSettings } = req.body;
    
    // Fetch and apply new settings
    await fetchSettings(userIdForSettings);
    
    // Get updated settings
    const lineWidth = getUserLineWidth(userIdForSettings);
    const scrollSpeed = getUserScrollSpeed(userIdForSettings);
    const customText = getUserCustomText(userIdForSettings);
    
    // Update teleprompter manager with new settings
    let teleprompterManager = userTeleprompterManagers.get(userIdForSettings);
    if (teleprompterManager) {
      teleprompterManager.setLineWidth(lineWidth);
      teleprompterManager.setScrollSpeed(scrollSpeed);
      if (customText) {
        teleprompterManager.setText(customText);
      }
    }
    
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
