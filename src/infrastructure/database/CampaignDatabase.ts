import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { MigrationRunner } from "@infra/database/MigrationRunner";

export class CampaignDatabase {
  private readonly database: Database.Database;

  private constructor(public readonly dbPath: string, database: Database.Database) {
    this.database = database;
  }

  static async open(dbPath: string): Promise<CampaignDatabase> {
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    const database = new Database(dbPath);
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    database.pragma("synchronous = NORMAL");
    database.pragma("temp_store = MEMORY");

    const campaignDatabase = new CampaignDatabase(dbPath, database);
    new MigrationRunner(database).run();
    return campaignDatabase;
  }

  get connection(): Database.Database {
    return this.database;
  }

  close(): void {
    if (this.database.open) {
      this.database.close();
    }
  }
}
