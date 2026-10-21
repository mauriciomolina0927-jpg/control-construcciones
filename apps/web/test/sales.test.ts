import { describe, expect, it } from "vitest";
import { suggestTransfers } from "../src/lib/sales";

describe("suggested transfers", () => {
  it("papá received the whole sale and passes the socio his part", () => {
    expect(
      suggestTransfers([
        { partnerId: "papa", balance: -87_500_000n },
        { partnerId: "socio", balance: 87_500_000n },
      ]),
    ).toEqual([{ from: "papa", to: "socio", amount: 87_500_000n }]);
  });

  it("nothing to move when everyone is square", () => {
    expect(suggestTransfers([{ partnerId: "a", balance: 0n }, { partnerId: "b", balance: 0n }])).toEqual([]);
  });

  it("splits one debt among several partners", () => {
    expect(
      suggestTransfers([
        { partnerId: "a", balance: -30n },
        { partnerId: "b", balance: 10n },
        { partnerId: "c", balance: 20n },
      ]),
    ).toEqual([
      { from: "a", to: "b", amount: 10n },
      { from: "a", to: "c", amount: 20n },
    ]);
  });
});
