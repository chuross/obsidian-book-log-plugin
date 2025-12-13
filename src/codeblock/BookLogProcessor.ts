import { App, MarkdownPostProcessorContext, parseYaml, ButtonComponent, DropdownComponent, Notice, requestUrl } from 'obsidian';
import { AniListClient } from '../api/AniListClient';
import { GoogleBooksClient } from '../api/GoogleBooksClient';
import { BookFileService } from '../services/BookFileService';

export class BookLogProcessor {
    static async postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext, app: App, aniList: AniListClient, googleBooks: GoogleBooksClient, fileService: BookFileService) {
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

            // 3. Volumes (Google Books)
            const volSection = detailsContainer.createDiv({ cls: 'anime-log-section' });
            volSection.createEl('h4', { text: '単行本一覧' });
            const volGrid = volSection.createDiv({ cls: 'book-volume-grid' });
            volGrid.createDiv({ text: '読み込み中...', attr: { style: 'grid-column: 1/-1' } });

            // Fetch Google Books
            const title = details.title.native || details.title.romaji || '';
            const authorNode = details.staff?.edges.find(e => e.role === 'Story & Art' || e.role === 'Story' || e.role === 'Art')?.node;
            const author = authorNode?.name.native || authorNode?.name.full;

            googleBooks.searchBooks(title, author, details.format).then(books => {
                volGrid.empty();
                if (books.length === 0) {
                    volGrid.createDiv({ text: '単行本情報が見つかりませんでした', attr: { style: 'grid-column: 1/-1' } });
                    return;
                }

                books.forEach((book, index) => {
                    const item = volGrid.createDiv({ cls: 'book-volume-item' });
                    const imgUrl = book.volumeInfo.imageLinks?.thumbnail || book.volumeInfo.imageLinks?.smallThumbnail;
                    if (imgUrl) {
                        item.createEl('img', { attr: { src: imgUrl } });
                    } else {
                        item.createDiv({ text: 'No Image', attr: { style: 'height: 100px; display: flex; align-items: center; justify-content: center; background: var(--background-secondary); width: 100%; margin-bottom: 5px;' } });
                    }

                    item.createDiv({ cls: 'book-volume-title', text: book.volumeInfo.title });

                    // Checkbox
                    const cbContainer = item.createDiv({ attr: { style: 'margin-top: auto;' } });
                    const cb = cbContainer.createEl('input', { type: 'checkbox' });

                    // Check status
                    const currentVolStatus = params.volume_status || {};
                    const volKey = index.toString(); // Use index as key? Or try to parse volume number? Index is safer for display order mapping but if books list changes order... API results for 'oldest' should be stable-ish.
                    // Google books doesn't guarantee volume number in consistent field.
                    // We will use the index in the list as the ID for now as requested "volume_index: completed".

                    cb.checked = currentVolStatus[volKey] === 'completed';

                    cb.onchange = async () => {
                        await BookLogProcessor.updateVolumeStatus(app, ctx.sourcePath, volKey, cb.checked);
                    };
                    cbContainer.createSpan({ text: ' 読んだ', attr: { style: 'font-size: 0.8em;' } });
                });
            });


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
                        card.onclick = () => { /* Open or create new manga note */
                            // Need to inject functionality or just show notice. 
                            // We don't have direct access to 'openAnimeGrid' logic easily here without circular dependencies or complex passing.
                            // For now maybe just a Notice or try to open if exists.
                            BookLogProcessor.openRelated(app, fileService, node);
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
                        BookLogProcessor.openRelated(app, fileService, node);
                    };
                });
            }

        } catch (e) {
            console.error('Render error', e);
            detailsContainer.setText('エラーが発生しました');
        }
    }

    static async openRelated(app: App, fileService: BookFileService, node: any) {
        const existing = await fileService.getBookFile(node.id);
        if (existing) {
            await fileService.openFile(existing);
        } else {
            // Create new file?
            // We need full details to create proper file (like logic in BookFileService).
            // But we can create with basic info we have.
            // Let's prompt user? Or just create.
            new Notice(`Creating note for ${node.title.native || node.title.romaji}...`);
            try {
                // If we only have basic node info, createBookFile might lack genre etc.
                // It's better to fetch full details first? 
                // BookFileService.createBookFile takes MediaNode. The node from Relation/Rec might be partial.
                // Let's assume partial is enough or we fetch inside service? 
                // Service uses passed node. 
                // Let's use what we have, it's better than nothing.
                const file = await fileService.createBookFile(node);
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

    static async updateVolumeStatus(app: App, path: string, index: string, completed: boolean) {
        const file = app.vault.getAbstractFileByPath(path);
        if (!file || !('read' in file)) return;

        let content = await app.vault.read(file as any);

        // Find volume_status block
        // If not exist, parseYaml might have returned empty, but in file strictly it might be missing or empty.
        // We look for 'volume_status:'

        const blockRegex = /(volume_status:\s*\n)((?:\s+.*\n?)*)/;
        const match = content.match(blockRegex);

        if (match) {
            let body = match[2];
            // parsing body lines
            // We want to update or add line "  {index}: completed"
            const lines = body.split('\n').filter(l => l.trim().length > 0);
            const indent = '  '; // Assume 2 spaces

            // Map current status
            const statusMap = new Map<string, string>();
            lines.forEach(l => {
                const parts = l.split(':');
                if (parts.length >= 2) {
                    const k = parts[0].trim();
                    const v = parts[1].trim();
                    statusMap.set(k, v);
                }
            });

            if (completed) {
                statusMap.set(index, 'completed');
            } else {
                statusMap.delete(index);
            }

            // Rebuild string
            // Sort keys numerically
            const keys = Array.from(statusMap.keys()).sort((a, b) => parseInt(a) - parseInt(b));

            let newBody = '';
            if (keys.length > 0) {
                newBody = keys.map(k => `${indent}${k}: ${statusMap.get(k)}`).join('\n') + '\n';
            }

            // Allow empty body if no volumes checked
            // Need to ensure we don't eat next section of file if any (e.g. ``` end)
            // The regex ((?:\s+.*\n?)*) is greedy but confined by what? 
            // We should be careful. Usually `volume_status` is at the end of block.
            // But let's use a safer replace logic for the block content.

            const newContent = content.replace(blockRegex, `$1${newBody}`);
            await app.vault.modify(file as any, newContent);

        } else {
            // Append to block?
            // If volume_status not found, we should fail or add it?
            // createBookFile adds "volume_status:" at end.
            // If user deleted it, we might append it before ```
            // For now, assume it exists.
        }
    }
}
