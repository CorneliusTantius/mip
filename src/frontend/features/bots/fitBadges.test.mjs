// Checks how many bot badges fit on one line, with "+n" for the rest. Run after a build: node src/frontend/features/bots/fitBadges.test.mjs
import assert from "node:assert/strict";
import { badgesThatFit } from "./fitBadges.ts";

// Every badge is 50 wide, the "+n" badge is 30, and the gap between items is 6.
const bots = [50, 50, 50, 50];
const more = 30;
const gap = 6;
const fit = (available) => badgesThatFit([...bots, more], available, gap);

// 1. Everything fits, so no "+n" is needed: 4 * 50 + 3 * 6 = 218.
assert.equal(fit(218), 4);
assert.equal(fit(400), 4);

// 2. Some do not fit, so "+n" is needed. Three badges and "+1" take 3 * 50 + 2 * 6 + 6 + 30 = 198. Two and "+2" take 2 * 50 + 6 + 6 + 30 = 142.
assert.equal(fit(198), 3);
assert.equal(fit(197), 2, "three badges and +1 do not fit in 197");
assert.equal(fit(142), 2);
assert.equal(fit(141), 1, "two badges and +2 do not fit in 141, but one and +3 take 50 + 6 + 30 = 86");
assert.equal(fit(86), 1);

// 3. Not even one badge fits with "+n", so the line shows only "+n".
assert.equal(fit(60), 0);
assert.equal(fit(0), 0);

// 4. No bots, and no measurements, show nothing.
assert.equal(badgesThatFit([30], 100, gap), 0);
assert.equal(badgesThatFit([], 100, gap), 0);

console.log("bot badge fit tests passed");
