import { expect, it } from "vitest";
import { nameFromEmail } from "./names";

it.each([
  ["max.mustermann@firma.de", "Max Mustermann"],
  ["anna_schmidt@firma.de", "Anna Schmidt"],
  ["it@firma.de", "It"],
  ["j-p.weber+tickets@firma.de", "J P Weber Tickets"],
])("%s → %s", (email, name) => {
  expect(nameFromEmail(email)).toBe(name);
});
