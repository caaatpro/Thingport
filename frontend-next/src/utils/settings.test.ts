import { beforeEach, describe, expect, it } from "vitest";
import { loadSettings, saveSettings } from "./settings";

beforeEach(() => window.localStorage.clear());

describe("settings", () => {
  it("defaults to an empty MakerWorld cookie", () => {
    expect(loadSettings()).toEqual({ makerworld: { cookie: "" } });
  });

  it("saves and loads the cookie", () => {
    saveSettings({ makerworld: { cookie: "token=abc" } });
    expect(loadSettings().makerworld.cookie).toBe("token=abc");
  });

  it("falls back to the default for corrupt or mistyped data", () => {
    window.localStorage.setItem("thingport_settings", "{broken");
    expect(loadSettings().makerworld.cookie).toBe("");
    window.localStorage.setItem("thingport_settings", JSON.stringify({ makerworld: { cookie: 5 } }));
    expect(loadSettings().makerworld.cookie).toBe("");
  });
});
