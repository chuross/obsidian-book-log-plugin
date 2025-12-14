import { requestUrl } from 'obsidian';
import { md5 } from '../utils/md5';

export class SaleBonClient {
    async getUnlimitedCount(title: string): Promise<number | null> {
        try {
            const hash = md5(title);
            const url = `https://sale-bon.com/detail/?series_hash=${hash}`;

            const response = await requestUrl({ url });
            const html = response.text;

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // User requirement: Count elements where class="comic-list-title" contains class="on-unlimited"
            // We can select all .comic-list-title elements and check if they have .on-unlimited descendant
            const titles = doc.querySelectorAll('.comic-list-title');
            let count = 0;

            titles.forEach(t => {
                if (t.querySelector('.on-unlimited')) {
                    count++;
                }
            });

            return count;
        } catch (error) {
            console.error('Failed to fetch Kindle Unlimited count:', error);
            return null;
        }
    }
}
