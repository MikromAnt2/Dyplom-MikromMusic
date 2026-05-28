import { Fragment, useMemo } from 'react';
import { useLocale } from '../context/LocaleContext';
import { buildPlayerHotkeys } from '../translations/hotkeys';

// HotkeysTable: таблиця гарячих клавіш плеєра
export default function HotkeysTable() {
    const { t } = useLocale();
    const sections = useMemo(() => buildPlayerHotkeys(t), [t]);

    return (
        <div className="hotkeys_table_wrap">
            <table className="hotkeys_table">
                <thead>
                    <tr>
                        <th scope="col">{t('hotkeys.keysCol')}</th>
                        <th scope="col">{t('hotkeys.actionCol')}</th>
                    </tr>
                </thead>
                <tbody>
                    {sections.map((section) => (
                        <Fragment key={section.group}>
                            <tr className="hotkeys_table_group">
                                <td colSpan={2}>{section.group}</td>
                            </tr>
                            {section.rows.map((row) => (
                                <tr key={`${section.group}-${row.action}`}>
                                    <td className="hotkeys_table_keys">
                                        {row.keys.map((key, i) => (
                                            <span key={`${row.action}-${key}`}>
                                                {i > 0 ? <span className="hotkeys_plus">+</span> : null}
                                                <kbd>{key}</kbd>
                                            </span>
                                        ))}
                                    </td>
                                    <td>{row.action}</td>
                                </tr>
                            ))}
                        </Fragment>
                    ))}
                </tbody>
            </table>
            <p className="hotkeys_footnote">{t('hotkeys.footnote')}</p>
        </div>
    );
}
