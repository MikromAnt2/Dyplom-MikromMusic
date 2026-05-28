import { loadYouTubeApi, warmupPlayer, wakePlayerLayout } from './lib/youtubePlayer.js';
import { ytLog } from './lib/youtubePlayerDebug.js';

ytLog('ytBoot: старт');
loadYouTubeApi();
warmupPlayer()
    .then(() => {
        ytLog('ytBoot: warmup ok');
        wakePlayerLayout('ytBoot-warmup');
    })
    .catch((e) => ytLog('ytBoot: warmup fail', e));
