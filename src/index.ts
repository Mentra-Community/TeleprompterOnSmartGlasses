// augmentos_cloud/packages/apps/teleprompter/src/index.ts
import express from 'express';
import path from 'path';
import {
  TpaServer,
  TpaSession,
  ViewType,
} from '@augmentos/sdk';
import { TranscriptProcessor } from './utils/src/text-wrapping/TranscriptProcessor';
import { convertLineWidth } from './utils/src/text-wrapping/convertLineWidth';

// Configuration constants
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80;
const PACKAGE_NAME = process.env.PACKAGE_NAME;
const AUGMENTOS_API_KEY = process.env.AUGMENTOS_API_KEY;

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
  private showingFinalLine: boolean = false; // Track if we're showing the final line
  private finalLineTimestamp: number | null = null; // Track when we started showing the final line
  private autoReplay: boolean = false; // Track if auto-replay is enabled
  private replayTimeout: NodeJS.Timeout | null = null; // Track the replay timeout
  
  constructor(text: string, lineWidth: number = 38, scrollSpeed: number = 120, autoReplay: boolean = false) {
    this.text = text || this.getDefaultText();
    this.lineWidth = lineWidth;
    this.numberOfLines = 4;
    this.scrollSpeed = scrollSpeed;
    this.scrollInterval = 500; // Update twice per second for smoother scrolling
    this.autoReplay = autoReplay;
    
    // Initialize transcript processor for text formatting
    this.transcript = new TranscriptProcessor(lineWidth, this.numberOfLines, this.numberOfLines * 2);
    
    // Process the text into lines
    this.processText();
    
    // Calculate words per interval based on WPM
    this.calculateWordsPerInterval();
    
    // Initialize start time
    this.resetStopwatch();
  }
  
  private processText(preservePosition: boolean = false): void {
    // Remember current position if preserving
    const oldPosition = this.currentLinePosition;
    const oldAccumulator = this.linePositionAccumulator;
    
    // Split the text into lines
    this.lines = this.transcript.wrapText(this.text, this.lineWidth);
    
    if (!preservePosition) {
      this.currentLinePosition = 0;
      this.linePositionAccumulator = 0;
    } else {
      // Restore position but cap it if text is now shorter
      const maxPosition = Math.max(0, this.lines.length - this.numberOfLines);
      this.currentLinePosition = Math.min(oldPosition, maxPosition);
      this.linePositionAccumulator = oldAccumulator;
    }
    
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
    this.processText(false); // Reset position when text changes
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
    this.processText(true); // Preserve position when line width changes
    this.calculateWordsPerInterval();
  }

  setNumberOfLines(lines: number): void {
    this.numberOfLines = lines;
    this.transcript = new TranscriptProcessor(this.lineWidth, lines, lines * 2);
    this.processText(true); // Preserve position when number of lines changes
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

  setAutoReplay(enabled: boolean): void {
    this.autoReplay = enabled;
    // If auto-replay is disabled, clear any pending replay timeout
    if (!enabled && this.replayTimeout) {
      clearTimeout(this.replayTimeout);
      this.replayTimeout = null;
    }
  }

  getAutoReplay(): boolean {
    return this.autoReplay;
  }

  private scheduleReplay(): void {
    if (this.autoReplay && !this.replayTimeout) {
      this.replayTimeout = setTimeout(() => {
        this.resetPosition();
        this.replayTimeout = null;
      }, 5000); // 5 second delay before replay
    }
  }

  resetPosition(): void {
    this.currentLinePosition = 0;
    this.linePositionAccumulator = 0;
    this.endTimestamp = null;
    this.showingEndMessage = false;
    this.showingFinalLine = false;
    this.finalLineTimestamp = null;
    if (this.replayTimeout) {
      clearTimeout(this.replayTimeout);
      this.replayTimeout = null;
    }
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
    let progressPercent: number;
    if (this.lines.length <= this.numberOfLines) {
      progressPercent = 100;
    } else {
      progressPercent = Math.min(100, Math.round((this.currentLinePosition / (this.lines.length - this.numberOfLines)) * 100));
    }
    const elapsedTime = this.getElapsedTime();
    const currentTime = this.getCurrentTime();
    const progressText = `[${progressPercent}%] | ${elapsedTime}`;
    
    // Check if we're at the end
    if (this.isAtEnd()) {
      // If we haven't started showing the final line yet, start now
      if (!this.showingFinalLine && !this.showingEndMessage) {
        this.showingFinalLine = true;
        this.finalLineTimestamp = Date.now();
        return `${progressText}\n${visibleLines.join('\n')}`;
      }
      
      // If we're showing the final line, check if it's been 5 seconds
      if (this.showingFinalLine && this.finalLineTimestamp) {
        const timeAtFinalLine = Date.now() - this.finalLineTimestamp;
        if (timeAtFinalLine < 5000) { // Show final line for 5 seconds
          return `${progressText}\n${visibleLines.join('\n')}`;
        } else {
          // After 5 seconds, switch to showing END OF TEXT
          this.showingFinalLine = false;
          this.showingEndMessage = true;
          this.endTimestamp = Date.now();
        }
      }
      
      // If we're showing the end message, check if it's been 10 seconds
      if (this.showingEndMessage && this.endTimestamp) {
        const timeAtEnd = Date.now() - this.endTimestamp;
        if (timeAtEnd < 10000) { // Show END OF TEXT for 10 seconds
          return `${progressText}\n\n*** END OF TEXT ***`;
        } else {
          // After 10 seconds, just reset the flags
          // The actual restart will be handled by the scrolling logic
          this.showingEndMessage = false;
          this.endTimestamp = null;
          this.finalLineTimestamp = null;
          this.showingFinalLine = false;
        }
      }
    }

    return `${progressText}\n${visibleLines.join('\n')}`;
  }

  isAtEnd(): boolean {
    // Consider at end when last line is at bottom of display
    const isEnd = this.currentLinePosition >= this.lines.length - this.numberOfLines;
    if (isEnd && this.endTimestamp === null && !this.showingFinalLine && !this.showingEndMessage) {
      console.log('Reached end of text, starting final line display');
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

  getText(): string {
    return this.text;
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
      packageName: PACKAGE_NAME!,
      apiKey: AUGMENTOS_API_KEY as string,
      port: PORT,
      publicDir: path.join(__dirname, './public')
    });
  }

  /**
   * Called by TpaServer when a new session is created
   */
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`\n\n📜📜📜 Received teleprompter session request for user ${userId}, session ${sessionId}\n\n`);

    try {
      // Set up settings change handlers
      this.setupSettingsHandlers(session, sessionId, userId);
      
      // Apply initial settings
      await this.applySettings(session, sessionId, userId);
      
      // Show initial text
      const teleprompterManager = this.userTeleprompterManagers.get(userId);
      if (teleprompterManager) {
        this.showTextToUser(session, sessionId, teleprompterManager.getCurrentVisibleText());
      }
      
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
   * Set up handlers for settings changes
   */
  private setupSettingsHandlers(
    session: TpaSession,
    sessionId: string,
    userId: string
  ): void {
    // Handle line width changes
    session.settings.onValueChange('line_width', (newValue, oldValue) => {
      console.log(`Line width changed for user ${userId}: ${oldValue} -> ${newValue}`);
      this.applySettings(session, sessionId, userId);
    });

    // Handle scroll speed changes
    session.settings.onValueChange('scroll_speed', (newValue, oldValue) => {
      console.log(`Scroll speed changed for user ${userId}: ${oldValue} -> ${newValue}`);
      this.applySettings(session, sessionId, userId);
    });

    // Handle number of lines changes
    session.settings.onValueChange('number_of_lines', (newValue, oldValue) => {
      console.log(`Number of lines changed for user ${userId}: ${oldValue} -> ${newValue}`);
      this.applySettings(session, sessionId, userId);
    });

    // Handle custom text changes
    session.settings.onValueChange('custom_text', (newValue, oldValue) => {
      console.log(`Custom text changed for user ${userId}`);
      this.applySettings(session, sessionId, userId);
      this.stopScrolling(sessionId);
      this.startScrolling(session, sessionId, userId);
    });

    session.settings.onValueChange('auto_replay', (newValue, oldValue) => {
      console.log(`Auto replay changed for user ${userId}: ${oldValue} -> ${newValue}`);
      this.applySettings(session, sessionId, userId);
    });
  }

  /**
   * Apply settings from the session to the teleprompter manager
   */
  private async applySettings(
    session: TpaSession,
    sessionId: string,
    userId: string
  ): Promise<void> {
    try {
      // Extract settings from the session
      const lineWidthString = session.settings.get<string>('line_width', "Medium");
      const scrollSpeed = session.settings.get<number>('scroll_speed', 120);
      const numberOfLines = session.settings.get<number>('number_of_lines', 4);
      const customText = session.settings.get<string>('custom_text', '');
      const autoReplay = session.settings.get<boolean>('auto_replay', false);

      const lineWidth = convertLineWidth(lineWidthString, false);
      
      console.log(`Applied settings for user ${userId}: lineWidth=${lineWidth}, scrollSpeed=${scrollSpeed}, numberOfLines=${numberOfLines}, autoReplay=${autoReplay}`);

      // Create or update teleprompter manager
      let teleprompterManager = this.userTeleprompterManagers.get(userId);
      let textChanged = false;
      // Always ensure newTextToSet is a string
      const newTextToSet = (customText ?? '') || teleprompterManager?.getDefaultText() || '';
      console.log(`Applying settings for user ${userId}: customText=${customText}`);
      if (!teleprompterManager) {
        teleprompterManager = new TeleprompterManager(newTextToSet, lineWidth, scrollSpeed, autoReplay);
        teleprompterManager.setNumberOfLines(numberOfLines);
        this.userTeleprompterManagers.set(userId, teleprompterManager);
        textChanged = true; // Always reset on first creation
      } else {
        // Check if text changed (compare actual text that will be displayed)
        if (teleprompterManager.getText() !== newTextToSet) {
          teleprompterManager.setText(newTextToSet);
          textChanged = true;
        }
        teleprompterManager.setLineWidth(lineWidth);
        teleprompterManager.setScrollSpeed(scrollSpeed);
        teleprompterManager.setNumberOfLines(numberOfLines);
        teleprompterManager.setAutoReplay(autoReplay);
      }

      console.log(`Text changed: ${textChanged}`);
      // Only reset position if the text changed
      if (textChanged) {
        teleprompterManager.resetPosition();
      }
      
    } catch (error) {
      console.error(`Error applying settings for user ${userId}:`, error);
      throw error;
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
    console.log(`[Session ${sessionId}]: Showing text to user.`);

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

    // Show the initial lines immediately
    // Show the initial lines with a 1 second delay
    setTimeout(() => {
      this.showTextToUser(session, sessionId, teleprompterManager.getCurrentVisibleText());
    }, 1000);

    // Create a timeout for the initial delay
    const delayTimeout = setTimeout(() => {
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
                
                // If we're showing the end message, check if we should restart
                if (teleprompterManager.isShowingEndMessage()) {
                  const shouldRestart = teleprompterManager.getAutoReplay();
                  if (shouldRestart) {
                    // Stop the current intervals
                    clearInterval(endInterval);
                    clearInterval(scrollInterval);
                    this.sessionScrollers.delete(sessionId);
                    
                    // Wait 5 seconds then restart
                    setTimeout(() => {
                      console.log(`[Session ${sessionId}]: Restarting teleprompter for auto-replay`);
                      teleprompterManager.resetPosition();
                      this.startScrolling(session, sessionId, userId);
                    }, 5000);
                  } else {
                    // If not auto-replaying, just stop everything
                    clearInterval(endInterval);
                    this.stopScrolling(sessionId);
                    this.userTeleprompterManagers.delete(userId);
                    console.log(`[Session ${sessionId}]: Finished showing end message and cleaned up teleprompter manager for user ${userId}`);
                  }
                }
              } catch (error: any) {
                // If there's an error (likely WebSocket closed), stop the interval
                if (error.message && error.message.includes('WebSocket not connected')) {
                  clearInterval(endInterval);
                  this.stopScrolling(sessionId);
                  this.userTeleprompterManagers.delete(userId);
                  console.log(`[Session ${sessionId}]: WebSocket connection closed, stopping end message updates and cleaned up teleprompter manager for user ${userId}`);
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
    }, 5000); // 5 second delay

    // Store the timeout so it can be cleared if needed
    this.sessionScrollers.set(sessionId, delayTimeout);
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
