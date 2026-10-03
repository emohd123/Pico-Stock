async (page) => {
  if(!page.url().startsWith('https://pico-stock.vercel.app/'))throw new Error('Expected live studio');
  const api='/api/pico-ai/admin/event-layouts/royal-bahrain-concours-2026';
  await page.reload();await page.getByRole('textbox',{name:'Search site locations',exact:true}).fill('Lounge 1');
  await page.getByRole('button',{name:/^Lounge 1 /}).click();
  const select=page.getByRole('combobox',{name:'Lounge tent option',exact:true});
  if(await select.inputValue()!=='mq40')throw new Error('Supplier selector missing or wrong value');
  const panel=page.getByRole('region',{name:'Supplier tent options'}),text=await panel.innerText();
  if(!text.includes('BHD 2,900')||!text.includes('Furniture and décor excluded'))throw new Error('Incorrect quoted option');
  await page.getByText('Supplier reference & accuracy',{exact:true}).click();
  const photo=page.getByAltText('MQ40 Hexagon Marquee supplier reference');
  await photo.waitFor();await page.waitForFunction(()=>Array.from(document.images).some(i=>i.alt==='MQ40 Hexagon Marquee supplier reference'&&i.complete&&i.naturalWidth===1280));
  await page.screenshot({path:'output/playwright/supplier/live-mq40-final.png'});
  const data=await page.evaluate(async api=>fetch(api).then(r=>r.json()),api);
  const lounge=data.scene.objects.find(o=>o.id==='lounge-1');
  if(lounge.dimensions.join(',')!=='10.5,6.8,12')throw new Error('Dimensions mismatch');
  const report={revision:data.revision,objects:data.scene.objects.length,furniture:data.scene.objects.filter(o=>o.kind==='furniture').length,supplier:lounge.metadata.supplierTent,dimensions:lounge.dimensions,price:lounge.metadata.quote.tent,referenceImageLoaded:true,options:await select.locator('option').allTextContents(),fps:await page.locator('.es-performance').innerText(),editorErrors:await page.locator('.es-alert').allTextContents(),modelWarnings:await page.locator('.es-model-warning').allTextContents(),mutations:0};
  if(report.editorErrors.length||report.modelWarnings.length)throw new Error('Live editor warning');
  return report;
}
