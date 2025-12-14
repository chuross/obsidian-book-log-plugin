import { App, MarkdownPostProcessorContext, parseYaml, ButtonComponent, DropdownComponent, Notice, requestUrl, MarkdownSectionInformation, TFile } from 'obsidian';
import { md5 } from '../utils/md5';
import { AniListClient } from '../api/AniListClient';
import { SaleBonClient } from '../api/SaleBonClient';

import { BookPreviewModal } from '../ui/BookPreviewModal';

import { BookFileService } from '../services/BookFileService';

export class BookLogProcessor {
    static async postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext, app: App, aniList: AniListClient, fileService: BookFileService) {
        const saleBon = new SaleBonClient();
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
        const savedStatus = params.status || 'none';

        const statusMap: Record<string, string> = {
            'none': '(未設定)',
            'plan_to_read': '読みたい',
            'reading': '読んでる',
            'completed': '読んだ',
            'on_hold': '中断',
            'dropped': '途中リタイア'
        };

        Object.keys(statusMap).forEach(key => dropdown.addOption(key, statusMap[key]));
        dropdown.setValue(savedStatus);
        dropdown.onChange(async (newStatus) => {
            const section = ctx.getSectionInfo(el);
            const wasNone = savedStatus === 'none';

            await BookLogProcessor.updateStatus(app, ctx.sourcePath, newStatus, section);


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

            // Kindle Unlimited Badge
            if (details.format !== 'NOVEL' && (details.title.native || details.title.romaji)) {
                const title = details.title.native || details.title.romaji;
                saleBon.getUnlimitedCount(title).then(count => {
                    if (count !== null && count > 0) {
                        const badge = statusContainer.createDiv({ cls: 'kindle-unlimited-badge' });
                        badge.createEl('span', { text: `Kindle Unlimited: ${count}巻` });
                    }
                });
            }

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
                    const imgContainer = card.createDiv({ cls: 'anime-card-image-container' });

                    if (node.coverImage?.medium) {
                        imgContainer.createEl('img', { attr: { src: node.coverImage.medium, referrerpolicy: 'no-referrer' } });
                    }

                    if (node.format) {
                        const isNovel = node.format === 'NOVEL';
                        const badgeText = isNovel ? 'ノベル' : 'マンガ';
                        const badgeCls = isNovel ? 'is-novel' : 'is-manga';
                        imgContainer.createDiv({
                            cls: `anime-card-format-badge ${badgeCls}`,
                            text: badgeText
                        });
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
                    const imgContainer = card.createDiv({ cls: 'anime-card-image-container' });

                    if (node.coverImage?.medium) {
                        imgContainer.createEl('img', { attr: { src: node.coverImage.medium, referrerpolicy: 'no-referrer' } });
                    }

                    if (node.format) {
                        const isNovel = node.format === 'NOVEL';
                        const badgeText = isNovel ? 'ノベル' : 'マンガ';
                        const badgeCls = isNovel ? 'is-novel' : 'is-manga';
                        imgContainer.createDiv({
                            cls: `anime-card-format-badge ${badgeCls}`,
                            text: badgeText
                        });
                    }
                    const t = node.title.native || node.title.romaji;
                    card.createDiv({ cls: 'anime-card-title', text: t });

                    card.onclick = () => {
                        BookLogProcessor.openRelated(app, aniList, fileService, node);
                    };
                });
            }

            // 6. Kindle Link
            const title = details.title.native || details.title.romaji;
            if (title) {
                const isNovel = details.format === 'NOVEL';
                let url = '';

                if (isNovel) {
                    url = `https://www.amazon.co.jp/s?k=${encodeURIComponent(title)}&i=digital-text&rh=p_n_feature_nineteen_browse-bin%3A3169286051`;
                } else {
                    const hash = md5(title);
                    url = `https://sale-bon.com/detail/?series_hash=${hash}`;
                }

                const btnContainer = detailsContainer.createDiv({ cls: 'anime-log-section' });
                new ButtonComponent(btnContainer)
                    .setButtonText('Kindle Unlimitedで確認')
                    .onClick(() => {
                        window.open(url, '_blank');
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
            new BookPreviewModal(
                app,
                node,
                aniList,
                fileService,
                async (bookToRegister) => {
                    // Fetch full details before creating file
                    const fullDetails = await aniList.getMangaDetails(bookToRegister.id);
                    const dataToUse = fullDetails || bookToRegister;

                    const newFile = await fileService.createBookFile(dataToUse);
                    await fileService.openFile(newFile);
                }
            ).open();
        }
    }

    static async updateStatus(app: App, path: string, newStatus: string, section: MarkdownSectionInformation | null) {
        const abstractFile = app.vault.getAbstractFileByPath(path);
        if (!abstractFile) {
            new Notice(`Error: File not found at path: ${path}`);
            return;
        }

        // Check if it's a file (not a folder)
        if (!('stat' in abstractFile)) {
            new Notice('Error: Path is not a file');
            return;
        }

        const file = abstractFile as any; // TFile

        try {
            const content = await app.vault.read(file);
            const lines = content.split('\n');

            let statusLineIdx = -1;

            if (section) {
                // Search within the specific section
                for (let i = section.lineStart; i <= section.lineEnd && i < lines.length; i++) {
                    if (lines[i] && lines[i].trim().startsWith('status:')) {
                        statusLineIdx = i;
                        break;
                    }
                }
            } else {
                // Fallback: search entire file for first bookLog block's status
                let inBookLogBlock = false;
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].trim().startsWith('```bookLog')) {
                        inBookLogBlock = true;
                    } else if (inBookLogBlock && lines[i].trim().startsWith('```')) {
                        inBookLogBlock = false;
                    } else if (inBookLogBlock && lines[i].trim().startsWith('status:')) {
                        statusLineIdx = i;
                        break;
                    }
                }
            }

            if (statusLineIdx !== -1) {
                lines[statusLineIdx] = `status: ${newStatus}`;
                const newContent = lines.join('\n');

                await app.vault.modify(file, newContent);
                new Notice(`Status updated to: ${newStatus}`);
            } else {
                new Notice('Error: status: line not found in code block');
            }
        } catch (e) {
            new Notice(`Error updating status: ${e.message}`);
        }
    }


}
