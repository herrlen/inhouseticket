import { describe, expect, it } from "vitest";
import {
  applyProjectMove,
  computeFolderMove,
  computeProjectMove,
  folderDndId,
  projectDndId,
  projectsIn,
  sortByKey,
  type FolderItem,
  type ProjectItem,
} from "./model";

const p = (id: string, folderId: string | null, sort: string): ProjectItem => ({
  id, name: id, key: id.toUpperCase(), color: "#FF6B5B", icon: null, folderId, sort, openCount: 0,
});

// root: a, b, c   folder F: x, y
const projects = [p("a", null, "a0"), p("b", null, "a1"), p("c", null, "a2"), p("x", "F", "a0"), p("y", "F", "a1")];
const order = (list: ProjectItem[], folder: string | null) => projectsIn(list, folder).map((q) => q.id);
const move = (active: string, over: string) => {
  const m = computeProjectMove(projects, active, over);
  return m ? applyProjectMove(projects, m) : projects;
};

describe("computeProjectMove", () => {
  it("moves down within the same list", () => {
    expect(order(move("a", projectDndId("c")), null)).toEqual(["b", "c", "a"]);
    expect(order(move("a", projectDndId("b")), null)).toEqual(["b", "a", "c"]);
  });

  it("moves up within the same list", () => {
    expect(order(move("c", projectDndId("a")), null)).toEqual(["c", "a", "b"]);
  });

  it("moves into another list before the target", () => {
    const next = move("b", projectDndId("y"));
    expect(order(next, "F")).toEqual(["x", "b", "y"]);
    expect(order(next, null)).toEqual(["a", "c"]);
  });

  it("drops on a folder → end of that folder", () => {
    const next = move("a", folderDndId("F"));
    expect(order(next, "F")).toEqual(["x", "y", "a"]);
  });

  it("ignores drops on itself or on its own folder", () => {
    expect(computeProjectMove(projects, "a", projectDndId("a"))).toBeNull();
    expect(computeProjectMove(projects, "x", folderDndId("F"))).toBeNull();
  });
});

describe("computeFolderMove", () => {
  const folders: FolderItem[] = [
    { id: "F1", name: "1", sort: "a0" },
    { id: "F2", name: "2", sort: "a1" },
    { id: "F3", name: "3", sort: "a2" },
  ];
  const apply = (a: string, o: string) => {
    const m = computeFolderMove(folders, a, o)!;
    return sortByKey(folders.map((f) => (f.id === m.folderId ? { ...f, sort: m.sort } : f))).map((f) => f.id);
  };

  it("reorders folders down and up", () => {
    expect(apply("F1", "F3")).toEqual(["F2", "F3", "F1"]);
    expect(apply("F3", "F1")).toEqual(["F3", "F1", "F2"]);
  });
});
