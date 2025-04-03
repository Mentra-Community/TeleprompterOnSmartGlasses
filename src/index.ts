// augmentos_cloud/packages/apps/teleprompter/src/index.ts
import express from 'express';
import path from 'path';
import {
  TpaServer,
  TpaSession,
  ViewType,
} from '@augmentos/sdk';
import { TranscriptProcessor } from './utils/src/text-wrapping/TranscriptProcessor';
import { fetchSettings, getUserLineWidth, getUserNumberOfLines, getUserScrollSpeed, getUserCustomText } from './settings_handler';

// Configuration constants
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80;
const PACKAGE_NAME = 'com.augmentos.teleprompter';
const AUGMENTOS_API_KEY = process.env.AUGMENTOS_API_KEY || 'test_key';

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

/**
 * TeleprompterApp - Main application class for the Teleprompter
 * that extends TpaServer for seamless integration with AugmentOS
 */
class TeleprompterApp extends TpaServer {
  // Maps to track user teleprompter managers and active scrollers
  private userTeleprompterManagers = new Map<string, TeleprompterManager>();
  private sessionScrollers = new Map<string, NodeJS.Timeout>();

  constructor() {
    if (!AUGMENTOS_API_KEY) {
      throw new Error('AUGMENTOS_API_KEY is not set');
    }
  
    super({
      packageName: PACKAGE_NAME,
      apiKey: AUGMENTOS_API_KEY as string,
      port: PORT,
      publicDir: path.join(__dirname, './public')
    });
    
    // Add settings endpoint
    const expressApp = this.getExpressApp();
    expressApp.post('/settings', this.handleSettingsUpdate.bind(this));
  }

  /**
   * Called by TpaServer when a new session is created
   */
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`\n\n📜📜📜 Received teleprompter session request for user ${userId}, session ${sessionId}\n\n`);

    try {
      // Fetch and apply user settings
      await fetchSettings(userId);
      
      // Get user settings
      const lineWidth = getUserLineWidth(userId);
      const scrollSpeed = getUserScrollSpeed(userId);
      const numberOfLines = getUserNumberOfLines(userId);
      const customText = getUserCustomText(userId);
      
      // Create or update teleprompter manager
      let teleprompterManager = this.userTeleprompterManagers.get(userId);
      if (!teleprompterManager) {
        teleprompterManager = new TeleprompterManager(customText, lineWidth, scrollSpeed);
        teleprompterManager.setNumberOfLines(numberOfLines);
        this.userTeleprompterManagers.set(userId, teleprompterManager);
      } else {
        teleprompterManager.setLineWidth(lineWidth);
        teleprompterManager.setScrollSpeed(scrollSpeed);
        teleprompterManager.setNumberOfLines(numberOfLines);
        if (customText) {
          teleprompterManager.setText(customText);
        }
      }
      
      // Reset position to start
      teleprompterManager.resetPosition();
      
      // Show initial text
      this.showTextToUser(session, sessionId, teleprompterManager.getCurrentVisibleText());
      
      // Start scrolling
      this.startScrolling(session, sessionId, userId);
      
    } catch (error) {
      console.error('Error initializing session:', error);
      // Create default teleprompter manager if there was an error
      const teleprompterManager = new TeleprompterManager('', 38, 120);
      this.userTeleprompterManagers.set(userId, teleprompterManager);
      
      // Show initial text
      this.showTextToUser(session, sessionId, teleprompterManager.getCurrentVisibleText());
      
      // Start scrolling
      this.startScrolling(session, sessionId, userId);
    }
  }

  /**
   * Called by TpaServer when a session is stopped
   */
  protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    console.log(`Session ${sessionId} stopped: ${reason}`);
    
    // Stop scrolling for this session
    this.stopScrolling(sessionId);
    
    // Immediately remove the session from our maps to prevent further updates
    this.sessionScrollers.delete(sessionId);
    
    // Clean up teleprompter manager if this was the last session for this user
    let hasOtherSessions = false;
    
    try {
        const activeSessions = (this as any).getSessions?.() || [];
        
        for (const [activeSessionId, session] of Object.entries(activeSessions)) {
            if (activeSessionId !== sessionId) {
                const sessionObj = session as any;
                if (sessionObj.userId === userId || 
                    sessionObj.user === userId ||
                    sessionObj.getUserId?.() === userId) {
                    hasOtherSessions = true;
                    break;
                }
            }
        }
        
        // If no other sessions, clean up the teleprompter manager
        if (!hasOtherSessions) {
            const teleprompterManager = this.userTeleprompterManagers.get(userId);
            if (teleprompterManager) {
                teleprompterManager.clear();
                teleprompterManager.resetPosition();
                this.userTeleprompterManagers.delete(userId);
                console.log(`[User ${userId}]: All sessions closed, teleprompter manager destroyed`);
            }
        }
    } catch (e) {
        console.error('Error cleaning up session:', e);
    }
  }
  
  /**
   * Displays text to the user using the SDK's layout API
   */
  private showTextToUser(session: TpaSession, sessionId: string, text: string): void {
    // Check if the session is still active
    if (!this.sessionScrollers.has(sessionId)) {
      console.log(`[Session ${sessionId}]: Session is no longer active, not sending text`);
      return;
    }
    
    // Check WebSocket state before sending
    try {
      const ws = (session as any).ws;
      if (ws && ws.readyState !== 1) { // 1 is OPEN state
        console.log(`[Session ${sessionId}]: WebSocket not in OPEN state (state: ${ws.readyState}), stopping text updates`);
        this.stopScrolling(sessionId);
        return;
      }
      
      console.log(`[Session ${sessionId}]: Text to show: \n${text}`);

      // Use the SDK's layout API to display the text
      session.layouts.showTextWall(text, {
        view: ViewType.MAIN,
        durationMs: 10 * 1000 // 10 seconds timeout in case updates stop
      });
    } catch (error: any) {
      // Check if this is a WebSocket connection error
      if (error.message && error.message.includes('WebSocket not connected')) {
        console.log(`[Session ${sessionId}]: WebSocket connection closed, stopping text updates`);
        // Stop any active intervals for this session
        this.stopScrolling(sessionId);
      } else {
        console.error(`[Session ${sessionId}]: Failed to display text wall:`, error);
      }
    }
  }
  
  /**
   * Starts scrolling the teleprompter text for a session
   */
  private startScrolling(session: TpaSession, sessionId: string, userId: string): void {
    // Check if we already have a scroller for this session
    if (this.sessionScrollers.has(sessionId)) {
      this.stopScrolling(sessionId);
    }
    
    // Get teleprompter manager for this user
    const teleprompterManager = this.userTeleprompterManagers.get(userId);
    if (!teleprompterManager) {
      console.error(`No teleprompter manager found for user ${userId}, session ${sessionId}`);
      return;
    }
    
    // Check if the session is still active before creating intervals
    try {
      // Try to access a property of the session to check if it's still valid
      // This will throw an error if the session is closed
      const _ = (session as any).layouts;
    } catch (error) {
      console.log(`[Session ${sessionId}]: Session is no longer active, not starting scrolling`);
      return;
    }
    
    // Create interval to scroll the text
    const scrollInterval = setInterval(() => {
      try {
        // Check if the session is still active
        if (!this.sessionScrollers.has(sessionId)) {
          clearInterval(scrollInterval);
          return;
        }
        
        // Advance the position
        teleprompterManager.advancePosition();
        
        // Get current text to display
        const textToDisplay = teleprompterManager.getCurrentVisibleText();
        
        // Show the text
        this.showTextToUser(session, sessionId, textToDisplay);
        
        // Check if we've reached the end
        if (teleprompterManager.isAtEnd()) {
          // Stop the scrolling but keep showing text
          this.stopScrolling(sessionId);
          console.log(`[Session ${sessionId}]: Reached end of teleprompter text`);
          
          // Create a new interval to keep showing text after scrolling stops
          const endInterval = setInterval(() => {
            try {
              // Check if the session is still active
              if (!this.sessionScrollers.has(sessionId)) {
                clearInterval(endInterval);
                return;
              }
              
              const endText = teleprompterManager.getCurrentVisibleText();
              this.showTextToUser(session, sessionId, endText);
              
              // If we're showing the end message, stop this interval
              if (teleprompterManager.isShowingEndMessage()) {
                clearInterval(endInterval);
                console.log(`[Session ${sessionId}]: Finished showing end message`);
              }
            } catch (error: any) {
              // If there's an error (likely WebSocket closed), stop the interval
              if (error.message && error.message.includes('WebSocket not connected')) {
                clearInterval(endInterval);
                console.log(`[Session ${sessionId}]: WebSocket connection closed, stopping end message updates`);
              }
            }
          }, 500); // Update every 500ms
        }
      } catch (error: any) {
        // If there's an error (likely WebSocket closed), stop the interval
        if (error.message && error.message.includes('WebSocket not connected')) {
          clearInterval(scrollInterval);
          console.log(`[Session ${sessionId}]: WebSocket connection closed, stopping scrolling`);
        }
      }
    }, teleprompterManager.getScrollInterval());
    
    // Store the interval
    this.sessionScrollers.set(sessionId, scrollInterval);
  }
  
  /**
   * Stops scrolling for a session
   */
  private stopScrolling(sessionId: string): void {
    const interval = this.sessionScrollers.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.sessionScrollers.delete(sessionId);
      console.log(`[Session ${sessionId}]: Stopped scrolling`);
    }
  }
  
  /**
   * Refreshes all sessions for a user after settings changes
   */
  private refreshUserSessions(userId: string): boolean {
    let sessionsUpdated = 0;
    
    try {
      // Get all sessions for this user from the TpaServer
      const userSessions: Array<[string, TpaSession]> = [];
      const activeSessions = (this as any).getSessions?.() || [];
      
      for (const [sessionId, session] of Object.entries(activeSessions)) {
        const sessionObj = session as any;
        if (sessionObj.userId === userId || 
            sessionObj.user === userId ||
            sessionObj.getUserId?.() === userId) {
          userSessions.push([sessionId, session as TpaSession]);
        }
      }
      
      if (userSessions.length === 0) {
        console.log(`No active sessions found for user ${userId}`);
        return false;
      }
      
      console.log(`Refreshing ${userSessions.length} sessions for user ${userId}`);
      
      // Get the teleprompter manager
      const teleprompterManager = this.userTeleprompterManagers.get(userId);
      if (!teleprompterManager) {
        console.log(`No teleprompter manager found for user ${userId}`);
        return false;
      }
      
      // Refresh each session
      for (const [sessionId, session] of userSessions) {
        // Stop current scrolling
        this.stopScrolling(sessionId);
        
        // Show a message about settings update
        this.showTextToUser(session, sessionId, "Settings updated. Restarting teleprompter...");
        
        // Restart with new settings after a brief delay
        setTimeout(() => {
          this.startScrolling(session, sessionId, userId);
        }, 1500);
        
        sessionsUpdated++;
      }
    } catch (e) {
      console.error('Error refreshing user sessions:', e);
    }
    
    return sessionsUpdated > 0;
  }
  
  /**
   * Handles settings updates via the /settings endpoint
   */
  private async handleSettingsUpdate(req: any, res: any): Promise<void> {
    try {
      console.log('Received settings update for teleprompter:', req.body);
      const { userIdForSettings } = req.body;
      
      if (!userIdForSettings) {
        return res.status(400).json({ error: 'Missing userIdForSettings in the request' });
      }
      
      // Fetch and apply new settings
      await fetchSettings(userIdForSettings);
      
      // Get updated settings
      const lineWidth = getUserLineWidth(userIdForSettings);
      const scrollSpeed = getUserScrollSpeed(userIdForSettings);
      const numberOfLines = getUserNumberOfLines(userIdForSettings);
      const customText = getUserCustomText(userIdForSettings);
      
      // Update teleprompter manager with new settings
      let teleprompterManager = this.userTeleprompterManagers.get(userIdForSettings);
      if (teleprompterManager) {
        teleprompterManager.setLineWidth(lineWidth);
        teleprompterManager.setScrollSpeed(scrollSpeed);
        teleprompterManager.setNumberOfLines(numberOfLines);
        if (customText) {
          teleprompterManager.setText(customText);
        }
      } else {
        // Create new teleprompter manager if none exists
        teleprompterManager = new TeleprompterManager(customText, lineWidth, scrollSpeed);
        teleprompterManager.setNumberOfLines(numberOfLines);
        this.userTeleprompterManagers.set(userIdForSettings, teleprompterManager);
      }
      
      // Refresh all active sessions for this user
      const refreshed = this.refreshUserSessions(userIdForSettings);
      
      if (refreshed) {
        res.status(200).json({ status: 'settings updated and sessions refreshed' });
      } else {
        res.status(200).json({ status: 'settings updated, no active sessions to refresh' });
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      res.status(500).json({ error: 'Internal server error updating settings' });
    }
  }
}

// Create and start the app
const teleprompterApp = new TeleprompterApp();

// Add health check endpoint
const expressApp = teleprompterApp.getExpressApp();
expressApp.get('/health', (req, res) => {
  res.json({ status: 'healthy', app: PACKAGE_NAME });
});

// Start the server
teleprompterApp.start().then(() => {
  console.log(`${PACKAGE_NAME} server running on port ${PORT}`);
}).catch(error => {
  console.error('Failed to start server:', error);
});
