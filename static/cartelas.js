'use strict';
// Cartelas de VT: o app do Cartelas roda em /cartelas/ (servidor repassa ao processo do Cartelas) e aparece dentro desta tela.
// A página só é carregada na primeira visita, para não iniciar o Cartelas à toa.
function abrirCartelas(){const frame=$('cartelas-frame');if(!frame.getAttribute('src'))frame.src='/cartelas/';}
