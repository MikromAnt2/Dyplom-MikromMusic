import CardRowSkeleton from './CardRowSkeleton';
import EmptyState from './EmptyState';
import { useLocale } from '../context/LocaleContext';

// SectionState: скелетон завантаження, порожній стан або children
export default function SectionState({
    loading = false,
    empty = false,
    emptyMessage,
    emptyActionLabel,
    onEmptyAction,
    skeletonType = 'card',
    skeletonCount = 6,
    loadingLabel,
    children
}) {
    const { t } = useLocale();
    const resolvedEmptyMessage = emptyMessage ?? t('common.notFound');

    if (loading) {
        return (
            <div className="section_state section_state--loading" aria-busy="true">
                {loadingLabel ? <p className="section_state_loading_text">{loadingLabel}</p> : null}
                <CardRowSkeleton count={skeletonCount} type={skeletonType} />
            </div>
        );
    }

    if (empty) {
        return (
            <EmptyState
                message={resolvedEmptyMessage}
                actionLabel={emptyActionLabel}
                onAction={onEmptyAction}
            />
        );
    }

    return children;
}
