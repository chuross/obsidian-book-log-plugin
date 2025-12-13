import { App, TFile, requestUrl, normalizePath, Notice } from 'obsidian';
import { MediaNode } from '../api/types';

const BOOK_LOG_DIR = 'booklog';
const ATTACHMENTS_DIR = 'attachments/book';

export class BookFileService {
    app: App;

    constructor(app: App) {
        this.app = app;
    }

    async getBookFile(mediaId: number): Promise<TFile | null> {
        const files = this.app.vault.getMarkdownFiles();
        // Search file starting with {mediaId}_
        const file = files.find(f => f.basename.startsWith(`${mediaId}_`));
        return file || null;
    }

    async createBookFile(media: MediaNode): Promise<TFile> {
        await this.ensureDirectory(BOOK_LOG_DIR);

        const displayTitle = media.title.native || media.title.romaji || media.title.english || 'No Title';
        const sanitizedTitle = this.sanitizeFileName(displayTitle);
        const fileName = `${BOOK_LOG_DIR}/${media.id}_${sanitizedTitle}.md`;

        // Save thumbnail
        let thumbnailPath = '';
        if (media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium) {
            const imageUrl = media.coverImage.extraLarge || media.coverImage.large || media.coverImage.medium;
            if (imageUrl) {
                thumbnailPath = await this.saveThumbnail(media.id, imageUrl);
            }
        }

        const tags = ['booklog'];
        if (media.genres) {
            media.genres.forEach(g => tags.push(`booklog_${this.sanitizeTag(g)}`));
        }

        const authorNode = media.staff?.edges.find(e => e.role === 'Story & Art' || e.role === 'Story' || e.role === 'Art')?.node;
        const author = authorNode?.name.native || authorNode?.name.full || '';

        // Thumbnail embed
        const thumbnailEmbed = thumbnailPath
            ? `<div contenteditable="false"><img src="${thumbnailPath}" alt="${displayTitle}" width="300" /></div>`
            : '';

        const content = `---
anilist_id: ${media.id}
title: "${displayTitle}"
author: "${author}"
tags:
${tags.map(t => `  - ${t}`).join('\n')}
---

${thumbnailEmbed}

# ${displayTitle}

\`\`\`bookLog
media_id: ${media.id}
status: plan_to_read

\`\`\`
`;

        try {
            const file = await this.app.vault.create(fileName, content);
            this.cleanupAttachments();
            return file;
        } catch (e) {
            console.error('Failed to create file', e);
            throw e;
        }
    }

    async openFile(file: TFile) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);
    }

    private async saveThumbnail(mediaId: number, imageUrl: string): Promise<string> {
        await this.ensureDirectory(ATTACHMENTS_DIR);

        const urlObj = new URL(imageUrl);
        const ext = urlObj.pathname.split('.').pop() || 'jpg';
        // Clean extension logic (sometimes extension might have query params etc if not handled by URL pathname logic correctly strictly? usually last part of path is safe enough for basic images)

        const fileName = `${ATTACHMENTS_DIR}/${mediaId}_thumbnail.${ext}`;
        const normalizedPath = normalizePath(fileName);

        const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
        if (existing) return normalizedPath;

        try {
            const response = await requestUrl({ url: imageUrl });
            await this.app.vault.createBinary(normalizedPath, response.arrayBuffer);
            return normalizedPath;
        } catch (error) {
            console.error('Failed to save thumbnail:', error);
            return '';
        }
    }

    private async ensureDirectory(path: string) {
        const normalized = normalizePath(path);
        const folder = this.app.vault.getAbstractFileByPath(normalized);
        if (!folder) {
            await this.app.vault.createFolder(normalized);
        }
    }

    private async cleanupAttachments() {
        try {
            const markdownFiles = this.app.vault.getMarkdownFiles();
            const validIds = new Set<string>();

            markdownFiles.forEach(file => {
                const match = file.basename.match(/^(\d+)_/);
                if (match) {
                    validIds.add(match[1]);
                }
            });

            const attachmentFolder = this.app.vault.getAbstractFileByPath(ATTACHMENTS_DIR);
            if (attachmentFolder && 'children' in attachmentFolder) {
                const images = (attachmentFolder as any).children;

                for (const img of images) {
                    if (img instanceof TFile) {
                        const match = img.name.match(/^(\d+)_thumbnail\./);
                        if (match) {
                            const id = match[1];
                            if (!validIds.has(id)) {
                                console.log(`Deleting unused thumbnail: ${img.path}`);
                                await this.app.vault.delete(img);
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Cleanup failed', e);
        }
    }

    private sanitizeFileName(name: string): string {
        return name.replace(/[\\/:*?"<>|]/g, '').trim();
    }

    private sanitizeTag(name: string): string {
        return name.replace(/\s+/g, '_').replace(/[^\w\d_]/g, '');
    }
}
