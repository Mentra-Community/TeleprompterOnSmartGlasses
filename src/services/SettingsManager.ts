/**
 * SettingsManager - Encapsulates all settings storage and retrieval operations
 * Currently uses in-memory storage, can be easily extended to use database or file storage
 */

import { DEFAULT_TELEPROMPTER_SETTINGS, type TeleprompterSettings } from '../constants/defaultSettings';

export class SettingsManager {
  // In-memory storage for user settings
  private userSettings: Map<string, TeleprompterSettings>;

  constructor() {
    this.userSettings = new Map();
  }

  /**
   * Get settings for a specific user
   * Returns user's saved settings or default settings if none exist
   */
  getUserSettings(userId: string): TeleprompterSettings {
    console.log('SettingsManager.getUserSettings called with userId:', userId);
    console.log('SettingsManager: current userSettings map size:', this.userSettings.size);
    console.log('SettingsManager: userSettings keys:', Array.from(this.userSettings.keys()));

    const settings = this.userSettings.get(userId);
    if (settings) {
      console.log('SettingsManager: found existing settings for userId:', userId, settings);
      return { ...settings }; // Return a copy to prevent external modifications
    }

    console.log('SettingsManager: no settings found for userId:', userId, '- returning defaults');
    console.log('SettingsManager: DEFAULT_TELEPROMPTER_SETTINGS:', DEFAULT_TELEPROMPTER_SETTINGS);
    // Return a copy of default settings
    return { ...DEFAULT_TELEPROMPTER_SETTINGS };
  }

  /**
   * Save settings for a specific user
   */
  saveUserSettings(userId: string, settings: TeleprompterSettings): void {
    // Validate settings before saving
    this.validateSettings(settings);
    this.userSettings.set(userId, { ...settings });
  }

  /**
   * Clear all settings (useful for testing)
   */
  clearAllSettings(): void {
    this.userSettings.clear();
  }

  /**
   * Validate settings structure
   * Throws an error if settings are invalid
   */
  private validateSettings(settings: TeleprompterSettings): void {
    const requiredFields: (keyof TeleprompterSettings)[] = [
      'lineWidth',
      'scrollSpeed',
      'numberOfLines',
      'autoReplay',
      'speechScrollEnabled',
      'showEstimatedTotal'
    ];

    for (const field of requiredFields) {
      if (!(field in settings)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate specific field types and ranges
    if (typeof settings.lineWidth !== 'string') {
      throw new Error('lineWidth must be a string');
    }

    if (typeof settings.scrollSpeed !== 'number' || settings.scrollSpeed < 1 || settings.scrollSpeed > 500) {
      throw new Error('scrollSpeed must be a number between 1 and 500');
    }

    if (typeof settings.numberOfLines !== 'string') {
      throw new Error('numberOfLines must be a string');
    }

    if (typeof settings.autoReplay !== 'boolean') {
      throw new Error('autoReplay must be a boolean');
    }

    if (typeof settings.speechScrollEnabled !== 'boolean') {
      throw new Error('speechScrollEnabled must be a boolean');
    }

    if (typeof settings.showEstimatedTotal !== 'boolean') {
      throw new Error('showEstimatedTotal must be a boolean');
    }
  }
}