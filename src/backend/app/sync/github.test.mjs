// Checks how sync reads gh's accounts and picks one. Run after a build: node src/backend/app/sync/github.test.mjs
// Only the text parsing and the choice are tested here. Real tokens come from gh and are not used in the tests.
import assert from "node:assert/strict";
import { parseAccounts, pickAccount } from "../../../../dist/backend/app/sync/github.js";

// One account, as this machine's gh prints it.
const single = `github.com
  ✓ Logged in to github.com account CorneliusTantius (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'
`;

// Several accounts, the second active, and one login gh could not verify (a stale token).
const several = `github.com
  ✓ Logged in to github.com account work-bot (keyring)
  - Active account: false
  - Git operations protocol: https
  ✓ Logged in to github.com account personal (keyring)
  - Active account: true
  - Git operations protocol: https
  X Failed to log in to github.com account old-login (keyring)
  - Active account: false
`;

{
  assert.deepEqual(parseAccounts(single), [{ login: "CorneliusTantius", active: true }]);
}

{
  assert.deepEqual(parseAccounts(several), [
    { login: "work-bot", active: false },
    { login: "personal", active: true },
  ]);
}

{
  assert.deepEqual(parseAccounts("You are not logged into any GitHub hosts. Run gh auth login to authenticate.\n"), []);
}

// The chosen account wins while gh still has it. Otherwise gh's active account is used. With none active, the first.
{
  const accounts = parseAccounts(several);
  assert.equal(pickAccount(accounts, "work-bot"), "work-bot");
  assert.equal(pickAccount(accounts, null), "personal");
  assert.equal(pickAccount(accounts, "removed-from-gh"), "personal");
  assert.equal(pickAccount([], "anyone"), null);
  assert.equal(pickAccount([{ login: "first", active: false }, { login: "second", active: false }], null), "first");
}

console.log("github tests passed");
