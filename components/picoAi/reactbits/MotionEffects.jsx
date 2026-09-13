// Adapted from React Bits (David Haz, 2026). See accompanying LICENSE.md.
import {useEffect, useRef} from 'react';

export function MagicRings(){
  return <div className="rb-magic-rings" aria-hidden="true">{[0,1,2,3].map(i=><i key={i} style={{'--ring':i}}/>)}</div>;
}

export function MotionEffects(){
  const canvasRef=useRef(null);
  useEffect(()=>{
    const canvas=canvasRef.current,root=canvas?.closest('main');
    const ctx=canvas?.getContext('2d');
    if(!canvas||!root||!ctx)return;
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    let sparks=[],raf=0,width=0,height=0;
    const enabled=()=>!media.matches&&!document.hidden&&root.dataset.smMotion!=='reduced'&&root.dataset.motionPaused!=='true';
    const resetTilt=el=>{el.style.removeProperty('--rb-rx');el.style.removeProperty('--rb-ry');};
    const stop=()=>{cancelAnimationFrame(raf);raf=0;sparks=[];ctx.clearRect(0,0,width,height);root.querySelectorAll('.hero-card,.outfit,.moment-print').forEach(resetTilt);};
    const sync=()=>{if(!enabled())stop();};
    const resize=()=>{width=innerWidth;height=innerHeight;const dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);};
    const draw=now=>{
      if(!enabled()){stop();return;}
      ctx.clearRect(0,0,width,height);
      sparks=sparks.filter(s=>now-s.start<520);
      for(const s of sparks){
        const t=(now-s.start)/520,eased=t*(2-t),distance=eased*38,length=13*(1-eased);
        ctx.strokeStyle=s.colour;ctx.lineWidth=2;ctx.globalAlpha=1-t;
        ctx.beginPath();ctx.moveTo(s.x+distance*Math.cos(s.angle),s.y+distance*Math.sin(s.angle));
        ctx.lineTo(s.x+(distance+length)*Math.cos(s.angle),s.y+(distance+length)*Math.sin(s.angle));ctx.stroke();
      }
      ctx.globalAlpha=1;raf=sparks.length?requestAnimationFrame(draw):0;
    };
    const click=e=>{
      const button=e.target.closest?.('button:not(:disabled)');
      if(!enabled()||!button||!button.matches('.primary,.outfit,.moment-language,.moment-email button'))return;
      const rect=button.getBoundingClientRect();
      const x=e.detail?e.clientX:rect.left+rect.width/2,y=e.detail?e.clientY:rect.top+rect.height/2;
      const start=performance.now();
      sparks.push(...Array.from({length:10},(_,i)=>({x,y,start,angle:2*Math.PI*i/10,colour:i%3?'#e4c78b':'#79e2ae'})));
      sparks=sparks.slice(-60);if(!raf)raf=requestAnimationFrame(draw);
    };
    const move=e=>{
      const card=e.target.closest?.('.hero-card,.outfit,.moment-print');
      if(!card||!enabled()||e.pointerType!=='mouse')return;
      const r=card.getBoundingClientRect();
      card.style.setProperty('--rb-rx',`${(0.5-(e.clientY-r.top)/r.height)*8}deg`);
      card.style.setProperty('--rb-ry',`${((e.clientX-r.left)/r.width-0.5)*8}deg`);
    };
    const leave=e=>{const card=e.target.closest?.('.hero-card,.outfit,.moment-print');if(card&&!card.contains(e.relatedTarget))resetTilt(card);};
    resize();root.addEventListener('click',click,true);root.addEventListener('pointermove',move);root.addEventListener('pointerout',leave);
    window.addEventListener('resize',resize);document.addEventListener('visibilitychange',sync);media.addEventListener('change',sync);
    const observer=new MutationObserver(sync);observer.observe(root,{attributes:true,attributeFilter:['data-sm-motion','data-motion-paused']});
    return()=>{stop();observer.disconnect();root.removeEventListener('click',click,true);root.removeEventListener('pointermove',move);root.removeEventListener('pointerout',leave);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',sync);media.removeEventListener('change',sync);};
  },[]);
  return <canvas ref={canvasRef} className="rb-click-spark" aria-hidden="true"/>;
}
