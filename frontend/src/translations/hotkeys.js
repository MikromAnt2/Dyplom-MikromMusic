// buildPlayerHotkeys: таблиця гарячих клавіш для поточної мови
export function buildPlayerHotkeys(t) {
    return [
        {
            group: t('hotkeys.groups.playback'),
            rows: [
                { keys: [t('hotkeys.keys.space')], action: t('hotkeys.actions.playPause') },
                { keys: ['M'], action: t('hotkeys.actions.mute') }
            ]
        },
        {
            group: t('hotkeys.groups.seek'),
            rows: [
                { keys: ['←'], action: t('hotkeys.actions.back1') },
                { keys: ['→'], action: t('hotkeys.actions.forward1') },
                { keys: ['Shift', '←'], action: t('hotkeys.actions.back5') },
                { keys: ['Shift', '→'], action: t('hotkeys.actions.forward5') }
            ]
        },
        {
            group: t('hotkeys.groups.queue'),
            rows: [
                { keys: ['Ctrl', '←'], action: t('hotkeys.actions.prevTrack') },
                { keys: ['Ctrl', '→'], action: t('hotkeys.actions.nextTrack') }
            ]
        },
        {
            group: t('hotkeys.groups.volume'),
            rows: [
                { keys: ['↑'], action: t('hotkeys.actions.volUp1') },
                { keys: ['↓'], action: t('hotkeys.actions.volDown1') },
                { keys: ['Shift', '↑'], action: t('hotkeys.actions.volUp5') },
                { keys: ['Shift', '↓'], action: t('hotkeys.actions.volDown5') }
            ]
        }
    ];
}
