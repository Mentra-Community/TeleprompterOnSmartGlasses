// augmentos_cloud/packages/apps/teleprompter/src/index.ts
import express from 'express';
import path from 'path';
import {
  TpaServer,
  TpaSession,
  ViewType,
} from '@mentra/sdk';
import { TranscriptProcessor } from './utils/src/text-wrapping/TranscriptProcessor';
import { convertLineWidth } from './utils/src/text-wrapping/convertLineWidth';

// Configuration constants
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80;
const PACKAGE_NAME = process.env.PACKAGE_NAME;
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY || process.env.AUGMENTOS_API_KEY;

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
  private showEstimatedTotal: boolean = true; // Track if estimated total should be shown in status bar

  // Speech-based scrolling properties
  private speechBuffer: string[] = []; // Buffer of recent speech words
  private speechScrollEnabled: boolean = true; // Enable/disable speech-based scrolling
  private lastSpeechPosition: number = -1; // Last detected position from speech
  private speechLookaheadLines: number = 4; // How many lines ahead to search for speech matches (increased)
  private minWordsForMatch: number = 3; // Minimum words needed for a reliable match (reduced to 1)
  private lineOffset: number = 0; // Offset the line position by 1 to show the match on the 2nd line

  constructor(text: string, lineWidth: number = 38, scrollSpeed: number = 120, autoReplay: boolean = false, speechScrollEnabled: boolean = true, showEstimatedTotal: boolean = true) {
    this.text = text || this.getDefaultText();
    this.lineWidth = lineWidth;
    this.numberOfLines = 4;
    this.scrollSpeed = scrollSpeed;
    this.scrollInterval = 500; // Update twice per second for smoother scrolling
    this.autoReplay = autoReplay;
    this.speechScrollEnabled = speechScrollEnabled;
    this.showEstimatedTotal = showEstimatedTotal;

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

  /**
   * Calculate and format the projected total time based on current progress
   * @param progressPercent Current progress as a percentage (0-100)
   * @returns Formatted time string (MM:SS) or "--:--" if projection not available
   */
  private getProjectedTotalTime(progressPercent: number): string {
    // Don't calculate projection if progress is too low (less than 5%) or at 100%
    if (progressPercent < 5 || progressPercent >= 100) {
      return "--:--";
    }

    const elapsedMs = Date.now() - this.startTime;
    const elapsedSeconds = elapsedMs / 1000;

    // Calculate projected total time: elapsed_time / (progress_percent / 100)
    const projectedTotalSeconds = Math.round(elapsedSeconds / (progressPercent / 100));

    const minutes = Math.floor(projectedTotalSeconds / 60);
    const seconds = projectedTotalSeconds % 60;
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

  /**
   * Set whether to show estimated total time in status bar
   */
  setShowEstimatedTotal(enabled: boolean): void {
    this.showEstimatedTotal = enabled;
  }

  /**
   * Get whether estimated total time is shown in status bar
   */
  getShowEstimatedTotal(): boolean {
    return this.showEstimatedTotal;
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
    this.clearSpeechBuffer(); // Clear speech buffer when position is reset
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

      // Skip over empty lines after advancing
      this.currentLinePosition = this.skipEmptyLines(this.currentLinePosition);
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
    const projectedTotalTime = this.getProjectedTotalTime(progressPercent);
    const currentTime = this.getCurrentTime();
    const progressText = this.showEstimatedTotal
      ? `[${progressPercent}%] | ${elapsedTime} | Est Total: ${projectedTotalTime}`
      : `[${progressPercent}%] | ${elapsedTime}`;

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

    /**
   * Process incoming speech transcription and update position accordingly
   * @param speechText - The latest speech text from transcription
   * @param isFinal - Whether this is a final transcription result
   */
  processSpeechInput(speechText: string, isFinal: boolean = false): void {
    if (!this.speechScrollEnabled || !speechText.trim()) {
      return;
    }

    // Clean and split the speech text into words - use same normalization as search text
    const words = speechText.toLowerCase()
      .replace(/[^\w\s'-]/g, ' ') // Keep apostrophes and hyphens, like search text
      .split(/\s+/)
      .filter(word => word.length > 0);

    if (words.length === 0) {
      return;
    }

    // Update speech buffer - keep last 20 words for context (increased)
    if (isFinal) {
      // For final results, replace the buffer content more aggressively
      this.speechBuffer = [...this.speechBuffer, ...words].slice(-20);
    } else {
      // For interim results, be more aggressive - update more frequently
      const bufferWithoutInterim = this.speechBuffer; // Remove last 3 words that might be interim (reduced)
      this.speechBuffer = [...bufferWithoutInterim, ...words].slice(-10);
    }

    console.log(`[SPEECH DEBUG] Buffer (${this.speechBuffer.length} words): "${this.speechBuffer.join(' ')}" | Current line: ${this.currentLinePosition}`);

    // Only try to match if we have enough words
    if (this.speechBuffer.length < this.minWordsForMatch) {
      return;
    }

    // Find the best match position in the text
    const matchPosition = this.findSpeechMatchPosition();

    if (matchPosition !== -1) {
      console.log(`[SPEECH MATCH] Found at line ${matchPosition}, current position: ${this.currentLinePosition}`);

      // Only advance forward - never go backward
      if (matchPosition > this.currentLinePosition) {
        // Calculate how far to advance - be more aggressive but only forward
        const maxAdvance = Math.min(matchPosition, this.currentLinePosition + 10); // Increased from 5 to 10

        // Add slight forward bias to help keep up with speech
        const biasedPosition = Math.max(maxAdvance, this.currentLinePosition);

        // Position the teleprompter so the matched text appears on the 2nd line (not 1st)
        // This provides better spatial reference for tracking location
        const targetPosition = Math.max(this.currentLinePosition, biasedPosition - this.lineOffset); // Never go below current position

        // Skip over empty lines when advancing
        const finalPosition = this.skipEmptyLines(targetPosition);

        const previousPosition = this.currentLinePosition;
        // Ensure we only move forward, never backward
        this.currentLinePosition = Math.max(this.currentLinePosition, Math.min(finalPosition, this.lines.length - this.numberOfLines));

        if (this.currentLinePosition !== previousPosition) {
          this.linePositionAccumulator = 0; // Reset accumulator since we're jumping
        }
        this.lastSpeechPosition = matchPosition;

        console.log(`[SPEECH ADVANCE] Moved forward to line ${this.currentLinePosition} (was ${previousPosition}) to show speech match at line ${matchPosition} on 2nd display line`);
      } else {
        console.log(`[SPEECH NO_ADVANCE] Match at line ${matchPosition} is not ahead of current position ${this.currentLinePosition}, staying put`);
      }
    } else {
      console.log(`[SPEECH NO_MATCH] No match found for buffer: "${this.speechBuffer.slice(-5).join(' ')}" | Searching from line ${this.currentLinePosition}`);
    }
  }

    /**
   * Find the best match position for current speech buffer in the teleprompter text
   * @returns Line number where speech was found, or -1 if no good match
   */
  private findSpeechMatchPosition(): number {
    if (this.speechBuffer.length < this.minWordsForMatch || this.lines.length === 0) {
      return -1;
    }

        // Search window - only look forward, never backward
    const searchStartLine = this.currentLinePosition; // Start from current position, never behind
    const searchEndLine = Math.min(
      this.lines.length,
      this.currentLinePosition + this.numberOfLines + 1 // Much larger lookahead
    );

    console.log(`[SEARCH DEBUG] Searching lines ${searchStartLine} to ${searchEndLine} (current: ${this.currentLinePosition})`);

    const searchLines = this.lines.slice(searchStartLine, searchEndLine);
    // Filter out empty lines from search text
    const nonEmptyLines = searchLines.filter(line => line && line.trim().length > 0);

    // Better text normalization
    const searchText = nonEmptyLines.join(' ').toLowerCase()
      .replace(/[^\w\s'-]/g, ' ') // Keep apostrophes and hyphens
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    if (!searchText) {
      console.log(`[SEARCH DEBUG] No search text found in range`);
      return -1;
    }

    const searchWords = searchText.split(' ').filter(w => w.length > 0);
    console.log(`[SEARCH DEBUG] Search text (${searchWords.length} words): "${searchText.substring(0, 100)}..."`);

    // Try different speech buffer lengths (from shorter to longer for better responsiveness)
    for (let bufferLen = Math.min(this.speechBuffer.length, 5); bufferLen >= this.minWordsForMatch; bufferLen--) {
      const speechPhrase = this.speechBuffer.slice(-bufferLen).join(' ');
      console.log(`[MATCH DEBUG] Trying phrase (${bufferLen} words): "${speechPhrase}"`);

      // Try exact match first
      const exactMatch = this.findExactMatch(speechPhrase, searchWords, searchStartLine);
      if (exactMatch !== -1) {
        console.log(`[MATCH SUCCESS] Exact match found: "${speechPhrase}" at line ${exactMatch}`);
        return exactMatch;
      }

      // Try fuzzy match next
      const fuzzyMatch = this.findFuzzyMatch(speechPhrase, searchWords, searchStartLine);
      if (fuzzyMatch !== -1) {
        console.log(`[MATCH SUCCESS] Fuzzy match found: "${speechPhrase}" at line ${fuzzyMatch}`);
        return fuzzyMatch;
      }
    }

    return -1;
  }

  /**
   * Find exact match of speech phrase in search text
   */
  private findExactMatch(speechPhrase: string, searchWords: string[], searchStartLine: number): number {
    const searchText = searchWords.join(' ');
    const matchIndex = searchText.indexOf(speechPhrase);

    if (matchIndex !== -1) {
      // Convert character position back to line number
      const wordsBeforeMatch = searchText.substring(0, matchIndex).split(' ').length - 1;
      const linePosition = this.estimateLineFromWordPosition(wordsBeforeMatch, searchStartLine);
      return linePosition;
    }

    return -1;
  }

  /**
   * Find fuzzy match allowing for some word differences
   */
  private findFuzzyMatch(speechPhrase: string, searchWords: string[], searchStartLine: number): number {
    const speechWords = speechPhrase.split(' ');
    const minMatchWords = Math.max(this.minWordsForMatch, speechWords.length); // Very aggressive - require only 30% word match

    // Try multiple sliding window sizes to handle speech recognition variability
    const windowSizes = [speechWords.length, speechWords.length + 1, speechWords.length - 1].filter(s => s > 0);

    for (const windowSize of windowSizes) {
      for (let i = 0; i <= searchWords.length - windowSize; i++) {
        const windowWords = searchWords.slice(i, i + windowSize);
        let matchCount = 0;

        // More flexible matching - allow words to be out of order within a small range
        for (const speechWord of speechWords) {
          for (let j = 0; j < windowWords.length; j++) {
            if (this.wordsAreSimilar(speechWord, windowWords[j])) {
              matchCount++;
              break; // Found a match, move to next speech word
            }
          }
        }

        if (matchCount >= minMatchWords) {
          const linePosition = this.estimateLineFromWordPosition(i, searchStartLine);
          console.log(`[FUZZY SUCCESS] Match of ${matchCount} words at word position ${i}, estimated line ${linePosition} for phrase "${speechPhrase}"`);
          return linePosition;
        }
      }
    }

    return -1;
  }

    /**
   * Check if two words are similar (handles common speech recognition errors)
   */
  private wordsAreSimilar(word1: string, word2: string): boolean {
    if (word1 === word2) return true;
    if (word1.length < 2 || word2.length < 2) return word1 === word2; // More lenient for short words

    // Check if one word starts with the other (common with speech recognition)
    if (word1.startsWith(word2) || word2.startsWith(word1)) {
      return true;
    }

    // Check if one word contains the other (more aggressive matching)
    if (word1.includes(word2) || word2.includes(word1)) {
      return true;
    }

    // More lenient edit distance for words
    if (word1.length <= 7 && word2.length <= 7) {
      const maxDistance = Math.max(1, Math.floor(Math.min(word1.length, word2.length) * 0.3)); // Allow 30% character difference
      return this.calculateLevenshteinDistance(word1, word2) <= maxDistance;
    }

    return false;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private calculateLevenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + substitutionCost // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

    /**
   * Estimate line number from word position in search area
   */
  private estimateLineFromWordPosition(wordPosition: number, searchStartLine: number): number {
    if (this.avgWordsPerLine <= 0) return searchStartLine;

    // More accurate line estimation by counting actual words in lines
    let wordCount = 0;
    for (let lineIdx = searchStartLine; lineIdx < this.lines.length; lineIdx++) {
      const line = this.lines[lineIdx];
      const lineWords = line ? line.toLowerCase()
        .replace(/[^\w\s'-]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 0).length : 0;

      if (wordCount + lineWords > wordPosition) {
        console.log(`[POSITION DEBUG] Word position ${wordPosition} maps to line ${lineIdx} (accumulated ${wordCount} words)`);
        return lineIdx;
      }

      wordCount += lineWords;
    }

    // Fallback to original calculation
    const estimatedLinesFromStart = Math.floor(wordPosition / this.avgWordsPerLine);
    const result = Math.max(0, searchStartLine + estimatedLinesFromStart);
    console.log(`[POSITION DEBUG] Fallback estimation: word ${wordPosition} -> line ${result}`);
    return result;
  }

  /**
   * Enable or disable speech-based scrolling
   */
  setSpeechScrollEnabled(enabled: boolean): void {
    this.speechScrollEnabled = enabled;
    if (!enabled) {
      this.speechBuffer = [];
      this.lastSpeechPosition = -1;
    }
  }

  /**
   * Get current speech scroll status
   */
  isSpeechScrollEnabled(): boolean {
    return this.speechScrollEnabled;
  }

  /**
   * Clear speech buffer (useful when resetting or changing text)
   */
  clearSpeechBuffer(): void {
    this.speechBuffer = [];
    this.lastSpeechPosition = -1;
  }

  /**
   * Get the current scrolling mode
   */
  getScrollingMode(): string {
    return this.speechScrollEnabled ? 'SPEECH-BASED' : 'TIME-BASED';
  }

  /**
   * Skip over empty lines starting from the given position
   * @param startPosition - Position to start checking from
   * @returns Position after skipping empty lines
   */
  private skipEmptyLines(startPosition: number): number {
    let position = startPosition;
    const maxPosition = this.lines.length - this.numberOfLines;

    // Skip empty lines that would be visible in the current view
    while (position <= maxPosition) {
      let hasContent = false;

      // Check if any of the visible lines have content
      for (let i = 0; i < this.numberOfLines && position + i < this.lines.length; i++) {
        const line = this.lines[position + i];
        if (line && line.trim().length > 0) {
          hasContent = true;
          break;
        }
      }

      if (hasContent) {
        break; // Found content, stop skipping
      }

      position++; // Skip this empty view
    }

    return Math.min(position, maxPosition);
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
    if (!MENTRAOS_API_KEY) {
      throw new Error('AUGMENTOS_API_KEY is not set');
    }

    super({
      packageName: PACKAGE_NAME!,
      apiKey: MENTRAOS_API_KEY as string,
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

    // Handle speech scroll enabled changes
    session.settings.onValueChange('speech_scroll_enabled', (newValue, oldValue) => {
      console.log(`Speech scroll enabled changed for user ${userId}: ${oldValue} -> ${newValue}`);
      this.applySettings(session, sessionId, userId);
    });

    // Handle show estimated total changes
    session.settings.onValueChange('show_estimated_total', (newValue, oldValue) => {
      console.log(`Show estimated total changed for user ${userId}: ${oldValue} -> ${newValue}`);
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
      const numberOfLines = parseInt(session.settings.get<string>('number_of_lines', "4"));
      const customText = session.settings.get<string>('custom_text', '');
      const autoReplay = session.settings.get<boolean>('auto_replay', false);
      const speechScrollEnabled = session.settings.get<boolean>('speech_scroll_enabled', true);
      const showEstimatedTotal = session.settings.get<boolean>('show_estimated_total', true);

      const lineWidth = convertLineWidth(lineWidthString, false);

      console.log(`Applied settings for user ${userId}: lineWidth=${lineWidth}, scrollSpeed=${scrollSpeed}, numberOfLines=${numberOfLines}, autoReplay=${autoReplay}, speechScrollEnabled=${speechScrollEnabled}, showEstimatedTotal=${showEstimatedTotal}`);

      // Create or update teleprompter manager
      let teleprompterManager = this.userTeleprompterManagers.get(userId);
      let textChanged = false;
      // Always ensure newTextToSet is a string
      const newTextToSet = (customText ?? '') || teleprompterManager?.getDefaultText() || '';
      console.log(`Applying settings for user ${userId}: customText=${customText}`);
      if (!teleprompterManager) {
        teleprompterManager = new TeleprompterManager(newTextToSet, lineWidth, scrollSpeed, autoReplay, speechScrollEnabled, showEstimatedTotal);
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
        teleprompterManager.setSpeechScrollEnabled(speechScrollEnabled);
        teleprompterManager.setShowEstimatedTotal(showEstimatedTotal);
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

        // Set up speech-based scrolling if enabled
    let transcriptionUnsubscribe: (() => void) | null = null;
    if (teleprompterManager.isSpeechScrollEnabled()) {
      try {
        console.log(`[Session ${sessionId}]: Setting up SPEECH-BASED scrolling for user ${userId} (time-based scrolling disabled)`);

        transcriptionUnsubscribe = session.events.onTranscription((data) => {
          try {
            // Check if the session is still active
            if (!this.sessionScrollers.has(sessionId)) {
              return;
            }

            const speechText = data.text?.trim();
            if (speechText) {
              console.log(`[Session ${sessionId}]: Processing speech input: "${speechText}" (isFinal: ${data.isFinal})`);
              teleprompterManager.processSpeechInput(speechText, data.isFinal);
            }
          } catch (error) {
            console.error(`[Session ${sessionId}]: Error processing speech input:`, error);
          }
        });

        // Store the unsubscribe function for cleanup
        this.addCleanupHandler(transcriptionUnsubscribe);

        console.log(`[Session ${sessionId}]: Speech transcription listener set up successfully`);
      } catch (error) {
        console.error(`[Session ${sessionId}]: Failed to set up speech transcription:`, error);
        // Continue with time-based scrolling even if speech setup fails
      }
    } else {
      console.log(`[Session ${sessionId}]: Using TIME-BASED scrolling for user ${userId} (speech-based scrolling disabled)`);
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

          // Only advance by time if speech scrolling is disabled
          if (!teleprompterManager.isSpeechScrollEnabled()) {
            // Advance the position
            teleprompterManager.advancePosition();
          }

          // Get current text to display (always update display regardless of scroll mode)
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

