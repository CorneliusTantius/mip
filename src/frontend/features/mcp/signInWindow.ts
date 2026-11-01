// The sign-in page of an OAuth server opens in a new tab. The tab is opened straight from the click, since a browser blocks a tab that is
// opened after a request has finished. Its address is set once the server has answered with the sign-in link.
export function openSignInTab(): Window | null {
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  return tab;
}

// Sends the tab to the sign-in page, and says whether it did. A server that gave no web link has nothing to sign in to, so the tab is
// closed. With no tab (a browser that blocked it), nothing happens, and the caller can offer the link instead.
export function goToSignIn(tab: Window | null, link: string | null | undefined): boolean {
  if (!tab) return false;
  if (!isWebLink(link)) {
    tab.close();
    return false;
  }
  tab.location.href = link;
  return true;
}

// Only a web link is used, so a link from a server's own metadata cannot open anything else.
export function isWebLink(link: string | null | undefined): link is string {
  return !!link && /^https?:\/\//.test(link);
}
