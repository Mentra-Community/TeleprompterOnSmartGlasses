/**
 * API service for the Teleprompter webview
 */
import type { TeleprompterSettings, StartTeleprompterResponse } from './types/index';

// Use environment variable for API URL, fallback to relative URLs in production
// Check window location to determine if we're in production
const isProduction = window.location.hostname.includes('mentra.glass') ||
                    window.location.hostname.includes('onporter.run');

// Allow override via environment variable

const API_BASE_URL = isProduction
  ? 'https://teleprompter-api.mentra.glass'
  : (import.meta.env.VITE_API_URL || '');

/**
 * Create API client with optional authentication headers
 */
export function createApiClient(getHeaders?: () => HeadersInit) {
  const getAuthHeaders = (): HeadersInit => {
    const baseHeaders: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (getHeaders) {
      return { ...baseHeaders, ...getHeaders() };
    }
    
    return baseHeaders;
  };

  return {
    /**
     * Get user settings
     * @param userId - The user ID to fetch settings for
     */
    async getUserSettings(): Promise<TeleprompterSettings> {
      const response = await fetch(`${API_BASE_URL}/api/settings`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data = await response.json();
      return data.settings;
    },

    /**
     * Save user settings
     * @param userId - The user ID to save settings for
     * @param settings - The settings to save
     */
    async saveUserSettings(settings: TeleprompterSettings): Promise<void> {
      const response = await fetch(`${API_BASE_URL}/api/settings`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ settings }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    },

    /**
     * Start the teleprompter with the given settings
     */
    async startTeleprompter(scriptText: string): Promise<StartTeleprompterResponse> {
      const bodyJson = {'textToRead':scriptText}
      const response = await fetch(`${API_BASE_URL}/api/start-teleprompter`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(bodyJson),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    },

    /**
     * Stop the teleprompter
     */
    async stopTeleprompter(): Promise<{ success: boolean; message: string }> {
        const response = await fetch(`${API_BASE_URL}/api/stop-teleprompter`, {
          method: 'POST',
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    },

    /**
     * Reset the teleprompter (restart from beginning)
     */
    async resetTeleprompter(): Promise<{ success: boolean; message: string }> {
      const response = await fetch(`${API_BASE_URL}/api/reset-teleprompter`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    },
  };
}

// Default export for backward compatibility (without auth headers)
const api = createApiClient();
export default api;