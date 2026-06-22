import { app } from "electron";
import type { AppInfoDto } from "@shared/contracts";
import { APP_NAME } from "@shared/constants";
import { formatDisplayVersion } from "@shared/versioning";

export class AppInfoService {
  private static instance: AppInfoService | null = null;

  static getInstance(): AppInfoService {
    if (AppInfoService.instance == null) {
      AppInfoService.instance = new AppInfoService();
    }

    return AppInfoService.instance;
  }

  getInfo(): AppInfoDto {
    const version = app.getVersion();
    const displayVersion = formatDisplayVersion(version);
    return {
      name: APP_NAME,
      version,
      displayVersion,
      displayName: `${APP_NAME} v${displayVersion}`,
    };
  }

  getWindowTitle(): string {
    return this.getInfo().displayName;
  }
}
