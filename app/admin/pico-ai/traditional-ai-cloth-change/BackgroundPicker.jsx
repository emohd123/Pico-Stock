import backgrounds from '@/lib/picoAi/backgrounds.json';
export default function BackgroundPicker({value}){
  return <fieldset className="pai-backgrounds"><legend>Portrait background</legend><p>Close portrait framing, with the guest naturally cropped into the design. Applies to new sessions.</p><div>{backgrounds.map(b=><label key={b.id}><input type="radio" name="background" value={b.id} defaultChecked={b.id===(value||'diriyah-arch')}/><img src={`/pico-ai/backgrounds/${b.id}.webp`} alt=""/><strong>{b.name}</strong><small>{b.description}</small></label>)}</div></fieldset>;
}
