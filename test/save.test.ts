import { describe, expect, it } from "vitest";
import { freeName } from "../src/save";

describe("freeName", () => {
  it("keeps a free name and numbers a taken one, ignoring case", () => {
    const taken = new Set(["a_x.jpg", "b_x (2).jpg", "b_x.jpg"]);
    expect(freeName(taken, "c_x.jpg")).toBe("c_x.jpg");
    expect(freeName(taken, "A_X.jpg")).toBe("A_X (2).jpg");
    expect(freeName(taken, "b_x.jpg")).toBe("b_x (3).jpg");
  });

  it("never gives two files of one batch the same name", () => {
    const taken = new Set<string>();
    expect([freeName(taken, "p.jpg"), freeName(taken, "p.jpg")]).toEqual(["p.jpg", "p (2).jpg"]);
  });
});
