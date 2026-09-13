import {chromium} from '../../ai photo post/saudi-moment-app/node_modules/playwright/index.mjs';
import dotenv from 'dotenv';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
dotenv.config({path:'.env.local',quiet:true});await fs.mkdir('output/pico-ai',{recursive:true});
const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1080}});
try{const response=await context.request.post('http://127.0.0.1:3100/api/admin/login',{data:{password:process.env.ADMIN_PASSWORD}});assert.equal(response.status(),200);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:3100/admin/pico-ai/traditional-ai-cloth-change');await page.locator('.pai-stats').waitFor({timeout:45000});await page.screenshot({path:'output/pico-ai/admin-overview.png',fullPage:true});
 for(const tab of ['Screens','Photos','Settings','Testing']){await page.getByRole('button',{name:tab,exact:true}).click();await page.locator('.pai-card').first().waitFor();}
 await page.screenshot({path:'output/pico-ai/admin-testing.png',fullPage:true});assert.deepEqual(errors,[]);console.log('PASS: protected admin login, sidebar page, reporting, screens, photos, settings and testing tabs.');
}finally{await browser.close();}
