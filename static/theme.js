(() => {
 'use strict';
 const key='indoor-theme',root=document.documentElement;
 let theme='light';try{theme=localStorage.getItem(key)||'light';}catch{}
 // O ícone mostra o tema para onde o botão leva: lua no claro, sol no escuro.
 const svg=d=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">'+d+'</svg>';
 const lua=svg('<path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/>');
 const sol=svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>');
 function apply(value){theme=value==='light'?'light':'dark';root.dataset.theme=theme;const b=document.getElementById('theme-toggle');if(b){const label=theme==='dark'?'Ativar modo claro':'Ativar modo escuro';b.title=label;b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',String(theme==='dark'));b.innerHTML=(theme==='dark'?sol:lua)+'<span>'+(theme==='dark'?'Modo claro':'Modo escuro')+'</span>';}}
 apply(theme);
 document.addEventListener('DOMContentLoaded',()=>{
  const b=document.createElement('button');b.id='theme-toggle';b.className='theme-toggle';b.type='button';
  const sidebar=document.querySelector('.sidebar');if(sidebar)sidebar.insertBefore(b,document.getElementById('user-chip'));else document.body.append(b);
  b.onclick=()=>{apply(theme==='dark'?'light':'dark');try{localStorage.setItem(key,theme);}catch{}};apply(theme);
 });
 window.addEventListener('storage',event=>{if(event.key===key)apply(event.newValue||'light');});
})();
