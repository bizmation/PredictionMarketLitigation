import { createSeededPageCheck } from "./publicSource";

export function createLegalNewsLeadsCheck() {
  return createSeededPageCheck("https://news.bloomberglaw.com");
}
