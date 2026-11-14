import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import {
  BackgroundGeolocation,
  LocationLogEntry,
} from '@capgo/background-geolocation';

const DATABASE_NAME = 'aaptha_location_history';
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const NATIVE_LOG_PAGE_SIZE = 500;

export interface LocationHistoryRecord {
  native_log_id: number;
  shift_started_at: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  altitude_accuracy: number | null;
  speed: number | null;
  bearing: number | null;
  simulated: number;
  captured_at: number;
  stored_at: number;
}

@Injectable({ providedIn: 'root' })
export class LocationDatabaseService {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private connectionPromise: Promise<SQLiteDBConnection> | null = null;
  private nativeLogSync: Promise<number> | null = null;

  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    await this.getDatabase();
  }

  async syncNativeLocationLog(shiftStartedAt: string | null): Promise<number> {
    if (!Capacitor.isNativePlatform()) return 0;
    if (this.nativeLogSync) return this.nativeLogSync;

    this.nativeLogSync = this.copyNativeLocationLog(shiftStartedAt).finally(() => {
      this.nativeLogSync = null;
    });
    return this.nativeLogSync;
  }

  async getRecentLocations(limit = 100): Promise<LocationHistoryRecord[]> {
    const database = await this.getDatabase();
    const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
    const result = await database.query(
      `SELECT native_log_id, shift_started_at, latitude, longitude, accuracy,
              altitude, altitude_accuracy, speed, bearing, simulated, captured_at, stored_at
       FROM location_history
       ORDER BY captured_at DESC
       LIMIT ?`,
      [safeLimit],
    );
    return (result.values ?? []) as LocationHistoryRecord[];
  }

  async getLocationsSince(sinceTimestamp: number): Promise<LocationHistoryRecord[]> {
    if (!Number.isFinite(sinceTimestamp)) {
      throw new RangeError('A finite location export start time is required.');
    }
    const database = await this.getDatabase();
    const result = await database.query(
      `SELECT native_log_id, shift_started_at, latitude, longitude, accuracy,
              altitude, altitude_accuracy, speed, bearing, simulated, captured_at, stored_at
       FROM location_history
       WHERE captured_at >= ?
       ORDER BY captured_at ASC`,
      [Math.floor(sinceTimestamp)],
    );
    return (result.values ?? []) as LocationHistoryRecord[];
  }

  private async getDatabase(): Promise<SQLiteDBConnection> {
    if (!this.connectionPromise) {
      this.connectionPromise = this.openDatabase().catch((error: unknown) => {
        this.connectionPromise = null;
        throw error;
      });
    }
    return this.connectionPromise;
  }

  private async openDatabase(): Promise<SQLiteDBConnection> {
    const secret = await CapacitorSQLite.isSecretStored();
    if (!secret.result) {
      await CapacitorSQLite.setEncryptionSecret({
        passphrase: this.generateEncryptionSecret(),
      });
    }

    const database = await this.sqlite.createConnection(
      DATABASE_NAME,
      true,
      'secret',
      1,
      false,
    );
    await database.open();
    await database.execute(`
      CREATE TABLE IF NOT EXISTS location_history (
        native_log_id INTEGER PRIMARY KEY,
        shift_started_at TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL,
        altitude REAL,
        altitude_accuracy REAL,
        speed REAL,
        bearing REAL,
        simulated INTEGER NOT NULL,
        captured_at INTEGER NOT NULL,
        stored_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_location_history_captured_at
        ON location_history (captured_at);
    `);
    await database.run(
      'DELETE FROM location_history WHERE captured_at < ?',
      [Date.now() - RETENTION_MS],
    );
    return database;
  }

  private generateEncryptionSecret(): string {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  private async copyNativeLocationLog(
    shiftStartedAt: string | null,
  ): Promise<number> {
    const database = await this.getDatabase();
    let copied = 0;

    while (true) {
      const { entries } = await BackgroundGeolocation.getLocationLog({
        limit: NATIVE_LOG_PAGE_SIZE,
      });
      if (entries.length === 0) break;

      for (const entry of entries) {
        await this.insertLocation(database, entry, shiftStartedAt);
      }

      const lastId = entries[entries.length - 1].id;
      await BackgroundGeolocation.clearLocationLog({ upToId: lastId });
      copied += entries.length;
    }

    await database.run(
      'DELETE FROM location_history WHERE captured_at < ?',
      [Date.now() - RETENTION_MS],
    );
    return copied;
  }

  private async insertLocation(
    database: SQLiteDBConnection,
    entry: LocationLogEntry,
    shiftStartedAt: string | null,
  ): Promise<void> {
    await database.run(
      `INSERT OR IGNORE INTO location_history (
        native_log_id, shift_started_at, latitude, longitude, accuracy,
        altitude, altitude_accuracy, speed, bearing, simulated, captured_at, stored_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        shiftStartedAt,
        entry.latitude,
        entry.longitude,
        entry.accuracy,
        entry.altitude,
        entry.altitudeAccuracy,
        entry.speed,
        entry.bearing,
        entry.simulated ? 1 : 0,
        entry.time ?? Date.now(),
        Date.now(),
      ],
    );
  }
}
