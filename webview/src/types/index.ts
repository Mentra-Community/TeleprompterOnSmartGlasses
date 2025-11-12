// Type exports for teleprompter functionality

export interface TeleprompterSettings {
  lineWidth: string;
  scrollSpeed: number;
  numberOfLines: string;
  customText: string;
  autoReplay: boolean;
  speechScrollEnabled: boolean;
  showEstimatedTotal: boolean;
}

export interface StartTeleprompterRequest {
  settings: TeleprompterSettings;
}

export interface StartTeleprompterResponse {
  success: boolean;
  message: string;
  sessionId?: string;
}