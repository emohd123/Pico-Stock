async (page) => {
 if(!page.url().startsWith('https://pico-stock.vercel.app/'))throw new Error('Expected live studio');
 const api='/api/pico-ai/admin/event-layouts/royal-bahrain-concours-2026';
 const initial=await page.evaluate(async api=>fetch(api).then(r=>r.json()),api);
 await page.getByRole('textbox',{name:'Search site locations',exact:true}).fill('Lounge 2');
 await page.getByRole('button',{name:/^Lounge 2 · west /}).click();
 await page.getByRole('button',{name:'Compare all three configurations ↗',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await page.waitForFunction(()=>[...document.querySelectorAll('dialog img')].filter(i=>i.complete&&i.naturalWidth===1600).length===3);
 const text=await dialog.innerText();if(!['BHD 2,900','BHD 2,400','BHD 4,200','height is estimated','Furniture and décor excluded'].every(t=>text.includes(t)))throw new Error('Missing supplier details');
 await page.screenshot({path:'output/playwright/tent-comparison/live-comparison.png'});
 await page.getByRole('button',{name:'Close tent comparison',exact:true}).click();
 await page.getByRole('button',{name:'Files & versions',exact:true}).click();
 const pdf=page.locator('a[href$="/supplier/Lounge-Tent-Comparison.pdf"]');
 const blend=page.locator('a[href$="/supplier/Lounge-Tent-Options.blend"]');
 await pdf.waitFor();await blend.waitFor();
 const final=await page.evaluate(async api=>fetch(api).then(r=>r.json()),api);
 if(initial.revision!==final.revision||JSON.stringify(initial.scene)!==JSON.stringify(final.scene))throw new Error('Scene changed while checking');
 const report={revision:final.revision,objects:final.scene.objects.length,furniture:final.scene.objects.filter(o=>o.kind==='furniture').length,comparisonImages:3,comparisonPdfListed:true,blenderLibraryListed:true,mutations:0,fps:await page.locator('.es-performance').innerText(),errors:await page.locator('.es-alert').allTextContents(),modelWarnings:await page.locator('.es-model-warning').allTextContents()};
 if(report.errors.length||report.modelWarnings.length)throw new Error('Studio warning');
 await page.getByRole('button',{name:'Compare all three configurations ↗',exact:true}).click();return report;
}
