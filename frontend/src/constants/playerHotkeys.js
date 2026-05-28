// PLAYER_HOTKEYS: список гарячих клавіш для довідки та usePlayerHotkeys
export const PLAYER_HOTKEYS = [
    {
        group: 'Відтворення',
        rows: [
            { keys: ['Пробіл'], action: 'Відтворення / пауза' },
            { keys: ['M'], action: 'Вимкнути / увімкнути звук' }
        ]
    },
    {
        group: 'Перемотка',
        rows: [
            { keys: ['←'], action: 'Назад на 1 с' },
            { keys: ['→'], action: 'Вперед на 1 с' },
            { keys: ['Shift', '←'], action: 'Назад на 5 с' },
            { keys: ['Shift', '→'], action: 'Вперед на 5 с' }
        ]
    },
    {
        group: 'Черга',
        rows: [
            { keys: ['Ctrl', '←'], action: 'Попередній трек' },
            { keys: ['Ctrl', '→'], action: 'Наступний трек' }
        ]
    },
    {
        group: 'Гучність',
        rows: [
            { keys: ['↑'], action: 'Гучність +1%' },
            { keys: ['↓'], action: 'Гучність −1%' },
            { keys: ['Shift', '↑'], action: 'Гучність +5%' },
            { keys: ['Shift', '↓'], action: 'Гучність −5%' }
        ]
    }
];

export const HOTKEYS_FOOTNOTE =
    'Не працюють, коли курсор у полі пошуку або в текстовому полі.';
