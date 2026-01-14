#!/usr/bin/env node

/**
 * Console Log Capture Script
 * 
 * This script captures browser console logs from the running application
 * without starting the development server itself.
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const APP_URL = 'http://localhost:1420';
const LOG_FILE = path.join(__dirname, '../browser-logs.log');

// Clear previous log file
if (fs.existsSync(LOG_FILE)) {
  fs.unlinkSync(LOG_FILE);
}

// Helper to write logs
function log(message) {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, formattedMessage);
  console.log(message);
}

// Start browser and capture console logs
async function captureLogs() {
  log('Starting browser console capture...');
  
  try {
    const browser = await puppeteer.launch({
      headless: false,
      devtools: true,
      args: ['--window-size=1280,800']
    });
    
    const page = await browser.newPage();
    
    // Capture console logs
    page.on('console', (msg) => {
      const type = msg.type().toUpperCase();
      const text = msg.text();
      const logMessage = `[BROWSER ${type}] ${text}`;
      log(logMessage);
    });
    
    // Capture errors
    page.on('pageerror', (error) => {
      log(`[BROWSER ERROR] ${error.message}`);
    });
    
    // Capture network errors
    page.on('requestfailed', (request) => {
      log(`[NETWORK ERROR] ${request.url()} failed: ${request.failure().errorText}`);
    });
    
    log('Navigating to app...');
    await page.goto(APP_URL);
    log(`Browser opened at ${APP_URL}`);
    log('Console logs are being captured to browser-logs.log');
    
    // Keep the script running
    process.on('SIGINT', async () => {
      log('Shutting down...');
      await browser.close();
      process.exit(0);
    });
    
  } catch (error) {
    log(`Error: ${error.message}`);
    process.exit(1);
  }
}

captureLogs();
