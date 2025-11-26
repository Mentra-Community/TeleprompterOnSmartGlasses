// src/testing/DummyAppSession.ts
/**
 * DummyAppSession - Mock implementation of AppSession for testing without physical glasses
 * 
 * This class simulates the AppSession interface from @mentra/sdk, allowing developers
 * to test the teleprompter functionality by printing output to the console instead of
 * sending it to actual smart glasses.
 * 
 * Usage: Only active when NODE_ENV=development
 */

import { ViewType } from '@mentra/sdk';

export class DummyAppSession {
  // Simulate WebSocket connection state (1 = OPEN)
  public ws = { readyState: 1 };

  // Mock layouts API
  public layouts = {
    /**
     * Simulates showTextWall by printing to console
     * @param text - The text to display
     * @param options - Display options (view, durationMs)
     */
    showTextWall: (text: string, options?: { view?: ViewType; durationMs?: number }) => {
        console.log(text);
    }
  };

  // Mock events API
  public events = {
    /**
     * Simulates onTranscription event handler
     * In dev mode, this doesn't actually listen to speech, but provides the interface
     * @param callback - Function to call when transcription occurs
     * @returns Unsubscribe function
     */
    onTranscription: (callback: (data: { text: string; isFinal: boolean }) => void) => {
      console.log('📝 [DummyAppSession] Transcription listener registered (no-op in dev mode)');
      
      // Return unsubscribe function
      return () => {
        console.log('📝 [DummyAppSession] Transcription listener unsubscribed');
      };
    }
  };

  constructor() {
    console.log('🧪 [DummyAppSession] Created dummy session for testing');
  }
}