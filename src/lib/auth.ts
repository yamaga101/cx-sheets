const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

/** Get OAuth2 access token via chrome.identity */
export async function getAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken(
      { interactive: true, scopes: SCOPES },
      (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!token) {
          reject(new Error("Failed to obtain access token"));
          return;
        }
        resolve(token);
      }
    );
  });
}

/** Remove cached token and get a fresh one */
export async function refreshAccessToken(): Promise<string> {
  const oldToken = await getAccessTokenSilent();
  if (oldToken) {
    await removeCachedToken(oldToken);
  }
  return getAccessToken();
}

/** Get token without user interaction (returns null if not available) */
export async function getAccessTokenSilent(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken(
      { interactive: false, scopes: SCOPES },
      (token) => {
        if (chrome.runtime.lastError || !token) {
          resolve(null);
          return;
        }
        resolve(token);
      }
    );
  });
}

/** Remove a cached token so next call fetches a new one */
function removeCachedToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => {
      resolve();
    });
  });
}

/** Sign out by removing the cached token */
export async function signOut(): Promise<void> {
  const token = await getAccessTokenSilent();
  if (token) {
    await removeCachedToken(token);
  }
}
