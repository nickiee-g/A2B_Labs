// Shared media background; no procedural scene animation.
const globeStill='https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/f1631235-0a76-464d-8f1d-2c4b48a997d5.jpg';
const globeMovie='https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/e71aea27-a808-4ae3-8231-a469d49285d4.mp4';
const oldCanvas=document.getElementById('hero-fluid');
const plate=document.createElement('div');plate.className='globe-plate';plate.setAttribute('aria-hidden','true');
const still=document.createElement('img');still.src=globeStill;still.alt='';plate.append(still);
const video=document.createElement('video');video.muted=true;video.loop=true;video.playsInline=true;video.preload='none';video.poster=globeStill;plate.append(video);oldCanvas?.replaceWith(plate);
const motionButton=document.querySelector('[data-motion-toggle]');const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
let paused=motionPreference.matches;try{paused=paused||localStorage.getItem('a2b-motion')==='paused'}catch(_){}
video.addEventListener('playing',()=>plate.classList.add('video-ready'));
video.addEventListener('error',()=>{plate.classList.remove('video-ready');motionButton.hidden=true});
function applyMotion(){
 document.documentElement.dataset.motion=paused?'paused':'playing';
 motionButton.textContent=paused?'Play background':'Pause background';motionButton.setAttribute('aria-pressed',String(paused));
 if(paused||document.hidden){video.pause();plate.classList.remove('video-ready');return;}
 if(!video.src)video.src=globeMovie;
 video.play().catch(()=>{plate.classList.remove('video-ready');paused=true;motionButton.textContent='Play background';motionButton.setAttribute('aria-pressed','true')});
}
motionButton.addEventListener('click',()=>{paused=!paused;try{localStorage.setItem('a2b-motion',paused?'paused':'playing')}catch(_){}applyMotion()});
motionPreference.addEventListener('change',e=>{paused=e.matches;applyMotion()});document.addEventListener('visibilitychange',applyMotion);applyMotion();
