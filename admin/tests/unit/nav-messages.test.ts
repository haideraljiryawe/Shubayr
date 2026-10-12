import { describe, expect, it } from "vitest";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import { NAV_ITEMS } from "@/lib/nav";

/**
 * Every sidebar entry has its label, and its card on the dashboard has its
 * description, in both languages: a missing one only shows up as a server
 * log line (MISSING_MESSAGE), so it is checked here.
 */
describe("nav messages", () => {
  for (const [locale, messages] of [["en", en], ["ar", ar]] as const) {
    it(`${locale}: every nav item has a label and a dashboard description`, () => {
      const nav = messages.nav as Record<string, string>;
      const sections = messages.dashboard.section as Record<string, string>;
      for (const item of NAV_ITEMS) {
        expect(nav[item.key], `nav.${item.key}`).toBeTruthy();
        if (item.key !== "dashboard") expect(sections[item.key], `dashboard.section.${item.key}`).toBeTruthy();
      }
    });
  }
});
