import {chromium} from '../../ai photo post/saudi-moment-app/node_modules/playwright/index.mjs';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
dotenv.config({path:'.env.local',quiet:true});
const out='output/pico-ai/ui-refresh';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1080}});
  const auth=await context.request.post('http://127.0.0.1:3100/api/admin/login',{data:{password:process.env.ADMIN_PASSWORD}});assert.equal(auth.status(),200);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:3100/admin/pico-ai');await page.locator('.pai-sample-stack img').last().waitFor();await page.waitForTimeout(600);await page.screenshot({path:`${out}/admin-home.png`,fullPage:true});
  await page.locator('.pai-experience-link').click();await page.locator('.pai-stats').waitFor();
  for(const name of ['Screens','Photos','Settings','Testing','Overview']){await page.getByRole('button',{name,exact:true}).click();await page.locator('.pai-card').first().waitFor();}
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Admin mobile overflow');await page.screenshot({path:`${out}/admin-mobile.png`,fullPage:true});
  const phone=await browser.newContext({viewport:{width:390,height:844}}),p=await phone.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>localStorage.setItem('pico.photo.language','en'));
  const image=await sharp(await fs.readFile('output/pico-ai/live-abaya.jpg').catch(()=>fs.readFile('public/pico-ai/abaya-card.webp'))).jpeg().toBuffer();let emails=0,failPhoto=false;
  await phone.route('**/api/pico-ai/photo/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(path.endsWith('/email')){const body=request.postDataJSON();assert.equal(body.accepted,true);assert.equal(body.email,'ui-test@example.com');emails++;return route.fulfill({json:{ok:true}});}
    return route.fulfill(failPhoto?{status:410,json:{error:'This photo link has expired.'}}:{json:{image:'/ui-fixture.jpg',expiresAt:new Date(Date.now()+86400000).toISOString(),isSample:true,email:true}});
  });
  await phone.route('**/ui-fixture.jpg',route=>route.fulfill({contentType:'image/jpeg',body:image}));
  await p.goto(`http://127.0.0.1:3100/pico-ai/photo/${'b'.repeat(64)}`);await p.locator('.moment-print img').waitFor();await p.waitForTimeout(700);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(emails,0);
  await p.screenshot({path:`${out}/phone-photo.png`,fullPage:true});
  assert.ok((await p.locator('.moment-download').getAttribute('href')).endsWith('/download'));
  await p.getByLabel('Email address',{exact:true}).fill('ui-test@example.com');await p.getByRole('button',{name:'Send',exact:true}).click();assert.equal(emails,0,'Email requires deliberate consent');
  await p.getByRole('checkbox').check();await p.getByRole('button',{name:'Send',exact:true}).click();await p.locator('.moment-success').waitFor();assert.equal(emails,1);await p.screenshot({path:`${out}/phone-success.png`,fullPage:true});
  failPhoto=true;await p.reload();await p.locator('.moment-alert').waitFor();assert.equal(await p.locator('.moment-print').count(),0);await p.screenshot({path:`${out}/phone-expired.png`});
  failPhoto=false;await p.getByRole('button',{name:/Try again/}).click();await p.locator('.moment-print').waitFor();
  await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await p.locator('.moment-photo').evaluate(el=>el.getAnimations({subtree:true}).length),0);
  assert.deepEqual(errors,[]);await fs.writeFile(`${out}/report.json`,JSON.stringify({passed:true,pageErrors:errors,email:'Mocked response only. No email sent.',checks:['admin home and all tabs','mobile overflow','phone photo/download link','explicit email consent and success','expired photo and recovery','reduced motion']},null,2));
  console.log('PASS: admin and phone responsive UI, explicit email consent, expired-link recovery and reduced motion. Email responses mocked.');
} finally {await browser.close();}
