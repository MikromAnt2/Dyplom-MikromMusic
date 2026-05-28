// CardRowSkeleton: skeleton рядка карток — під час завантаження
export default function CardRowSkeleton({ count = 6, type = 'card' }) {
    const w = type === 'artist' ? 130 : 165;
    const h = type === 'artist' ? 130 : 165;
    const coverClass = type === 'artist' ? 'skeleton_cover--artist' : 'skeleton_cover--card';

    return (
        <div className="skeleton_row">
            {Array.from({ length: count }).map((_, i) => (
                <div key={`sk-${type}-${i}`} className="skeleton_item" style={{ width: w }}>
                    <div
                        className={`skeleton_pulse skeleton_cover ${coverClass}`}
                        style={{ width: w, height: h }}
                    />
                    <div className="skeleton_pulse skeleton_line" />
                </div>
            ))}
        </div>
    );
}
