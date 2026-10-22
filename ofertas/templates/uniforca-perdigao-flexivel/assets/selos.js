/* O mesmo componente é usado no editor, nas miniaturas e na exportação. */
(() => {
  'use strict';
  const vermelho = '<path fill="#e00012" d="M10 29H227V105Q227 128 204 128H33Q10 128 10 105Z"/><path fill="#870900" d="M1 29V39Q5 38 10 37L10 40H58L72 34H10V29Z"/><path fill="#a81104" d="M206 10L223 2Q228 -1 228 5V28L215 36Z"/><path fill="#c91808" d="M14 9H224L217 31Q215 35 208 35H5Q1 35 1 31V20Q1 9 14 9Z"/><path fill="#df2511" d="M14 9H222L220 12H14Q5 12 4 20V29H1V20Q1 9 14 9Z"/>';
  const amarelo = '<path fill="#5f4535" d="M52.32 174.16C31.81 171.78 11.83 156.36 4.51 137.25C0.30 126.26 0.43 128.08 0.43 81.07C0.43 32.24 0.37 32.98 5.51 21.26C10.13 10.76 22.12 4.39 43.84 0.91C53.38 -0.62 177.02 -0.31 187.05 1.27C208.15 4.59 218.47 10.61 223.86 22.73C228.44 33.06 228.57 34.65 228.57 81.92C228.57 125.67 228.57 125.67 226.16 132.73C219.88 151.06 204.53 166.57 187.83 171.47C185.71 172.10 183.01 173.05 181.83 173.58C179.34 174.72 61.67 175.25 52.32 174.16Z"/><path fill="#e9e112" d="M50.60 171.15C26.20 166.55 9.69 150.36 3.56 125.02C2.12 119.06 2.27 87.63 3.77 80.64C8.11 60.43 21.05 45.40 40.74 37.72C48.10 34.84 50.63 34.74 114.93 34.74C178.83 34.74 178.83 34.74 184.83 36.70C204.87 43.24 218.71 57.56 224.39 77.63C226.59 85.40 227.08 114.90 225.16 124.28C222.51 137.28 218.20 145.53 209.42 154.37C199.65 164.22 191.04 168.77 177.54 171.22C168.80 172.81 59.10 172.74 50.60 171.15Z"/>';
  function resolver(projeto, produto, padrao) {
    const valido = v => v === 'vermelho' || v === 'amarelo';
    return valido(produto) ? produto : valido(projeto) ? projeto : padrao;
  }
  function aplicar(produto, projeto, escolha, padrao) {
    const estilo = resolver(projeto, escolha, padrao);
    produto.dataset.estiloSelo = estilo;
    const forma = produto.querySelector('.selo-forma');
    forma.setAttribute('viewBox', estilo === 'vermelho' ? '0 0 229 128' : '0 0 229 175');
    forma.innerHTML = estilo === 'vermelho' ? vermelho : amarelo;
    produto.querySelector('.selo-titulo').textContent = estilo === 'vermelho' ? 'CLUBE DE DESCONTO' : 'Clube de Desconto';
  }
  window.SelosOfertas = {resolver, aplicar};
})();
