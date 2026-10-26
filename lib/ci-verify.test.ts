import { expect, test } from "vitest";

test("deliberately failing assertion (CI verification, do not merge)", () => {
  expect(1 + 1).toBe(3);
});
