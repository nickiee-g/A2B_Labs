(() => {
 const sidebar=document.getElementById('workspace-sidebar');
 const toggle=document.getElementById('sidebar-toggle');
 const narrow=matchMedia('(max-width:700px)');
 let desktopOpen=true;
 try{desktopOpen=localStorage.getItem('a2b-sidebar')!=='closed'}catch(_){}
 let open=!narrow.matches&&desktopOpen;
 function render(){
  sidebar.inert=!open;
  sidebar.setAttribute('aria-hidden',String(!open));
  document.body.classList.toggle('sidebar-collapsed',!open);
  toggle.setAttribute('aria-expanded',String(open));
  toggle.title=open?'Hide sidebar':'Show sidebar';
  toggle.querySelector('.sidebar-toggle-label').textContent=toggle.title;
 }
 function change(next){open=next;if(!narrow.matches){desktopOpen=open;try{localStorage.setItem('a2b-sidebar',open?'open':'closed')}catch(_){}}render();}
 toggle.addEventListener('click',()=>change(!open));
 sidebar.querySelector('.sidebar-close').addEventListener('click',()=>{change(false);toggle.focus()});
 sidebar.addEventListener('keydown',e=>{if(e.key==='Escape'){change(false);toggle.focus()}});
 narrow.addEventListener('change',()=>{open=narrow.matches?false:desktopOpen;render()});
 render();
})();
