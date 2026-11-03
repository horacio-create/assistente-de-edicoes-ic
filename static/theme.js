(() => {
 'use strict';
 const key='indoor-theme',root=document.documentElement;
 let theme='dark';try{theme=localStorage.getItem(key)||'dark';}catch{}
 const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/></svg>';
 function apply(value){theme=value==='light'?'light':'dark';root.dataset.theme=theme;const b=document.getElementById('theme-toggle');if(b){const label=theme==='dark'?'Ativar modo claro':'Ativar modo escuro';b.title=label;b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',String(theme==='dark'));b.innerHTML=icon+'<span>'+(theme==='dark'?'Modo claro':'Modo escuro')+'</span>';}}
 apply(theme);
 document.addEventListener('DOMContentLoaded',()=>{
  const b=document.createElement('button');b.id='theme-toggle';b.className='theme-toggle';b.type='button';
  const sidebar=document.querySelector('.sidebar');if(sidebar)sidebar.insertBefore(b,document.getElementById('user-chip'));else document.body.append(b);
  b.onclick=()=>{apply(theme==='dark'?'light':'dark');try{localStorage.setItem(key,theme);}catch{}};apply(theme);
 });
 window.addEventListener('storage',event=>{if(event.key===key)apply(event.newValue||'dark');});
})();
