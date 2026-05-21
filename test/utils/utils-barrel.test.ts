import { describe, expect, it } from "vitest";
import * as utils from "../../src/utils.ts";

describe("utils barrel", () => {
  it("exposes public utility API", () => {
    expect(typeof utils.checkDevtoolsGlobalHook).toBe("function");
    expect(typeof utils.findDebugSourceByHostInstance).toBe("function");
    expect(typeof utils.findFiberByHostInstance).toBe("function");
    expect(typeof utils.getDebugSourceFromFiber).toBe("function");
    expect(typeof utils.getEditorLink).toBe("function");
    expect(typeof utils.isReactDevtoolsRunning).toBe("function");
  });
});
