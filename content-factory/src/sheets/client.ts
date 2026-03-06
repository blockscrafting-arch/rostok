/**
 * Инициализация Google Sheets API (Service Account).
 */
import { google } from 'googleapis';
import { config } from '../config';

const auth = new google.auth.GoogleAuth({
  keyFile: config.google.serviceAccountKey,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

export const sheets = google.sheets({ version: 'v4', auth });
export const spreadsheetId = config.google.spreadsheetId;
