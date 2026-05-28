import { usePlayerHotkeys } from '../hooks/usePlayerHotkeys';

// PlayerHotkeys: підключає глобальні клавіші плеєра в Layout
export default function PlayerHotkeys() {
    usePlayerHotkeys();
    return null;
}
