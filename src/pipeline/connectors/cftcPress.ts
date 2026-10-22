import { createSeededPageCheck } from "./publicSource";

export function createCftcPressCheck() {
  return createSeededPageCheck("https://www.cftc.gov");
}
