import axios from 'axios';

const PACKAGE_NAME = 'com.augmentos.teleprompter';
const CLOUD_URL = 'cloud';

// Define the settings interface
interface UserSettings {
  lineWidth: number;
  numberOfLines: number;
  scrollSpeed: number;
  customText: string;
}

// Default settings
const DEFAULT_SETTINGS: UserSettings = {
  lineWidth: 38,
  numberOfLines: 4,
  scrollSpeed: 120,
  customText: ''
};

// Store user settings in memory
const userSettingsMap = new Map<string, UserSettings>();

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

/**
 * Fetches and applies settings for a user
 * @param userId The user ID
 * @returns The user settings object
 */
async function fetchSettings(userId: string): Promise<UserSettings> {
  try {
    // Fetch user settings from the cloud
    const response = await axios.get(`http://${CLOUD_URL}/tpasettings/user/${PACKAGE_NAME}`, {
      headers: { Authorization: `Bearer ${userId}` }
    });

    const settings = response.data.settings;
    console.log(`Fetched settings for userId ${userId}:`, settings);

    // Find the relevant settings
    const lineWidthSetting = settings.find((s: any) => s.key === 'line_width');
    const numberOfLinesSetting = settings.find((s: any) => s.key === 'number_of_lines');
    const scrollSpeedSetting = settings.find((s: any) => s.key === 'scroll_speed');
    const customTextSetting = settings.find((s: any) => s.key === 'input_text');

    console.log(`Custom text setting for userId ${userId}:`, customTextSetting);

    // Create settings object with defaults if not found
    const userSettings: UserSettings = {
      lineWidth: lineWidthSetting ? convertLineWidth(lineWidthSetting.value) : DEFAULT_SETTINGS.lineWidth,
      numberOfLines: numberOfLinesSetting ? Number(numberOfLinesSetting.value) : DEFAULT_SETTINGS.numberOfLines,
      scrollSpeed: scrollSpeedSetting ? Number(scrollSpeedSetting.value) : DEFAULT_SETTINGS.scrollSpeed,
      customText: customTextSetting?.value || DEFAULT_SETTINGS.customText
    };

    // Store the settings for this user
    userSettingsMap.set(userId, userSettings);
    console.log(`Settings for user ${userId}:`, userSettings);

    return userSettings;
  } catch (err) {
    console.error(`Error fetching settings for userId ${userId}:`, err);

    // Fallback to default values
    userSettingsMap.set(userId, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Gets the current settings for a user
 * @param userId The user ID
 * @returns The user settings object
 */
function getUserSettings(userId: string): UserSettings {
  return userSettingsMap.get(userId) || DEFAULT_SETTINGS;
}

/**
 * Gets the line width for a user
 * @param userId The user ID
 * @returns The line width
 */
function getUserLineWidth(userId: string): number {
  return getUserSettings(userId).lineWidth;
}

/**
 * Gets the number of lines for a user
 * @param userId The user ID
 * @returns The number of lines
 */
function getUserNumberOfLines(userId: string): number {
  return getUserSettings(userId).numberOfLines;
}

/**
 * Gets the scroll speed for a user
 * @param userId The user ID
 * @returns The scroll speed in words per minute
 */
function getUserScrollSpeed(userId: string): number {
  return getUserSettings(userId).scrollSpeed;
}

/**
 * Gets the custom text for a user
 * @param userId The user ID
 * @returns The custom text
 */
function getUserCustomText(userId: string): string {
  return getUserSettings(userId).customText;
}

export {
  fetchSettings,
  getUserSettings,
  getUserLineWidth,
  getUserNumberOfLines,
  getUserScrollSpeed,
  getUserCustomText,
  UserSettings
};
