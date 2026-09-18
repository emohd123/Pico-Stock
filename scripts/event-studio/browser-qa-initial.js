async (page) => {
  if(new URL(page.url()).hostname!=='localhost')throw new Error('This development verification runs only on localhost.');
  await page.reload();
  await page.locator('.event-studio canvas').waitFor({timeout:60000});
  const summary=await page.evaluate(async()=>{const p=await fetch('/api/pico-ai/admin/event-layouts/royal-bahrain-concours-2026').then(r=>r.json());window.__rbcQABaseline=structuredClone(p.scene);return {revision:p.revision,persistence:p.persistence,objects:p.scene.objects.length,furniture:p.scene.objects.filter(o=>o.kind==='furniture').length,tents:p.scene.objects.filter(o=>o.kind==='tent').length,assets:p.assets.length,parents:p.scene.objects.filter(o=>o.metadata?.parentTentId).length};});
  console.log(JSON.stringify(summary));
  console.log(await page.locator('.es-statusbar').innerText());
  console.log(await page.locator('.es-inspector').innerText());
  await page.getByRole('button',{name:'Plan view',exact:true}).click();
  await page.getByRole('button',{name:'Show roofs',exact:true}).click();
  await page.screenshot({path:'output/concours-plan.png'});
  await page.getByRole('textbox',{name:'Search site locations',exact:true}).fill('Owners Enclosure');
  console.log(await page.locator('.es-rail').innerText());
  await page.locator('.es-location').filter({hasText:'Owners Enclosure'}).first().click();
  await page.getByRole('button',{name:'Enter tent',exact:true}).click();
  await page.screenshot({path:'output/concours-interior.png'});
  console.log(await page.locator('.es-inspector').innerText());
}
