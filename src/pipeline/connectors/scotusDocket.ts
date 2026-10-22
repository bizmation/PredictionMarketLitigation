import { createSeededPageCheck } from "./publicSource";

export function createScotusDocketCheck() {
  return createSeededPageCheck("https://www.supremecourt.gov");
}
