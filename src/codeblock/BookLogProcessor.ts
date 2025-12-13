import { App, MarkdownPostProcessorContext, parseYaml, ButtonComponent, DropdownComponent, Notice, requestUrl } from 'obsidian';
import { AniListClient } from '../api/AniListClient';

import { BookFileService } from '../services/BookFileService';

export class BookLogProcessor {
    static async postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext, app: App, aniList: AniListClient, fileService: BookFileService) {
        const container = el.createDiv({ cls: 'anime-log-container' });

        let params: any = {};
        try {
            params = parseYaml(source) || {};
        } catch (e) {
            container.createEl('div', { text: 'YAML Parse Error', cls: 'error' });
            return;
        }

        const mediaId = params.media_id;
        if (!mediaId) {
            container.createEl('div', { text: 'Error: media_id not found', cls: 'error' });
            return;
        }

        // --- Status UI ---
        const statusContainer = container.createDiv({ cls: 'anime-log-section anime-status' });
        statusContainer.createEl('h4', { text: '読書状態' });
        const dropdown = new DropdownComponent(statusContainer);
        const savedStatus = params.status || 'plan_to_read';

        const statusMap: Record<string, string> = {
            'plan_to_read': '読みたい',
            'reading': '読んでる',
            'completed': '読んだ',
            'on_hold': '中断',
            'dropped': '途中リタイア'
        };

        Object.keys(statusMap).forEach(key => dropdown.addOption(key, statusMap[key]));
        dropdown.setValue(savedStatus);
        dropdown.onChange(async (newStatus) => {
            await BookLogProcessor.updateStatus(app, ctx.sourcePath, newStatus);
        });

        // --- Fetch Details ---
        const detailsContainer = container.createDiv({ cls: 'anime-log-details-loading', text: '詳細情報を読み込み中...' });

        try {
            const details = await aniList.getMangaDetails(mediaId);
            detailsContainer.empty();
            detailsContainer.removeClass('anime-log-details-loading');
            detailsContainer.addClass('anime-log-details');

            if (!details) {
                detailsContainer.setText('詳細情報の取得に失敗しました');
                return;
            }

            // Add Volume Info to Status Section
            statusContainer.createEl('h4', { text: '巻数' });
            statusContainer.createDiv({ text: details.volumes ? `全${details.volumes}巻` : '不明' });

            // 1. Statistics Info (Merged)
            const infoSection = detailsContainer.createDiv({ cls: 'anime-log-section' });
            infoSection.createEl('h4', { text: '統計情報' });
            const infoGrid = infoSection.createDiv({ cls: 'anime-stats-grid' });

            const createInfoItem = (label: string, val: string) => {
                const item = infoGrid.createDiv({ cls: 'anime-stat-item' });
                item.createDiv({ cls: 'label', text: label });
                item.createDiv({ cls: 'value', text: val });
            };

            createInfoItem('連載状況', details.status === 'FINISHED' ? '完結' : '連載中');
            if (details.averageScore) createInfoItem('スコア', `${details.averageScore}%`);

            if (details.stats?.statusDistribution) {
                details.stats.statusDistribution.forEach(s => {
                    const labelMap: any = { 'CURRENT': '読んでる', 'PLANNING': '読みたい', 'COMPLETED': '完了', 'DROPPED': '中止', 'PAUSED': '中断' };
                    createInfoItem(labelMap[s.status] || s.status, s.amount.toString());
                });
            }




            // 4. Related
            if (details.relations?.edges.length) {
                const relSection = detailsContainer.createDiv({ cls: 'anime-log-section' });
                relSection.createEl('h4', { text: '関連作品' });
                const scroll = relSection.createDiv({ cls: 'horizontal-scroll-container' });

                details.relations.edges.forEach(edge => {
                    const node = edge.node;
                    if (node.type !== 'MANGA') return; // Filter only manga? or show anime too? Let's show all but click action only for manga.

                    const card = scroll.createDiv({ cls: 'anime-card mini-card' });
                    if (node.coverImage?.medium) {
                        card.createEl('img', { attr: { src: node.coverImage.medium } });
                    }
                    const t = node.title.native || node.title.romaji;
                    card.createDiv({ cls: 'anime-card-title', text: t });
                    card.createDiv({ cls: 'anime-card-relation', text: edge.relationType });

                    if (node.type === 'MANGA') {
                        card.onclick = () => {
                            BookLogProcessor.openRelated(app, aniList, fileService, node);
                        };
                    }
                });
            }

            // 5. Recommendations
            if (details.recommendations?.nodes.length) {
                const recSection = detailsContainer.createDiv({ cls: 'anime-log-section' });
                recSection.createEl('h4', { text: 'おすすめ' });
                const scroll = recSection.createDiv({ cls: 'horizontal-scroll-container' });

                details.recommendations.nodes.forEach(rec => {
                    const node = rec.mediaRecommendation;
                    if (!node) return;

                    const card = scroll.createDiv({ cls: 'anime-card mini-card' });
                    if (node.coverImage?.medium) {
                        card.createEl('img', { attr: { src: node.coverImage.medium } });
                    }
                    const t = node.title.native || node.title.romaji;
                    card.createDiv({ cls: 'anime-card-title', text: t });

                    card.onclick = () => {
                        BookLogProcessor.openRelated(app, aniList, fileService, node);
                    };
                });
            }

        } catch (e) {
            console.error('Render error', e);
            detailsContainer.setText('エラーが発生しました');
        }
    }

    static async openRelated(app: App, aniList: AniListClient, fileService: BookFileService, node: any) {
        const existing = await fileService.getBookFile(node.id);
        if (existing) {
            await fileService.openFile(existing);
        } else {
            new Notice(`Creating note for ${node.title.native || node.title.romaji}...`);
            try {
                // Fetch full details before creating file
                const fullDetails = await aniList.getMangaDetails(node.id);
                const dataToUse = fullDetails || node;

                const file = await fileService.createBookFile(dataToUse);
                await fileService.openFile(file);
            } catch (e) {
                new Notice('Failed to create note');
                console.error(e);
            }
        }
    }

    static async updateStatus(app: App, path: string, newStatus: string) {
        const file = app.vault.getAbstractFileByPath(path);
        if (!file || !('read' in file)) return;

        const content = await app.vault.read(file as any);
        // Replace status: ... line
        const newContent = content.replace(/(status:\s*)(.*)/, `$1${newStatus}`);

        if (content !== newContent) {
            await app.vault.modify(file as any, newContent);
        }
    }


}
