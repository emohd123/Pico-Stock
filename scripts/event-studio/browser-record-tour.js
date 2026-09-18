async (page) => {
  if(new URL(page.url()).hostname!=='localhost')throw new Error('This development verification runs only on localhost.');
  await page.reload();await page.locator('.event-studio canvas').waitFor({timeout:60000});
  await page.waitForFunction(()=>!document.querySelector('.es-model-loading')&&!document.querySelector('.es-model-warning'),{timeout:60000});
  await page.getByRole('button',{name:'Files & versions',exact:true}).click();
  await page.evaluate(()=>{window.__rbcVideoFps=[];window.__rbcVideoTimer=setInterval(()=>{const t=document.querySelector('.es-performance')?.textContent||'';const n=parseInt(t);if(Number.isFinite(n))window.__rbcVideoFps.push(n);},1500)});
  const pending=page.waitForEvent('download',{timeout:180000});
  await page.getByRole('button',{name:/^Record walkthrough/}).click();
  const download=await pending;await download.saveAs('private/event-studio/rbc/Royal-Concours-Walkthrough-1080p.webm');
  const stats=await page.evaluate(()=>{clearInterval(window.__rbcVideoTimer);const a=window.__rbcVideoFps;return {samples:a,minimum:Math.min(...a),median:a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)],maximum:Math.max(...a),canvas:[document.querySelector('.es-viewport canvas').width,document.querySelector('.es-viewport canvas').height],error:document.querySelector('.es-alert')?.innerText||null};});
  return {file:download.suggestedFilename(),...stats};
}
