import { expect, it } from "vitest";
import { hostedModelDisclosure } from "./hosted-model-disclosure";
import { deepseekCapabilities, hostedCapabilities } from "@/test/hosted-fixtures";

it("requires exact enabled provider/API model/high effort/disclosure rather than an OpenAI default", () => {
  expect(hostedModelDisclosure(deepseekCapabilities)).toContain("DeepSeek");
  expect(hostedModelDisclosure(hostedCapabilities)).toBeNull();
  for (const patch of [{ model_id: "gpt-6.1-sol" as const }, { model_provider: null }, { model_disclosure: null }, { model_reasoning_effort: null }]) {
    expect(hostedModelDisclosure({ ...deepseekCapabilities, ...patch })).toBeNull();
  }
  expect(hostedModelDisclosure({ ...deepseekCapabilities, model_provider: "openai", model_id: "gpt-6.1-sol", model_disclosure: "OpenAI gpt-6.1-sol high; not zero retention" })).toContain("OpenAI");
});
