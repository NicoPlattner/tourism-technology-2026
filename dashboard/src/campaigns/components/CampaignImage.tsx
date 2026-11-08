import { useEffect,useRef,useState } from 'react';
// Mount a fresh image per creative/context so the browser cannot paint the previous src while fetching.
export default function CampaignImage({src,alt,waiting}:{src:string;alt:string;waiting:boolean}){
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  const [attempt,setAttempt]=useState(0);
  const ref=useRef<HTMLImageElement>(null);
  useEffect(()=>{
    let active=true;
    const image=ref.current;if(!image)return;
    const loaded=async()=>{
      try{await image.decode();}catch{if(!image.complete||!image.naturalWidth)return;}
      if(active&&image.naturalWidth)setStatus('ready');
    };
    const failed=()=>{if(active)setStatus('error');};
    image.addEventListener('load',loaded);image.addEventListener('error',failed);
    if(image.complete){if(image.naturalWidth)void loaded();else if(image.getAttribute('src'))failed();}
    return()=>{active=false;image.removeEventListener('load',loaded);image.removeEventListener('error',failed);};
  },[src,attempt]);
  const visible=status==='ready'&&!waiting;
  return <div className="cp-social-media" aria-busy={waiting||status==='loading'}>
    <img key={attempt} ref={ref} className="cp-social-image" src={attempt?`${src}${src.includes("?")?"&":"?"}retry=${attempt}`:src} alt={alt} aria-hidden={!visible} style={{visibility:visible?'visible':'hidden'}} decoding="async" fetchPriority="high"/>
    {!visible&&<div className="cp-image-placeholder" role="status" aria-live="polite">
      {status==='error'&&!waiting?<><span>Campaign image couldn’t load.</span><button className="link" onClick={()=>{setStatus('loading');setAttempt(n=>n+1);}}>Retry image</button></>:<><span className="cp-image-spinner" aria-hidden="true"/><span>{waiting?'Preparing campaign image…':'Loading campaign image…'}</span></>}
    </div>}
  </div>;
}
