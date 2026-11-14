// A shared glass indicator follows the hovered or keyboard-focused navigation link.
function mountNavHover(){document.querySelectorAll('.glass-nav, .workspace-trail').forEach(nav=>{
 const pill=document.createElement('span');pill.className='nav-hover-pill';pill.setAttribute('aria-hidden','true');nav.prepend(pill);
 const links=[...nav.querySelectorAll(nav.classList.contains('workspace-trail')?':scope > ol > li > a':'a')];let current=null;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 function place(link,event){
  current=link;const box=nav.getBoundingClientRect(),rect=link.getBoundingClientRect();
  const drift=event&&!reduced.matches?Math.max(-4,Math.min(4,(event.clientX-(rect.left+rect.width/2))*.1)):0;
  pill.style.width=(rect.width+24)+'px';pill.style.height=(rect.height+20)+'px';
  pill.style.transform=`translate(${rect.left-box.left-nav.clientLeft-12+drift}px,${rect.top-box.top-nav.clientTop-10}px)`;
  nav.classList.add('has-hover');links.forEach(a=>a.classList.toggle('nav-lift',a===link));
 }
 function reset(){const focus=links.find(a=>a===document.activeElement);if(focus){place(focus);return}current=null;nav.classList.remove('has-hover');links.forEach(a=>a.classList.remove('nav-lift'))}
 links.forEach(link=>{
  link.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')place(link)});
  link.addEventListener('pointermove',e=>{if(e.pointerType!=='touch')place(link,e)});
  link.addEventListener('focus',()=>place(link));
  link.addEventListener('blur',()=>requestAnimationFrame(reset));
 });
 nav.addEventListener('pointerleave',reset);
 new ResizeObserver(()=>{if(current)place(current)}).observe(nav);
});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountNavHover);else mountNavHover();
