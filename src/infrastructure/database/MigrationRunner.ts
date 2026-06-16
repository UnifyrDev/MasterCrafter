import type Database from "better-sqlite3";
import { MIGRATIONS } from "@infra/database/migrations";

export class MigrationRunner {
  constructor(private readonly database: Database.Database) {}

  run(): void {
    const currentVersion = this.database.pragma("user_version", { simple: true }) as number;

    for (const migration of MIGRATIONS) {
      if (migration.version <= currentVersion) {
        continue;
      }

      const transaction = this.database.transaction(() => {
        for (const statement of migration.statements) {
          try {
            this.database.prepare(statement).run();
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const isDuplicateColumn = message.includes("duplicate column name");
            const isAddColumnStatement = /^ALTER TABLE\s+/i.test(statement) && /\bADD COLUMN\b/i.test(statement);

            if (isDuplicateColumn && isAddColumnStatement) {
              continue;
            }

            throw error;
          }
        }
        this.database.pragma(`user_version = ${migration.version}`);
      });

      transaction();
    }
  }
}
