/// <reference types="vite/client" />

import type { DigitalHumanStudioAPI } from "../shared/ipc";

declare global {
  interface Window {
    digitalHumanStudio: DigitalHumanStudioAPI;
  }
}
