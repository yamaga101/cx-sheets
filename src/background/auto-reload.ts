// Auto-reload: detect version change from git pull and reload extension
const AUTO_RELOAD_ALARM = 'sheets_auto_reload_check';

async function checkVersionAndReload(): Promise<void> {
    try {
        const loadedVersion = chrome.runtime.getManifest().version;
        const resp = await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' });
        if (!resp.ok) return;
        const manifest = await resp.json();
        const diskVersion = manifest.version as string;
        console.log(`[Sheets AutoReload] Loaded: ${loadedVersion} / Disk: ${diskVersion}`);
        if (diskVersion !== loadedVersion) {
            console.log('[Sheets AutoReload] Version mismatch → reloading...');
            chrome.runtime.reload();
        }
    } catch (e) {
        console.warn('[Sheets AutoReload] Check failed:', (e as Error).message);
    }
}

async function ensureAutoReloadAlarm(): Promise<void> {
    if (!await chrome.alarms.get(AUTO_RELOAD_ALARM)) {
        chrome.alarms.create(AUTO_RELOAD_ALARM, { periodInMinutes: 1 });
        console.log('[Sheets AutoReload] Alarm registered (1 min interval)');
    }
}

ensureAutoReloadAlarm().catch(e => console.error('[Sheets AutoReload] ensureAlarm failed:', e));

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === AUTO_RELOAD_ALARM) {
        checkVersionAndReload();
    }
});
