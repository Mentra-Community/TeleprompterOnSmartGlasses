import { Express } from 'express';
import { router as healthRouter } from './health.route';
import { TeleprompterApp } from '..';
import { router as teleprompterRouter, setupTeleprompterRouter } from './teleprompter.route';

export function setupAPI(app: Express, teleprompterApp: TeleprompterApp, apiKey: string) {
  // Setup route handlers with app instance and API key for auth
  setupTeleprompterRouter(teleprompterApp, apiKey);
  
  // Mount routes
  app.use('/', teleprompterRouter);
  app.use('/', healthRouter);
}

