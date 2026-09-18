// Records only the 3D canvas, without editor controls or account information.
export function recordEventTour(engine, onProgress = () => {}, duration = 90) {
  if (!window.MediaRecorder || !engine?.renderer?.domElement.captureStream) throw new Error('This browser cannot record the walkthrough. Use current Chrome or Edge.');
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error('WebM recording is unavailable in this browser.');
  const renderer = engine.renderer, view = engine.getView(), ratio = renderer.getPixelRatio(), resize = engine.resize;
  const previous = { labels: engine.showLabels, editing: engine.editing, enabled: engine.controls.enabled, selection: engine.selectedId };
  let recorder, stream, interval, timer, canceled = false, cleaned = false;
  const chunks = [];
  const cleanup = () => {
    if (cleaned) return; cleaned = true;
    clearInterval(interval); clearTimeout(timer); stream?.getTracks().forEach(track => track.stop());
    engine.resize = resize;
    if (!engine.disposed) {
      engine.stopTour(); engine.setVisibility({ labels: previous.labels }); engine.setEditing(previous.editing);
      engine.goTo(view, false); engine.controls.enabled = previous.enabled; engine.select(previous.selection);
      renderer.setPixelRatio(ratio); engine.resize();
    }
  };
  const done = new Promise((resolve, reject) => {
    try {
      engine.resize = () => {}; engine.setEditing(false); engine.select(null); engine.setVisibility({ labels: false }); engine.playTour(); engine.controls.enabled = false;
      renderer.setPixelRatio(1); renderer.setSize(1920, 1080, false); engine.perspective.aspect = 1920 / 1080; engine.perspective.updateProjectionMatrix();
      renderer.render(engine.world, engine.camera);
      stream = renderer.domElement.captureStream(30);
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { cleanup(); reject(new Error('Video recording was interrupted. Please try again.')); };
      recorder.onstop = () => { cleanup(); canceled ? resolve(null) : resolve(new Blob(chunks, { type: 'video/webm' })); };
      recorder.start(1000);
      const start = performance.now(); onProgress(0);
      interval = setInterval(() => {
        if (engine.disposed) { canceled = true; if (recorder.state !== 'inactive') recorder.stop(); return; }
        onProgress(Math.min(duration, Math.floor((performance.now() - start) / 1000)));
      }, 250);
      timer = setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, duration * 1000);
    } catch (error) { cleanup(); reject(error); }
  });
  return { done, cancel() { canceled = true; if (recorder && recorder.state !== 'inactive') recorder.stop(); else cleanup(); } };
}
