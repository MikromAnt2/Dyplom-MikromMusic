// clampMenuPosition: тримає попап/меню в межах вікна — з відкриттям вгору біля плеєра
export function clampMenuPosition(x, y, width, height, options = {}) {
    const margin = options.margin ?? 12;
    const bottomReserve = options.bottomReserve ?? 88;

    let posX = x;
    let posY = y;

    if (options.preferAbove || y + height > window.innerHeight - bottomReserve) {
        posY = y - height;
    }

    if (posY + height > window.innerHeight - margin) {
        posY = window.innerHeight - height - margin;
    }
    if (posY < margin) posY = margin;

    posX = Math.max(margin, Math.min(posX, window.innerWidth - width - margin));

    return { x: posX, y: posY };
}
