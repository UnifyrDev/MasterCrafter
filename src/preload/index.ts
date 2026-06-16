import { contextBridge } from "electron";
import { createMasterCrafterApi } from "@preload/api";

contextBridge.exposeInMainWorld("masterCrafter", createMasterCrafterApi());
