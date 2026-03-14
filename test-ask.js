import { askPCloud } from './lib/pcloud/searchService.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
    try {
        console.log('Testing askPCloud...');
        const result = await askPCloud({
            query: 'Find all quotes for stc from 2024',
            filters: {},
            pageSize: 6
        });
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('FAILED:', err);
    }
}

test();
