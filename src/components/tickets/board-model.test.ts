import { describe, expect, it } from "vitest";
import { applyCardMove, cardDndId, columnCards, columnDndId, computeCardMove, wipState, type BoardCard } from "./board-model";

// open: a, b, c   doing: x
const cards: BoardCard[] = [
  { id: "a", statusId: "open", sort: "a0" },
  { id: "b", statusId: "open", sort: "a1" },
  { id: "c", statusId: "open", sort: "a2" },
  { id: "x", statusId: "doing", sort: "a0" },
];
const order = (list: BoardCard[], status: string) => columnCards(list, status).map((c) => c.id);
const move = (active: string, over: string) => {
  const m = computeCardMove(cards, active, over);
  return m ? applyCardMove(cards, m) : cards;
};

describe("computeCardMove", () => {
  it("reorders within a column (down and up)", () => {
    expect(order(move("a", cardDndId("c")), "open")).toEqual(["b", "c", "a"]);
    expect(order(move("c", cardDndId("a")), "open")).toEqual(["c", "a", "b"]);
  });

  it("moves to another column before the target card", () => {
    const next = move("b", cardDndId("x"));
    expect(order(next, "doing")).toEqual(["b", "x"]);
    expect(order(next, "open")).toEqual(["a", "c"]);
  });

  it("drops on a column → end of that column, also when it is empty", () => {
    expect(order(move("a", columnDndId("doing")), "doing")).toEqual(["x", "a"]);
    expect(order(move("a", columnDndId("done")), "done")).toEqual(["a"]);
  });

  it("ignores no-op drops", () => {
    expect(computeCardMove(cards, "a", cardDndId("a"))).toBeNull();
    expect(computeCardMove(cards, "c", columnDndId("open"))).toBeNull();
  });
});

describe("wipState", () => {
  it.each([
    [3, null, "none"],
    [2, 3, "ok"],
    [3, 3, "full"],
    [4, 3, "over"],
  ] as const)("%i of %j → %s", (count, limit, state) => {
    expect(wipState(count, limit)).toBe(state);
  });
});
